import { z } from "zod";

export const listJobsQuerySchema = z.object({
  queueId: z.string().uuid().optional(),
  status: z.string().max(50).optional(),
  name: z.string().max(255).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const retryJobSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const cancelJobSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const jobIdParamSchema = z.string().uuid();

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type RetryJobDto = z.infer<typeof retryJobSchema>;
export type CancelJobDto = z.infer<typeof cancelJobSchema>;
