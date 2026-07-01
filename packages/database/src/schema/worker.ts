import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const workers = pgTable("workers", {
  id: uuid("id").defaultRandom().primaryKey(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
