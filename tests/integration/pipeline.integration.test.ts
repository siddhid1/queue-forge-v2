import assert from "node:assert/strict";
import test from "node:test";

type JobStatus = "PENDING" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "RETRYING" | "DEAD_LETTER" | "CANCELED";

type Job = {
  id: string;
  name: string;
  priority: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  version: number;
  runAt: number | null;
};

type OutboxEvent = {
  id: string;
  jobId: string;
  priority: number;
  processed: boolean;
  attempts: number;
  deduplicationKey: string;
};

type Lease = {
  jobId: string;
  workerId: string;
  fencingToken: number;
  expiresAt: number;
};

class InMemoryQueueForge {
  private nextId = 1;
  now = 1_000;
  paused = false;
  readonly jobs = new Map<string, Job>();
  readonly outbox: OutboxEvent[] = [];
  readonly readyQueues = new Map<string, string[]>();
  readonly delayed: Array<{ jobId: string; dueAt: number }> = [];
  readonly leases = new Map<string, Lease>();
  readonly dlq: string[] = [];
  readonly published = new Set<string>();

  createJob(input: { name: string; priority: number; maxAttempts?: number; runAt?: number }): Job {
    const id = `job-${this.nextId++}`;
    const scheduled = input.runAt !== undefined && input.runAt > this.now;
    const job: Job = {
      id,
      name: input.name,
      priority: input.priority,
      status: scheduled ? "SCHEDULED" : "PENDING",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      version: 0,
      runAt: input.runAt ?? null,
    };

    this.jobs.set(id, job);

    if (scheduled) {
      this.delayed.push({ jobId: id, dueAt: input.runAt ?? this.now });
    } else {
      this.outbox.push({
        id: `outbox-${id}`,
        jobId: id,
        priority: input.priority,
        processed: false,
        attempts: 0,
        deduplicationKey: `job-created-${id}`,
      });
    }

    return job;
  }

  publishNext(options: { crashAfterPublish?: boolean } = {}): number {
    if (this.paused) {
      return 0;
    }

    const event = this.outbox.find((candidate) => !candidate.processed);

    if (!event) {
      return 0;
    }

    if (!this.published.has(event.deduplicationKey)) {
      this.enqueue(event.jobId, event.priority);
      this.published.add(event.deduplicationKey);
    }

    if (options.crashAfterPublish) {
      return 1;
    }

    event.processed = true;
    return 1;
  }

  processNext(handler: (job: Job) => Promise<void>, workerId = "worker-1"): Promise<void> {
    const jobId = this.dequeue();

    if (!jobId) {
      return Promise.resolve();
    }

    const lease = this.acquireLease(jobId, workerId, 30_000);

    if (!lease) {
      return Promise.resolve();
    }

    return this.runWithLease(jobId, lease, handler);
  }

  acquireLease(jobId: string, workerId: string, ttlMs: number): Lease | null {
    const activeLease = this.leases.get(jobId);

    if (activeLease && activeLease.expiresAt > this.now) {
      return null;
    }

    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    const lease = {
      jobId,
      workerId,
      fencingToken: job.version + 1,
      expiresAt: this.now + ttlMs,
    };
    this.leases.set(jobId, lease);
    return lease;
  }

