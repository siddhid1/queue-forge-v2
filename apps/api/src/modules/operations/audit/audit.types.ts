export interface AuditRecord {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  outcome: string;
  requestId: string | null;
  changeSummary: Record<string, unknown>;
  createdAt: string;
}

export interface AuditPage {
  items: AuditRecord[];
  nextCursor: string | null;
}

export interface AuditCursor {
  createdAt: string;
  id: string;
}
