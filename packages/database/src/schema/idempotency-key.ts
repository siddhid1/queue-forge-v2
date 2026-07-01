import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).unique().notNull(),
  jobId: uuid("job_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
