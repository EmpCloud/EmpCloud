// =============================================================================
// EMP CLOUD — Auth Middleware
// Validates JWT access tokens and attaches user to request.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../../services/oauth/jwt.service.js";
import { getDB } from "../../db/connection.js";
import { sendError } from "../../utils/response.js";
import {
  API_KEY_PREFIX,
  resolveApiKeyPrincipal,
} from "../../services/auth/api-key.service.js";
import type { AccessTokenPayload } from "@empcloud/shared";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Require a valid access token. Rejects with 401 if missing or invalid.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, 401, "UNAUTHORIZED", "Missing or invalid authorization header");
    return;
  }

  const token = authHeader.slice(7);

  // API-key path — an `empc_` token is an opaque programmatic key, not a JWT.
  // Resolve it to the owner's live RBAC principal (same shape as a JWT user)
  // so every downstream permission check works unchanged.
  if (token.startsWith(API_KEY_PREFIX)) {
    resolveApiKeyPrincipal(token)
      .then((principal) => {
        if (!principal) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired API key");
          return;
        }
        req.user = principal;
        next();
      })
      .catch(() => {
        sendError(res, 401, "UNAUTHORIZED", "API key validation failed");
      });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    // Check if token is revoked
    getDB()("oauth_access_tokens")
      .where({ jti: decoded.jti })
      .whereNull("revoked_at")
      .first()
      .then((record) => {
        if (!record) {
          sendError(res, 401, "UNAUTHORIZED", "Token has been revoked");
          return;
        }
        req.user = decoded;
        next();
      })
      .catch(() => {
        sendError(res, 401, "UNAUTHORIZED", "Token validation failed");
      });
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      sendError(res, 401, "TOKEN_EXPIRED", "Access token has expired");
    } else {
      sendError(res, 401, "UNAUTHORIZED", "Invalid access token");
    }
  }
}

/**
 * Optional auth — attaches user if token present, continues either way.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Token invalid — continue without user
  }
  next();
}
