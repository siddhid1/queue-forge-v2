import { Router } from "express";
import type { OperationsWorkerController } from "./worker.controller.js";

export function createOperationsWorkerRouter(controller: OperationsWorkerController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  return router;
}
