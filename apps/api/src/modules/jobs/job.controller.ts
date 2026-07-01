import type { Request, Response } from "express";
import { JobRepository } from "./job.repository.js";
import { JobService } from "./job.service.js";

const service = new JobService(new JobRepository());

export class JobController {
  async create(req: Request, res: Response) {
    const idempotencyKey = req.header("Idempotency-Key");
    const job = await service.createJob(req.body, idempotencyKey);

    return res.status(201).json(job);
  }
}
