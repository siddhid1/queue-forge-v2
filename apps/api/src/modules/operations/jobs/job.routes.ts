import { Router } from "express";
import type { OperationsJobController } from "./job.controller.js";

export function createOperationsJobRouter(controller: OperationsJobController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.get("/:id/executions", controller.getExecutions);
  router.get("/:id/events", controller.getEvents);
  router.post("/:id/retry", controller.retry);
  router.post("/:id/cancel", controller.cancel);

  return router;
}
