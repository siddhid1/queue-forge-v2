import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/authentication.js";
import type { AuditLogService } from "./audit.service.js";
import { listAuditLogsQuerySchema } from "./audit.schema.js";

export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  list = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const query = listAuditLogsQuerySchema.parse(req.query);
    res.json({ data: await this.service.list(query) });
  };
}
