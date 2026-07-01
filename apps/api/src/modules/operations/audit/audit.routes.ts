import { Router } from "express";
import type { AuditLogController } from "./audit.controller.js";

export function createAuditLogRouter(controller: AuditLogController): Router {
  const router = Router();
  router.get("/", controller.list);
  return router;
}
