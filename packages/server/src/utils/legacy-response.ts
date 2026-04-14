// =============================================================================
// EMP CLOUD — Legacy emp-monitor response shape
//
// Existing kiosk clients built against emp-monitor's /v3/bioMetric API expect
// responses of the form { code, message, error, data } — crucially with the
// HTTP status always 200 regardless of the logical code. This helper exists
// only so the biometric-legacy compatibility router can stay bit-identical
// to emp-monitor. Do not use it from new EmpCloud endpoints — use
// utils/response.ts instead.
// =============================================================================

import { Response } from "express";

export function sendLegacyResponse(
  res: Response,
  code: number,
  data: unknown,
  message: string | null,
  error: unknown = null,
): Response {
  return res.json({ code, message, error, data });
}
