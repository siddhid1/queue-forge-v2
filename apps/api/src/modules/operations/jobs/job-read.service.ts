import { InvalidCursorError, ResourceNotFoundError } from "../../../errors/api.error.js";
import type { OperationsJobRepository } from "./job.repository.js";
import type { JobPage, JobSummary, JobCursor, JobRecord, JobExecutionRecord, JobEventRecord } from "./job.types.js";
import type { ListJobsQuery } from "./job.schema.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OperationsJobReadService {
  constructor(
    private readonly repository: OperationsJobRepository,
  ) {}

  async list(query: ListJobsQuery): Promise<JobPage> {
    const records = await this.repository.list({
      queueId: query.queueId,
      status: query.status,
      name: query.name,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      limit: query.limit + 1,
      before: query.cursor ? this.decodeCursor(query.cursor) : undefined,
    });

    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page.map(toSummary),
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  async get(id: string): Promise<JobRecord> {
    const job = await this.repository.findById(id);
    if (!job) throw new ResourceNotFoundError("Job", id);
    return job;
  }

  async getExecutions(jobId: string): Promise<JobExecutionRecord[]> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new ResourceNotFoundError("Job", jobId);
    return this.repository.getExecutions(jobId);
  }

  async getEvents(jobId: string): Promise<JobEventRecord[]> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new ResourceNotFoundError("Job", jobId);
    return this.repository.getEvents(jobId);
  }

  private encodeCursor(job: JobRecord): string {
    const cursor: JobCursor = { createdAt: job.updatedAt, id: job.id };
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(value: string): JobCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<JobCursor>;
      const createdAt = new Date(cursor.createdAt ?? "");
      if (!cursor.id || !uuidPattern.test(cursor.id) || Number.isNaN(createdAt.getTime())) {
        throw new InvalidCursorError();
      }
      return { createdAt: cursor.createdAt!, id: cursor.id! };
    } catch (error) {
      if (error instanceof InvalidCursorError) throw error;
      throw new InvalidCursorError();
    }
  }
}

function toSummary(record: JobRecord): JobSummary {
  return {
    id: record.id,
    name: record.name,
    priority: record.priority,
    status: record.status,
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
