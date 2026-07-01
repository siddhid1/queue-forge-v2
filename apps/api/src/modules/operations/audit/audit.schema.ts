import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  action: z.string().max(100).optional(),
  actorId: z.string().max(255).optional(),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(255).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
