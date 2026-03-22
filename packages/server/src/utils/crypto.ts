// =============================================================================
// EMP CLOUD — Crypto Utilities
// Hashing, random token generation, PKCE verification.
// =============================================================================

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PASSWORD_POLICY } from "@empcloud/shared";

/**
 * Hash a password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_POLICY.BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically secure random hex string.
 */
export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generate a cryptographically secure random base64url string.
 */
export function randomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * SHA-256 hash of a string (hex output).
 */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * SHA-256 hash of a string (base64url output) — used for PKCE S256.
 */
export function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

/**
 * Verify a PKCE code_verifier against a code_challenge.
 */
export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: "S256" | "plain"
): boolean {
  if (method === "plain") {
    return codeVerifier === codeChallenge;
  }
  return sha256Base64Url(codeVerifier) === codeChallenge;
}

/**
 * Generate a client_id (URL-safe random string).
 */
export function generateClientId(): string {
  return `ec_${randomBase64Url(24)}`;
}

/**
 * Generate a client_secret (URL-safe random string).
 */
export function generateClientSecret(): string {
  return `ecs_${randomBase64Url(48)}`;
}

/**
 * Hash a token for storage (SHA-256).
 */
export function hashToken(token: string): string {
  return sha256(token);
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
