import type { DeadLetterRepository } from "./dead-letter.repository.js";
import type { OperationsJobRepository } from "../jobs/job.repository.js";
import { ResourceNotFoundError, InvalidCursorError, ConflictError, InvalidStateTransitionError } from "../../../errors/api.error.js";
import type { DeadLetterPage, DeadLetterCursor, DeadLetterRecord } from "./dead-letter.types.js";
import type { ListDeadLettersQuery } from "./dead-letter.schema.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DeadLetterService {
  constructor(
    private readonly deadLetterRepository: DeadLetterRepository,
    private readonly jobRepository: OperationsJobRepository,
    private readonly writeAuditLog: (entry: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      outcome: string;
      requestId?: string;
      changeSummary: Record<string, unknown>;
    }) => Promise<void> = async () => {},
  ) {}

  async list(query: ListDeadLettersQuery): Promise<DeadLetterPage> {
    const records = await this.deadLetterRepository.list({
      queueId: query.queueId,
      reasonCode: query.reasonCode,
      limit: query.limit + 1,
      before: query.cursor ? this.decodeCursor(query.cursor) : undefined,
    });

    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  async get(id: string): Promise<DeadLetterRecord> {
    const record = await this.deadLetterRepository.findById(id);
    if (!record) throw new ResourceNotFoundError("DeadLetterJob", id);
    return record;
  }

  async replay(dlqId: string, reason: string, actorId: string, requestId?: string): Promise<{ jobId: string; status: string }> {
    const dlq = await this.deadLetterRepository.findById(dlqId);
    if (!dlq) throw new ResourceNotFoundError("DeadLetterJob", dlqId);

    const job = await this.jobRepository.findById(dlq.jobId);
    if (!job) throw new ResourceNotFoundError("Job", dlq.jobId);

    if (job.status !== "DEAD_LETTER") {
      throw new InvalidStateTransitionError(job.status, "PENDING");
    }

    const updated = await this.jobRepository.updateStatus(dlq.jobId, "PENDING", job.version);
    if (!updated) throw new ConflictError("Job was modified concurrently; retry the request");

    await this.deadLetterRepository.delete(dlqId);

    await this.jobRepository.createJobEvent({
      jobId: dlq.jobId,
      eventType: "job.dlq.replay",
      fromStatus: "DEAD_LETTER",
      toStatus: "PENDING",
      version: updated.version,
      actorType: "operator",
      actorId,
      metadata: { reason, dlqId },
    });

    await this.writeAuditLog({
      actorId,
      action: "dlq.replay",
      targetType: "dead_letter_job",
      targetId: dlqId,
      reason,
      outcome: "accepted",
      requestId,
      changeSummary: { jobId: dlq.jobId, fromStatus: "DEAD_LETTER", toStatus: "PENDING" },
    });

    return { jobId: updated.id, status: updated.status };
  }

  private encodeCursor(record: DeadLetterRecord): string {
    const cursor: DeadLetterCursor = { createdAt: record.createdAt, id: record.id };
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(value: string): DeadLetterCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<DeadLetterCursor>;
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
