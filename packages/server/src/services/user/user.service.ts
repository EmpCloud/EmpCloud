// =============================================================================
// EMP CLOUD — User Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { hashPassword, randomHex, hashToken } from "../../utils/crypto.js";
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { TOKEN_DEFAULTS } from "@empcloud/shared";
import { checkFreeTierUserLimit } from "../subscription/subscription.service.js";
import type { CreateUserInput, UpdateUserInput, InviteUserInput, UserPublic } from "@empcloud/shared";

/** Strip sensitive fields from user records before sending to client */
function sanitizeUser(user: any): UserPublic {
  const { password, password_hash, token_hash, reset_token, ...safe } = user;
  return safe;
}

export async function listUsers(orgId: number, params?: { page?: number; perPage?: number; search?: string; include_inactive?: boolean }) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("users").where({ organization_id: orgId });

  // Never show super_admin in org user lists — they are platform-level accounts
  query = query.where("role", "!=", "super_admin");

  // #1021 — Only show active employees by default
  if (!params?.include_inactive) {
    query = query.where("status", 1);
  }

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
    .orderBy("status", "desc")
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

  // --- Free-tier user limit check (#1015) ---
  await checkFreeTierUserLimit(orgId);

  // #1013 — Check org seat limit before adding user
  const org = await db("organizations").where({ id: orgId }).first();
  if (org && org.total_allowed_user_count > 0 && org.current_user_count >= org.total_allowed_user_count) {
    throw new ForbiddenError(
      `Organization has reached its user limit (${org.current_user_count}/${org.total_allowed_user_count}). Upgrade your subscription to add more users.`,
    );
  }

  const existing = await db("users").where({ email: data.email }).first();
  if (existing) throw new ConflictError("Email already in use");

  // Validate employee_code uniqueness within org
  if (data.emp_code) {
    const existingCode = await db("users")
      .where({ organization_id: orgId, emp_code: data.emp_code })
      .first();
    if (existingCode) throw new ConflictError("Employee code already in use within this organization");
  }

  // Validate date_of_birth — must be a valid past date, employee must be at least 18
  if (data.date_of_birth) {
    const dob = new Date(data.date_of_birth);
    const now = new Date();
    if (isNaN(dob.getTime())) {
      throw new ValidationError("Invalid date of birth format");
    }
    if (dob > now) {
      throw new ValidationError("Date of birth cannot be in the future");
    }
    if (dob.getFullYear() < 1900) {
      throw new ValidationError("Invalid date of birth");
    }
    const age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate()) ? age - 1 : age;
    if (actualAge < 18) throw new ValidationError("Employee must be at least 18 years old");
  }

  // Validate date_of_exit — must be after date_of_joining
  if ((data as any).date_of_exit) {
    const joinDate = data.date_of_joining || new Date().toISOString().slice(0, 10);
    const exitMs = new Date(String((data as any).date_of_exit)).getTime();
    const joinMs = new Date(String(joinDate)).getTime();
    if (!isNaN(exitMs) && !isNaN(joinMs) && exitMs <= joinMs) {
      throw new ValidationError("Date of exit must be after date of joining");
    }
  }

  // Validate self-manager
  // (cannot validate at create time since ID doesn't exist yet, but validate reporting_manager exists)
  if (data.reporting_manager_id) {
    const manager = await db("users").where({ id: data.reporting_manager_id, organization_id: orgId, status: 1 }).first();
    if (!manager) data.reporting_manager_id = null as any;
  }

  const passwordHash = data.password ? await hashPassword(data.password) : null;

  // Validate department_id exists in this org
  let departmentId = data.department_id || null;
  if (departmentId) {
    const dept = await db("organization_departments")
      .where({ id: departmentId, organization_id: orgId })
      .first();
    if (!dept) departmentId = null;
  }

  // Validate location_id exists in this org
  let locationId = data.location_id || null;
  if (locationId) {
    const loc = await db("organization_locations")
      .where({ id: locationId, organization_id: orgId })
      .first();
    if (!loc) locationId = null;
  }

  // Rule: Cannot hire more than department position headcount
  if (departmentId) {
    const positions = await db("positions")
      .where({ organization_id: orgId, department_id: departmentId })
      .whereIn("status", ["active", "filled"])
      .select(
        db.raw("COALESCE(SUM(headcount_budget), 0) as total_budget"),
        db.raw("COALESCE(SUM(headcount_filled), 0) as total_filled"),
      )
      .first();

    if (positions && Number(positions.total_budget) > 0) {
      const [{ count: activeInDept }] = await db("users")
        .where({ organization_id: orgId, department_id: departmentId, status: 1 })
        .count("* as count");

      if (Number(activeInDept) >= Number(positions.total_budget)) {
        throw new ValidationError(
          `Department headcount limit reached (${activeInDept}/${positions.total_budget}). Cannot add more employees.`,
        );
      }
    }
  }

  // Calculate probation end date (6 months from join date)
  const joinDate = data.date_of_joining || new Date().toISOString().slice(0, 10);
  const probationEnd = new Date(joinDate);
  probationEnd.setMonth(probationEnd.getMonth() + 6);
  const probationEndDate = probationEnd.toISOString().slice(0, 10);

  const nowTs = new Date();
  const [id] = await db("users").insert({
    organization_id: orgId,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    password: passwordHash,
    password_changed_at: passwordHash ? nowTs : null,
    role: data.role || "employee",
    emp_code: data.emp_code || null,
    contact_number: data.contact_number || null,
    date_of_birth: data.date_of_birth || null,
    gender: data.gender || null,
    date_of_joining: joinDate,
    designation: data.designation || null,
    department_id: departmentId,
    location_id: locationId,
    reporting_manager_id: data.reporting_manager_id || null,
    employment_type: data.employment_type || "full_time",
    probation_end_date: probationEndDate,
    probation_status: "on_probation",
    status: 1,
    created_at: nowTs,
    updated_at: nowTs,
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
  const SAFE_FIELDS = ["first_name", "last_name", "phone", "designation", "department_id", "location_id", "reporting_manager_id", "date_of_birth", "gender", "emp_code", "employee_code", "date_of_joining", "date_of_exit", "contact_number", "employment_type", "role"];
  for (const key of SAFE_FIELDS) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      allowed[key] = (data as Record<string, unknown>)[key];
    }
  }
  // Map employee_code -> emp_code (DB column)
  if (allowed.employee_code !== undefined && allowed.emp_code === undefined) {
    allowed.emp_code = allowed.employee_code;
    delete allowed.employee_code;
  }
  // Strip HTML and trim whitespace from text fields
  for (const key of ["first_name", "last_name", "designation"]) {
    if (typeof allowed[key] === "string") {
      allowed[key] = (allowed[key] as string).replace(/<[^>]*>/g, "").trim();
      // Reject empty or whitespace-only names with a validation error
      if ((key === "first_name" || key === "last_name") && !(allowed[key] as string)) {
        throw new ValidationError(`${key.replace("_", " ")} cannot be empty or whitespace only`);
      }
    }
  }
  // Map phone -> contact_number (DB column)
  if (allowed.phone !== undefined && allowed.contact_number === undefined) {
    allowed.contact_number = allowed.phone;
    delete allowed.phone;
  }
  // Validate contact_number — digits, spaces, +, -, () only
  if (allowed.contact_number !== undefined) {
    const phone = String(allowed.contact_number);
    if (!/^[+\d\s\-()]{0,20}$/.test(phone)) {
      throw new ValidationError("Invalid phone number format");
    }
  }
  // Validate date_of_birth — must be a valid past date, employee must be at least 18
  if (allowed.date_of_birth !== undefined && allowed.date_of_birth !== null) {
    const dob = new Date(allowed.date_of_birth as string);
    const now = new Date();
    if (isNaN(dob.getTime())) {
      throw new ValidationError("Invalid date of birth format");
    }
    if (dob > now) {
      throw new ValidationError("Date of birth cannot be in the future");
    }
    if (dob.getFullYear() < 1900) {
      throw new ValidationError("Invalid date of birth");
    }
    const age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate()) ? age - 1 : age;
    if (actualAge < 18) {
      throw new ValidationError("Employee must be at least 18 years old");
    }
  }
  // Validate date_of_joining — must be a valid date
  if (allowed.date_of_joining !== undefined && allowed.date_of_joining !== null) {
    const doj = new Date(allowed.date_of_joining as string);
    if (isNaN(doj.getTime())) {
      throw new ValidationError("Invalid date_of_joining format");
    }
  }
  // Validate gender — enum
  if (allowed.gender !== undefined && !["male", "female", "other", "prefer_not_to_say"].includes(String(allowed.gender))) {
    delete allowed.gender;
  }
  // Validate department_id — must exist in organization_departments for this org
  if (allowed.department_id !== undefined) {
    const deptId = Number(allowed.department_id);
    if (deptId) {
      const dept = await db("organization_departments")
        .where({ id: deptId, organization_id: orgId })
        .first();
      if (!dept) {
        delete allowed.department_id; // department doesn't exist in this org
      }
    }
  }
  // Validate location_id — must exist in organization_locations for this org
  if (allowed.location_id !== undefined) {
    const locId = Number(allowed.location_id);
    if (locId) {
      const loc = await db("organization_locations")
        .where({ id: locId, organization_id: orgId })
        .first();
      if (!loc) {
        delete allowed.location_id; // location doesn't exist in this org
      }
    }
  }
  // Validate reporting_manager_id — cannot be self, must exist in same org
  if (allowed.reporting_manager_id !== undefined) {
    const mgId = Number(allowed.reporting_manager_id);
    if (mgId === userId) {
      throw new ValidationError("Employee cannot be their own reporting manager");
    } else if (mgId) {
      // Check for circular chain (A->B->A)
      const manager = await db("users").where({ id: mgId, organization_id: orgId, status: 1 }).first();
      if (!manager) {
        throw new ValidationError("Reporting manager does not exist in this organization");
      } else if (manager.reporting_manager_id === userId) {
        throw new ValidationError("Circular reporting chain detected");
      }
    }
  }

  // Validate emp_code uniqueness within org (exclude self)
  if (allowed.emp_code !== undefined && allowed.emp_code !== null && allowed.emp_code !== "") {
    const existingCode = await db("users")
      .where({ organization_id: orgId, emp_code: String(allowed.emp_code) })
      .whereNot({ id: userId })
      .first();
    if (existingCode) {
      throw new ConflictError("Employee code already in use within this organization");
    }
  }

  // Validate date_of_exit — must be after date_of_joining
  if (allowed.date_of_exit !== undefined && allowed.date_of_exit !== null) {
    const exitMs = new Date(String(allowed.date_of_exit)).getTime();
    // Get joining date from update payload or existing DB record
    let joinMs = 0;
    if (allowed.date_of_joining) {
      joinMs = new Date(String(allowed.date_of_joining)).getTime();
    } else if (user.date_of_joining) {
      // MySQL returns Date object or string — handle both
      joinMs = new Date(user.date_of_joining).getTime();
    }

    if (isNaN(exitMs)) {
      throw new ValidationError("Invalid date_of_exit format");
    } else if (joinMs > 0 && exitMs <= joinMs) {
      throw new ValidationError("Date of exit must be after date of joining");
    }

    // Rule: Notice period enforcement
    // Check employee_profiles for notice_period_days; if set, date_of_exit must be
    // at least that many days from today.
    const profile = await db("employee_profiles")
      .where({ user_id: userId, organization_id: orgId })
      .select("notice_period_days")
      .first();
    if (profile && profile.notice_period_days && profile.notice_period_days > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const exitDate = new Date(String(allowed.date_of_exit));
      exitDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((exitDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < profile.notice_period_days) {
        throw new ValidationError(
          `Notice period of ${profile.notice_period_days} days is required. Exit date must be at least ${profile.notice_period_days} days from today (${diffDays} days provided).`,
        );
      }
    }
  }

  // Validate role — must be one of the 5 valid roles
  if (allowed.role !== undefined) {
    const validRoles = ["employee", "manager", "hr_admin", "org_admin", "super_admin"];
    if (!validRoles.includes(String(allowed.role))) {
      throw new ValidationError("Invalid role. Must be one of: employee, manager, hr_admin, org_admin, super_admin");
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

  // Rule: Cannot deactivate employee with pending items
  const pendingItems: string[] = [];

  const [{ count: pendingLeaves }] = await db("leave_applications")
    .where({ organization_id: orgId, user_id: userId, status: "pending" })
    .count("* as count");
  if (Number(pendingLeaves) > 0) {
    pendingItems.push(`${pendingLeaves} pending leave application(s)`);
  }

  const [{ count: assignedAssets }] = await db("assets")
    .where({ organization_id: orgId, assigned_to: userId, status: "assigned" })
    .count("* as count");
  if (Number(assignedAssets) > 0) {
    pendingItems.push(`${assignedAssets} assigned asset(s)`);
  }

  const [{ count: openTickets }] = await db("helpdesk_tickets")
    .where({ organization_id: orgId, raised_by: userId })
    .whereIn("status", ["open", "in_progress", "awaiting_response"])
    .count("* as count");
  if (Number(openTickets) > 0) {
    pendingItems.push(`${openTickets} open helpdesk ticket(s)`);
  }

  if (pendingItems.length > 0) {
    throw new ValidationError(
      `Cannot deactivate employee with pending items: ${pendingItems.join(", ")}. Please resolve these first.`
    );
  }

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

  // #1013 — Check org seat limit before inviting user
  const org = await db("organizations").where({ id: orgId }).first();
  if (org && org.total_allowed_user_count > 0) {
    // Count active users + pending invitations against the limit
    const [{ count: pendingInvitations }] = await db("invitations")
      .where({ organization_id: orgId, status: "pending" })
      .count("* as count");
    const totalCommitted = org.current_user_count + Number(pendingInvitations);
    if (totalCommitted >= org.total_allowed_user_count) {
      throw new ForbiddenError(
        `Organization has reached its user limit (${org.current_user_count} active + ${pendingInvitations} pending invites / ${org.total_allowed_user_count} allowed). Upgrade your subscription to add more users.`,
      );
    }
  }

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

  // Detect and break circular chains before building tree
  // A circular chain is A->B->...->A. Break by making the highest-role user a root.
  const visited = new Set<number>();
  for (const uid of childToParent.keys()) {
    if (visited.has(uid)) continue;
    // Walk the chain from uid upward
    const chain: number[] = [];
    const inChain = new Set<number>();
    let current: number | undefined = uid;
    while (current !== undefined && !visited.has(current)) {
      if (inChain.has(current)) {
        // Found a cycle — break it by removing the parent link of `current`
        childToParent.delete(current);
        break;
      }
      inChain.add(current);
      chain.push(current);
      current = childToParent.get(current);
    }
    for (const c of chain) visited.add(c);
  }

  // Build tree: attach children to parents
  // #1060 — Collect employees without a valid manager into a virtual "No Manager" group
  const roots: OrgChartNode[] = [];
  const noManagerChildren: OrgChartNode[] = [];

  for (const [uid, node] of nodeMap) {
    const parentId = childToParent.get(uid);
    if (parentId !== undefined && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else if (childToParent.has(uid)) {
      // Has a reporting_manager_id but manager is not in the active user set
      noManagerChildren.push(node);
    } else {
      roots.push(node);
    }
  }

  // If there are orphaned employees whose managers are missing, group them
  if (noManagerChildren.length > 0) {
    const noManagerRoot: OrgChartNode = {
      id: 0,
      name: "No Manager",
      designation: null,
      department: null,
      photo: null,
      children: noManagerChildren,
    };
    roots.push(noManagerRoot);
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
    // Calculate probation end date (6 months from today)
    const inviteJoinDate = new Date().toISOString().slice(0, 10);
    const inviteProbationEnd = new Date();
    inviteProbationEnd.setMonth(inviteProbationEnd.getMonth() + 6);

    const inviteNow = new Date();
    const [userId] = await trx("users").insert({
      organization_id: invitation.organization_id,
      first_name: params.firstName || invitation.first_name,
      last_name: params.lastName || invitation.last_name,
      email: invitation.email,
      password: passwordHash,
      password_changed_at: inviteNow,
      role: invitation.role,
      status: 1,
      date_of_joining: inviteJoinDate,
      probation_end_date: inviteProbationEnd.toISOString().slice(0, 10),
      probation_status: "on_probation",
      created_at: inviteNow,
      updated_at: inviteNow,
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
