import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "@queue-forge/database";
import { JobExecutor } from "./job-executor.js";

const job: Job = {
  id: "00000000-0000-4000-8000-000000000301",
  queueId: null,
  name: "send-email",
  payload: {},
  priority: 5,
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

test("execute calls the registered handler for the job name", async () => {
  let handledJobId: string | null = null;
  const executor = new JobExecutor();
  executor.register("send-email", async (handledJob) => {
    handledJobId = handledJob.id;
  });

  await executor.execute(job);

  assert.equal(handledJobId, job.id);
});

test("execute throws when no handler is registered", async () => {
  const executor = new JobExecutor();

  await assert.rejects(() => executor.execute(job), /No handler registered/);
});

test("execute propagates handler errors", async () => {
  const executor = new JobExecutor();
  executor.register("send-email", async () => {
    throw new Error("handler failed");
  });

  await assert.rejects(() => executor.execute(job), /handler failed/);
});
