import { and, desc, eq, gte, gt, lte, lt, or, like, asc } from "drizzle-orm";
import { db, jobs, jobExecutions, jobEvents, jobLeases } from "@queue-forge/database";
import type { JobRecord, JobExecutionRecord, JobEventRecord, JobCursor } from "./job.types.js";

export interface OperationsJobRepository {
  list(query: {
    limit: number;
    queueId?: string;
    status?: string;
    name?: string;
    createdFrom?: Date;
    createdTo?: Date;
    before?: JobCursor;
  }): Promise<JobRecord[]>;
  findById(id: string): Promise<JobRecord | null>;
  getExecutions(jobId: string): Promise<JobExecutionRecord[]>;
  getEvents(jobId: string): Promise<JobEventRecord[]>;
  updateStatus(id: string, status: string, version: number): Promise<JobRecord | null>;
  createJobEvent(event: {
    jobId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    version: number;
    actorType: string;
    actorId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export class DrizzleOperationsJobRepository implements OperationsJobRepository {
  async list(query: {
    limit: number;
    queueId?: string;
    status?: string;
    name?: string;
    createdFrom?: Date;
    createdTo?: Date;
    before?: JobCursor;
  }): Promise<JobRecord[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.queueId) conditions.push(eq(jobs.queueId, query.queueId));
    if (query.status) conditions.push(eq(jobs.status, query.status));
    if (query.name) conditions.push(like(jobs.name, `%${query.name}%`));
    if (query.createdFrom) conditions.push(gte(jobs.createdAt, query.createdFrom));
    if (query.createdTo) conditions.push(lte(jobs.createdAt, query.createdTo));

    const paginationCondition = query.before
      ? or(
          lt(jobs.updatedAt, new Date(query.before.createdAt)),
          and(eq(jobs.updatedAt, new Date(query.before.createdAt)), lt(jobs.id, query.before.id)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(jobs)
      .where(and(...conditions, paginationCondition))
      .orderBy(desc(jobs.updatedAt), desc(jobs.id))
      .limit(query.limit);

    return rows.map(toJobRecord);
  }

  async findById(id: string): Promise<JobRecord | null> {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row ? toJobRecord(row) : null;
  }

  async getExecutions(jobId: string): Promise<JobExecutionRecord[]> {
    const rows = await db
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId))
      .orderBy(desc(jobExecutions.startedAt));

    return rows.map(toJobExecutionRecord);
  }

  async getEvents(jobId: string): Promise<JobEventRecord[]> {
    const rows = await db
      .select()
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(asc(jobEvents.createdAt));

    return rows.map(toJobEventRecord);
  }

  async updateStatus(id: string, status: string, version: number): Promise<JobRecord | null> {
    const [activeLease] = await db
      .select({ jobId: jobLeases.jobId })
      .from(jobLeases)
      .where(and(eq(jobLeases.jobId, id), gt(jobLeases.expiresAt, new Date())))
      .limit(1);

    if (activeLease) {
      return null;
    }

    const [row] = await db
      .update(jobs)
      .set({ status, version: version + 1, updatedAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.version, version)))
      .returning();

    return row ? toJobRecord(row) : null;
  }

  async createJobEvent(event: {
    jobId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    version: number;
    actorType: string;
    actorId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(jobEvents).values(event);
  }
}

function toJobRecord(row: typeof jobs.$inferSelect): JobRecord {
  return {
    id: row.id,
    queueId: row.queueId ?? null,
    name: row.name,
    payload: row.payload as Record<string, unknown>,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    version: row.version,
    runAt: row.runAt?.toISOString() ?? null,
    cancellationRequestedAt: row.cancellationRequestedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toJobExecutionRecord(row: typeof jobExecutions.$inferSelect): JobExecutionRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    status: row.status ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

function toJobEventRecord(row: typeof jobEvents.$inferSelect): JobEventRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    eventType: row.eventType,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    version: row.version,
    actorType: row.actorType,
    actorId: row.actorId ?? null,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}
