# Queue-Forge Completion Agent — Full Instruction Set

## CRITICAL RULE: NO ASKING FOR PERMISSION

You are an autonomous engineering agent. Your job is to **complete all tasks in order without asking for permission, clarification, or approval**. Do not pause to ask questions. Do not seek confirmation. If something is ambiguous, make a reasonable judgment and proceed. The only exception is if you encounter a genuine blocker that prevents progress entirely — and even then, first try to work around it.

**You are not a consultant. You are a doer. Get the job done.**

---

## Prerequisite Reading

Before touching any code, read every one of these files:

1. `AI_HANDOFF.md` — Complete project analysis, phase status, risks, priorities
2. `TASKS.md` — The full work order with every task detailed
3. `docs/ARCHITECTURE.md` — System architecture and component responsibilities
4. `docs/ADR.md` — All architectural decisions (do NOT violate these)
5. `docs/CURRENT_FOCUS.md` — Current focus and objectives
6. `docs/AI_CONTEXT.md` — Additional AI instructions and coding conventions
7. `docs/PHASE_10_TECHNICAL_DESIGN.md` — Detailed Phase 10 design for context
8. `.env` — Environment configuration

---

## Project Summary

Queue-Forge is a production-grade distributed job processing platform built in TypeScript on Node.js. It uses PostgreSQL as the authoritative state store and Redis as a high-throughput execution transport layer. It has a functional REST API (Express 5), a worker with a basic polling loop, a React dashboard SPA, and database schemas spanning jobs, queues, workers, DLQ, outbox, audit logs, and workflow definitions.

The project is **not production-safe** today because:
- Jobs can be lost if the API crashes between PostgreSQL insert and Redis push
- Jobs can be executed multiple times (no idempotency in the worker)
- Execution signals can be permanently lost (BRPOP removes from Redis before lease acquisition)
- Delayed jobs never actually execute (no scheduler promotion)
- The publisher app is completely empty
- Only 7 test files exist (all unit tests, zero integration tests)

---

## System Architecture and Data Flow

### High-Level Component Architecture

```
                    ┌──────────────┐
                    │   Client /   │
                    │  Dashboard   │
                    └──────┬───────┘
                           │ HTTP
                           ▼
                    ┌──────────────┐
                    │  Express API │  apps/api/
                    │  (Port 3000) │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
     ┌────────────────┐       ┌─────────────────┐
     │   PostgreSQL   │       │   Redis (Queue) │
     │  (Source of    │       │  (Transport)    │
     │   Truth)       │       │                 │
     └────┬───────────┘       └────────┬────────┘
          │                            │
          │                            ▼
          │                     ┌──────────────┐
          │                     │   Worker(s)  │  apps/worker/
          │                     │  (BRPOP loop)│
          │                     └──────┬───────┘
          │                            │
          └────────────┬───────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Outbox Events │
              │  Publisher     │  apps/publisher/
              │  (PG → Redis)  │
              └────────────────┘

     ┌────────────────┐
     │   Scheduler    │  apps/scheduler/
     │  (Delayed Jobs)│
     └────────────────┘
```

### Current (Broken) Data Flow

This is how the system works TODAY. You must fix this.

```
POST /api/v1/jobs
       │
       ├── 1. Insert job into PostgreSQL  ──┐
       │                                     │  If crash happens HERE,
       ├── 2. LPUSH job ID to Redis  ────────┤  job exists in PG but
       │                                     │  never reaches Redis → LOST
       └── 3. Return success ────────────────┘

Worker loop:
       BRPOP from Redis queue
         │
       Fetch job from PostgreSQL
         │                              If crash happens HERE,
       UPDATE status = 'RUNNING'  ──────┤  job removed from Redis but
         │                              │  never marked RUNNING → LOST
       Execute job (2s sleep stub)
         │
       UPDATE status = 'COMPLETED'

Scheduler:  (no entry point, does nothing)
Publisher:  (empty files, does nothing)
```

### Target (Correct) Data Flow

This is what the system must look like after your work.

