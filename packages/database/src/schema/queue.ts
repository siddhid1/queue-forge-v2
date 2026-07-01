import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const queues = pgTable(
  "queues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    state: varchar("state", { length: 20 }).notNull().default("ACTIVE"),
    version: integer("version").notNull().default(0),
    stateReason: varchar("state_reason", { length: 500 }),
    pausedAt: timestamp("paused_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("queues_name_unique").on(table.name), index("queues_state_idx").on(table.state)],
);

export type Queue = InferSelectModel<typeof queues>;
export type NewQueue = InferInsertModel<typeof queues>;
