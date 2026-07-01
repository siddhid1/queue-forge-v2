import { pgTable, uuid, timestamp, varchar } from "drizzle-orm/pg-core";

export const jobExecutions = pgTable("job_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  status: varchar("status", { length: 50 }),
  errorMessage: varchar("error_message", { length: 1000 }),
});
