import { InvalidCursorError } from "../../../errors/api.error.js";
import type { AuditLogRepository } from "./audit.repository.js";
import type { AuditPage, AuditCursor, AuditRecord } from "./audit.types.js";
import type { ListAuditLogsQuery } from "./audit.schema.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async list(query: ListAuditLogsQuery): Promise<AuditPage> {
    const records = await this.repository.list({
      action: query.action,
      actorId: query.actorId,
      targetType: query.targetType,
      targetId: query.targetId,
      from: query.from,
      to: query.to,
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

  private encodeCursor(record: AuditRecord): string {
    const cursor: AuditCursor = { createdAt: record.createdAt, id: record.id };
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(value: string): AuditCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuditCursor>;
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
