import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { index, integer, pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    eventType: varchar("event_type", {
      length: 100,
    }).notNull(),

    aggregateType: varchar("aggregate_type", { length: 100 }).notNull().default("job"),
    aggregateId: uuid("aggregate_id"),
    deduplicationKey: varchar("deduplication_key", { length: 255 }).notNull().unique(),

    payload: jsonb("payload").notNull(),

    processedAt: timestamp("processed_at"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: varchar("last_error", { length: 1000 }),
    claimedBy: varchar("claimed_by", { length: 255 }),
    claimExpiresAt: timestamp("claim_expires_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("outbox_pending_idx").on(table.processedAt, table.nextAttemptAt, table.createdAt),
    index("outbox_claim_idx").on(table.claimedBy, table.claimExpiresAt),
  ],
);

export type OutboxEvent = InferSelectModel<typeof outboxEvents>;
export type NewOutboxEvent = InferInsertModel<typeof outboxEvents>;
