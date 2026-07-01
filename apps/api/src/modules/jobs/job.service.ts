import { type Job, type NewJob } from "@queue-forge/database";
import type { JobRepository } from "./job.repository.js";
import type { CreateJobDto } from "./job.schema.js";
import { JobStatus } from "./job.types.js";

export class JobService {
  constructor(private readonly repository: Pick<JobRepository, "createJobWithIdempotencyAndOutbox">) {}

  async createJob(payload: CreateJobDto, idempotencyKey?: string): Promise<Job> {
    const now = new Date();

    const job: NewJob = {
      name: payload.name,
      payload: payload.payload,
      priority: payload.priority,
      maxAttempts: payload.maxAttempts,
      status: JobStatus.PENDING,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.createJobWithIdempotencyAndOutbox(job, idempotencyKey);
  }
}
