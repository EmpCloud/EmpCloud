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
  organization_id: number;
  email: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  timezone?: string | null;
  is_bio_enabled?: boolean;
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
