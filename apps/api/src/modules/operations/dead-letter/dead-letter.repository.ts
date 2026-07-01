import { and, desc, eq, lt, or } from "drizzle-orm";
import { db, deadLetterJobs } from "@queue-forge/database";
import type { DeadLetterRecord, DeadLetterCursor } from "./dead-letter.types.js";

export interface DeadLetterRepository {
  list(query: {
    limit: number;
    queueId?: string;
    reasonCode?: string;
    before?: DeadLetterCursor;
  }): Promise<DeadLetterRecord[]>;
  findById(id: string): Promise<DeadLetterRecord | null>;
  findByJobId(jobId: string): Promise<DeadLetterRecord | null>;
  delete(id: string): Promise<void>;
}

export class DrizzleDeadLetterRepository implements DeadLetterRepository {
  async list(query: {
    limit: number;
    queueId?: string;
    reasonCode?: string;
    before?: DeadLetterCursor;
  }): Promise<DeadLetterRecord[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.reasonCode) conditions.push(eq(deadLetterJobs.reason, query.reasonCode));

    const paginationCondition = query.before
      ? or(
          lt(deadLetterJobs.createdAt, new Date(query.before.createdAt)),
          and(eq(deadLetterJobs.createdAt, new Date(query.before.createdAt)), lt(deadLetterJobs.id, query.before.id)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(deadLetterJobs)
      .where(and(...conditions, paginationCondition))
      .orderBy(desc(deadLetterJobs.createdAt), desc(deadLetterJobs.id))
      .limit(query.limit);

    return rows.map(toDeadLetterRecord);
  }

  async findById(id: string): Promise<DeadLetterRecord | null> {
    const [row] = await db.select().from(deadLetterJobs).where(eq(deadLetterJobs.id, id)).limit(1);
    return row ? toDeadLetterRecord(row) : null;
  }

  async findByJobId(jobId: string): Promise<DeadLetterRecord | null> {
    const [row] = await db.select().from(deadLetterJobs).where(eq(deadLetterJobs.jobId, jobId)).limit(1);
    return row ? toDeadLetterRecord(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.delete(deadLetterJobs).where(eq(deadLetterJobs.id, id));
  }
}

function toDeadLetterRecord(row: typeof deadLetterJobs.$inferSelect): DeadLetterRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