```
POST /api/v1/jobs  (with Idempotency-Key header)
       │
       └── 1. PostgreSQL TRANSACTION:
                ├── INSERT INTO jobs (status='PENDING')
                ├── INSERT INTO idempotency_keys
                └── INSERT INTO outbox_events (event_type='job.dispatch.requested')
           COMMIT ──────────────────────────────────────────────┐
           If crash HERE, transaction rolls back → no data loss │
                                                                 │
Publisher loop:                                                  │
       SELECT FROM outbox_events WHERE processed_at IS NULL      │
       FOR UPDATE SKIP LOCKED                                    │
         │                                                       │
       LPUSH job ID to correct Redis priority queue              │
         │                                                       │
       UPDATE outbox_events SET processed_at = NOW()             │
         │                                                       │
       If crash after LPUSH but before markProcessed:            │
       next loop claims same event, LPUSH again (idempotent) ────┘

Worker loop:
       BRPOP from Redis queue (high > medium > low priority)
         │
       acquireLease(): INSERT INTO job_leases ON CONFLICT DO NOTHING
         │  If another worker has the lease, skip this job
         │
       UPDATE jobs SET status='RUNNING', version=version+1
         WHERE id=jobId AND version=oldVersion
         │  (optimistic concurrency guard)
         │
       Periodically renew lease: UPDATE job_leases SET expires_at=NOW()+TTL
         │
       Execute job via registered handler
         │
       UPDATE jobs SET status='COMPLETED', version=version+1
         WHERE id=jobId AND version=oldVersion AND
               EXISTS (SELECT 1 FROM job_leases WHERE
                       job_id=jobId AND fencing_token=token)
         │  (fencing token ensures only lease holder can complete)
         │
       releaseLease(): DELETE FROM job_leases WHERE job_id=jobId

       If crash mid-execution:
         lease expires → another worker can claim the job

On failure (catch block):
       IF attempts < maxAttempts:
           enqueueDelayed(jobId, backoffDelay)  → Redis sorted set
           UPDATE attempts = attempts + 1
       ELSE:
           INSERT INTO dead_letter_jobs
           UPDATE status = 'DEAD_LETTER'

Scheduler loop:
       Every 1 second:
         ZRANGEBYSCORE queue:delayed -inf NOW()
         For each due job: LPUSH to priority queue + ZREM from delayed
         (atomic via Lua script)

API retry command:
       POST /operations/jobs/:id/retry
         Checks valid transition (FAILED/DEAD_LETTER → PENDING)
         Checks no active lease exists
         UPDATE status='PENDING', version=version+1
           WHERE id=jobId AND version=oldVersion
         INSERT INTO job_events (event_type='job.retry.requested')
         INSERT INTO audit_logs
```

### Job State Machine

```
PENDING ──→ RUNNING ──→ COMPLETED
                │
                ├──→ FAILED ──→ DEAD_LETTER (exhausted retries)
                │       │
                │       └──→ PENDING (retry via command)
                │
                ├──→ RETRYING ──→ PENDING (delayed re-enqueue)
                │
                └──→ CANCELED (from PENDING, RETRYING, or RUNNING)

SCHEDULED ──→ PENDING (when run_at is due)
```

### Queue Model

Three logical queues derived from priority ranges:

| Priority Range | Queue Name | Redis Key    |
|---------------|------------|--------------|
| priority >= 10| high       | queue:high   |
| 5 <= priority < 10 | medium | queue:medium |
| priority < 5  | low        | queue:low    |

The `queues` table has a state machine: ACTIVE ↔ PAUSED.
When PAUSED, no new jobs should be dispatched (the publisher checks this).

### Database Table Relationships

```
jobs ──────→ job_events          (1:many, job_id FK)
  │
  ├────────→ job_executions       (1:many, job_id FK)
  │
  ├────────→ job_leases           (1:1, job_id PK)
  │
  ├────────→ dead_letter_jobs     (1:1, job_id FK)
  │
  ├────────→ idempotency_keys     (1:1, key unique)
  │
  └── queues ───→ jobs.queue_id   (1:many FK)

outbox_events     (standalone, no FK — decoupled)
audit_logs        (standalone, no FK — append-only)
workflow_definitions ──→ workflow_task_definitions
                             │
                             └── workflow_dependencies
```

