import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerRepository } from "./worker.repository.js";
import { OperationsWorkerService } from "./worker.service.js";
import type { WorkerRecord } from "./worker.types.js";

const now = new Date("2026-06-13T12:00:00Z");
const records: WorkerRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    hostname: "worker-1",
    status: "ACTIVE",
    lastHeartbeat: new Date(now.getTime() - 5_000),
    createdAt: new Date("2026-06-13T10:00:00Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    hostname: "worker-2",
    status: "ACTIVE",
    lastHeartbeat: new Date(now.getTime() - 20_000),
    createdAt: new Date("2026-06-13T10:00:00Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    hostname: "worker-3",
    status: "DEAD",
    lastHeartbeat: null,
    createdAt: new Date("2026-06-13T10:00:00Z"),
  },
];

const repository: WorkerRepository = {
  async list(query) {
    return records.filter((record) => {
      if (!query.health) return true;
      if (query.health === "HEALTHY") return record.id.endsWith("1");
      if (query.health === "STALE") return record.id.endsWith("2");
      return record.id.endsWith("3");
    });
  },
  async findById(id) {
    return records.find((record) => record.id === id) ?? null;
  },
};

test("derives worker health from durable status and heartbeat age", async () => {
  const service = new OperationsWorkerService(repository, 15_000, () => now);
  const page = await service.list({ limit: 50 });
  assert.deepEqual(
    page.items.map(({ id, health }) => ({ id, health })),
    [
      { id: "00000000-0000-4000-8000-000000000001", health: "HEALTHY" },
      { id: "00000000-0000-4000-8000-000000000002", health: "STALE" },
      { id: "00000000-0000-4000-8000-000000000003", health: "OFFLINE" },
    ],
  );
  assert.equal(page.nextCursor, null);
});

test("returns an opaque cursor when another page exists", async () => {
  const service = new OperationsWorkerService(repository, 15_000, () => now);
  const page = await service.list({ limit: 2 });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
});

test("rejects malformed cursors", async () => {
  const service = new OperationsWorkerService(repository, 15_000, () => now);
  await assert.rejects(() => service.list({ limit: 2, cursor: "not-a-cursor" }), {
    code: "INVALID_CURSOR",
    statusCode: 400,
  });
});

test("returns a stable not-found domain error", async () => {
  const service = new OperationsWorkerService(repository, 15_000, () => now);
  await assert.rejects(() => service.get("missing"), { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
});
