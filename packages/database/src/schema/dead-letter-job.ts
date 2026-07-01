import { pgTable, uuid, timestamp, varchar } from "drizzle-orm/pg-core";

export const deadLetterJobs = pgTable("dead_letter_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull(),
  reason: varchar("reason", { length: 1000 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
