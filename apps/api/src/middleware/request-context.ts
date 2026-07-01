import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  req.id = (req.header("X-Request-Id") as string) || randomUUID();
  next();
}
