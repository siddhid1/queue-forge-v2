import { count, gte, sql } from "drizzle-orm";
import { db, jobs, workers } from "@queue-forge/database";

export interface StatusCount {
  status: string;
  count: number;
}

export interface MetricsSnapshotRecord {
  jobsByStatus: StatusCount[];
  workersByStatus: StatusCount[];
  retryAttempts: number;
  jobsCreatedInWindow: number;
  jobsCompletedInWindow: number;
  jobsFailedInWindow: number;
}

export interface MetricsRepository {
  getSnapshot(since: Date): Promise<MetricsSnapshotRecord>;
}

export class DrizzleMetricsRepository implements MetricsRepository {
  async getSnapshot(since: Date): Promise<MetricsSnapshotRecord> {
    const [jobsByStatus, workersByStatus, retryRows, createdRows, completedRows, failedRows] = await Promise.all([
      db.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status),
      db.select({ status: workers.status, count: count() }).from(workers).groupBy(workers.status),
      db.select({ value: sql<number>`coalesce(sum(${jobs.attempts}), 0)::int` }).from(jobs),
      db.select({ value: count() }).from(jobs).where(gte(jobs.createdAt, since)),
      db
        .select({ value: count() })
        .from(jobs)
        .where(sql`${jobs.status} = 'COMPLETED' and ${jobs.updatedAt} >= ${since}`),
      db
        .select({ value: count() })
        .from(jobs)
        .where(sql`${jobs.status} in ('FAILED', 'DEAD_LETTER') and ${jobs.updatedAt} >= ${since}`),
    ]);

    return {
      jobsByStatus,
      workersByStatus,
      retryAttempts: retryRows[0]?.value ?? 0,
      jobsCreatedInWindow: createdRows[0]?.value ?? 0,
      jobsCompletedInWindow: completedRows[0]?.value ?? 0,
      jobsFailedInWindow: failedRows[0]?.value ?? 0,
    };
  }
}
