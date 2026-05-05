// =============================================================================
// EMP CLOUD — Permissions Service
//
// Resolves a user's effective permission set:
//   1. Look up the system role row (organization_id IS NULL, name = users.role).
//   2. Union with all custom-role rows assigned via user_roles for that user.
// Result is a flat string[] used by:
//   - JWT issuance (embedded in the access token's `permissions` claim)
//   - server middleware (requirePermission)
//
// Single-source-of-truth: the catalogue / system defaults live in
// @empcloud/shared. This service only reads the DB.
// =============================================================================

import { getDB } from "../../db/connection.js";
import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_DEFAULTS,
  findUnknownPermissions,
} from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { ValidationError } from "../../utils/errors.js";

const SYSTEM = 0;
const CUSTOM = 1;

interface RoleRow {
  id: number;
  name: string;
  organization_id: number | null;
  type: number;
  is_active: boolean;
  permissions: string | string[]; // JSON column — driver may parse or not
  description: string | null;
}

function parsePermissions(raw: RoleRow["permissions"]): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Resolve the effective permissions for a user. Returns a deduped string[].
 * Falls back to the in-code SYSTEM_ROLE_DEFAULTS if the system role row is
 * missing for any reason (e.g., migration 062 hasn't run yet).
 */
export async function resolveUserPermissions(
  userId: number,
  systemRole: UserRole,
): Promise<string[]> {
  const db = getDB();

  // System role — prefer the org's customization if one exists, fall back to
  // the NULL-scoped global default, fall back to the in-code defaults.
  // This is the "per-org override" pattern: editing a system role transparently
  // forks a global template into an org-scoped row so org A's edits don't
  // bleed into org B.
  const userOrg = await db("users").where({ id: userId }).select("organization_id").first<{ organization_id: number } | undefined>();
  const orgId = userOrg?.organization_id;

  let systemRoleRow: RoleRow | undefined;
  if (orgId != null) {
    systemRoleRow = await db("roles")
      .where({ organization_id: orgId, name: systemRole, type: SYSTEM, is_active: true })
      .first<RoleRow | undefined>();
  }
  if (!systemRoleRow) {
    systemRoleRow = await db("roles")
      .whereNull("organization_id")
      .andWhere({ name: systemRole, type: SYSTEM, is_active: true })
      .first<RoleRow | undefined>();
  }

  const systemPermissions = systemRoleRow
    ? parsePermissions(systemRoleRow.permissions)
    : (SYSTEM_ROLE_DEFAULTS[systemRole] ?? []);

  // Custom roles assigned to this user.
  const customRoleRows = await db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", userId)
    .andWhere("roles.is_active", true)
    .select<RoleRow[]>("roles.*");

  const customPermissions = customRoleRows.flatMap((r) => parsePermissions(r.permissions));

  return [...new Set([...systemPermissions, ...customPermissions])];
}

/**
 * Validate that every key in the list is a real permission. Throws
 * ValidationError with the offending keys if not.
 */
export function assertPermissionKeysValid(keys: string[]): void {
  if (!Array.isArray(keys)) {
    throw new ValidationError("permissions must be an array of strings");
  }
  const unknown = findUnknownPermissions(keys);
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown permissions: ${unknown.join(", ")}`);
  }
}

/** Convenience: list all known permission keys. Used by the GET catalogue endpoint. */
export function listAllPermissionKeys(): string[] {
  return [...PERMISSION_KEYS];
}

/**
 * List all roles visible to a user — system roles (with the org's
 * customization preferred over the global template) plus any org-custom roles.
 *
 * If an org has customized a system role, the org-scoped row replaces the
 * global one in the response so the UI doesn't show two rows with the same
 * name.
 */
export async function listRolesForOrg(orgId: number): Promise<RoleRow[]> {
  const db = getDB();
  const rows = await db("roles")
    .where(function () {
      this.whereNull("organization_id").orWhere({ organization_id: orgId });
    })
    .andWhere({ is_active: true })
    .orderByRaw("organization_id IS NULL DESC") // global templates first, override picks below
    .orderBy("name")
    .select<RoleRow[]>("*");

  // Collapse system-role duplicates: if both NULL-scoped (global template) and
  // org-scoped (override) exist for the same name, keep the org-scoped row.
  const seen = new Map<string, RoleRow>();
  for (const r of rows) {
    if (r.type === SYSTEM) {
      const existing = seen.get(r.name);
      if (!existing || r.organization_id != null) seen.set(r.name, r);
    } else {
      // Custom roles use a unique key since name + org_id is unique already.
      seen.set(`__custom__${r.id}`, r);
    }
  }
  return [...seen.values()].map((r) => ({ ...r, permissions: parsePermissions(r.permissions) }));
}

/**
 * Internal: ensure the org has its own copy of a given system role. Returns
 * the org-scoped role's id. Used as the fork-on-edit step when an org admin
 * edits a system role for the first time.
 */
async function ensureOrgSystemRoleCopy(orgId: number, name: string): Promise<number> {
  const db = getDB();
  const existing = await db("roles")
    .where({ organization_id: orgId, name, type: SYSTEM })
    .first<RoleRow | undefined>();
  if (existing) return existing.id;

  const template = await db("roles")
    .whereNull("organization_id")
    .andWhere({ name, type: SYSTEM })
    .first<RoleRow | undefined>();
  const permissions = template
    ? parsePermissions(template.permissions)
    : (SYSTEM_ROLE_DEFAULTS[name] ?? []);
  const description = template?.description ?? null;

  const [id] = await db("roles").insert({
    name,
    organization_id: orgId,
    type: SYSTEM,
    is_active: true,
    permissions: JSON.stringify(permissions),
    description,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return Number(id);
}

export async function getRoleById(orgId: number, id: number): Promise<RoleRow | null> {
  const db = getDB();
  const row = await db("roles")
    .where({ id })
    .andWhere(function () {
      this.whereNull("organization_id").orWhere({ organization_id: orgId });
    })
    .first<RoleRow | undefined>();
  if (!row) return null;
  return { ...row, permissions: parsePermissions(row.permissions) };
}

/**
 * Resolve "what role should an org admin actually be editing" when they click
 * a system role. If they're touching the global template (organization_id IS
 * NULL), fork it into an org-scoped row first; return that row's id. If
 * they're already pointed at the org's own copy, return as-is. For custom
 * roles this is a no-op pass-through.
 *
 * The fork is transparent to the caller — the API just hands back an id and
 * the consumer does the actual update on it.
 */
export async function ensureEditableRoleId(orgId: number, id: number): Promise<number> {
  const db = getDB();
  const row = await db("roles").where({ id }).first<RoleRow | undefined>();
  if (!row) throw new ValidationError("Role not found");
  if (row.type === SYSTEM && row.organization_id === null) {
    return ensureOrgSystemRoleCopy(orgId, row.name);
  }
  if (row.organization_id !== orgId) {
    throw new ValidationError("Role belongs to a different organization");
  }
  return id;
}

export async function createCustomRole(params: {
  orgId: number;
  createdBy: number;
  name: string;
  description: string | null;
  permissions: string[];
}): Promise<{ id: number }> {
  const db = getDB();
  assertPermissionKeysValid(params.permissions);

  // Reject reserved names so a custom role can't shadow a system role.
  if (Object.keys(SYSTEM_ROLE_DEFAULTS).includes(params.name)) {
    throw new ValidationError(`Role name '${params.name}' is reserved for the system role`);
  }

  // Org-scoped name uniqueness is enforced by the table's unique index, but
  // we pre-check to give a friendly error.
  const existing = await db("roles")
    .where({ organization_id: params.orgId, name: params.name })
    .first("id");
  if (existing) {
    throw new ValidationError(`A role named '${params.name}' already exists in this organization`);
  }

  const [id] = await db("roles").insert({
    name: params.name,
    organization_id: params.orgId,
    type: CUSTOM,
    is_active: true,
    permissions: JSON.stringify([...new Set(params.permissions)]),
    description: params.description,
    created_by: params.createdBy,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return { id: Number(id) };
}

export async function updateCustomRole(params: {
  orgId: number;
  id: number;
  name?: string;
  description?: string | null;
  permissions?: string[];
  is_active?: boolean;
}): Promise<{ id: number }> {
  const db = getDB();
  const original = await db("roles").where({ id: params.id }).first<RoleRow | undefined>();
  if (!original) throw new ValidationError("Role not found");

  const isSystem = original.type === SYSTEM;

  // System role on the global template → fork into an org-scoped copy. The
  // edit then targets the fork. Subsequent edits hit the same fork directly.
  // Custom roles: must already be in the caller's org (no cross-org edits).
  let editableId = params.id;
  if (isSystem && original.organization_id === null) {
    editableId = await ensureOrgSystemRoleCopy(params.orgId, original.name);
  } else if (original.organization_id !== params.orgId) {
    throw new ValidationError("Role belongs to a different organization");
  }

  const update: Record<string, unknown> = { updated_at: new Date() };

  if (params.name !== undefined) {
    if (isSystem) {
      // System role names are load-bearing (users.role enum) — reject rename.
      if (params.name !== original.name) {
        throw new ValidationError("System role names cannot be changed");
      }
    } else if (Object.keys(SYSTEM_ROLE_DEFAULTS).includes(params.name)) {
      throw new ValidationError(`Role name '${params.name}' is reserved`);
    } else {
      update.name = params.name;
    }
  }

  if (params.description !== undefined) update.description = params.description;
  if (params.permissions !== undefined) {
    assertPermissionKeysValid(params.permissions);
    update.permissions = JSON.stringify([...new Set(params.permissions)]);
  }
  // System roles can't be deactivated — every user with this role would lose
  // all permissions. Only custom roles support `is_active`.
  if (params.is_active !== undefined && !isSystem) {
    update.is_active = params.is_active;
  }

  await db("roles").where({ id: editableId }).update(update);
  return { id: editableId };
}

export async function deleteCustomRole(orgId: number, id: number): Promise<void> {
  const db = getDB();
  const role = await db("roles").where({ id }).first<RoleRow | undefined>();
  if (!role) throw new ValidationError("Role not found");

  // For an org-scoped system role override: "delete" means revert to the
  // global default. Drop the org-scoped row; the resolver then falls back
  // to the NULL-scoped template / SYSTEM_ROLE_DEFAULTS.
  if (role.type === SYSTEM && role.organization_id === orgId) {
    await db("roles").where({ id }).delete();
    return;
  }

  if (role.type === SYSTEM) {
    throw new ValidationError("Global system role templates cannot be deleted");
  }
  if (role.organization_id !== orgId) {
    throw new ValidationError("Role belongs to a different organization");
  }
  // ON DELETE CASCADE on user_roles handles assignment cleanup.
  await db("roles").where({ id }).delete();
}

export async function listUserCustomRoles(userId: number): Promise<RoleRow[]> {
  const db = getDB();
  return db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", userId)
    .andWhere("roles.is_active", true)
    .select<RoleRow[]>("roles.*")
    .then((rows) =>
      rows.map((r) => ({ ...r, permissions: parsePermissions(r.permissions) })),
    );
}

export async function assignRoleToUser(params: {
  orgId: number;
  userId: number;
  roleId: number;
}): Promise<void> {
  const db = getDB();
  const role = await db("roles").where({ id: params.roleId }).first<RoleRow | undefined>();
  if (!role) throw new ValidationError("Role not found");
  if (role.type === SYSTEM) {
    throw new ValidationError(
      "System roles are assigned via users.role, not user_roles. Update users.role instead.",
    );
  }
  if (role.organization_id !== params.orgId) {
    throw new ValidationError("Role belongs to a different organization");
  }

  const targetUser = await db("users").where({ id: params.userId, organization_id: params.orgId }).first("id");
  if (!targetUser) throw new ValidationError("User not found in this organization");

  // Unique (user_id, role_id) — INSERT IGNORE-style via ON CONFLICT DO NOTHING.
  await db("user_roles")
    .insert({ user_id: params.userId, role_id: params.roleId, created_at: new Date() })
    .onConflict(["user_id", "role_id"])
    .ignore();
}

export async function unassignRoleFromUser(
  orgId: number,
  userId: number,
  roleId: number,
): Promise<void> {
  const db = getDB();
  const role = await db("roles").where({ id: roleId }).first<RoleRow | undefined>();
  if (!role || role.organization_id !== orgId) {
    throw new ValidationError("Role not found");
  }
  await db("user_roles").where({ user_id: userId, role_id: roleId }).delete();
}
