// =============================================================================
// EMP CLOUD — Auth Service
// Registration, login, password management.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { hashPassword, verifyPassword, randomHex, hashToken } from "../../utils/crypto.js";
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { issueTokens } from "../oauth/oauth.service.js";
import { TOKEN_DEFAULTS } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";

// Internal client_id used for direct auth (login/register via EMP Cloud itself)
const EMPCLOUD_CLIENT_ID = "empcloud-dashboard";

// ---------------------------------------------------------------------------
// Register (creates org + admin user)
// ---------------------------------------------------------------------------

export async function register(params: {
  orgName: string;
  orgLegalName?: string;
  orgCountry?: string;
  orgState?: string;
  orgTimezone?: string;
  orgEmail?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<{ user: object; org: object; tokens: object }> {
  const db = getDB();

  // Check if email already exists
  const existing = await db("users").where({ email: params.email }).first();
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(params.password);

  // Create organization
  const [orgId] = await db("organizations").insert({
    name: params.orgName,
    legal_name: params.orgLegalName || params.orgName,
    email: params.orgEmail || params.email,
    country: params.orgCountry || "IN",
    state: params.orgState || null,
    timezone: params.orgTimezone || "Asia/Kolkata",
    is_active: true,
    current_user_count: 1,
    total_allowed_user_count: 10, // default starter
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Create admin user
  const [userId] = await db("users").insert({
    organization_id: orgId,
    first_name: params.firstName,
    last_name: params.lastName,
    email: params.email,
    password: passwordHash,
    role: "org_admin",
    status: 1,
    date_of_joining: new Date().toISOString().slice(0, 10),
    created_at: new Date(),
    updated_at: new Date(),
  });

  const user = await db("users").where({ id: userId }).first();
  const org = await db("organizations").where({ id: orgId }).first();

  // Issue tokens
  const tokens = await issueTokens({
    userId: user.id,
    orgId: org.id,
    email: user.email,
    role: user.role as UserRole,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    scope: "openid profile email",
    clientId: EMPCLOUD_CLIENT_ID,
  });

  logger.info(`New org registered: ${org.name} (ID: ${org.id}) by ${user.email}`);

  // Return sanitized user (no password)
  const { password: _, ...safeUser } = user;
  return { user: safeUser, org, tokens };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(params: {
  email: string;
  password: string;
}): Promise<{ user: object; org: object; tokens: object }> {
  const db = getDB();

  const user = await db("users").where({ email: params.email, status: 1 }).first();
  if (!user || !user.password) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await verifyPassword(params.password, user.password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const org = await db("organizations").where({ id: user.organization_id }).first();
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const tokens = await issueTokens({
    userId: user.id,
    orgId: org.id,
    email: user.email,
    role: user.role as UserRole,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    scope: "openid profile email",
    clientId: EMPCLOUD_CLIENT_ID,
  });

  const { password: _, ...safeUser } = user;
  return { user: safeUser, org, tokens };
}

// ---------------------------------------------------------------------------
// Change Password
// ---------------------------------------------------------------------------

export async function changePassword(params: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const db = getDB();

  const user = await db("users").where({ id: params.userId }).first();
  if (!user || !user.password) {
    throw new NotFoundError("User");
  }

  const valid = await verifyPassword(params.currentPassword, user.password);
  if (!valid) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const newHash = await hashPassword(params.newPassword);
  await db("users").where({ id: params.userId }).update({
    password: newHash,
    updated_at: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Forgot Password — create reset token
// ---------------------------------------------------------------------------

export async function forgotPassword(email: string): Promise<{ token: string } | null> {
  const db = getDB();

  const user = await db("users").where({ email, status: 1 }).first();
  if (!user) {
    // Don't reveal whether email exists
    return null;
  }

  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + TOKEN_DEFAULTS.PASSWORD_RESET_EXPIRY * 1000);

  await db("password_reset_tokens").insert({
    user_id: user.id,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_at: new Date(),
  });

  return { token };
}

// ---------------------------------------------------------------------------
// Reset Password — consume reset token
// ---------------------------------------------------------------------------

export async function resetPassword(params: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const db = getDB();

  const tokenRecord = await db("password_reset_tokens")
    .where({ token_hash: hashToken(params.token) })
    .whereNull("used_at")
    .first();

  if (!tokenRecord) {
    throw new ValidationError("Invalid or expired reset token");
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    throw new ValidationError("Reset token has expired");
  }

  const newHash = await hashPassword(params.newPassword);

  await db.transaction(async (trx) => {
    await trx("users").where({ id: tokenRecord.user_id }).update({
      password: newHash,
      updated_at: new Date(),
    });
    await trx("password_reset_tokens")
      .where({ id: tokenRecord.id })
      .update({ used_at: new Date() });
  });
}
