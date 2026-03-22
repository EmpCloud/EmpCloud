// =============================================================================
// EMP CLOUD — JWT Service (RS256)
// Signs and verifies JWTs using asymmetric RS256 keys.
// =============================================================================

import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import type { AccessTokenPayload, IDTokenPayload } from "@empcloud/shared";

let privateKey: string | null = null;
let publicKey: string | null = null;
let keyId: string | null = null;

/**
 * Load RSA keys from disk. Call once at startup.
 */
export function loadKeys(): void {
  try {
    const resolve = (p: string) => path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    privateKey = fs.readFileSync(resolve(config.oauth.privateKeyPath), "utf-8");
    publicKey = fs.readFileSync(resolve(config.oauth.publicKeyPath), "utf-8");
    // Derive kid from public key fingerprint
    keyId = crypto
      .createHash("sha256")
      .update(publicKey)
      .digest("base64url")
      .slice(0, 16);
    logger.info(`RSA keys loaded (kid: ${keyId})`);
  } catch (err) {
    logger.warn("RSA keys not found. Run 'pnpm generate-keys' to create them.");
  }
}

export function getPublicKey(): string {
  if (!publicKey) throw new Error("RSA public key not loaded");
  return publicKey;
}

export function getPrivateKey(): string {
  if (!privateKey) throw new Error("RSA private key not loaded");
  return privateKey;
}

export function getKeyId(): string {
  if (!keyId) throw new Error("Key ID not available");
  return keyId;
}

/**
 * Sign an access token (RS256).
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, "iat" | "exp" | "iss">): string {
  return jwt.sign(payload as object, getPrivateKey(), {
    algorithm: "RS256",
    expiresIn: parseExpiry(config.oauth.accessTokenExpiry),
    issuer: config.oauth.issuer,
    keyid: getKeyId(),
  });
}

/**
 * Sign an ID token (RS256, OIDC).
 */
export function signIDToken(payload: Omit<IDTokenPayload, "iat" | "exp" | "iss">): string {
  return jwt.sign(payload as object, getPrivateKey(), {
    algorithm: "RS256",
    expiresIn: parseExpiry(config.oauth.idTokenExpiry),
    issuer: config.oauth.issuer,
    keyid: getKeyId(),
  });
}

/**
 * Verify and decode an access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getPublicKey(), {
    algorithms: ["RS256"],
    issuer: config.oauth.issuer,
  }) as unknown as AccessTokenPayload;
}

/**
 * Get the JWKS (JSON Web Key Set) for OIDC discovery.
 */
export function getJWKS(): object {
  const pubKey = getPublicKey();
  const keyObject = crypto.createPublicKey(pubKey);
  const jwk = keyObject.export({ format: "jwk" });

  return {
    keys: [
      {
        ...jwk,
        kid: getKeyId(),
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

/**
 * Parse expiry string (e.g. "15m", "7d") to seconds.
 */
export function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}
