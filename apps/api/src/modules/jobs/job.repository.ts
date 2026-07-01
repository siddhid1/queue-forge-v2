import { eq } from "drizzle-orm";
import { db, jobs, type Job, type NewJob, idempotencyKeys, outboxEvents } from "@queue-forge/database";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class JobRepository {
  async create(data: NewJob): Promise<Job> {
    const [inserted] = await db.insert(jobs).values(data).returning();

    if (!inserted) {
      throw new Error("Failed to create job");
    }

    return inserted;
  }

  async createJobWithIdempotencyAndOutbox(data: NewJob, idempotencyKey?: string): Promise<Job> {
    try {
      return await db.transaction(async (tx) => {
        if (idempotencyKey) {
          const [existingIdempotencyKey] = await tx
            .select()
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.key, idempotencyKey));

          if (existingIdempotencyKey) {
            const [existingJob] = await tx.select().from(jobs).where(eq(jobs.id, existingIdempotencyKey.jobId));

            if (!existingJob) {
              throw new Error("Idempotency key references a missing job");
            }

            return existingJob;
          }
        }

        const [inserted] = await tx.insert(jobs).values(data).returning();

        if (!inserted) {
          throw new Error("Failed to create job");
        }

        if (idempotencyKey) {
          await tx.insert(idempotencyKeys).values({ key: idempotencyKey, jobId: inserted.id });
        }

        await tx.insert(outboxEvents).values({
          eventType: "job.dispatch.requested",
          aggregateType: "job",
          aggregateId: inserted.id,
          deduplicationKey: `job-created-${inserted.id}`,
          payload: {
            jobId: inserted.id,
            priority: inserted.priority,
            name: inserted.name,
          },
        });

        return inserted;
      });
    } catch (error) {
      if (!idempotencyKey || !isUniqueViolation(error)) {
        throw error;
      }

      const existingIdempotencyKey = await this.findByIdempotencyKey(idempotencyKey);
      const existingJob = existingIdempotencyKey ? await this.findById(existingIdempotencyKey.jobId) : null;

      if (!existingJob) {
        throw error;
      }

      return existingJob;
    }
  }

  async findByIdempotencyKey(key: string) {
    const [result] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));

    return result ?? null;
  }

  async saveIdempotencyKey(key: string, jobId: string) {
    await db.insert(idempotencyKeys).values({ key, jobId });
  }

  async findById(id: string): Promise<Job | null> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));

    return job ?? null;
  }
}
