import assert from "node:assert/strict";
import test from "node:test";
import type { AuditLogRepository } from "./audit.repository.js";
import { AuditLogService } from "./audit.service.js";
import type { AuditRecord } from "./audit.types.js";

const records: AuditRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    actorId: "operator-1",
    action: "job.retry",
    targetType: "job",
    targetId: "00000000-0000-4000-8000-000000000010",
    reason: "testing retry",
    outcome: "accepted",
    requestId: "req-1",
    changeSummary: { fromStatus: "FAILED", toStatus: "PENDING" },
    createdAt: "2026-06-13T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    actorId: "operator-1",
    action: "queue.pause",
    targetType: "queue",
    targetId: "high",
    reason: "maintenance",
    outcome: "accepted",
    requestId: "req-2",
    changeSummary: { fromState: "ACTIVE", toState: "PAUSED" },
    createdAt: "2026-06-13T12:05:00.000Z",
  },
];

const repository: AuditLogRepository = {
  async list(query) {
    const filtered = records.filter((r) => {
      if (query.action && r.action !== query.action) return false;
      if (query.actorId && r.actorId !== query.actorId) return false;
      if (query.targetType && r.targetType !== query.targetType) return false;
      return true;
    });
    return filtered.slice(0, query.limit);
  },
  async create() {},
};

test("lists audit logs with cursor pagination", async () => {
  const service = new AuditLogService(repository);
  const page = await service.list({ limit: 50 });
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, null);
});

test("filters audit logs by action", async () => {
  const service = new AuditLogService(repository);
  const page = await service.list({ limit: 50, action: "job.retry" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.action, "job.retry");
});

test("filters audit logs by actor", async () => {
  const service = new AuditLogService(repository);
  const page = await service.list({ limit: 50, actorId: "operator-1" });
  assert.equal(page.items.length, 2);
});

test("filters audit logs by target type", async () => {
  const service = new AuditLogService(repository);
  const page = await service.list({ limit: 50, targetType: "queue" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.targetType, "queue");
});
