// =============================================================================
// EMP CLOUD — Legacy kiosk JWT middleware
//
// Verifies the short-lived HS256 token that /api/v3/biometric/auth issues to
// an emp-monitor kiosk device. The decoded payload is attached at
// req.kioskUser in the same nested shape emp-monitor used
// (`{ userData: { id, organization_id, email, timezone, ... } }`) so the
// legacy routes can read `req.kioskUser.userData.organization_id` exactly
// like the original controllers.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendLegacyResponse } from "../../utils/legacy-response.js";

export interface KioskUserData {
  id: number;
  // Primary org the kiosk credential belongs to. Always present so existing
  // tokens (and clients that only read this field) keep working.
  organization_id: number;
  // Multi-org kiosk linking (#1936): when the credential has linked
  // organisations, organization_ids is [primary, ...linked]. Older tokens
  // omit it; readers should treat absent as [organization_id].
  organization_ids?: number[];
  // Map of org id (stringified) → admin email used to identify that org.
  // Used by /get-locations and /get-department to render "Bhilai - admin@x"
  // when multiple orgs share a kiosk.
  organization_emails?: Record<string, string>;
  email: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  timezone?: string | null;
  is_bio_enabled?: boolean;
}

// Single source of truth for "which orgs does this kiosk see right now".
// Routes call this instead of reading req.kioskUser.userData.organization_id
// directly so the multi-org behaviour stays consistent with the JWT shape.
export function getKioskOrgIds(req: Request): number[] {
  const ud = req.kioskUser?.userData;
  if (!ud) return [];
  const list = ud.organization_ids;
  if (Array.isArray(list) && list.length > 0) return list.map((n) => Number(n));
  return [Number(ud.organization_id)];
}

export function getKioskPrimaryOrgId(req: Request): number {
  return Number(req.kioskUser!.userData.organization_id);
}

export function getKioskOrgEmails(req: Request): Record<string, string> {
  return req.kioskUser?.userData.organization_emails ?? {};
}

export interface KioskTokenPayload {
  userData: KioskUserData;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      kioskUser?: KioskTokenPayload;
    }
  }
}

export function kioskSecret(): string {
  return process.env.BIOMETRIC_KIOSK_SECRET || "empcloud-biometric-kiosk-dev-secret";
}

export function kioskTokenExpiry(): string {
  return process.env.BIOMETRIC_KIOSK_EXPIRY || "12h";
}

export function signKioskToken(userData: KioskUserData): string {
  return jwt.sign({ userData }, kioskSecret(), { expiresIn: kioskTokenExpiry() } as jwt.SignOptions);
}

export function kioskAuthenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && typeof authHeader === "string" ? authHeader.split(" ")[1] : undefined;
    if (!token) {
      sendLegacyResponse(res, 401, null, "access token required");
      return;
    }
    const decoded = jwt.verify(token, kioskSecret()) as KioskTokenPayload;
    if (!decoded || !decoded.userData) {
      sendLegacyResponse(res, 401, null, "Invalid access token....");
      return;
    }
    req.kioskUser = decoded;
    next();
  } catch {
    sendLegacyResponse(res, 401, null, "Invalid access token....");
  }
}
