import assert from "node:assert/strict";
import test from "node:test";
import type { OperationsJobRepository } from "./job.repository.js";
import { OperationsJobReadService } from "./job-read.service.js";
import type { JobRecord } from "./job.types.js";

const mockRecords: JobRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    queueId: null,
    name: "test-job-1",
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
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    queueId: null,
    name: "failed-job",
    payload: {},
    priority: 10,
    status: "FAILED",
    attempts: 3,
    maxAttempts: 3,
    version: 3,
    runAt: null,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: "2026-06-13T09:00:00.000Z",
    updatedAt: "2026-06-13T09:30:00.000Z",
  },
];

const repository: OperationsJobRepository = {
  async list(query) {
    return mockRecords.filter((r) => {
      if (query.status && r.status !== query.status) return false;
      return true;
    });
  },
  async findById(id) {
    return mockRecords.find((r) => r.id === id) ?? null;
  },
  async getExecutions() {
    return [];
  },
  async getEvents() {
    return [];
  },
  async updateStatus() {
    return null;
  },
  async createJobEvent() {},
};

test("lists jobs with cursor pagination", async () => {
  const service = new OperationsJobReadService(repository);
  const page = await service.list({ limit: 50 });
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, null);
  assert.equal(page.items[0]?.name, "test-job-1");
});

test("filters jobs by status", async () => {
  const service = new OperationsJobReadService(repository);
  const page = await service.list({ limit: 50, status: "FAILED" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.status, "FAILED");
});

test("returns single job by id", async () => {
  const service = new OperationsJobReadService(repository);
  const job = await service.get("00000000-0000-4000-8000-000000000001");
  assert.equal(job.name, "test-job-1");
});

test("throws not found for missing job", async () => {
  const service = new OperationsJobReadService(repository);
  await assert.rejects(() => service.get("00000000-0000-4000-8000-000000000099"), {
    code: "RESOURCE_NOT_FOUND",
  });
});

test("returns next cursor when more results exist", async () => {
  const singleRecordRepo: OperationsJobRepository = {
    ...repository,
    async list(query) {
      return mockRecords.slice(0, query.limit);
    },
  };
  const service = new OperationsJobReadService(singleRecordRepo);
  const page = await service.list({ limit: 1 });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
});

test("rejects malformed cursor", async () => {
  const service = new OperationsJobReadService(repository);
  await assert.rejects(() => service.list({ limit: 10, cursor: "bad-cursor" }), {
    code: "INVALID_CURSOR",
  });
});
