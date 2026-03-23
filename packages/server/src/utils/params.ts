// =============================================================================
// EMP CLOUD — Route Parameter Helpers
// Express 5 types req.params values as string | string[].
// =============================================================================

import { ValidationError } from "./errors.js";

/**
 * Extract a route parameter as a string (Express 5 compat).
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value ?? "";
}

/**
 * Extract a route parameter as a number.
 * Throws ValidationError if the value is not a valid integer.
 */
export function paramInt(value: string | string[] | undefined): number {
  const raw = param(value);
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || String(parsed) !== raw) {
    throw new ValidationError(`Invalid ID parameter: "${raw}" is not a valid integer`);
  }
  return parsed;
}
