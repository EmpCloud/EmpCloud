// =============================================================================
// EMP CLOUD — API Response Helpers
// =============================================================================

import { Response } from "express";
import type { ApiResponse } from "@empcloud/shared";

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: ApiResponse["meta"]): void {
  const response: ApiResponse<T> = { success: true, data };
  if (meta) response.meta = meta;
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  perPage: number
): void {
  sendSuccess(res, data, 200, {
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  });
}
