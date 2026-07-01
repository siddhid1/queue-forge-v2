ALTER TABLE "job_executions" ALTER COLUMN "started_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "job_executions" ALTER COLUMN "error_message" SET DATA TYPE varchar(1000);