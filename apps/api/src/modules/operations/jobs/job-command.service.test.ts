import assert from "node:assert/strict";
import test from "node:test";
import type { OperationsJobRepository } from "./job.repository.js";
import { OperationsJobCommandService } from "./job-command.service.js";
import type { JobRecord } from "./job.types.js";

const failedJob: JobRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  queueId: null,
  name: "failed-job",
  payload: {},
  priority: 5,
  status: "FAILED",
  attempts: 3,
  maxAttempts: 3,
  version: 1,
  runAt: null,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: "2026-06-13T10:00:00.000Z",
  updatedAt: "2026-06-13T10:30:00.000Z",
};

const pendingJob: JobRecord = {
  id: "00000000-0000-4000-8000-000000000002",
  queueId: null,
  name: "pending-job",
  payload: {},
  priority: 5,
  status: "PENDING",
  attempts: 0,
  maxAttempts: 3,
  version: 1,
  runAt: null,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: "2026-06-13T10:00:00.000Z",
  updatedAt: "2026-06-13T10:00:00.000Z",
};

const completedJob: JobRecord = {
  id: "00000000-0000-4000-8000-000000000003",
  queueId: null,
  name: "completed-job",
  payload: {},
  priority: 5,
  status: "COMPLETED",
  attempts: 1,
  maxAttempts: 3,
  version: 1,
  runAt: null,
  cancellationRequestedAt: null,
  completedAt: "2026-06-13T11:00:00.000Z",
  createdAt: "2026-06-13T10:00:00.000Z",
  updatedAt: "2026-06-13T11:00:00.000Z",
};

let currentVersion = 1;

const repository: OperationsJobRepository = {
  async list() {
    return [];
  },
  async findById(id) {
    return [failedJob, pendingJob, completedJob].find((j) => j.id === id) ?? null;
  },
  async getExecutions() {
    return [];
  },
  async getEvents() {
    return [];
  },
  async updateStatus(id, status, version) {
    currentVersion++;
    const job = [failedJob, pendingJob, completedJob].find((j) => j.id === id);
    if (!job) return null;
    return { ...job, status, version: version + 1 };
  },
  async createJobEvent() {},
};

const mockAuditLog = async () => {};

test("retry transitions FAILED to PENDING", async () => {
  const service = new OperationsJobCommandService(repository, mockAuditLog);
  const result = await service.retry(failedJob.id, "testing retry", "operator", "req-1");
  assert.equal(result.status, "PENDING");
});

test("retry rejects COMPLETED jobs", async () => {
  const service = new OperationsJobCommandService(repository, mockAuditLog);
  await assert.rejects(() => service.retry(completedJob.id, "retry completed", "operator"), {
    code: "INVALID_STATE_TRANSITION",
  });
});

test("cancel transitions PENDING to CANCELED", async () => {
  const service = new OperationsJobCommandService(repository, mockAuditLog);
  const result = await service.cancel(pendingJob.id, "testing cancel", "operator", "req-2");
  assert.equal(result.status, "CANCELED");
});

test("cancel rejects COMPLETED jobs", async () => {
  const service = new OperationsJobCommandService(repository, mockAuditLog);
  await assert.rejects(() => service.cancel(completedJob.id, "cancel completed", "operator"), {
    code: "INVALID_STATE_TRANSITION",
  });
});

test("retry returns not found for missing job", async () => {
  const service = new OperationsJobCommandService(repository, mockAuditLog);
  await assert.rejects(() => service.retry("00000000-0000-4000-8000-000000000099", "test", "operator"), {
    code: "RESOURCE_NOT_FOUND",
  });
});
