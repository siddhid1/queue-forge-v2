ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "claimed_by" varchar(255);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_claim_idx" ON "outbox_events" ("claimed_by", "claim_expires_at");