### Core Interfaces (for your reference)

The worker service interface you'll need to implement:
```
WorkerService.start():
  loop:
    jobId = redis.dequeue()
    lease = db.acquireLease(jobId, workerId)
    if !lease: continue
    db.markRunning(jobId, lease.fencingToken)
    try:
      executor.execute(job)
      db.markCompleted(jobId, lease.fencingToken)
      metrics.jobsCompleted++
    catch error:
      metrics.jobsFailed++
      if job.attempts < job.maxAttempts:
        redis.enqueueDelayed(jobId, backoff.calculate(job.attempts))
        db.incrementAttempts(jobId)
      else:
        db.moveToDeadLetter(job)
    finally:
      db.releaseLease(jobId, workerId, lease.fencingToken)
```

The publisher service interface you'll need to implement:
```
PublisherService.start():
  loop:
    events = outboxRepo.claimBatch(workerId, batchSize=50)
    for event in events:
      job = parse payload
      queue = resolveQueue(job.priority)
      redis.enqueue(job.jobId, queue)
      outboxRepo.markProcessed(event.id)
    sleep(100ms)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict, ES2022) |
| Runtime | Node.js |
| API Framework | Express 5 |
| ORM | Drizzle ORM with PostgreSQL (postgres driver) |
| Database | PostgreSQL 17 |
| Queue Transport | Redis 7 (redis v6 client) |
| Validation | Zod 4 |
| Metrics | prom-client (Prometheus) |
| Logging | Pino |
| Frontend | React 19, React Router 7, TanStack React Query 5, Vite 6 |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Node.js built-in `node:test` |
| Linting | typescript-eslint |
| Containerization | Docker Compose (PostgreSQL 17 + Redis 7) |

---

## Hard Rules (Never Violate)

1. **PostgreSQL is the source of truth.** Redis is a disposable execution layer. All authoritative state must be in PostgreSQL first. Never write business state to Redis without writing it to PostgreSQL in the same transaction.
2. **No console.log in production code.** Use the Pino logger from `@queue-forge/logger`.
3. **All state mutations go through the service layer.** Controllers handle HTTP only. Repositories handle persistence only.
4. **Follow existing code style:** semicolons, double quotes, 120 char width, 2-space tabs.
5. **Use Node.js built-in `node:test`** for all tests. Follow the pattern in `apps/api/src/modules/operations/`.
6. **Add tests for every new service and every modified behavior.** No exceptions.
7. **Run `pnpm run build` and `pnpm run lint` after every change set.** Fix any issues before moving on.
8. **All metrics must use bounded labels.** Never label by job ID, worker ID, error message, or operator ID.
9. **Every feature must handle failure.** Consider: what happens if PostgreSQL is unavailable? What if Redis is unavailable? What if the process crashes mid-operation?

---

## Repository Structure

```
apps/
  api/              Express REST API — most complete, has operations endpoints
  dashboard/        React SPA — fully implemented with 6 pages
  worker/           Worker process — partially implemented, JobExecutor is a stub
  scheduler/        Barely started — no entry point, no run loop
  publisher/        Empty — both files are zero bytes
packages/
  database/         Drizzle client, schema (11 tables), migrations (6), OutboxRepository
  redis/            Redis client, QueueService (enqueue/dequeue), DedupService
  logger/           Pino logger instance
  metrics/          3 counters + 1 histogram via prom-client
  contracts/        EMPTY — no files
  telemetry/        EMPTY — no files
  config/           EMPTY — no files
  shared/           Single WorkerStatus enum
infrastructure/
  docker/           docker-compose.yml (PostgreSQL 17 + Redis 7)
  k8s/              EMPTY
  monitoring/       EMPTY
