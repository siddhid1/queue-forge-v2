import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { pgTable, uuid, varchar, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { queues } from "./queue.js";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queueId: uuid("queue_id").references(() => queues.id),
    name: varchar("name", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    priority: integer("priority").notNull().default(0),
    status: varchar("status", { length: 50 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    version: integer("version").notNull().default(0),
    runAt: timestamp("run_at"),
    cancellationRequestedAt: timestamp("cancellation_requested_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jobs_queue_status_created_idx").on(table.queueId, table.status, table.createdAt),
    index("jobs_status_run_at_idx").on(table.status, table.runAt),
  ],
);

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;
