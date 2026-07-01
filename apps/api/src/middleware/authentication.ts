import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  actorId: string;
}

const BYPASS_PATHS = new Set(["/api/v1/operations/metrics/prometheus"]);

function readBearerToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

export function createAuthenticationMiddleware(allowedTokens: Set<string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (BYPASS_PATHS.has(req.path)) {
      next();
      return;
    }

    const token = readBearerToken(req);
    if (!token || !allowedTokens.has(token)) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authentication token" },
      });
      return;
    }

    (req as AuthenticatedRequest).actorId = "operator";
    next();
  };
}
