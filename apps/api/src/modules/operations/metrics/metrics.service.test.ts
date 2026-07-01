import assert from "node:assert/strict";
import test from "node:test";
import type { MetricsRepository } from "./metrics.repository.js";
import { OperationsMetricsService } from "./metrics.service.js";

const repository: MetricsRepository = {
  async getSnapshot() {
    return {
      jobsByStatus: [
        { status: "COMPLETED", count: 8 },
        { status: "FAILED", count: 2 },
        { status: "PENDING", count: 5 },
      ],
      workersByStatus: [{ status: "ACTIVE", count: 3 }],
      retryAttempts: 4,
      jobsCreatedInWindow: 12,
      jobsCompletedInWindow: 6,
      jobsFailedInWindow: 1,
    };
  },
};

test("calculates dashboard metrics from repository aggregates", async () => {
  const now = new Date("2026-06-13T12:00:00Z");
  const service = new OperationsMetricsService(repository, () => now);

  const snapshot = await service.getSnapshot(15);

  assert.equal(snapshot.jobs.total, 15);
  assert.equal(snapshot.jobs.successRate, 0.8);
  assert.equal(snapshot.window.throughputPerMinute, 0.4);
  assert.equal(snapshot.window.from, "2026-06-13T11:45:00.000Z");
  assert.equal(snapshot.workers.total, 3);
});

test("returns null success rate when no terminal jobs exist", async () => {
  const emptyRepository: MetricsRepository = {
    async getSnapshot() {
      return {
        jobsByStatus: [],
        workersByStatus: [],
        retryAttempts: 0,
        jobsCreatedInWindow: 0,
        jobsCompletedInWindow: 0,
        jobsFailedInWindow: 0,
      };
    },
  };
  const service = new OperationsMetricsService(emptyRepository);
  assert.equal((await service.getSnapshot(15)).jobs.successRate, null);
});