```

---

## Architectural Decisions (Must Preserve)

- **ADR-001**: PostgreSQL is the source of truth
- **ADR-002**: Redis is the execution engine
- **ADR-003**: Repository pattern for persistence abstraction
- **ADR-004**: Dependency injection (manual composition root)
- **ADR-005**: Explicit job state machine with guarded transitions
- **ADR-006**: Transactional outbox pattern (documented, NOT YET IMPLEMENTED — you must implement it)
- **ADR-007**: At-least-once delivery
- **ADR-008**: Idempotent job execution (documented, NOT YET IMPLEMENTED — you must implement it)
- **ADR-009**: Worker lease ownership (documented, NOT YET IMPLEMENTED — you must implement it)
- **ADR-010**: Distributed locking (future)
- **ADR-011**: Queue partitioning (future)
- **ADR-012**: Retry strategy with exponential backoff
- **ADR-013**: Dead letter queue
- **ADR-014**: Structured logging
- **ADR-015**: Metrics and tracing
- **ADR-016**: Workers are stateless

---

## Tasks — Execute in Order

You must complete each task fully (all acceptance criteria met) before moving to the next. Do not skip ahead.

---

### Task 1: Fix Schema/Migration Drift

The Drizzle schema definitions and SQL migrations are out of sync.

**Problems:**
- `jobs` schema has `queue_id`, `version`, `cancellation_requested_at`, `completed_at` columns that are NOT in migration `0000_lonely_omega_flight.sql`
- `outbox_events` schema has 11 columns but migration `0004_dizzy_black_knight.sql` only creates 4 — missing: `aggregate_type`, `aggregate_id`, `deduplication_key`, `attempts`, `next_attempt_at`, `last_error`

**What to do:**
Create a new migration `0006` (or modify existing migrations) to add the missing columns via ALTER TABLE statements. The goal is that `drizzle-kit generate` produces no drift.

For `jobs`, add:
- `queue_id` (uuid, nullable, references queues.id)
- `version` (integer, default 0, not null)
- `cancellation_requested_at` (timestamp, nullable)
- `completed_at` (timestamp, nullable)

For `outbox_events`, add:
- `aggregate_type` (varchar 100, not null, default 'job')
- `aggregate_id` (uuid, nullable)
- `deduplication_key` (varchar 255, not null, unique)
- `attempts` (integer, default 0, not null)
- `next_attempt_at` (timestamp, default now, not null)
- `last_error` (varchar 1000, nullable)

**Validate:** `drizzle-kit generate` produces no changes; `pnpm run build` passes; `pnpm run lint` passes; existing tests pass.

**Files to modify:**
- `packages/database/src/migrations/` — Add migration `0006` or modify existing

---

### Task 2: Activate Transactional Outbox for Job Creation

Currently `POST /api/v1/jobs` writes to PostgreSQL then pushes to Redis in separate operations. A crash between them loses the job forever.

**What to do:**
Change job creation to use a single PostgreSQL transaction that atomically inserts:
1. The job row
2. The idempotency key row
3. An outbox event row with `eventType: "job.dispatch.requested"`, `aggregateType: "job"`, `aggregateId: jobId`, `payload: { jobId, priority, name }`, `deduplicationKey: "job-created-" + jobId`

Remove the direct Redis push from the job creation flow entirely. The outbox publisher (Task 4) will handle Redis.

The OutboxRepository.create() method currently doesn't accept a transaction client. Either modify it to accept one, or create the outbox event directly in the JobRepository transaction.

**Files to modify:**
- `apps/api/src/modules/jobs/job.service.ts` — Remove direct Redis push, use transaction
- `apps/api/src/modules/jobs/job.repository.ts` — Add transactional create method
- `packages/database/src/repositories/outbox.repository.ts` — May need to support passing a tx client

**Files to create:**
- `apps/api/src/modules/jobs/job.service.test.ts` — Tests for transactional behavior

**Acceptance criteria:**
- Job + idempotency key + outbox event inserted in one PG transaction
- No direct Redis push in job creation flow
- Duplicate idempotency key is handled correctly
- Tests verify transactional behavior

---

### Task 3: Complete Outbox Repository

The `OutboxRepository` only has `create()`. The publisher needs query and update methods.

**What to do:**
Add these methods to `packages/database/src/repositories/outbox.repository.ts`:
- `findPending(limit)` — SELECT with `processed_at IS NULL`, `ORDER BY created_at ASC`, `FOR UPDATE SKIP LOCKED`
- `claimBatch(workerId, limit)` — Atomic claim of pending events
- `markProcessed(id)` — Set `processed_at = now()`
- `markFailed(id, error)` — Increment attempts, set last_error, set next_attempt_at with backoff
- `getLagMetric()` — Oldest unprocessed event age and count

**Acceptance criteria:**
- All methods implemented
- `findPending` uses `FOR UPDATE SKIP LOCKED`
- Tests verify query logic

---

### Task 4: Implement Outbox Publisher

The `apps/publisher/` directory has two empty files. Build the publisher that bridges the outbox table to Redis.

**What to do:**
Create:
- `apps/publisher/src/main.ts` — Entry point: connect PG + Redis, loop claiming and publishing events, graceful shutdown
- `apps/publisher/src/publisher.service.ts` — `OutboxPublisherService` with start/processBatch/publishEvent/shutdown methods
- `apps/publisher/package.json` — Package config with dependencies

The publisher must:
1. Claim pending outbox events with `FOR UPDATE SKIP LOCKED` in batches of 50
2. Determine target Redis queue from event payload priority (high ≥ 10, medium ≥ 5, low)
3. Push job ID to correct Redis priority list via LPUSH
4. Mark event as processed only after Redis acknowledges
5. Use exponential backoff on Redis failure (max 5 retries)
6. Expose metrics: outbox lag gauge, events published counter, events failed counter, publish latency histogram
7. Handle graceful shutdown (complete current batch before exiting)

**Files to modify:**
- `infrastructure/docker/docker-compose.yml` — Add publisher service
- `turbo.json` — Add publisher to pipeline if needed

**Acceptance criteria:**
- Publisher starts and processes pending outbox events
- Events published to correct Redis priority queue
- Metrics exposed
- Graceful shutdown works
- Integration tests: event flows through publisher to Redis; publisher crash recovery does not lose events

---

### Task 5: Add Job Leases with Fencing Tokens

The worker BRPOPs a job from Redis then marks it RUNNING. A crash between these operations loses the job permanently. Per ADR-009, add durable PostgreSQL leases with fencing tokens.

**What to do:**

Create a new schema table `job_leases`:
```typescript
export const jobLeases = pgTable("job_leases", {
  jobId: uuid("job_id").primaryKey().references(() => jobs.id),
  workerId: uuid("worker_id").notNull(),
  leaseToken: uuid("lease_token").defaultRandom().notNull(),
  fencingToken: integer("fencing_token").notNull(),
  acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  heartbeatAt: timestamp("heartbeat_at").defaultNow().notNull(),
});
```
Add indexes on `(workerId)` and `(expiresAt)`.

Modify the worker's flow:
1. Dequeue from Redis
2. Acquire lease via INSERT INTO job_leases with ON CONFLICT DO NOTHING
3. If lease acquisition fails (another worker got it), continue polling
4. Mark job RUNNING with fencing token guard
5. Execute the job
6. Mark job COMPLETED with fencing token guard
7. Release the lease

Worker must renew lease every 10 seconds (configurable) during execution.

Modify the API's job command service to check for active leases before allowing retry/cancel.

**Files to create:**
- `packages/database/src/schema/job-lease.ts`

**Files to modify:**
- `packages/database/src/schema/index.ts` — Export jobLeases
- `packages/database/src/index.ts` — Export jobLeases
- `apps/worker/src/repositories/job.repository.ts` — Add lease methods
- `apps/worker/src/services/worker.service.ts` — Change flow to use leases
- `apps/worker/src/main.ts` — Pass workerId to WorkerService
- `apps/api/src/modules/operations/jobs/job.repository.ts` — Check lease in updateStatus

**Acceptance criteria:**
- Worker acquires durable PostgreSQL lease before execution
- Lease has TTL, worker renews periodically
- Fencing token prevents stale workers from committing state transitions
- Expired lease makes job recoverable by another worker
- Integration tests: crash after BRPOP, crash mid-execution, stale worker blocked

---

### Task 6: Implement Delayed Job Promotion

Delayed jobs go into Redis sorted set `queue:delayed` but never get promoted. The scheduler has no entry point.

**What to do:**

Create:
- `apps/scheduler/src/main.ts` — Entry point: connect to Redis, loop calling promoteDueJobs every 1 second, handle graceful shutdown
- `apps/scheduler/src/delayed-job-promoter.ts` — Class that uses ZRANGEBYSCORE to find due jobs, atomically moves them to ready queues via Lua script or Redis transaction

Modify:
- `apps/scheduler/package.json` — Add dependencies and scripts
- `infrastructure/docker/docker-compose.yml` — Add scheduler service

**Acceptance criteria:**
- Due delayed jobs promoted from `queue:delayed` to correct priority queue
- Promotion is atomic (Lua script or MULTI/EXEC)
- Scheduler runs continuously
- Metric: `delayed_jobs_promoted_total`
- Integration test: delayed job executes after scheduled time

---

### Task 7: Add Graceful Shutdown to Worker

The worker has no SIGTERM/SIGINT handling. Killing it orphans jobs in RUNNING status.

**What to do:**
Add signal handlers in `apps/worker/src/main.ts`:
1. On SIGTERM/SIGINT: set shutdown flag, log
2. Allow current job to complete (configurable timeout)
3. Release active lease
4. Unregister worker (mark DEAD)
5. Exit with code 0

Modify `apps/worker/src/services/worker.service.ts` to check shutdown flag between loop iterations.

**Acceptance criteria:**
- Worker handles SIGTERM and SIGINT
- Current execution completes within timeout
- Lease released on shutdown
- Worker unregistered on shutdown

---

### Task 8: Replace Stub JobExecutor

`JobExecutor.execute()` sleeps for 2 seconds and logs. Replace with a real handler framework.

**What to do:**
Replace `apps/worker/src/execution/job-executor.ts` with:
- `HandlerFunction = (job: Job) => Promise<void>` type
- `register(jobName: string, handler: HandlerFunction)` method
- `execute(job)` — looks up handler by job.name, calls it, handles errors
- If no handler registered, throw descriptive error

**Acceptance criteria:**
- Handlers registered by job name
- Correct handler called for each job
- Unknown job names throw error
- Errors propagate to retry/DLQ logic
- Unit tests for registration and execution

---

### Task 9: Fix console.log in Worker

`apps/worker/src/execution/job-executor.ts:5` uses `console.log`. Replace with `logger.info({ jobId: job.id }, "Executing job")`.

Ensure the worker bootstrap injects the Pino logger properly. Search the entire worker directory for any other `console.log` calls and replace them too.

**Acceptance criteria:**
- Zero `console.log` calls in worker source files
- Build and lint pass

---

### Task 10: Write Integration Tests

Only 7 unit tests exist. Write integration tests for the entire pipeline.

**What to do:**
Create a `tests/integration/` directory. Use `testcontainers` (Node.js) or Docker Compose to spin up PostgreSQL and Redis. Use Node.js built-in `node:test`.

Minimum 7 integration tests:

1. **End-to-end job lifecycle:** Create job via API → outbox event created → publisher reads it → job ID in Redis → worker dequeues and processes → job COMPLETED in PostgreSQL
2. **Retry and DLQ:** Handler always fails → job retries up to maxAttempts → job moves to DLQ
3. **Worker crash:** Worker starts → simulate kill → lease expires → another worker picks up the job
4. **Publisher crash:** API creates job → publisher crashes mid-publish → restart → event processed (no duplicate)
5. **Delayed job:** Create job with future `runAt` → enters delayed queue → scheduler promotes → worker executes
6. **Queue pause/resume:** Pause queue → no new jobs execute → resume → jobs flow again
7. **Concurrent state transition:** Two concurrent retry/cancel requests → only one succeeds (optimistic concurrency)

**Acceptance criteria:**
- All 7 scenarios pass
- Tests are idempotent
- Tests clean up after themselves

---

### Task 11: Add Prometheus and Grafana Configuration

`infrastructure/monitoring/` is empty. Add monitoring infrastructure.

**What to do:**

Create:
- `infrastructure/monitoring/prometheus/prometheus.yml` — Scrape config for all services
- `infrastructure/monitoring/grafana/datasources/prometheus.yml` — Prometheus datasource
- `infrastructure/monitoring/grafana/dashboards/queue-forge.json` — Dashboard with:
  - Jobs created/completed/failed per second (rate charts)
  - Queue depth by status
  - Execution latency (p50, p95, p99)
  - Worker count and health
  - Outbox lag and publish rate
  - Retry and DLQ rate

Modify:
- `infrastructure/docker/docker-compose.yml` — Add Prometheus and Grafana services

**Acceptance criteria:**
- Prometheus starts and scrapes all services
- Grafana starts with pre-configured datasource
- Dashboard renders all key metrics

---

### Task 12: Generate Architecture Documentation

As the final deliverable, produce a comprehensive architecture document that captures all the work you did.

**What to do:**
Create a file `docs/SYSTEM_ARCHITECTURE.md` that describes the complete system. This document should be detailed enough that a new developer or AI agent can understand the entire system without reading any source code.

The document must include:

1. **System Overview** — What Queue-Forge is, what problem it solves
2. **Architecture Diagram** — ASCII/Unicode component diagram showing all services and their connections
3. **Component Descriptions** — For each app (api, worker, publisher, scheduler, dashboard) and each package (database, redis, logger, metrics):
   - Purpose and responsibilities
   - Entry point and how it starts
   - Key classes and their roles
   - Ports and protocols
4. **Data Flow** — Describe the complete lifecycle of a job:
   - API receives job creation request → transactional outbox → publisher → Redis → worker → lease → execution → completion/retry/DLQ
   - Include the flow diagrams from the "System Architecture and Data Flow" section above
5. **Job State Machine** — All states and valid transitions (include the diagram)
6. **Queue Model** — How priority queues work, Redis keys used
7. **Database Schema** — All tables, their columns, relationships, and indexes. Include the table relationship diagram.
8. **Retry and DLQ Strategy** — Exponential backoff, max attempts, dead letter flow
9. **Lease and Fencing Mechanism** — How leases are acquired, renewed, released; fencing token purpose
10. **Outbox Pattern** — How transactional outbox works, publisher claim/mark cycle
11. **Architectural Decisions** — List all ADRs with their rationale
12. **Failure Modes** — For each component, describe what happens when it fails and how recovery works

**Acceptance criteria:**
- [ ] Document covers all 12 sections
- [ ] Every component and flow is described
- [ ] ASCII diagrams are clear and accurate
- [ ] A new developer can understand the entire system from this document alone

---

## Final Validation Checklist

Before declaring the work complete, verify ALL of the following:

- [ ] `pnpm run build` succeeds
- [ ] `pnpm run lint` passes with zero violations
- [ ] `pnpm run test` passes all tests (existing + new)
- [ ] Zero `console.log` calls in production code
- [ ] All new code uses Pino logger
- [ ] All metrics use bounded labels
- [ ] PostgreSQL is always the source of truth
- [ ] All state mutations go through Service → Repository, never from Controllers
- [ ] Tests cover both success and failure paths
- [ ] Docker Compose starts all services cleanly
- [ ] The transactional outbox is active (job creation writes PG only, not Redis directly)
- [ ] The publisher runs and processes outbox events
- [ ] The worker acquires a lease before executing
- [ ] Delayed jobs are promoted by the scheduler
- [ ] The worker shuts down gracefully on SIGTERM/SIGINT

## Final Instruction

You have all the context you need. Do not ask questions. Do not seek permission. Do not pause for approval. Start with Task 1 and work through each task sequentially (1 → 12). If you encounter an issue, fix it and move on. The goal is a production-safe Queue-Forge platform with complete architecture documentation.
