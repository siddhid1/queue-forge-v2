ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "queue_id" uuid;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancellation_requested_at" timestamp;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "jobs"
    ADD CONSTRAINT "jobs_queue_id_queues_id_fk"
    FOREIGN KEY ("queue_id") REFERENCES "queues"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_queue_status_created_idx" ON "jobs" ("queue_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_run_at_idx" ON "jobs" ("status", "run_at");
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "aggregate_type" varchar(100) DEFAULT 'job' NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "aggregate_id" uuid;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "deduplication_key" varchar(255);
--> statement-breakpoint
UPDATE "outbox_events"
SET "deduplication_key" = 'legacy-outbox-' || "id"::text
WHERE "deduplication_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "deduplication_key" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_deduplication_key_unique"
    UNIQUE ("deduplication_key");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "last_error" varchar(1000);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_pending_idx"
  ON "outbox_events" ("processed_at", "next_attempt_at", "created_at");
