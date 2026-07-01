# Queue Forge

A **distributed, durable, at-least-once job queue platform** — pnpm/Turborepo monorepo with Postgres (source of truth), Redis (execution transport), and a transactional outbox pattern.

> Full codebase deep dive — built by reading every source file, cross-referencing against existing `docs/`. Where docs disagree with code, see [§8 Findings](#8-findings--where-the-docs-code-dont-match-or-where-things-are-incomplete).

---

## Table of Contents

1. [What this project is](#1-what-this-project-is)
2. [High-level architecture](#2-high-level-architecture)
3. [End-to-end workflow](#3-end-to-end-workflow-the-actual-request-lifecycle)
   - [3.1 Creating a job](#31-creating-a-job)
   - [3.2 Outbox → Redis](#32-outbox--redis-appspublisher)
   - [3.3 Execution](#33-execution-appsworker)
   - [3.4 Delayed jobs](#34-delayed-jobs-appsscheduler)
   - [3.5 Worker lifecycle](#35-worker-lifecycle-registration-heartbeat-shutdown)
   - [3.6 Operator actions](#36-operator-actions-via-apps-api-operations-used-by-the-dashboard)
4. [Database schema](#4-database-schema-postgres-via-drizzle-orm--packagesdatabasesrcschema)
5. [Every directory and file](#5-every-directory-and-file-explained)
6. [Every API endpoint](#6-every-api-endpoint)
7. [Apps & packages summaries](#7-apps--packages-one-paragraph-summaries)
8. [Findings](#8-findings--where-the-docs-code-dont-match-or-where-things-are-incomplete)

---

## 1. What this project is

Queue Forge is a **distributed, durable, at-least-once job queue platform**, structured as a pnpm/Turborepo monorepo:

- **PostgreSQL** = source of truth for every durable fact (jobs, leases, outbox, audit, DLQ).
- **Redis** = disposable, fast execution transport (ready lists + a delayed sorted-set). It can be wiped and rebuilt from Postgres.
- A **transactional outbox** decouples "job was created" (Postgres) from "job was dispatched" (Redis), so the API never touches Redis directly.

Five runtime apps + six shared packages + a tests folder make up the system:

```
apps/
  api          → Express REST API (job creation + operator console API)
  worker       → consumes Redis queues, executes jobs, manages leases
  publisher    → outbox → Redis bridge
  scheduler    → promotes due delayed jobs from Redis sorted set → ready queues
  dashboard    → React/Vite operator UI, talks to apps/api's /operations routes

packages/
  database     → Drizzle ORM schema, Postgres client, migrations, OutboxRepository
  redis        → Redis client, QueueService (enqueue/dequeue/delay), dedup helper
  logger       → shared Pino logger
  metrics      → shared prom-client Registry + counters/histograms/gauges
  shared       → tiny shared enum (WorkerStatus)
  config / contracts / telemetry → empty placeholder packages (no files yet)

tests/integration → a single in-memory simulation test of the whole pipeline
infrastructure   → docker-compose, Prometheus config, Grafana provisioning, empty k8s/
```

---

## 2. High-level architecture

```
                         ┌─────────────────────┐
                         │   Client / Dashboard │
                         └──────────┬───────────┘
                                    │ HTTP
                                    ▼
                    ┌───────────────────────────────┐
                    │   apps/api  (Express, :3000)  │
                    │  /api/v1/jobs                 │
                    │  /api/v1/operations/*          │
                    │  /api/v1/metrics (Prometheus)  │
                    └───────────────┬────────────────┘
                                    │ one Postgres transaction:
                                    │ INSERT jobs + idempotency_keys + outbox_events
                                    ▼
                    ┌───────────────────────────────┐
                    │          PostgreSQL            │ ◄──────────────┐
                    │ jobs, queues, workers,         │                │
                    │ job_leases, outbox_events,     │   reads/writes │
                    │ idempotency_keys,               │   for state,   │
                    │ dead_letter_jobs, job_events,   │   leases, DLQ, │
                    │ job_executions, audit_logs      │   audit        │
                    └───────────────┬────────────────┘                │
                                    │ claim pending outbox rows        │
                                    │ (FOR UPDATE SKIP LOCKED)         │
                                    ▼                                  │
                    ┌───────────────────────────────┐                │
                    │ apps/publisher (:9102 metrics) │                │
                    │ OutboxPublisherService loop     │                │
                    └───────────────┬────────────────┘                │
                                    │ LPUSH jobId
                                    ▼
                    ┌───────────────────────────────┐
                    │            Redis               │
                    │ queue:high / :medium / :low    │
                    │ queue:delayed (sorted set)      │
                    └───────────────┬────────────────┘
                                    │ BRPOP
                                    ▼
                    ┌───────────────────────────────┐
                    │  apps/worker (:9101 metrics)   │────────────────┘
                    │  WorkerService main loop        │
                    │  acquire lease → run → complete │
                    └────────────────────────────────┘

                    ┌───────────────────────────────┐
                    │ apps/scheduler (:9103 metrics) │
                    │ polls queue:delayed every 1s,   │
                    │ Lua-script promotes due jobs    │
                    └────────────────────────────────┘

      Prometheus (:9090) scrapes api / worker / publisher / scheduler
      Grafana (:3001) renders dashboards from Prometheus
```

Ports (all configurable via env vars, defaults shown):

| Service    | Port                           | Purpose                  |
| ---------- | ------------------------------ | ------------------------ |
| api        | 3000                           | HTTP API                 |
| worker     | 9101                           | `/metrics` only (no API) |
| publisher  | 9102                           | `/metrics` only          |
| scheduler  | 9103                           | `/metrics` only          |
| prometheus | 9090                           | scrapes the four above   |
| grafana    | 3001 (host) → 3000 (container) | dashboards               |
| postgres   | 5432                           | `queue_forge` DB         |
| redis      | 6379                           | queues                   |

---

## 3. End-to-end workflow (the actual request lifecycle)

### 3.1 Creating a job

```
POST /api/v1/jobs
  → validateIdempotencyKey middleware (requires header "Idempotency-Key")
  → validate(createJobSchema) middleware (zod)
  → JobController.create
  → JobService.createJob(payload, idempotencyKey)
  → JobRepository.createJobWithIdempotencyAndOutbox(...)
      Postgres transaction:
        1. If idempotencyKey given, check idempotency_keys for an existing row
           → if found, return the existing job untouched (true idempotent replay)
        2. INSERT INTO jobs (status='PENDING', attempts=0, ...)
        3. INSERT INTO idempotency_keys (key, jobId)         [if key given]
        4. INSERT INTO outbox_events (
             eventType='job.dispatch.requested',
             deduplicationKey=`job-created-${jobId}`,
             payload={ jobId, priority, name }
           )
      If the transaction throws a unique-violation on the idempotency key
      (race between two requests with the same key), it re-reads the
      existing job and returns that instead of failing the second caller.
  → HTTP 201 with the full job row
```

Note: the API **never touches Redis** here — it only writes to Postgres. Dispatch to Redis is the publisher's job, on its own loop, decoupled from the request.

### 3.2 Outbox → Redis (apps/publisher)

`OutboxPublisherService.start()` loops forever (until `shutdown()` is called):

```
loop:
  events = outboxRepository.claimBatch(workerId, batchSize=50)
     → SELECT ... WHERE processedAt IS NULL AND nextAttemptAt <= now()
                  AND (claimedBy IS NULL OR claimExpiresAt <= now())
       FOR UPDATE SKIP LOCKED   (so multiple publisher instances never double-claim)
     → UPDATE claimedBy = workerId, claimExpiresAt = now()+30s

  for each event:
     if event.attempts >= maxRetries(5): throw (gives up, falls into catch below)
     parse payload → { jobId, priority }
     queueService.enqueue(jobId, priority)   # LPUSH to queue:high/medium/low
     markProcessed(event.id)                 # processedAt = now(), clears claim
       on failure: markFailed(event.id, errorMessage)
         → attempts += 1
         → nextAttemptAt = now() + min(2^attempts seconds, 5 minutes)   (exp backoff)
         → clears claimedBy/claimExpiresAt so it can be reclaimed

  updateLagMetrics()   # Prometheus gauges: oldest-unprocessed age, pending count
  sleep(pollIntervalMs=100ms)
```

If the publisher crashes **after** the Redis `LPUSH` but **before** `markProcessed`, the event stays unprocessed and gets republished by the next claim cycle. This is safe because the worker side is expected to tolerate duplicate delivery (at-least-once delivery, ADR-007/008) — nothing in this repo currently de-duplicates at the worker, so "idempotent execution" is a property job _handlers_ are expected to have, not something the platform enforces today (see [§8](#8-findings--where-the-docs-code-dont-match-or-where-things-are-incomplete)).

### 3.3 Execution (apps/worker)

`WorkerService.start()` loops forever:

```
loop:
  jobId = poller.poll()                 # BRPOP queue:high, queue:medium, queue:low (blocking)
  if no job: continue

  lease = repository.acquireLease(jobId, workerId, ttlMs=30000)
     Postgres transaction:
       SELECT version FROM jobs WHERE id=jobId FOR UPDATE
       DELETE FROM job_leases WHERE jobId=jobId AND expiresAt < now()   (clear stale lease)
       INSERT INTO job_leases (jobId, workerId, fencingToken = job.version+1, expiresAt)
         ON CONFLICT DO NOTHING   (so a still-active lease blocks a second worker)
  if no lease acquired: continue   # someone else already owns this job

  job = repository.findById(jobId)
  if job missing: release lease, continue

  start a setInterval every 10s: renewLease(jobId, workerId, fencingToken, ttl)
     → only succeeds if (jobId, workerId, fencingToken) still matches an
       unexpired lease row — this IS the fencing check.

  try:
    markRunningWithLease(jobId, workerId, fencingToken)
       → re-checks the lease is still active, then sets status='RUNNING', version+1
    executor.execute(job)             # looks up a handler by job.name, calls it
    markCompletedWithLease(jobId, workerId, fencingToken)
       → same lease re-check, then status='COMPLETED', completedAt=now(), version+1
    jobsCompleted.inc()
  catch (error):
    jobsFailed.inc()
    if job.attempts < job.maxAttempts:
       retryService.retry(jobId, job.attempts)
          → delay = min(5000 * 2^attempts, 60000) ms
          → ZADD queue:delayed score=now()+delay value=jobId
       repository.incrementAttempts(jobId)
    else:
       deadLetterService.moveToDeadLetter(job, error)
          Postgres transaction:
            INSERT INTO dead_letter_jobs (jobId, reason=error.message)
            UPDATE jobs SET status='DEAD_LETTER'
  finally:
    clearInterval(renewal)
    releaseLease(jobId, workerId, fencingToken)   # DELETE the lease row
```

**Important gap (see [§8.1](#81-worker-has-no-job-handlers-registered-in-production)):** `JobExecutor` starts with an _empty_ handler map. Nothing in `apps/worker/src/main.ts` ever calls `executor.register(...)`. The only place any handler is registered is inside the worker's own unit test (`job-executor.test.ts`, which registers `"send-email"`). As shipped, a real job created through the API will hit `JobExecutor.execute` and throw `No handler registered for job name: ...`, which the catch block above treats as a normal failure — so it will retry with backoff until attempts are exhausted and then dead-letter. This is the system's intended extension point (register real handlers per job name), it's just not wired up to anything yet.

### 3.4 Delayed jobs (apps/scheduler)

```
every SCHEDULER_INTERVAL_MS (default 1000ms):
  dueJobIds = ZRANGEBYSCORE queue:delayed -inf <now>
  for each jobId:
    priority = SELECT priority FROM jobs WHERE id=jobId   (Postgres lookup)
    if no priority found: skip (job no longer exists)
    run a Lua script atomically:
       if ZSCORE(queue:delayed, jobId) > now: return 0   (race-guard, no-op)
       LPUSH <priority queue>, jobId
       ZREM queue:delayed, jobId
       return 1
    if moved == 1: delayedJobsPromoted.inc()
```

The Lua script makes "move from delayed set to ready list" atomic, so two scheduler instances racing on the same due job can't double-promote it.

### 3.5 Worker lifecycle (registration, heartbeat, shutdown)

```
bootstrap():
  redisClient.connect()
  workerId = WorkerRegistryService.register()
     → INSERT INTO workers (id, hostname, status='ACTIVE', lastHeartbeat=now())
  HeartbeatService.start(workerId)
     → setInterval 5000ms: UPDATE workers SET lastHeartbeat=now() WHERE id=workerId
  start metrics HTTP server on :9101 (just serves /metrics, 404 otherwise)
  WorkerService.start()  # the main loop above, runs in background

on SIGTERM/SIGINT:
  worker.requestShutdown()              # stops the main loop's `while` condition
  wait up to WORKER_SHUTDOWN_TIMEOUT_MS (default 30s) for the loop to drain
  worker.releaseActiveLease()           # release whatever job it still holds
  close metrics server, stop heartbeat, redisClient.quit()
  WorkerRegistryService.unregister(workerId)
     → UPDATE workers SET status='DEAD'
  process.exit(0)
```

A `WorkerHealthMonitor` class exists (`apps/scheduler/src/worker-health-monitor.ts`, queries workers with stale heartbeats) but **nothing calls it** — see [§8.2](#82-workerhealthmonitor-is-dead-code).

### 3.6 Operator actions (via apps/api `/operations/*`, used by the dashboard)

- **Retry** a `FAILED`/`DEAD_LETTER` job → back to `PENDING` (optimistic-locked on `version`, blocked if an active lease exists), writes a `job_events` row and an `audit_logs` row.
- **Cancel** a `PENDING`/`RETRYING`/`RUNNING` job → `CANCELED`, same guard rails.
- **Replay** a dead-letter record → validates the underlying job is still `DEAD_LETTER`, flips it to `PENDING`, deletes the `dead_letter_jobs` row, writes a `job_events` row (audit log write is wired but silently a no-op in production — see [§8.3](#83-dlq-replays-audit-log-write-is-a-no-op-in-practice)).
- **Pause/Resume** a queue (`high`/`medium`/`low`) → flips a row in the `queues` table (`ACTIVE` ⇄ `PAUSED`). This is **purely informational/UI state today** — nothing in the publisher or worker actually checks `queues.state` before dispatching or consuming (see [§8.4](#84-queue-pauseresume-doesnt-actually-pause-anything)).

---

## 4. Database schema (Postgres, via Drizzle ORM — `packages/database/src/schema/`)

| Table                                                                          | Key columns                                                                                                                                                      | Purpose                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobs`                                                                         | id, queue_id (nullable FK), name, payload(jsonb), priority, status, attempts, max_attempts, version, run_at, cancellation_requested_at, completed_at             | The job record. Indexed on `(queue_id,status,created_at)` and `(status,run_at)`.                                                                                              |
| `queues`                                                                       | id, name (unique), state(`ACTIVE`/`PAUSED`), version, state_reason, paused_at                                                                                    | Durable queue state (3 logical queues: high/medium/low — see [§8.4](#84-queue-pauseresume-doesnt-actually-pause-anything) on what "durable" really means here).                |
| `workers`                                                                      | id, hostname, status(`ACTIVE`/`DEAD`), last_heartbeat                                                                                                            | Worker registry rows.                                                                                                                                                         |
| `job_leases`                                                                   | job_id (PK), worker_id, lease_token, fencing_token, acquired_at, expires_at, heartbeat_at                                                                        | One row per currently-executing job; enforces single-owner execution + fencing.                                                                                               |
| `outbox_events`                                                                | id, event_type, aggregate_type/id, deduplication_key (unique), payload(jsonb), processed_at, attempts, next_attempt_at, last_error, claimed_by, claim_expires_at | Transactional outbox rows bridging Postgres → Redis.                                                                                                                          |
| `idempotency_keys`                                                             | id, key (unique), job_id                                                                                                                                         | Maps a client-supplied `Idempotency-Key` header to the job it created.                                                                                                        |
| `dead_letter_jobs`                                                             | id, job_id, reason                                                                                                                                               | One row per job that exhausted retries.                                                                                                                                       |
| `job_events`                                                                   | id, job_id, event_type, from_status, to_status, version, actor_type, actor_id, metadata(jsonb)                                                                   | Append-only audit trail of state transitions (operator-triggered ones only — worker-driven transitions like RUNNING/COMPLETED don't write here).                              |
| `job_executions`                                                               | id, job_id, started_at, finished_at, status, error_message                                                                                                       | Defined and migrated, but nothing in the worker ever inserts into it (see [§8.5](#85-job_executions-is-never-written-to)) — the API's "get executions" endpoint will always return `[]`. |
| `audit_logs`                                                                   | id, actor_id, action, target_type, target_id, reason, outcome, request_id, change_summary(jsonb)                                                                 | Operator-action audit log (retry/cancel write here for real; DLQ replay does not, in the current wiring).                                                                     |
| `workflow_definitions` / `workflow_task_definitions` / `workflow_dependencies` | —                                                                                                                                                                | Defined in the Drizzle schema for a future DAG/workflow engine (Phase 11), but **there is no SQL migration creating these tables** — they don't exist in a real database yet. |

Migrations live in `packages/database/src/migrations/0000`…`0008` and show the schema's real evolution (e.g. `0006_fix_schema_migration_drift.sql` retrofits `queue_id`, `version`, `cancellation_requested_at`, `completed_at` onto `jobs` after the fact — a sign this schema grew iteratively rather than being designed monolithically up front).

### Job state machine (as enforced by `apps/api`'s `validTransitions` map)

```
validTransitions = {
  FAILED:      [PENDING],
  DEAD_LETTER: [PENDING],
  PENDING:     [CANCELED],
  RETRYING:    [CANCELED],
  RUNNING:     [CANCELED],
}
```

Plus the worker-driven transitions: `PENDING → RUNNING → COMPLETED`, and `RUNNING → (retry loop back to PENDING via queue:delayed)` or `RUNNING → DEAD_LETTER` on exhausted attempts.

Every operator-initiated transition is double-guarded:

1. **Optimistic concurrency** — the `UPDATE` includes `WHERE version = expectedVersion`; if another request already changed the row, this returns 0 rows and the API returns `409 CONFLICT`.
2. **Active-lease check** — `updateStatus()` first checks for a non-expired row in `job_leases`; if one exists, the whole update is refused (returns `null` → `409`), so an operator can't cancel/retry a job a worker currently holds.

### Queue state machine

```
ACTIVE ⇄ PAUSED
```

(see [§8.4](#84-queue-pauseresume-doesnt-actually-pause-anything) for the caveat that this state isn't actually consulted by dispatch/consumption)

---

## 5. Every directory and file, explained

### `apps/api/src/`

| Path                                      | Role                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts`                               | Process entrypoint: connects Redis, starts Express on `PORT` (default 3000).                                                                                                             |
| `app.ts`                                  | Builds the Express app: `express.json()` → `requestContext` → mounts `/api/v1` router → inline `/health` route → `errorHandler`.                                                         |
| `bootstrap/container.ts`                  | Manual DI container — constructs every Operations service/repo/controller and wires them together (no DI framework).                                                                     |
| `errors/api.error.ts`                     | `ApiError` base class + `ResourceNotFoundError` (404), `InvalidCursorError` (400), `ConflictError` (409), `InvalidStateTransitionError` (422), `ForbiddenError` (403, unused currently). |
| `middleware/authentication.ts`            | Bearer-token check against `OPERATIONS_AUTH_TOKEN` (comma-separated list, default `"dev-token"`). Only mounted on the `/operations` router.                                              |
| `middleware/error-handler.ts`             | Central error → JSON translator (ZodError → 400, ApiError → its status, else 500).                                                                                                       |
| `middleware/idempotency.middleware.ts`    | Requires an `Idempotency-Key` header on job creation; 400s if missing.                                                                                                                   |
| `middleware/request-context.ts`           | Generates/propagates a request id (`X-Request-Id` header or a new UUID) onto `req.id`.                                                                                                   |
| `middleware/validate.ts`                  | Generic Zod `safeParse`-based body validator factory.                                                                                                                                    |
| `modules/jobs/*`                          | Public job-creation module: schema, controller, service, repository (see [§3.1](#31-creating-a-job)).                                                                                    |
| `modules/operations/jobs/*`               | Operator job console: list/get/executions/events/retry/cancel. Split into a **read service** and a **command service**.                                                                  |
| `modules/operations/queues/*`             | Operator queue console: list/get/pause/resume. Blends a Postgres repository (authoritative depth/state) with a Redis repository (diagnostic depth only).                                 |
| `modules/operations/workers/*`            | Operator worker console: list/get, with derived `HEALTHY`/`STALE`/`OFFLINE` health based on heartbeat age.                                                                               |
| `modules/operations/dead-letter/*`        | DLQ console: list/get/replay.                                                                                                                                                            |
| `modules/operations/audit/*`              | Read-only audit log console: list with filters.                                                                                                                                          |
| `modules/operations/metrics/*`            | JSON operational snapshot (`GET /operations/metrics`) — distinct from the Prometheus `/metrics` endpoint.                                                                                |
| `modules/operations/operations.routes.ts` | Mounts the auth middleware + all six operations sub-routers.                                                                                                                             |
| `routes/index.ts`                         | Top-level router: `/jobs`, `/operations`, plus the Prometheus metrics route.                                                                                                             |
| `routes/health.routes.ts`                 | **Dead code** — defines `/health` but is never imported anywhere; the real `/health` lives inline in `app.ts`.                                                                           |
| `routes/metrics.routes.ts`                | The actual Prometheus scrape endpoint, `GET /api/v1/metrics`, no auth.                                                                                                                   |
| `types/express.d.ts`                      | Augments Express's `Request` with `id` and `actorId`.                                                                                                                                    |

### `apps/worker/src/`

| Path                                             | Role                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main.ts`                                        | Entrypoint: connects Redis, registers the worker, starts heartbeat, starts metrics server (:9101), runs `WorkerService`, handles graceful SIGTERM/SIGINT shutdown. |
| `services/worker.service.ts`                     | The main poll → lease → execute → complete/retry/dead-letter loop ([§3.3](#33-execution-appsworker)).                                                               |
| `polling/job-poller.ts`                          | Thin wrapper around `QueueService.dequeue()` (BRPOP).                                                                                                              |
| `execution/job-executor.ts`                      | Handler registry keyed by job name; throws if no handler is registered for a job. **Empty in production** ([§8.1](#81-worker-has-no-job-handlers-registered-in-production)). |
| `repositories/job.repository.ts`                 | All job + lease Postgres operations: `acquireLease`, `renewLease`, `releaseLease`, `markRunningWithLease`, `markCompletedWithLease`, `incrementAttempts`.          |
| `repositories/worker.repository.ts`              | `register`, `heartbeat`, `markDead` against the `workers` table.                                                                                                   |
| `retry/retry.service.ts` + `backoff.strategy.ts` | Computes exponential backoff (`min(5000·2^attempts, 60000)` ms) and pushes the job into `queue:delayed`.                                                           |
| `dead-letter/dead-letter.service.ts`             | Inserts a `dead_letter_jobs` row + flips job status to `DEAD_LETTER`, in one transaction.                                                                          |
| `heartbeat/heartbeat.service.ts`                 | `setInterval` every 5s calling `WorkerRepository.heartbeat`.                                                                                                       |
| `registry/worker-registry-service.ts`            | Generates a worker UUID, registers/unregisters it.                                                                                                                 |

### `apps/publisher/src/`

| Path                   | Role                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`              | Entrypoint: starts metrics server (:9102), connects Redis, runs `OutboxPublisherService.start()`, handles graceful shutdown via a `shutdownRequested` flag (no forced timeout — it just stops looping). |
| `publisher.service.ts` | The outbox-claim → publish → mark-processed/failed loop ([§3.2](#32-outbox--redis-appspublisher)).                                                                                                      |

### `apps/scheduler/src/`

| Path                       | Role                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                  | Entrypoint: starts metrics server (:9103), connects Redis, loops `promoteDueJobs()` every `SCHEDULER_INTERVAL_MS`.            |
| `delayed-job-promoter.ts`  | Reads due jobs from `queue:delayed`, looks up each job's priority in Postgres, atomically promotes via the Lua script ([§3.4](#34-delayed-jobs-appsscheduler)). |
| `worker-health-monitor.ts` | Queries workers with a heartbeat older than 15s. **Not called anywhere** ([§8.2](#82-workerhealthmonitor-is-dead-code)).      |

### `apps/dashboard/src/`

| Path                                           | Role                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx` / `App.tsx`                         | Vite/React entry; defines routes for Overview, Queues, Jobs, Workers, Dead Letter, Audit Log, all inside a shared `Layout`.                                                                                                                                                                                                |
| `components/Layout.tsx`                        | Left nav + page outlet.                                                                                                                                                                                                                                                                                                    |
| `components/MetricCard.tsx`, `StatusBadge.tsx` | Small presentational components.                                                                                                                                                                                                                                                                                           |
| `api/client.ts`                                | Hand-rolled `fetch` wrapper hitting `/api/v1/operations/*`, attaching `Authorization: Bearer <token>` from `localStorage` (defaults to `"dev-token"` — matching the API's default). One function per endpoint (`getMetrics`, `getQueues`, `pauseQueue`, `listJobs`, `retryJob`, `replayDeadLetter`, `listAuditLogs`, etc.) |
| `api/hooks.ts`                                 | React hooks wrapping the above (data fetching state).                                                                                                                                                                                                                                                                      |
| `pages/*.tsx`                                  | One page per operations area: Overview, Queues, Jobs, Workers, DeadLetter, AuditLog — each consumes the matching `api.*` calls.                                                                                                                                                                                            |
| `types/api.ts`                                 | TypeScript mirrors of the API's response shapes.                                                                                                                                                                                                                                                                           |

### `packages/database/src/`

| Path                                | Role                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client.ts`                         | Loads `.env`, creates the `postgres` client and the Drizzle `db` instance from `DATABASE_URL`.                                                                     |
| `schema/*.ts`                       | One file per table (see [§4](#4-database-schema-postgres-via-drizzle-orm--packagesdatabasesrcschema)); `schema/index.ts` re-exports them all.                        |
| `repositories/outbox.repository.ts` | The shared `OutboxRepository` used by `apps/publisher` (claim/markProcessed/markFailed/getLagMetric) — also exports `calculateOutboxBackoffMs` as a pure function. |
| `migrations/0000`–`0008`            | Raw SQL migration history (drizzle-kit generated).                                                                                                                 |
| `drizzle.config.ts`                 | drizzle-kit config pointing at the schema + migrations folder.                                                                                                     |

### `packages/redis/src/`

| Path                        | Role                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.ts`                 | Creates the shared `redisClient` (node-redis) from `REDIS_URL`, logs connect/error events.                                                                                                                                                                                                                                      |
| `queue/queue.service.ts`    | `QueueService`: `enqueue` (LPUSH by priority bucket), `enqueueDelayed` (ZADD to `queue:delayed`), `dequeue` (BRPOP across the three ready lists), `getQueueDepth` (LLEN).                                                                                                                                                       |
| `queue/queues.constants.ts` | The four Redis key names (`queue:high/medium/low/delayed`).                                                                                                                                                                                                                                                                     |
| `queue/queue.types.ts`      | `QueuePriority` enum (`LOW=1, MEDIUM=5, HIGH=10`) — **not actually used** by the priority-bucket logic, which hardcodes `>=10`/`>=5` thresholds inline in three different places (`QueueService.resolveQueue`, `apps/scheduler`'s `resolvePriorityQueue`, and `apps/api`'s `resolveQueueName`) instead of sharing one function. |
| `dedup/dedup.service.ts`    | `DedupService` (Redis SET/GET with 1hr TTL) for de-duplicating delivery. **Not exported from the package's `index.ts` and not used anywhere** ([§8.6](#86-dedupservice-is-unused-and-unexported)).                                                                                                                               |

### `packages/logger/src/`

`logger.ts` — a single shared Pino logger (`pino-pretty` transport, level from `LOG_LEVEL`). Every app imports this instead of `console`.

### `packages/metrics/src/`

`metrics.ts` — one shared `prom-client` `Registry` plus all named metrics (`jobsCreated`, `jobsCompleted`, `jobsFailed`, `executionLatency`, the five `outbox*` metrics, `delayedJobsPromoted`). Each app's `/metrics` HTTP handler just serializes this same registry. Note: `jobsCreated` is defined but **never incremented anywhere** in the codebase ([§8.7](#87-the-jobscreated-prometheus-counter-is-never-incremented)).

### `packages/shared/src/`

`worker-status.ts` — `WorkerStatus` enum (`ACTIVE`/`DEAD`). Defined but every actual write to `workers.status` uses a raw string literal instead of this enum.

### `packages/config/`, `packages/contracts/`, `packages/telemetry/`

Empty directories — reserved namespaces for future shared config validation, API contracts/DTOs, and tracing instrumentation. No files exist yet.

### `tests/integration/pipeline.integration.test.ts`

A **self-contained in-memory simulation** (`InMemoryQueueForge` class) of the whole pipeline — not a test that spins up real Postgres/Redis/processes. It models job creation, outbox publish (with a simulated crash-after-publish scenario), lease acquisition/expiry/recovery, delayed-job promotion, queue pause, and optimistic-version races, and asserts the _intended_ protocol behaves correctly. It's a good one-file reference for "how is this all supposed to behave," but it does not exercise the real `apps/*` code paths.

### `infrastructure/`

- `docker/docker-compose.yml` — spins up Postgres 17, Redis 7, and all four Node apps (each running `pnpm --filter @queue-forge/<app> start` against the mounted workspace) plus Prometheus and Grafana. Maps the ports from [§2](#2-high-level-architecture).
- `monitoring/prometheus/prometheus.yml` — scrape configs for `api:3000`, `worker:9101`, `publisher:9102`, `scheduler:9103`, every 15s.
- `monitoring/grafana/` — provisioning files (datasources + dashboard definitions) for Grafana to auto-load a Queue Forge dashboard.
- `k8s/` — empty placeholder.

### Top-level docs

`README.md` is essentially empty (just a title). The real documentation lives in `docs/`: `ARCHITECTURE.md` and `SYSTEM_ARCHITECTURE.md` (high-level, mostly accurate — this is what I cross-checked against the code), `ADR.md` (16 architectural decisions), `ROADMAP.md` and `CURRENT_FOCUS.md` (phase-based project plan — see [§8.8](#88-roadmap-focus-docs-mark-phases-complete-that-lack-implementations) for why these should be read with real skepticism), `PHASE_10_MILESTONE_1_API.md` and `PHASE_11_TECHNICAL_DESIGN.md` (design docs, partly superseded by later code), `AI_CONTEXT.md`, `AGENT_PROMPT.md`, `AI_HANDOFF.md`, `AI.md`, `TASKS.md` (agent/contributor working notes for iterative development).

---

## 6. Every API endpoint

Base URL: `http://localhost:3000`. All JSON. Errors use the envelope `{ "error": { "code", "message" } }`.

### Unauthenticated

| Method   | Path              | Body / Query                                                                                                                                         | Behavior                                                                                                                             |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/health`         | —                                                                                                                                                    | `{ success: true, service: "api" }`. (Defined inline in `app.ts`; the separate `health.routes.ts` file is unused dead code.)         |
| `GET`    | `/api/v1/metrics` | —                                                                                                                                                    | Prometheus text exposition of the shared metrics registry. This is what Prometheus actually scrapes.                                 |
| `POST`   | `/api/v1/jobs`    | Headers: `Idempotency-Key` (required). Body: `{ name (3-255 chars), payload (object), priority? (0-10, default 0), maxAttempts? (1-10, default 3) }` | Creates a job ([§3.1](#31-creating-a-job)). Returns `201` with the full job row. Replaying the same idempotency key returns the original job, still `201`. |

### Authenticated (`Authorization: Bearer <token>`, default token `dev-token`, configurable via `OPERATIONS_AUTH_TOKEN` as a comma-separated list)

All under `/api/v1/operations`. A `401 UNAUTHORIZED` is returned for any of these without a valid bearer token. (Note: there's a `BYPASS_PATHS` set in the auth middleware containing `/api/v1/operations/metrics/prometheus` intended to let a Prometheus-style metrics path skip auth — but no route at that exact path exists, so this bypass never actually triggers; see [§8.9](#89-an-auth-bypass-path-that-can-never-trigger).)

**Metrics**

| Method | Path                          | Query                     | Behavior                                                                                                                      |
| ------ | ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/metrics`         | `windowMinutes` (1-1440, default 15) | Returns a JSON snapshot: job/worker counts by status, jobs created/completed/failed in the time window, throughput/min, success rate, total retry attempts (all-time sum, since individual retries aren't timestamped). |

**Queues**

| Method | Path                                    | Body        | Behavior                                                                                                                        |
| ------ | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/queues`                    | —           | Lists `high`/`medium`/`low` with authoritative Postgres depth (jobs in `PENDING`/`RETRYING` for that priority bucket), oldest pending timestamp, status breakdown, Redis execution depth (best-effort — `null` if Redis read fails), and current pause state. |
| `GET`  | `/operations/queues/:name`              | —           | Same shape for one queue. `404` if `name` isn't `high`/`medium`/`low`.                                                          |
| `POST` | `/operations/queues/:name/pause`        | `{ reason }` | Sets `queues.state='PAUSED'`. `409` if already paused. **Does not actually stop dispatch or consumption** — see [§8.4](#84-queue-pauseresume-doesnt-actually-pause-anything). |
| `POST` | `/operations/queues/:name/resume`       | `{ reason }` | Sets `queues.state='ACTIVE'`. `409` if already active. |

**Jobs (operator console)**

| Method | Path                                  | Query/Body                                                     | Behavior                                                                                                                 |
| ------ | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/operations/jobs`                    | `queueId?, status?, name? (substring match), createdFrom?, createdTo?, limit (1-100, default 50), cursor?` | Cursor-paginated list of job summaries, ordered newest-updated first. |
| `GET`  | `/operations/jobs/:id`                | —                                                              | Full job record. `404` if not found.                                                                                     |
| `GET`  | `/operations/jobs/:id/executions`     | —                                                              | List of `job_executions` rows for the job. Always `[]` today ([§8.5](#85-job_executions-is-never-written-to) — nothing writes to this table). |
| `GET`  | `/operations/jobs/:id/events`         | —                                                              | List of `job_events` rows (operator-driven transitions only), oldest first.                                              |
| `POST` | `/operations/jobs/:id/retry`          | `{ reason }`                                                   | Only valid from `FAILED`/`DEAD_LETTER` → `PENDING`. `422` if current status doesn't allow it, `409` on version conflict or active lease. Writes a `job_events` row and a real `audit_logs` row. |
| `POST` | `/operations/jobs/:id/cancel`         | `{ reason }`                                                   | Only valid from `PENDING`/`RETRYING`/`RUNNING` → `CANCELED`. Same guards as retry. |

**Dead-letter jobs**

| Method | Path                                          | Query/Body                                                    | Behavior                                                                                                                    |
| ------ | --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/dead-letter-jobs`                | `queueId? (accepted but not actually filtered — see [§8.10](#810-queueid-filter-on-the-dead-letter-list-endpoint-is-silently-ignored)), reasonCode?, limit, cursor?` | Cursor-paginated DLQ list. |
| `GET`  | `/operations/dead-letter-jobs/:id`            | —                                                             | One DLQ record. `404` if missing.                                                                                           |
| `POST` | `/operations/dead-letter-jobs/:id/replay`     | `{ reason }`                                                  | Verifies the underlying job is still `DEAD_LETTER`, flips it to `PENDING`, deletes the DLQ row, writes a `job_events` row. **Audit log write is wired in code but resolves to a no-op by default in the current DI wiring** ([§8.3](#83-dlq-replays-audit-log-write-is-a-no-op-in-practice)) — so DLQ replays don't show up in `/audit-logs` despite the docs claiming otherwise. |

**Workers**

| Method | Path                            | Query                                                           | Behavior                                                                                                                     |
| ------ | ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/workers`           | `health? (HEALTHY/STALE/OFFLINE), limit, cursor?`               | Cursor-paginated worker list with derived health (`HEALTHY` = ACTIVE status + heartbeat younger than `WORKER_STALE_AFTER_MS`, default 15000ms; `STALE` = ACTIVE but old/missing heartbeat; `OFFLINE` = status isn't ACTIVE). |
| `GET`  | `/operations/workers/:id`       | —                                                               | One worker's detail + health. `404` if missing.                                                                              |

**Audit log**

| Method | Path                            | Query                                                                         | Behavior                                                                                     |
| ------ | ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/audit-logs`        | `action?, actorId?, targetType?, targetId?, from?, to?, limit, cursor?`       | Cursor-paginated, read-only. The only writers into this table today are the job retry/cancel command handlers. |

All cursor pagination here uses the same pattern: a base64url-encoded `{ createdAt/updatedAt, id }` tuple, validated and decoded server-side, returned as `nextCursor` in the response envelope (`{ data: { items, nextCursor } }`) when more rows exist.

---

## 7. Apps & packages, one-paragraph summaries

- **apps/api** — The only HTTP-facing app. Splits cleanly into a public, unauthenticated job-creation module and an authenticated `/operations` console used by the dashboard. Follows the documented Controller → Service → Repository layering fairly strictly, with manual dependency injection wired up in `bootstrap/container.ts`.
- **apps/worker** — A long-running process with no HTTP API of its own besides `/metrics`. Owns the lease/fencing protocol that makes "only one worker executes a job at a time, and a stale worker can't silently overwrite a newer worker's result" hold true even with crashes and clock drift.
- **apps/publisher** — A small, focused bridge service. Its entire job is "move outbox rows into Redis exactly once-ish, with retries and backoff on failure."
- **apps/scheduler** — Even smaller: a polling loop plus one atomic Lua-scripted promotion. Also contains the unused `WorkerHealthMonitor`.
- **apps/dashboard** — A thin React/Vite SPA that's a near 1:1 UI over the `/operations` API surface; no business logic of its own beyond rendering and triggering the same actions an `curl` call could.
- **packages/database** — The schema and migration history live here, plus the one cross-app repository (`OutboxRepository`) that's shared because both the API (writes) and the publisher (reads/claims) need the same table.
- **packages/redis** — Centralizes the Redis client and all queue primitives so every app uses the same key names and enqueue/dequeue semantics.
- **packages/logger / packages/metrics** — Pure cross-cutting concerns; every app imports these instead of rolling its own.
- **packages/shared / config / contracts / telemetry** — Mostly placeholders for future cross-app type-sharing, config validation, and tracing; only `shared` currently has any content (one enum), and it isn't even consistently used.

---

## 8. Findings — where the docs/code don't match, or where things are incomplete

These aren't guesses — each one was verified by reading the actual source and confirming via `grep` that nothing else in the repo wires the piece in question together.

### 8.1 Worker has no job handlers registered in production

`apps/worker/src/services/worker.service.ts` constructs `new JobExecutor()` and never calls `.register(...)`. Only the test file registers a `"send-email"` handler. As shipped, every real job dispatched to the worker will throw `No handler registered for job name: ...`, retry per the backoff schedule, and eventually land in the dead-letter queue. This is presumably the intended extension point for whoever adds real job types, but right now the system can't successfully complete any job end-to-end outside of tests.

### 8.2 `WorkerHealthMonitor` is dead code

It's defined in `apps/scheduler/src/worker-health-monitor.ts` and described in `SYSTEM_ARCHITECTURE.md` as a key scheduler class, but nothing instantiates or calls it. Stale-worker detection currently only happens passively, as a derived `health` field when someone calls the `GET /operations/workers` API — there's no background process that marks workers `DEAD` or recovers their jobs automatically.

### 8.3 DLQ replay's audit log write is a no-op in practice

`DeadLetterService`'s constructor has a `writeAuditLog` parameter defaulting to a real no-op (`async () => {}`), distinct from `OperationsJobCommandService` (whose default actually inserts into `audit_logs`). `bootstrap/container.ts` constructs `DeadLetterService` with only 2 arguments, so it always uses the no-op default. The docs (`SYSTEM_ARCHITECTURE.md` §8) state DLQ replay "writes an audit log" — in the current wiring, it writes a `job_events` row but not an `audit_logs` row.

### 8.4 Queue pause/resume doesn't actually pause anything

`queues.state` is set in Postgres, and the operator API/dashboard reflect it, but neither `OutboxPublisherService` (publishing to Redis) nor `WorkerService`/`JobPoller` (consuming from Redis) ever reads `queues.state`. A "paused" queue will keep dispatching and executing jobs exactly as before. `PHASE_10_MILESTONE_1_API.md` (an earlier design doc) is actually explicit that pause/resume was _intentionally_ left out at that point because "the current model has no durable queue table" — the `queues` table and pause/resume endpoints were added later, but the enforcement side was apparently never connected.

### 8.5 `job_executions` is never written to

The table and its `GET /operations/jobs/:id/executions` read endpoint both exist, but no code in `apps/worker` (or anywhere else) ever inserts a row into `job_executions`. That endpoint will always return an empty array.

### 8.6 `DedupService` is unused and unexported

It implements a Redis-backed dedup-key check with a 1-hour TTL — exactly the kind of mechanism you'd want for idempotent handler execution — but it's not even exported from `packages/redis/src/index.ts`, let alone called by the worker.

### 8.7 The `jobsCreated` Prometheus counter is never incremented

It's defined in `packages/metrics`, but `apps/api`'s job-creation path never imports or touches it, so it will always read `0` on the `/metrics` endpoint.

### 8.8 Roadmap/focus docs mark phases "complete" that lack implementations

`docs/ROADMAP.md` and `docs/CURRENT_FOCUS.md` mark Phases 6–9 "Complete" (Distributed Coordination/locks, Queue Partitioning/sharding/consistent-hashing, Rate Limiting/token-buckets, and full Observability/tracing), **but none of that code exists.** A repo-wide search for cron, rate-limiting, partitioning/sharding, distributed-lock, or multi-tenant code turns up nothing outside these planning docs. What _is_ implemented — leases/fencing (closer to Phase 6's spirit), priority-bucket queues (Phase 4), heartbeats/graceful shutdown (Phase 5), and Prometheus metrics + Pino logging without tracing (a partial Phase 9) — is solid and matches `SYSTEM_ARCHITECTURE.md`. Treat the phase-completion checkmarks in `ROADMAP.md`/`CURRENT_FOCUS.md` as planning aspirations, not a description of what's actually in this checkout. `docs/CURRENT_FOCUS.md`'s own "Reliability Validation Checklist" is, fittingly, entirely unchecked.

### 8.9 An auth bypass path that can never trigger

`middleware/authentication.ts` exempts `/api/v1/operations/metrics/prometheus` from the bearer-token check, but no route is ever mounted at that path — `operations/metrics` only has `GET /` (i.e., `/api/v1/operations/metrics`). The real unauthenticated Prometheus endpoint lives at the unrelated top-level path `/api/v1/metrics`. The bypass entry looks like leftover/aspirational code.

### 8.10 `queueId` filter on the dead-letter list endpoint is silently ignored

`listDeadLettersQuerySchema` accepts a `queueId` and the service threads it through to the repository, but `dead_letter_jobs` has no `queue_id` column and `DrizzleDeadLetterRepository.list()` never applies it as a filter condition — so passing `?queueId=...` has no effect on the results.

### 8.11 `workflow_*` tables exist in the Drizzle schema but have no migration

`packages/database/src/schema/workflow.ts` defines `workflow_definitions`, `workflow_task_definitions`, `workflow_dependencies` for the planned Phase 11 workflow engine, but there's no corresponding SQL file in `migrations/`. Any code trying to query these against a freshly-migrated database would fail — they're schema scaffolding for work that hasn't started.

---

None of this is a sign of a broken architecture — the _design_ (outbox pattern, leases + fencing, optimistic concurrency, cursor pagination, layered modules) is coherent and the parts that are wired together do work correctly per the integration test's simulation. It's a system that's mid-build: Phase 10 (the Operations Platform/dashboard) is the most complete and consistent layer; the deeper reliability machinery (job handlers, DLQ audit trail, queue pause enforcement, worker health automation) has the scaffolding in place but isn't fully connected end-to-end yet.
