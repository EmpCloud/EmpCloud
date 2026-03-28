// =============================================================================
// EMP CLOUD — User Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { hashPassword, randomHex, hashToken } from "../../utils/crypto.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { TOKEN_DEFAULTS } from "@empcloud/shared";
import type { CreateUserInput, UpdateUserInput, InviteUserInput, UserPublic } from "@empcloud/shared";

/** Strip sensitive fields from user records before sending to client */
function sanitizeUser(user: any): UserPublic {
  const { password, password_hash, token_hash, reset_token, ...safe } = user;
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
        .orWhere("emp_code", "like", s)
        .orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [s]);
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

  // Whitelist allowed fields — prevent mass assignment attacks
  const allowed: Record<string, unknown> = {};
  const SAFE_FIELDS = ["first_name", "last_name", "phone", "designation", "department_id", "location_id", "reporting_manager_id", "date_of_birth", "gender", "employee_code"];
  for (const key of SAFE_FIELDS) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      allowed[key] = (data as Record<string, unknown>)[key];
    }
  }
  // Strip HTML from text fields
  for (const key of ["first_name", "last_name", "designation"]) {
    if (typeof allowed[key] === "string") {
      allowed[key] = (allowed[key] as string).replace(/<[^>]*>/g, "");
    }
  }
  // Validate phone/contact_number — digits, spaces, +, -, () only
  if (allowed.phone !== undefined) {
    const phone = String(allowed.phone);
    if (!/^[+\d\s\-()]{0,20}$/.test(phone)) {
      delete allowed.phone;
    }
  }
  // Validate date_of_birth — must be a real past date
  if (allowed.date_of_birth !== undefined) {
    const dob = new Date(allowed.date_of_birth as string);
    const now = new Date();
    if (isNaN(dob.getTime()) || dob > now || dob.getFullYear() < 1900 || dob.getFullYear() > now.getFullYear() - 16) {
      delete allowed.date_of_birth;
    }
  }
  // Validate gender — enum
  if (allowed.gender !== undefined && !["male", "female", "other", "prefer_not_to_say"].includes(String(allowed.gender))) {
    delete allowed.gender;
  }
  // Validate reporting_manager_id — cannot be self, must exist in same org
  if (allowed.reporting_manager_id !== undefined) {
    const mgId = Number(allowed.reporting_manager_id);
    if (mgId === userId) {
      delete allowed.reporting_manager_id; // cannot report to self
    } else if (mgId) {
      // Check for circular chain (A->B->A)
      const manager = await db("users").where({ id: mgId, organization_id: orgId, status: 1 }).first();
      if (!manager) {
        delete allowed.reporting_manager_id; // manager doesn't exist
      } else if (manager.reporting_manager_id === userId) {
        delete allowed.reporting_manager_id; // circular: A->B->A
      }
    }
  }

  if (Object.keys(allowed).length > 0) {
    await db("users").where({ id: userId, organization_id: orgId }).update({ ...allowed, updated_at: new Date() });
  }
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

export async function listInvitations(orgId: number, status: string = "pending") {
  const db = getDB();
  return db("invitations")
    .where({ organization_id: orgId, status })
    .select("id", "email", "role", "status", "created_at", "expires_at")
    .orderBy("created_at", "desc");
}

export async function inviteUser(orgId: number, invitedBy: number, data: InviteUserInput): Promise<{ token: string; invitation: object }> {
  const db = getDB();

  const existing = await db("users").where({ email: data.email }).first();
  if (existing) throw new ConflictError("User with this email already exists");

  const pendingInvite = await db("invitations")
    .where({ email: data.email, status: "pending" })
    .first();
  if (pendingInvite) throw new ConflictError("An invitation has already been sent to this email");

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

// ---------------------------------------------------------------------------
// Org Chart
// ---------------------------------------------------------------------------

export interface OrgChartNode {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  photo: string | null;
  children: OrgChartNode[];
}

export async function getOrgChart(orgId: number): Promise<OrgChartNode[]> {
  const db = getDB();

  const users = await db("users")
    .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
    .where("users.organization_id", orgId)
    .where("users.status", 1)
    .select(
      "users.id as id",
      "users.first_name as first_name",
      "users.last_name as last_name",
      "users.designation as designation",
      "users.role as role",
      "users.reporting_manager_id as reporting_manager_id",
      "users.photo_path as photo",
      "organization_departments.name as department"
    );

  // Build a map of nodes (use Number() to handle potential BigInt from MySQL)
  const nodeMap = new Map<number, OrgChartNode>();
  const childToParent = new Map<number, number>();

  for (const u of users) {
    const uid = Number(u.id);
    nodeMap.set(uid, {
      id: uid,
      name: `${u.first_name} ${u.last_name}`,
      designation: u.designation || null,
      department: u.department || null,
      photo: u.photo || null,
      children: [],
    });

    const managerId = u.reporting_manager_id != null ? Number(u.reporting_manager_id) : null;
    if (managerId && managerId !== 0 && managerId !== uid) {
      childToParent.set(uid, managerId);
    }
  }

  // Build tree: attach children to parents
  const roots: OrgChartNode[] = [];
  for (const [uid, node] of nodeMap) {
    const parentId = childToParent.get(uid);
    if (parentId !== undefined && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically at each level for consistent display
  function sortChildren(nodes: OrgChartNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      if (node.children.length > 0) sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

// ---------------------------------------------------------------------------
// Bulk Import
// ---------------------------------------------------------------------------

export async function bulkCreateUsers(
  orgId: number,
  rows: Array<{
    first_name: string;
    last_name: string;
    email: string;
    designation?: string;
    department_id?: number;
    role?: string;
    emp_code?: string;
    contact_number?: string;
  }>,
  importedBy: number
): Promise<{ count: number }> {
  const db = getDB();

  const insertRows = rows.map((row) => ({
    organization_id: orgId,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    designation: row.designation || null,
    department_id: row.department_id || null,
    role: row.role || "employee",
    emp_code: row.emp_code || null,
    contact_number: row.contact_number || null,
    employment_type: "full_time",
    date_of_joining: new Date().toISOString().slice(0, 10),
    status: 1,
    created_at: new Date(),
    updated_at: new Date(),
  }));

  await db.transaction(async (trx) => {
    // Insert in batches of 100
    for (let i = 0; i < insertRows.length; i += 100) {
      await trx("users").insert(insertRows.slice(i, i + 100));
    }
    await trx("organizations")
      .where({ id: orgId })
      .increment("current_user_count", insertRows.length);
  });

  return { count: insertRows.length };
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
