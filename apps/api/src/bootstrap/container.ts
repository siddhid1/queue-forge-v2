import { QueueService } from "@queue-forge/redis";
import { logger } from "@queue-forge/logger";
import { OperationsMetricsController } from "../modules/operations/metrics/metrics.controller.js";
import { DrizzleMetricsRepository } from "../modules/operations/metrics/metrics.repository.js";
import { OperationsMetricsService } from "../modules/operations/metrics/metrics.service.js";
import { OperationsQueueController } from "../modules/operations/queues/queue.controller.js";
import { RedisQueueExecutionRepository } from "../modules/operations/queues/queue-execution.repository.js";
import { DrizzleQueueRepository } from "../modules/operations/queues/queue.repository.js";
import { OperationsQueueService } from "../modules/operations/queues/queue.service.js";
import { OperationsWorkerController } from "../modules/operations/workers/worker.controller.js";
import { DrizzleWorkerRepository } from "../modules/operations/workers/worker.repository.js";
import { OperationsWorkerService } from "../modules/operations/workers/worker.service.js";

import { DrizzleOperationsJobRepository } from "../modules/operations/jobs/job.repository.js";
import { OperationsJobReadService } from "../modules/operations/jobs/job-read.service.js";
import { OperationsJobCommandService } from "../modules/operations/jobs/job-command.service.js";
import { OperationsJobController } from "../modules/operations/jobs/job.controller.js";

import { DrizzleDeadLetterRepository } from "../modules/operations/dead-letter/dead-letter.repository.js";
import { DeadLetterService } from "../modules/operations/dead-letter/dead-letter.service.js";
import { DeadLetterController } from "../modules/operations/dead-letter/dead-letter.controller.js";

import { DrizzleAuditLogRepository } from "../modules/operations/audit/audit.repository.js";
import { AuditLogService } from "../modules/operations/audit/audit.service.js";
import { AuditLogController } from "../modules/operations/audit/audit.controller.js";

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createOperationsControllers() {
  const queueService = new OperationsQueueService(
    new DrizzleQueueRepository(),
    new RedisQueueExecutionRepository(new QueueService()),
    logger,
  );

  const workerService = new OperationsWorkerService(
    new DrizzleWorkerRepository(),
    readPositiveInteger(process.env.WORKER_STALE_AFTER_MS, 15_000),
  );

  const metricsService = new OperationsMetricsService(new DrizzleMetricsRepository());

  const jobRepository = new DrizzleOperationsJobRepository();
  const auditLogRepository = new DrizzleAuditLogRepository();
  const jobReadService = new OperationsJobReadService(jobRepository);
  const jobCommandService = new OperationsJobCommandService(jobRepository);
  const jobController = new OperationsJobController(jobReadService, jobCommandService);

  const deadLetterRepository = new DrizzleDeadLetterRepository();
  const deadLetterService = new DeadLetterService(deadLetterRepository, jobRepository);
  const deadLetterController = new DeadLetterController(deadLetterService);

  const auditLogService = new AuditLogService(auditLogRepository);
  const auditLogController = new AuditLogController(auditLogService);

  return {
    metrics: new OperationsMetricsController(metricsService),
    queues: new OperationsQueueController(queueService),
    workers: new OperationsWorkerController(workerService),
    jobs: jobController,
    deadLetter: deadLetterController,
    audit: auditLogController,
  };
}
