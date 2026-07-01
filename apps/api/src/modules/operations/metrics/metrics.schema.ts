import { z } from "zod";

export const metricsQuerySchema = z.object({
  windowMinutes: z.coerce.number().int().min(1).max(1440).default(15),
});
