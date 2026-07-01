import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

export const validate = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }

  req.body = result.data;

  next();
};
