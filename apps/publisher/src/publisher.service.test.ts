import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxEvent } from "@queue-forge/database";
import { OutboxPublisherService } from "./publisher.service.js";

const event: OutboxEvent = {
  id: "00000000-0000-4000-8000-000000000201",
  eventType: "job.dispatch.requested",
  aggregateType: "job",
  aggregateId: "00000000-0000-4000-8000-000000000202",
  deduplicationKey: "job-created-00000000-0000-4000-8000-000000000202",
  payload: {
    jobId: "00000000-0000-4000-8000-000000000202",
    priority: 10,
    name: "send-email",
  },
  processedAt: null,
  attempts: 0,
  nextAttemptAt: new Date("2026-06-22T10:00:00.000Z"),
  lastError: null,
  claimedBy: null,
  claimExpiresAt: null,
  createdAt: new Date("2026-06-22T10:00:00.000Z"),
};

test("publishEvent pushes job dispatch events through QueueService", async () => {
  const published: Array<{ jobId: string; priority: number }> = [];
  const service = new OutboxPublisherService(
    {
      async claimBatch() {
        return [];
      },
      async markProcessed() {},
      async markFailed() {},
      async getLagMetric() {
        return { oldestUnprocessedAgeMs: 0, count: 0 };
      },
    },
    {
      async enqueue(jobId: string, priority: number) {
        published.push({ jobId, priority });
      },
    },
    "00000000-0000-4000-8000-000000000203",
  );

  await service.publishEvent(event);

  assert.deepEqual(published, [{ jobId: "00000000-0000-4000-8000-000000000202", priority: 10 }]);
});
