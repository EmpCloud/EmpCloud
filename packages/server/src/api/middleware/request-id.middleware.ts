// =============================================================================
// EMP CLOUD — Request ID Middleware
// Adds a correlation ID (X-Request-ID) to every request for log tracing.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
