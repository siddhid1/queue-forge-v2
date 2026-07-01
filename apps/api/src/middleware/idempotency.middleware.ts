import type { Request, Response, NextFunction } from "express";

export function validateIdempotencyKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("Idempotency-Key");

  if (!key) {
    return res.status(400).json({ error: "Missing Idempotency-Key" });
  }

  next();
}
