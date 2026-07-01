CREATE TABLE IF NOT EXISTS "job_leases" (
	"job_id" uuid PRIMARY KEY NOT NULL REFERENCES "jobs"("id"),
	"worker_id" uuid NOT NULL,
	"lease_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"fencing_token" integer NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"heartbeat_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_leases_worker_id_idx" ON "job_leases" ("worker_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_leases_expires_at_idx" ON "job_leases" ("expires_at");
