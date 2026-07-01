import assert from "node:assert/strict";
import test from "node:test";
import type { DeadLetterRepository } from "./dead-letter.repository.js";
import type { OperationsJobRepository } from "../jobs/job.repository.js";
import { DeadLetterService } from "./dead-letter.service.js";
import type { DeadLetterRecord } from "./dead-letter.types.js";
import type { JobRecord } from "../jobs/job.types.js";

const dlqRecords: DeadLetterRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    jobId: "00000000-0000-4000-8000-000000000010",
    reason: "Max retries exceeded",
    createdAt: "2026-06-13T11:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    jobId: "00000000-0000-4000-8000-000000000011",
    reason: "Handler error",
    createdAt: "2026-06-13T11:30:00.000Z",
  },
];

const deadLetterJob: JobRecord = {
  id: "00000000-0000-4000-8000-000000000010",
  queueId: null,
  name: "dead-letter-job",
  payload: {},
  priority: 5,
  status: "DEAD_LETTER",
  attempts: 3,
  maxAttempts: 3,
  version: 1,
  runAt: null,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: "2026-06-13T10:00:00.000Z",
  updatedAt: "2026-06-13T11:00:00.000Z",
};

const deadLetterRepository: DeadLetterRepository = {
  async list() {
    return dlqRecords;
  },
  async findById(id) {
    return dlqRecords.find((r) => r.id === id) ?? null;
  },
  async findByJobId(jobId) {
    return dlqRecords.find((r) => r.jobId === jobId) ?? null;
  },
  async delete() {},
};

const jobRepository: OperationsJobRepository = {
  async list() {
    return [];
  },
  async findById(id) {
    return id === deadLetterJob.id ? deadLetterJob : null;
  },
  async getExecutions() {
    return [];
  },
  async getEvents() {
    return [];
  },
  async updateStatus(id, status, version) {
    return { ...deadLetterJob, id, status, version: version + 1 };
  },
  async createJobEvent() {},
};

test("lists dead letter jobs with cursor pagination", async () => {
  const service = new DeadLetterService(deadLetterRepository, jobRepository);
  const page = await service.list({ limit: 50 });
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, null);
});

test("gets single dead letter record", async () => {
  const service = new DeadLetterService(deadLetterRepository, jobRepository);
  const record = await service.get(dlqRecords[0]!.id);
  assert.equal(record.jobId, dlqRecords[0]!.jobId);
});

test("throws not found for missing DLQ record", async () => {
  const service = new DeadLetterService(deadLetterRepository, jobRepository);
  await assert.rejects(() => service.get("00000000-0000-4000-8000-000000000099"), {
    code: "RESOURCE_NOT_FOUND",
  });
});
