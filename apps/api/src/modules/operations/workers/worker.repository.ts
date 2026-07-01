import { and, desc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { db, workers } from "@queue-forge/database";
import type { WorkerHealth, WorkerRecord } from "./worker.types.js";

export interface WorkerListQuery {
  limit: number;
  health?: WorkerHealth;
  staleBefore: Date;
  before?: {
    createdAt: Date;
    id: string;
  };
}

export interface WorkerRepository {
  list(query: WorkerListQuery): Promise<WorkerRecord[]>;
  findById(id: string): Promise<WorkerRecord | null>;
}

export class DrizzleWorkerRepository implements WorkerRepository {
  list(query: WorkerListQuery): Promise<WorkerRecord[]> {
    const healthCondition =
      query.health === "HEALTHY"
        ? and(eq(workers.status, "ACTIVE"), gte(workers.lastHeartbeat, query.staleBefore))
        : query.health === "STALE"
          ? and(
              eq(workers.status, "ACTIVE"),
              or(isNull(workers.lastHeartbeat), lt(workers.lastHeartbeat, query.staleBefore)),
            )
          : query.health === "OFFLINE"
            ? ne(workers.status, "ACTIVE")
            : undefined;
    const paginationCondition = query.before
      ? or(
          lt(workers.createdAt, query.before.createdAt),
          and(eq(workers.createdAt, query.before.createdAt), lt(workers.id, query.before.id)),
        )
      : undefined;

    return db
      .select()
      .from(workers)
      .where(and(healthCondition, paginationCondition))
      .orderBy(desc(workers.createdAt), desc(workers.id))
      .limit(query.limit);
  }

  async findById(id: string): Promise<WorkerRecord | null> {
    const [worker] = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
    return worker ?? null;
  }
}
