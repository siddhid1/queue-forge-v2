import { Router } from "express";
import { createOperationsControllers } from "../../bootstrap/container.js";
import { createOperationsMetricsRouter } from "./metrics/metrics.routes.js";
import { createOperationsQueueRouter } from "./queues/queue.routes.js";
import { createOperationsWorkerRouter } from "./workers/worker.routes.js";
import { createOperationsJobRouter } from "./jobs/job.routes.js";
import { createDeadLetterRouter } from "./dead-letter/dead-letter.routes.js";
import { createAuditLogRouter } from "./audit/audit.routes.js";
import { createAuthenticationMiddleware } from "../../middleware/authentication.js";

let authTokenSet: Set<string> | null = null;

function getAllowedTokens(): Set<string> {
  if (!authTokenSet) {
    const token = process.env.OPERATIONS_AUTH_TOKEN || "dev-token";
    authTokenSet = new Set(token.split(",").map((t) => t.trim()).filter(Boolean));
  }
  return authTokenSet;
}

export function createOperationsRouter(): Router {
  const router = Router();
  const controllers = createOperationsControllers();

  router.use(createAuthenticationMiddleware(getAllowedTokens()));

  router.use("/metrics", createOperationsMetricsRouter(controllers.metrics));
  router.use("/queues", createOperationsQueueRouter(controllers.queues));
  router.use("/workers", createOperationsWorkerRouter(controllers.workers));
  router.use("/jobs", createOperationsJobRouter(controllers.jobs));
  router.use("/dead-letter-jobs", createDeadLetterRouter(controllers.deadLetter));
  router.use("/audit-logs", createAuditLogRouter(controllers.audit));

  return router;
}
