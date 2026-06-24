// =============================================================================
// EMP CLOUD — API Key Service
//
// Org-admin-generated programmatic access tokens. The same key authenticates
// against EmpCloud APIs and any module reading the EmpCloud master DB
// (emp-payroll validates against this exact `api_keys` table).
//
// Security model:
//   - The raw key is shown to the admin EXACTLY once (at creation). Only its
//     SHA-256 hash is persisted, so a DB leak can't reconstruct usable keys.
//   - A key carries no permissions of its own. On every request the validating
//     service resolves the OWNER user's *current* RBAC permissions, so the key
//     mirrors that admin and reflects live role changes (and is killed the
//     instant the user is deactivated / the key is revoked).
// =============================================================================

import crypto from "node:crypto";
import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";
import { resolveUserPermissions } from "../permissions/permissions.service.js";
import type { AccessTokenPayload, UserRole } from "@empcloud/shared";

// Opaque key format: empc_live_<43 url-safe base64 chars>. The `empc_` prefix
// is how the auth middleware (here and in modules) tells an API key apart from
// a JWT without trying to verify it as one.
export const API_KEY_PREFIX = "empc_";
const KEY_ENV_SEGMENT = "live";
const RAW_BYTES = 32; // 32 bytes -> 43 base64url chars

export interface ApiKeyRow {
  id: number;
  organization_id: number;
  user_id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

/** Public (safe) view of a key — never includes the hash or the raw secret. */
export interface ApiKeyPublic {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

function toPublic(row: ApiKeyRow): ApiKeyPublic {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

export function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): { raw: string; prefix: string } {
  const secret = crypto.randomBytes(RAW_BYTES).toString("base64url");
  const raw = `${API_KEY_PREFIX}${KEY_ENV_SEGMENT}_${secret}`;
  // Display prefix: enough to recognise a key in a list, not enough to use it.
  const prefix = raw.slice(0, `${API_KEY_PREFIX}${KEY_ENV_SEGMENT}_`.length + 6);
  return { raw, prefix };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a key for an org. Returns the public row PLUS the raw key — the only
 * time the raw key is ever available. Caller must surface it to the user once
 * and never store it.
 */
export async function createApiKey(params: {
  orgId: number;
  userId: number;
  name: string;
  expiresInDays?: number | null;
}): Promise<{ apiKey: ApiKeyPublic; rawKey: string }> {
  const db = getDB();
  const { raw, prefix } = generateRawKey();
  const key_hash = hashKey(raw);

  const expires_at =
    params.expiresInDays && params.expiresInDays > 0
      ? new Date(Date.now() + params.expiresInDays * 86400_000)
      : null;

  const [id] = await db("api_keys").insert({
    organization_id: params.orgId,
    user_id: params.userId,
    name: params.name.trim().slice(0, 150) || "API Key",
    key_hash,
    key_prefix: prefix,
    expires_at,
    created_by: params.userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const row = (await db("api_keys").where({ id }).first()) as ApiKeyRow;
  return { apiKey: toPublic(row), rawKey: raw };
}

/** List an org's keys (newest first). Never exposes the hash. */
export async function listApiKeys(orgId: number): Promise<ApiKeyPublic[]> {
  const db = getDB();
  const rows = (await db("api_keys")
    .where({ organization_id: orgId })
    .orderBy("created_at", "desc")) as ApiKeyRow[];
  return rows.map(toPublic);
}

/** Revoke a key (soft — sets revoked_at). Scoped to the org so admins can't
 * revoke another org's keys. Returns false if the key doesn't belong to org. */
export async function revokeApiKey(orgId: number, id: number): Promise<boolean> {
  const db = getDB();
  const updated = await db("api_keys")
    .where({ id, organization_id: orgId })
    .whereNull("revoked_at")
    .update({ revoked_at: new Date(), updated_at: new Date() });
  return updated > 0;
}

// ---------------------------------------------------------------------------
// Validation (used by the auth middleware)
// ---------------------------------------------------------------------------

/** Low-level: look up a live (not revoked, not expired) key by its raw value. */
export async function findValidKey(rawKey: string): Promise<ApiKeyRow | null> {
  const db = getDB();
  const row = (await db("api_keys")
    .where({ key_hash: hashKey(rawKey) })
    .whereNull("revoked_at")
    .first()) as ApiKeyRow | undefined;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

/**
 * Resolve an API key into a JWT-shaped principal the rest of the app already
 * understands (same shape verifyAccessToken returns). Loads the owner user,
 * resolves their *current* permissions, and bumps last_used_at. Returns null
 * if the key is invalid/expired/revoked or the owner is gone/inactive.
 */
export async function resolveApiKeyPrincipal(rawKey: string): Promise<AccessTokenPayload | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;
  const db = getDB();

  const key = await findValidKey(rawKey);
  if (!key) return null;

  const user = await db("users").where({ id: key.user_id }).first();
  // status: 1 = active. A deactivated owner kills the key.
  if (!user || user.status !== 1) return null;

  const org = await db("organizations").where({ id: user.organization_id }).first();

  const permissions = await resolveUserPermissions(user.id, user.role as UserRole);

  // Best-effort usage tracking — never block the request on it.
  db("api_keys")
    .where({ id: key.id })
    .update({ last_used_at: new Date() })
    .catch(() => {});

  const nowSec = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    org_id: user.organization_id,
    email: user.email,
    role: user.role as UserRole,
    first_name: user.first_name,
    last_name: user.last_name,
    org_name: org?.name ?? "",
    scope: "api",
    client_id: "api-key",
    jti: `apikey-${key.id}`,
    permissions,
    iat: nowSec,
    exp: nowSec + 3600,
    iss: config.oauth.issuer,
  };
}
