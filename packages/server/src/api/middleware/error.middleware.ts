// =============================================================================
// EMP CLOUD — Error Handling Middleware
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { AppError, OAuthError } from "../../utils/errors.js";
import { sendError } from "../../utils/response.js";
import { logger } from "../../utils/logger.js";
import { ZodError } from "zod";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // OAuth errors use a different response format (RFC 6749)
  if (err instanceof OAuthError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid request data", err.errors);
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Unknown errors
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}
