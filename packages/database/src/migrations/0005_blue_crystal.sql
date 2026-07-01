CREATE TABLE "queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"state" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"state_reason" varchar(500),
	"paused_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id"),
	"event_type" varchar(100) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"version" integer NOT NULL,
	"actor_type" varchar(50) NOT NULL,
	"actor_id" varchar(255),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(100) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"outcome" varchar(50) NOT NULL,
	"request_id" varchar(255),
	"change_summary" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "queues_name_unique" ON "queues" ("name");
CREATE INDEX "queues_state_idx" ON "queues" ("state");
CREATE INDEX "job_events_job_created_idx" ON "job_events" ("job_id", "created_at");
CREATE INDEX "audit_logs_target_created_idx" ON "audit_logs" ("target_type", "target_id", "created_at");
