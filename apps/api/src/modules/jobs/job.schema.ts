import { z } from "zod";

export const createJobSchema = z.object({
  name: z.string().min(3).max(255),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().min(0).max(10).default(0),
  maxAttempts: z.number().int().min(1).max(10).default(3),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
