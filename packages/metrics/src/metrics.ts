import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const register = new Registry();

export const jobsCreated = new Counter({
  name: "queue_forge_jobs_created_total",
  help: "Total jobs created",
  registers: [register],
});

export const jobsCompleted = new Counter({
  name: "queue_forge_jobs_completed_total",
  help: "Total jobs completed",
  registers: [register],
});

export const jobsFailed = new Counter({
  name: "queue_forge_jobs_failed_total",
  help: "Total jobs failed",
  registers: [register],
});

export const executionLatency = new Histogram({
  name: "queue_forge_job_execution_seconds",
  help: "Job execution duration",
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const outboxLagSeconds = new Gauge({
  name: "queue_forge_outbox_lag_seconds",
  help: "Age in seconds of the oldest unprocessed outbox event",
  registers: [register],
});

export const outboxPendingEvents = new Gauge({
  name: "queue_forge_outbox_pending_events",
  help: "Number of unprocessed outbox events",
  registers: [register],
});

export const outboxEventsPublished = new Counter({
  name: "queue_forge_outbox_events_published_total",
  help: "Total outbox events published to Redis",
  registers: [register],
});

export const outboxEventsFailed = new Counter({
  name: "queue_forge_outbox_events_failed_total",
  help: "Total outbox event publish failures",
  registers: [register],
});

export const outboxPublishDuration = new Histogram({
  name: "queue_forge_outbox_publish_duration_seconds",
  help: "Outbox event publish duration",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const delayedJobsPromoted = new Counter({
  name: "queue_forge_delayed_jobs_promoted_total",
  help: "Total delayed jobs promoted to ready queues",
  registers: [register],
});
