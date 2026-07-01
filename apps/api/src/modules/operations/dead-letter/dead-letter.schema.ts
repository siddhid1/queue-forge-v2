import { z } from "zod";

export const listDeadLettersQuerySchema = z.object({
  queueId: z.string().uuid().optional(),
  reasonCode: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const replayDeadLetterSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const deadLetterIdParamSchema = z.string().uuid();

export type ListDeadLettersQuery = z.infer<typeof listDeadLettersQuerySchema>;
export type ReplayDeadLetterDto = z.infer<typeof replayDeadLetterSchema>;
