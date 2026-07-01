import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/authentication.js";
import type { OperationsQueueService } from "./queue.service.js";

export class OperationsQueueController {
  constructor(private readonly service: OperationsQueueService) {}

  list = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.json({ data: await this.service.list() });
  };

  get = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const name = req.params.name;
    res.json({ data: await this.service.get(typeof name === "string" ? name : "") });
  };

  pause = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const name = String(req.params.name);
    const body = req.body as { reason?: string };
    if (!body.reason || typeof body.reason !== "string") {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "reason is required" } });
      return;
    }
    res.json({ data: await this.service.pause(name, body.reason) });
  };

  resume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const name = String(req.params.name);
    const body = req.body as { reason?: string };
    if (!body.reason || typeof body.reason !== "string") {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "reason is required" } });
      return;
    }
    res.json({ data: await this.service.resume(name, body.reason) });
  };
}
