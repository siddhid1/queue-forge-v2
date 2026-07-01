import { db, deadLetterJobs, jobs } from "@queue-forge/database";
import { eq } from "drizzle-orm";
import type { Job } from "@queue-forge/database";

export class DeadLetterService {
  async moveToDeadLetter(job: Job, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : "Unknown Error";

    await db.transaction(async (tx) => {
      await tx.insert(deadLetterJobs).values({ jobId: job.id, reason });
      await tx.update(jobs).set({ status: "DEAD_LETTER", updatedAt: new Date() }).where(eq(jobs.id, job.id));
    });
  }
}
