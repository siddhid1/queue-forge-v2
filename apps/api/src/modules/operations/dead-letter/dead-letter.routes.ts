import { Router } from "express";
import type { DeadLetterController } from "./dead-letter.controller.js";

export function createDeadLetterRouter(controller: DeadLetterController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/:id/replay", controller.replay);

  return router;
}
