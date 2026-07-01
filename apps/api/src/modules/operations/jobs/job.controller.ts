import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/authentication.js";
import type { OperationsJobReadService } from "./job-read.service.js";
import type { OperationsJobCommandService } from "./job-command.service.js";
import { listJobsQuerySchema, retryJobSchema, cancelJobSchema, jobIdParamSchema } from "./job.schema.js";

export class OperationsJobController {
  constructor(
    private readonly readService: OperationsJobReadService,
    private readonly commandService: OperationsJobCommandService,
  ) {}

  list = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const query = listJobsQuerySchema.parse(req.query);
    res.json({ data: await this.readService.list(query) });
  };

  get = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = jobIdParamSchema.parse(req.params.id);
    res.json({ data: await this.readService.get(id) });
  };

  getExecutions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = jobIdParamSchema.parse(req.params.id);
    res.json({ data: await this.readService.getExecutions(id) });
  };

  getEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = jobIdParamSchema.parse(req.params.id);
    res.json({ data: await this.readService.getEvents(id) });
  };

  retry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = jobIdParamSchema.parse(req.params.id);
    const body = retryJobSchema.parse(req.body);
    const result = await this.commandService.retry(id, body.reason, req.actorId, req.id);
    res.json({ data: result });
  };

  cancel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = jobIdParamSchema.parse(req.params.id);
    const body = cancelJobSchema.parse(req.body);
    const result = await this.commandService.cancel(id, body.reason, req.actorId, req.id);
    res.json({ data: result });
  };
}
