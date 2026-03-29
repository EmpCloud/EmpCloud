// =============================================================================
// EMP CLOUD — Auth Service
// Registration, login, password management.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { hashPassword, verifyPassword, randomHex, hashToken } from "../../utils/crypto.js";
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { logAudit } from "../audit/audit.service.js";
import { issueTokens } from "../oauth/oauth.service.js";
import { TOKEN_DEFAULTS, AuditAction } from "@empcloud/shared";
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
  const now = new Date();
  const [userId] = await db("users").insert({
    organization_id: orgId,
    first_name: params.firstName,
    last_name: params.lastName,
    email: params.email,
    password: passwordHash,
    password_changed_at: now,
    role: "org_admin",
    status: 1,
    date_of_joining: now.toISOString().slice(0, 10),
    created_at: now,
    updated_at: now,
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
}): Promise<{ user: object; org: object; tokens: object; password_expired?: boolean }> {
  const db = getDB();

  const user = await db("users").where({ email: params.email }).first();
  if (!user || !user.password) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Check if account is deactivated (inactive status or past exit date)
  if (user.status !== 1) {
    throw new UnauthorizedError("Account is deactivated");
  }
  if (user.date_of_exit) {
    const exitDate = new Date(user.date_of_exit);
    exitDate.setHours(23, 59, 59, 999);
    if (exitDate < new Date()) {
      throw new UnauthorizedError("Account is deactivated");
    }
  }

  const valid = await verifyPassword(params.password, user.password);
  if (!valid) {
    // #1049 — Record failed login attempt in audit log
    await logAudit({
      organizationId: user.organization_id,
      userId: user.id,
      action: AuditAction.LOGIN_FAILED,
      details: { email: params.email, reason: "invalid_password" },
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  const org = await db("organizations").where({ id: user.organization_id }).first();
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  // --- Password expiry check ---
  // If the org has a password_expiry_days policy (> 0), check if the user's
  // password is older than that many days and flag it in the response.
  let passwordExpired = false;
  const expiryDays = org.password_expiry_days ?? 0;
  if (expiryDays > 0) {
    const changedAt = user.password_changed_at
      ? new Date(user.password_changed_at)
      : new Date(user.created_at);
    const ageMs = Date.now() - changedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays >= expiryDays) {
      passwordExpired = true;
    }
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
  return { user: safeUser, org, tokens, password_expired: passwordExpired };
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
  const now = new Date();
  await db("users").where({ id: params.userId }).update({
    password: newHash,
    password_changed_at: now,
    updated_at: now,
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

  const now = new Date();
  await db.transaction(async (trx) => {
    await trx("users").where({ id: tokenRecord.user_id }).update({
      password: newHash,
      password_changed_at: now,
      updated_at: now,
    });
    await trx("password_reset_tokens")
      .where({ id: tokenRecord.id })
      .update({ used_at: now });
  });
}
