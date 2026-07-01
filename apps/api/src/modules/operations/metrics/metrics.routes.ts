import { Router } from "express";
import type { OperationsMetricsController } from "./metrics.controller.js";

export function createOperationsMetricsRouter(controller: OperationsMetricsController): Router {
  const router = Router();
  router.get("/", controller.get);
  return router;
}
