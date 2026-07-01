import type { Request, Response } from "express";
import type { OperationsMetricsService } from "./metrics.service.js";
import { metricsQuerySchema } from "./metrics.schema.js";

export class OperationsMetricsController {
  constructor(private readonly service: OperationsMetricsService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const query = metricsQuerySchema.parse(req.query);
    res.json({ data: await this.service.getSnapshot(query.windowMinutes) });
  };
}
