ALTER TABLE "dead_letter_jobs" ALTER COLUMN "reason" SET DATA TYPE varchar(1000);--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ALTER COLUMN "reason" DROP NOT NULL;