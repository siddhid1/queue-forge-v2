import { and, desc, eq, gte, lte, lt, or } from "drizzle-orm";
import { db, auditLogs } from "@queue-forge/database";
import type { AuditRecord, AuditCursor } from "./audit.types.js";

export interface AuditLogRepository {
  list(query: {
    limit: number;
    action?: string;
    actorId?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    before?: AuditCursor;
  }): Promise<AuditRecord[]>;
  create(entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    outcome: string;
    requestId?: string;
    changeSummary: Record<string, unknown>;
  }): Promise<void>;
}

export class DrizzleAuditLogRepository implements AuditLogRepository {
  async list(query: {
    limit: number;
    action?: string;
    actorId?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    before?: AuditCursor;
  }): Promise<AuditRecord[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
    if (query.targetType) conditions.push(eq(auditLogs.targetType, query.targetType));
    if (query.targetId) conditions.push(eq(auditLogs.targetId, query.targetId));
    if (query.from) conditions.push(gte(auditLogs.createdAt, query.from));
    if (query.to) conditions.push(lte(auditLogs.createdAt, query.to));

    const paginationCondition = query.before
      ? or(
          lt(auditLogs.createdAt, new Date(query.before.createdAt)),
          and(eq(auditLogs.createdAt, new Date(query.before.createdAt)), lt(auditLogs.id, query.before.id)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions, paginationCondition))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.limit);

    return rows.map(toAuditRecord);
  }

  async create(entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    outcome: string;
    requestId?: string;
    changeSummary: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(auditLogs).values(entry);
  }
}

function toAuditRecord(row: typeof auditLogs.$inferSelect): AuditRecord {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    outcome: row.outcome,
    requestId: row.requestId ?? null,
    changeSummary: row.changeSummary as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}
