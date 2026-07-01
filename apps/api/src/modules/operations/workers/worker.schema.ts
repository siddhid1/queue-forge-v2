import { z } from "zod";
import { workerHealthValues } from "./worker.types.js";

export const listWorkersQuerySchema = z.object({
  health: z.enum(workerHealthValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const workerIdSchema = z.string().uuid();
