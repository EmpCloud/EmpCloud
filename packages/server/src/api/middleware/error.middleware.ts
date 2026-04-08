// =============================================================================
// EMP CLOUD — Error Handling Middleware
// =============================================================================

import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError, OAuthError } from "../../utils/errors.js";
import { sendError } from "../../utils/response.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";
import { ZodError } from "zod";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // OAuth errors use a different response format (RFC 6749)
  if (err instanceof OAuthError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Multer file-upload errors — return 400 with a helpful message
  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: "File too large. Maximum allowed size is 10 MB.",
      LIMIT_UNEXPECTED_FILE: "File is required. Use field name 'file' for upload.",
      LIMIT_FILE_COUNT: "Too many files uploaded.",
      LIMIT_FIELD_KEY: "Field name too long.",
      LIMIT_FIELD_VALUE: "Field value too long.",
      LIMIT_FIELD_COUNT: "Too many fields.",
      LIMIT_PART_COUNT: "Too many parts.",
    };
    const message = messages[err.code] || `Upload error: ${err.message}`;
    sendError(res, 400, "VALIDATION_ERROR", message);
    return;
  }

  // Zod validation errors — extract first human-readable message for the client
  if (err instanceof ZodError) {
    const firstIssue = err.errors[0];
    const message = firstIssue?.message && firstIssue.message !== "Required"
      ? firstIssue.message
      : "Invalid request data";
    const details = config.isProd ? undefined : err.errors;
    sendError(res, 400, "VALIDATION_ERROR", message, details);
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Catch common DB/input errors that bubble up as unhandled exceptions
  // These are typically caused by bad input (invalid types, constraint violations, etc.)
  const msg = err.message || "";
  if (
    msg.includes("ER_BAD_FIELD_ERROR") ||
    msg.includes("ER_TRUNCATED_WRONG_VALUE") ||
    msg.includes("ER_DATA_TOO_LONG") ||
    msg.includes("ER_DUP_ENTRY") ||
    msg.includes("ER_INVALID_JSON_TEXT") ||
    msg.includes("Cannot read properties") ||
    msg.includes("is not a function") ||
    msg.includes("WARN_DATA_TRUNCATED") ||
    err.name === "TypeError" ||
    err.name === "RangeError" ||
    err.name === "SyntaxError"
  ) {
    logger.warn("Bad request caught by error handler", { message: msg });
    sendError(res, 400, "BAD_REQUEST", "Invalid request — please check your input and try again");
    return;
  }

  // Unknown errors — log full details server-side but return generic message to client
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}
