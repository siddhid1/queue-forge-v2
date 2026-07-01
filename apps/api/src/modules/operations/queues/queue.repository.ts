import { count, min, eq, sql } from "drizzle-orm";
import { db, jobs, queues } from "@queue-forge/database";
import type { QueueJobGroup } from "./queue.types.js";

export interface QueueRepository {
  getJobGroups(): Promise<QueueJobGroup[]>;
  getQueueState(name: string): Promise<{ state: string; pausedAt: Date | null; stateReason: string | null } | null>;
  setQueueState(name: string, state: string, reason: string | null): Promise<{ state: string; pausedAt: Date | null } | null>;
}

export class DrizzleQueueRepository implements QueueRepository {
  async getJobGroups(): Promise<QueueJobGroup[]> {
    return db
      .select({
        priority: jobs.priority,
        status: jobs.status,
        count: count(),
        oldestCreatedAt: min(jobs.createdAt),
      })
      .from(jobs)
      .groupBy(jobs.priority, jobs.status);
  }

  async getQueueState(name: string): Promise<{ state: string; pausedAt: Date | null; stateReason: string | null } | null> {
    const [row] = await db
      .select({ state: queues.state, pausedAt: queues.pausedAt, stateReason: queues.stateReason })
      .from(queues)
      .where(eq(queues.name, name))
      .limit(1);
    return row ?? null;
  }

  async setQueueState(name: string, state: string, reason: string | null): Promise<{ state: string; pausedAt: Date | null } | null> {
    const now = sql`now()`;
    const [row] = await db
      .update(queues)
      .set({
        state: state === "PAUSED" ? "PAUSED" : "ACTIVE",
        pausedAt: state === "PAUSED" ? now : null,
        stateReason: reason,
        updatedAt: now,
      })
      .where(eq(queues.name, name))
      .returning({ state: queues.state, pausedAt: queues.pausedAt });

    return row ?? null;
  }
}
