import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/authentication.js";
import type { DeadLetterService } from "./dead-letter.service.js";
import { listDeadLettersQuerySchema, replayDeadLetterSchema, deadLetterIdParamSchema } from "./dead-letter.schema.js";

export class DeadLetterController {
  constructor(private readonly service: DeadLetterService) {}

  list = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const query = listDeadLettersQuerySchema.parse(req.query);
    res.json({ data: await this.service.list(query) });
  };

  get = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = deadLetterIdParamSchema.parse(req.params.id);
    res.json({ data: await this.service.get(id) });
  };

  replay = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = deadLetterIdParamSchema.parse(req.params.id);
    const body = replayDeadLetterSchema.parse(req.body);
    const result = await this.service.replay(id, body.reason, req.actorId, req.id);
    res.json({ data: result });
  };
}
