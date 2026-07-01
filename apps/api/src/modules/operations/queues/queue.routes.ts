import { Router } from "express";
import type { OperationsQueueController } from "./queue.controller.js";

export function createOperationsQueueRouter(controller: OperationsQueueController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:name", controller.get);
  router.post("/:name/pause", controller.pause);
  router.post("/:name/resume", controller.resume);
  return router;
}
