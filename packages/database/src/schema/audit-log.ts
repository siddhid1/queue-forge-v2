import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 100 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    outcome: varchar("outcome", { length: 50 }).notNull(),
    requestId: varchar("request_id", { length: 255 }),
    changeSummary: jsonb("change_summary").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("audit_logs_target_created_idx").on(table.targetType, table.targetId, table.createdAt)],
);
