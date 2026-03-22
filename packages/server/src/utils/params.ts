// =============================================================================
// EMP CLOUD — Route Parameter Helpers
// Express 5 types req.params values as string | string[].
// =============================================================================

/**
 * Extract a route parameter as a string (Express 5 compat).
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value ?? "";
}

/**
 * Extract a route parameter as a number.
 */
export function paramInt(value: string | string[] | undefined): number {
  return parseInt(param(value), 10);
}
