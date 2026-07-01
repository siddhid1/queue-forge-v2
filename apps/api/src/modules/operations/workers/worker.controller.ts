import type { Request, Response } from "express";
import type { OperationsWorkerService } from "./worker.service.js";
import { listWorkersQuerySchema, workerIdSchema } from "./worker.schema.js";

export class OperationsWorkerController {
  constructor(private readonly service: OperationsWorkerService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = listWorkersQuerySchema.parse(req.query);
    res.json({ data: await this.service.list(query) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    res.json({ data: await this.service.get(workerIdSchema.parse(typeof id === "string" ? id : "")) });
  };
}
