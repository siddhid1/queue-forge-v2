import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { jobs } from "./jobs.js";

export const jobLeases = pgTable(
  "job_leases",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => jobs.id),
    workerId: uuid("worker_id").notNull(),
    leaseToken: uuid("lease_token").defaultRandom().notNull(),
    fencingToken: integer("fencing_token").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    heartbeatAt: timestamp("heartbeat_at").defaultNow().notNull(),
  },
  (table) => [
    index("job_leases_worker_id_idx").on(table.workerId),
    index("job_leases_expires_at_idx").on(table.expiresAt),
  ],
);

export type JobLease = InferSelectModel<typeof jobLeases>;
export type NewJobLease = InferInsertModel<typeof jobLeases>;
