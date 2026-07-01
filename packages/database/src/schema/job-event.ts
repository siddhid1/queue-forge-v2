import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { jobs } from "./jobs.js";

export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }),
    version: integer("version").notNull(),
    actorType: varchar("actor_type", { length: 50 }).notNull(),
    actorId: varchar("actor_id", { length: 255 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("job_events_job_created_idx").on(table.jobId, table.createdAt)],
);