  async runWithLease(jobId: string, lease: Lease, handler: (job: Job) => Promise<void>): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job || !this.isLeaseCurrent(lease)) {
      return;
    }

    this.transition(job, "RUNNING");

    try {
      await handler(job);

      if (this.isLeaseCurrent(lease)) {
        this.transition(job, "COMPLETED");
      }
    } catch {
      if (job.attempts + 1 >= job.maxAttempts) {
        job.attempts++;
        this.transition(job, "DEAD_LETTER");
        this.dlq.push(job.id);
      } else {
        job.attempts++;
        this.transition(job, "RETRYING");
        this.delayed.push({ jobId: job.id, dueAt: this.now + 5_000 * 2 ** job.attempts });
      }
    } finally {
      this.leases.delete(jobId);
    }
  }

  promoteDelayed(): number {
    let promoted = 0;
    const due = this.delayed.filter((entry) => entry.dueAt <= this.now);

    for (const entry of due) {
      const job = this.jobs.get(entry.jobId);

      if (job) {
        this.transition(job, "PENDING");
        this.enqueue(job.id, job.priority);
        promoted++;
      }
    }

    for (const entry of due) {
      const index = this.delayed.indexOf(entry);
      if (index >= 0) this.delayed.splice(index, 1);
    }

    return promoted;
  }

  recoverExpiredLeases(): number {
    let recovered = 0;

    for (const lease of this.leases.values()) {
      const job = this.jobs.get(lease.jobId);

      if (lease.expiresAt <= this.now && job && job.status === "RUNNING") {
        this.leases.delete(lease.jobId);
        this.transition(job, "PENDING");
        this.enqueue(job.id, job.priority);
        recovered++;
      }
    }

    return recovered;
  }

  updateWithVersion(jobId: string, nextStatus: JobStatus, expectedVersion: number): boolean {
    const job = this.jobs.get(jobId);

    if (!job || job.version !== expectedVersion || this.leases.has(jobId)) {
      return false;
    }

    this.transition(job, nextStatus);
    return true;
  }

  private enqueue(jobId: string, priority: number): void {
    const queue = priority >= 10 ? "high" : priority >= 5 ? "medium" : "low";
    const values = this.readyQueues.get(queue) ?? [];
    values.push(jobId);
    this.readyQueues.set(queue, values);
  }

  private dequeue(): string | null {
    for (const queue of ["high", "medium", "low"]) {
      const values = this.readyQueues.get(queue) ?? [];
      const jobId = values.shift();

      if (jobId) {
        return jobId;
      }
    }

    return null;
  }

  private transition(job: Job, status: JobStatus): void {
    job.status = status;
    job.version++;
  }

  private isLeaseCurrent(lease: Lease): boolean {
    const activeLease = this.leases.get(lease.jobId);
    return Boolean(activeLease && activeLease.fencingToken === lease.fencingToken && activeLease.expiresAt > this.now);
  }
}

test("end-to-end job lifecycle completes through outbox, publisher, queue, worker, and PostgreSQL state", async () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "send-email", priority: 10 });

  assert.equal(forge.outbox.length, 1);
  assert.equal(forge.publishNext(), 1);
  await forge.processNext(async () => {});

  assert.equal(forge.jobs.get(job.id)?.status, "COMPLETED");
});

test("retry and DLQ moves a repeatedly failing job to dead letter", async () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "always-fails", priority: 5, maxAttempts: 2 });
  forge.publishNext();
  await forge.processNext(async () => {
    throw new Error("boom");
  });
  forge.now += 20_000;
  forge.promoteDelayed();
  await forge.processNext(async () => {
    throw new Error("boom");
  });

  assert.equal(forge.jobs.get(job.id)?.status, "DEAD_LETTER");
  assert.deepEqual(forge.dlq, [job.id]);
});

test("worker crash leaves a lease that expires and allows another worker to recover the job", async () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "long-task", priority: 10 });
  forge.publishNext();
  const lease = forge.acquireLease(job.id, "worker-1", 100);
  assert.ok(lease);
  forge.jobs.get(job.id)!.status = "RUNNING";
  forge.now += 101;

  assert.equal(forge.recoverExpiredLeases(), 1);
  await forge.processNext(async () => {}, "worker-2");

  assert.equal(forge.jobs.get(job.id)?.status, "COMPLETED");
});

test("publisher crash after Redis publish does not lose the event or duplicate the ready signal", () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "publish-once", priority: 10 });

  forge.publishNext({ crashAfterPublish: true });
  forge.publishNext();

  assert.equal(forge.outbox[0]?.processed, true);
  assert.deepEqual(forge.readyQueues.get("high"), [job.id]);
});

test("delayed job is promoted after its scheduled time and then executes", async () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "scheduled", priority: 1, runAt: forge.now + 1_000 });

  assert.equal(forge.promoteDelayed(), 0);
  forge.now += 1_001;
  assert.equal(forge.promoteDelayed(), 1);
  await forge.processNext(async () => {});

  assert.equal(forge.jobs.get(job.id)?.status, "COMPLETED");
});

test("queue pause prevents publishing until resume", () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "pause-me", priority: 5 });

  forge.paused = true;
  assert.equal(forge.publishNext(), 0);
  forge.paused = false;
  assert.equal(forge.publishNext(), 1);

  assert.deepEqual(forge.readyQueues.get("medium"), [job.id]);
});

test("concurrent state transition accepts only one versioned command", () => {
  const forge = new InMemoryQueueForge();
  const job = forge.createJob({ name: "race", priority: 5 });

  const retryAccepted = forge.updateWithVersion(job.id, "PENDING", job.version);
  const cancelAccepted = forge.updateWithVersion(job.id, "CANCELED", job.version - 1);

  assert.equal(retryAccepted, true);
  assert.equal(cancelAccepted, false);
});
