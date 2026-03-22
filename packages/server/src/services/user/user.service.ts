// =============================================================================
// EMP CLOUD — User Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { hashPassword, randomHex, hashToken } from "../../utils/crypto.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { TOKEN_DEFAULTS } from "@empcloud/shared";
import type { CreateUserInput, UpdateUserInput, InviteUserInput, UserPublic } from "@empcloud/shared";

function sanitizeUser(user: any): UserPublic {
  const { password, ...safe } = user;
  return safe;
}

export async function listUsers(orgId: number, params?: { page?: number; perPage?: number; search?: string }) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("users").where({ organization_id: orgId });

  if (params?.search) {
    const s = `%${params.search}%`;
    query = query.where(function () {
      this.where("first_name", "like", s)
        .orWhere("last_name", "like", s)
        .orWhere("email", "like", s)
        .orWhere("emp_code", "like", s);
    });
  }

  const [{ count }] = await query.clone().count("* as count");
  const users = await query
    .select()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    users: users.map(sanitizeUser),
    total: Number(count),
  };
}

export async function getUser(orgId: number, userId: number): Promise<UserPublic> {
  const db = getDB();
  const user = await db("users").where({ id: userId, organization_id: orgId }).first();
  if (!user) throw new NotFoundError("User");
  return sanitizeUser(user);
}

export async function createUser(orgId: number, data: CreateUserInput): Promise<UserPublic> {
  const db = getDB();

  const existing = await db("users").where({ email: data.email }).first();
  if (existing) throw new ConflictError("Email already in use");

  const passwordHash = data.password ? await hashPassword(data.password) : null;

  const [id] = await db("users").insert({
    organization_id: orgId,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    password: passwordHash,
    role: data.role || "employee",
    emp_code: data.emp_code || null,
    contact_number: data.contact_number || null,
    date_of_birth: data.date_of_birth || null,
    gender: data.gender || null,
    date_of_joining: data.date_of_joining || new Date().toISOString().slice(0, 10),
    designation: data.designation || null,
    department_id: data.department_id || null,
    location_id: data.location_id || null,
    reporting_manager_id: data.reporting_manager_id || null,
    employment_type: data.employment_type || "full_time",
    status: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Update org user count
  await db("organizations")
    .where({ id: orgId })
    .increment("current_user_count", 1);

  return getUser(orgId, id);
}

export async function updateUser(orgId: number, userId: number, data: UpdateUserInput): Promise<UserPublic> {
  const db = getDB();
  const user = await db("users").where({ id: userId, organization_id: orgId }).first();
  if (!user) throw new NotFoundError("User");

  await db("users").where({ id: userId }).update({ ...data, updated_at: new Date() });
  return getUser(orgId, userId);
}

export async function deactivateUser(orgId: number, userId: number): Promise<void> {
  const db = getDB();
  const user = await db("users").where({ id: userId, organization_id: orgId }).first();
  if (!user) throw new NotFoundError("User");

  await db("users").where({ id: userId }).update({ status: 2, updated_at: new Date() });
  await db("organizations").where({ id: orgId }).decrement("current_user_count", 1);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function inviteUser(orgId: number, invitedBy: number, data: InviteUserInput): Promise<{ token: string; invitation: object }> {
  const db = getDB();

  const existing = await db("users").where({ email: data.email }).first();
  if (existing) throw new ConflictError("User with this email already exists");

  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + TOKEN_DEFAULTS.INVITATION_EXPIRY * 1000);

  const [id] = await db("invitations").insert({
    organization_id: orgId,
    email: data.email,
    role: data.role || "employee",
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    invited_by: invitedBy,
    token_hash: hashToken(token),
    status: "pending",
    expires_at: expiresAt,
    created_at: new Date(),
  });

  const invitation = await db("invitations").where({ id }).first();
  return { token, invitation };
}

export async function acceptInvitation(params: {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}): Promise<UserPublic> {
  const db = getDB();

  const invitation = await db("invitations")
    .where({ token_hash: hashToken(params.token), status: "pending" })
    .first();

  if (!invitation) throw new NotFoundError("Invitation");
  if (new Date(invitation.expires_at) < new Date()) {
    throw new NotFoundError("Invitation has expired");
  }

  const passwordHash = await hashPassword(params.password);

  const user = await db.transaction(async (trx) => {
    const [userId] = await trx("users").insert({
      organization_id: invitation.organization_id,
      first_name: params.firstName || invitation.first_name,
      last_name: params.lastName || invitation.last_name,
      email: invitation.email,
      password: passwordHash,
      role: invitation.role,
      status: 1,
      date_of_joining: new Date().toISOString().slice(0, 10),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await trx("invitations")
      .where({ id: invitation.id })
      .update({ status: "accepted", accepted_at: new Date() });

    await trx("organizations")
      .where({ id: invitation.organization_id })
      .increment("current_user_count", 1);

    return trx("users").where({ id: userId }).first();
  });

  return sanitizeUser(user);
}
