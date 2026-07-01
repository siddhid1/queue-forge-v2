import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, jobLeases, jobs, type Job } from "@queue-forge/database";

export type LeaseHandle = {
  leaseToken: string;
  fencingToken: number;
};

export class JobRepository {
  async findById(id: string): Promise<Job | null> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));

    return job ?? null;
  }

  async acquireLease(jobId: string, workerId: string, ttlMs: number): Promise<LeaseHandle | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    return db.transaction(async (tx) => {
      const [job] = await tx
        .select({ version: jobs.version })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .for("update");

      if (!job) {
        return null;
      }

      await tx.delete(jobLeases).where(and(eq(jobLeases.jobId, jobId), lt(jobLeases.expiresAt, now)));

      const [lease] = await tx
        .insert(jobLeases)
        .values({
          jobId,
          workerId,
          fencingToken: job.version + 1,
          acquiredAt: now,
          expiresAt,
          heartbeatAt: now,
        })
        .onConflictDoNothing()
        .returning({
          leaseToken: jobLeases.leaseToken,
          fencingToken: jobLeases.fencingToken,
        });

      return lease ?? null;
    });
  }

  async renewLease(jobId: string, workerId: string, fencingToken: number, ttlMs: number): Promise<boolean> {
    const [lease] = await db
      .update(jobLeases)
      .set({ expiresAt: new Date(Date.now() + ttlMs), heartbeatAt: new Date() })
      .where(
        and(
          eq(jobLeases.jobId, jobId),
          eq(jobLeases.workerId, workerId),
          eq(jobLeases.fencingToken, fencingToken),
          gt(jobLeases.expiresAt, new Date()),
        ),
      )
      .returning({ jobId: jobLeases.jobId });

    return Boolean(lease);
  }

  async releaseLease(jobId: string, workerId: string, fencingToken: number): Promise<void> {
    await db
      .delete(jobLeases)
      .where(
        and(
          eq(jobLeases.jobId, jobId),
          eq(jobLeases.workerId, workerId),
          eq(jobLeases.fencingToken, fencingToken),
        ),
      );
  }

  async markRunning(id: string): Promise<void> {
    await db.update(jobs).set({ status: "RUNNING", updatedAt: new Date() }).where(eq(jobs.id, id));
  }

  async markRunningWithLease(jobId: string, workerId: string, fencingToken: number): Promise<boolean> {
    const hasLease = await this.hasActiveLease(jobId, workerId, fencingToken);

    if (!hasLease) {
      return false;
    }

    const [job] = await db
      .update(jobs)
      .set({ status: "RUNNING", version: sql`${jobs.version} + 1`, updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id });

    return Boolean(job);
  }

  async markCompleted(id: string): Promise<void> {
    await db.update(jobs).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(jobs.id, id));
  }

  async markCompletedWithLease(jobId: string, workerId: string, fencingToken: number): Promise<boolean> {
    const hasLease = await this.hasActiveLease(jobId, workerId, fencingToken);

    if (!hasLease) {
      return false;
    }

    const [job] = await db
      .update(jobs)
      .set({
        status: "COMPLETED",
        version: sql`${jobs.version} + 1`,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id });

    return Boolean(job);
  }

  async incrementAttempts(id: string): Promise<void> {
    const job = await this.findById(id);

    if (!job) {
      return;
    }

    await db.update(jobs).set({ attempts: job.attempts + 1, updatedAt: new Date() }).where(eq(jobs.id, id));
  }

  private async hasActiveLease(jobId: string, workerId: string, fencingToken: number): Promise<boolean> {
    const [lease] = await db
      .select({ jobId: jobLeases.jobId })
      .from(jobLeases)
      .where(
        and(
          eq(jobLeases.jobId, jobId),
          eq(jobLeases.workerId, workerId),
          eq(jobLeases.fencingToken, fencingToken),
          gt(jobLeases.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return Boolean(lease);
  }
}
