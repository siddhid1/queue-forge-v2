import assert from "node:assert/strict";
import test from "node:test";
import type { Job, NewJob } from "@queue-forge/database";
import { JobService } from "./job.service.js";

const createdJob: Job = {
  id: "00000000-0000-4000-8000-000000000101",
  queueId: null,
  name: "send-email",
  payload: { to: "ops@example.com" },
  priority: 10,
  status: "PENDING",
  attempts: 0,
  maxAttempts: 3,
  version: 0,
  runAt: null,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: new Date("2026-06-22T10:00:00.000Z"),
  updatedAt: new Date("2026-06-22T10:00:00.000Z"),
};

test("createJob delegates job, idempotency, and outbox insertion to one repository transaction", async () => {
  let capturedJob: NewJob | null = null;
  let capturedIdempotencyKey: string | undefined;

  const service = new JobService({
    async createJobWithIdempotencyAndOutbox(job, idempotencyKey) {
      capturedJob = job;
      capturedIdempotencyKey = idempotencyKey;
      return createdJob;
    },
  });

  const result = await service.createJob(
    {
      name: "send-email",
      payload: { to: "ops@example.com" },
      priority: 10,
      maxAttempts: 3,
    },
    "idem-1",
  );

  assert.equal(result, createdJob);
  assert.equal(capturedIdempotencyKey, "idem-1");
  assert.equal(capturedJob?.name, "send-email");
  assert.equal(capturedJob?.status, "PENDING");
  assert.equal(capturedJob?.attempts, 0);
});

test("createJob has no Redis enqueue dependency", async () => {
  const service = new JobService({
    async createJobWithIdempotencyAndOutbox() {
      return createdJob;
    },
  });

  const result = await service.createJob({
    name: "send-email",
    payload: {},
    priority: 1,
    maxAttempts: 1,
  });

  assert.equal(result.id, createdJob.id);
});
