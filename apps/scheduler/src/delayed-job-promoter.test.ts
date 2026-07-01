import assert from "node:assert/strict";
import test from "node:test";
import { QUEUES } from "@queue-forge/redis";
import { resolvePriorityQueue } from "./delayed-job-promoter.js";

test("resolvePriorityQueue maps priorities to bounded Redis queue keys", () => {
  assert.equal(resolvePriorityQueue(10), QUEUES.HIGH);
  assert.equal(resolvePriorityQueue(5), QUEUES.MEDIUM);
  assert.equal(resolvePriorityQueue(4), QUEUES.LOW);
});
