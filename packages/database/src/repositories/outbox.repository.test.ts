import assert from "node:assert/strict";
import test from "node:test";
import { calculateOutboxBackoffMs } from "./outbox.repository.js";

test("calculateOutboxBackoffMs uses bounded exponential backoff", () => {
  assert.equal(calculateOutboxBackoffMs(0), 1_000);
  assert.equal(calculateOutboxBackoffMs(3), 8_000);
  assert.equal(calculateOutboxBackoffMs(20), 300_000);
});
