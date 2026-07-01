import { and, asc, count, inArray, isNull, lte, min, or, sql } from "drizzle-orm";
import { db } from "../client.js";
import { outboxEvents, type NewOutboxEvent, type OutboxEvent } from "../schema/outbox-event.js";

const DEFAULT_CLAIM_TTL_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;
const BASE_BACKOFF_MS = 1_000;

export function calculateOutboxBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts, 0), MAX_BACKOFF_MS);
}

function truncateError(error: string): string {
  return error.length > 1000 ? error.slice(0, 1000) : error;
}

function pendingPredicate(now: Date) {
  return and(isNull(outboxEvents.processedAt), lte(outboxEvents.nextAttemptAt, now));
}

function claimablePredicate(now: Date) {
  return and(pendingPredicate(now), or(isNull(outboxEvents.claimedBy), lte(outboxEvents.claimExpiresAt, now)));
}

export class OutboxRepository {
  constructor(private readonly claimTtlMs = DEFAULT_CLAIM_TTL_MS) {}

  async create(event: NewOutboxEvent): Promise<void> {
    await db.insert(outboxEvents).values(event);
  }

  async findPending(limit: number): Promise<OutboxEvent[]> {
    return db.transaction(async (tx) =>
      tx
        .select()
        .from(outboxEvents)
        .where(pendingPredicate(new Date()))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true }),
    );
  }

  async claimBatch(workerId: string, limit: number): Promise<OutboxEvent[]> {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + this.claimTtlMs);

    return db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(claimablePredicate(now))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });

      const ids = candidates.map((event) => event.id);

      if (ids.length === 0) {
        return [];
      }

      return tx
        .update(outboxEvents)
        .set({ claimedBy: workerId, claimExpiresAt })
        .where(inArray(outboxEvents.id, ids))
        .returning();
    });
  }

  async markProcessed(id: string): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        processedAt: new Date(),
        claimedBy: null,
        claimExpiresAt: null,
      })
      .where(sql`${outboxEvents.id} = ${id}`);
  }

  async markFailed(id: string, error: string): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        attempts: sql`${outboxEvents.attempts} + 1`,
        lastError: truncateError(error),
        nextAttemptAt: sql`now() + least((power(2, ${outboxEvents.attempts}) * interval '1 second'), interval '5 minutes')`,
        claimedBy: null,
        claimExpiresAt: null,
      })
      .where(sql`${outboxEvents.id} = ${id}`);
  }

  async getLagMetric(): Promise<{ oldestUnprocessedAgeMs: number; count: number }> {
    const [result] = await db
      .select({
        count: count(),
        oldestCreatedAt: min(outboxEvents.createdAt),
      })
      .from(outboxEvents)
      .where(isNull(outboxEvents.processedAt));

    const oldestCreatedAt = result?.oldestCreatedAt;
    const oldestDate =
      oldestCreatedAt instanceof Date ? oldestCreatedAt : oldestCreatedAt ? new Date(oldestCreatedAt) : null;

    return {
      count: Number(result?.count ?? 0),
      oldestUnprocessedAgeMs: oldestDate ? Math.max(Date.now() - oldestDate.getTime(), 0) : 0,
    };
  }
}
