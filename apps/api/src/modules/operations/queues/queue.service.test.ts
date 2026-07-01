import assert from "node:assert/strict";
import test from "node:test";
import type { QueueExecutionRepository } from "./queue-execution.repository.js";
import type { QueueRepository } from "./queue.repository.js";
import { OperationsQueueService, type QueueLogger } from "./queue.service.js";

const repository: QueueRepository = {
  async getJobGroups() {
    return [
      { priority: 10, status: "PENDING", count: 2, oldestCreatedAt: new Date("2026-01-01T00:00:00Z") },
      { priority: 7, status: "COMPLETED", count: 3, oldestCreatedAt: new Date("2026-01-02T00:00:00Z") },
      { priority: 0, status: "RETRYING", count: 1, oldestCreatedAt: new Date("2026-01-03T00:00:00Z") },
    ];
  },
  async getQueueState() {
    return { state: "ACTIVE", pausedAt: null, stateReason: null };
  },
  async setQueueState() {
    return { state: "ACTIVE", pausedAt: null };
  },
};

const logger: QueueLogger = { warn() {} };

test("returns PostgreSQL depth separately from Redis execution depth", async () => {
  const executionRepository: QueueExecutionRepository = {
    async getDepth(name) {
      return { high: 1, medium: 0, low: 1 }[name];
    },
  };
  const service = new OperationsQueueService(repository, executionRepository, logger);

  const queues = await service.list();

  assert.deepEqual(
    queues.map(({ name, authoritativeDepth, executionDepth }) => ({ name, authoritativeDepth, executionDepth })),
    [
      { name: "high", authoritativeDepth: 2, executionDepth: 1 },
      { name: "medium", authoritativeDepth: 0, executionDepth: 0 },
      { name: "low", authoritativeDepth: 1, executionDepth: 1 },
    ],
  );
});

test("degrades Redis diagnostics without hiding authoritative queue state", async () => {
  const executionRepository: QueueExecutionRepository = {
    async getDepth() {
      throw new Error("Redis unavailable");
    },
  };
  const service = new OperationsQueueService(repository, executionRepository, logger);

  const [high] = await service.list();

  assert.equal(high?.authoritativeDepth, 2);
  assert.equal(high?.executionDepth, null);
  assert.equal(high?.executionLayerAvailable, false);
});

test("rejects unknown queues", async () => {
  const service = new OperationsQueueService(repository, { getDepth: async () => 0 }, logger);
  await assert.rejects(() => service.get("critical"), { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
});
