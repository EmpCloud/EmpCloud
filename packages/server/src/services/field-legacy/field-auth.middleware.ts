// =============================================================================
// EMP CLOUD — Field Tracking shared-secret middleware
//
// Gate for the emp-monitor-compatible EMP Field surface mounted at
// /api/v3/hrms/* and /api/v3/user/fieldAllEmployeeList. emp-monitor's field
// endpoints authenticated with a single shared secret carried in the request
// body (`req.body.secretKey === process.env.FIELD_TRACKING_SECRET_KEY`); there
// is no per-request JWT. We mirror that contract so the existing field client
// works unchanged.
//
// One deliberate deviation from emp-monitor (see auth.middleware.js there):
// emp-monitor compared `req.body.secretKey === process.env.FIELD_TRACKING_SECRET_KEY`
// with no guard, so when the env var was unset both sides were `undefined` and
// the check passed — a request with NO secret silently bypassed auth. We
// fail-closed instead: if the configured secret is empty, every call is
// rejected (same posture as the NAS middleware).
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";
import { sendLegacyResponse } from "../../utils/legacy-response.js";

export function fieldAuthenticate(req: Request, res: Response, next: NextFunction): void {
  const configured = config.fieldTracking.secretKey;

  // Fail-closed — an unconfigured secret must never authenticate anyone.
  if (!configured) {
    sendLegacyResponse(res, 503, null, "Field tracking is not configured");
    return;
  }

  const provided = (req.body && req.body.secretKey) as unknown;
  if (typeof provided !== "string" || provided !== configured) {
    sendLegacyResponse(res, 401, null, "Un-Authorized Access(Invalid secretKey)");
    return;
  }

  next();
}
