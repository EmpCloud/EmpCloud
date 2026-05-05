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

  // System role — global, organization_id IS NULL.
  const systemRoleRow = await db("roles")
    .whereNull("organization_id")
    .andWhere({ name: systemRole, type: SYSTEM, is_active: true })
    .first<RoleRow | undefined>();

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
 * List all roles visible to a user — system roles (always visible) plus
 * any custom roles in the user's org.
 */
export async function listRolesForOrg(orgId: number): Promise<RoleRow[]> {
  const db = getDB();
  return db("roles")
    .where(function () {
      this.whereNull("organization_id").orWhere({ organization_id: orgId });
    })
    .andWhere({ is_active: true })
    .orderByRaw("organization_id IS NULL DESC") // system roles first
    .orderBy("name")
    .select<RoleRow[]>("*")
    .then((rows) =>
      rows.map((r) => ({ ...r, permissions: parsePermissions(r.permissions) })),
    );
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
}): Promise<void> {
  const db = getDB();
  const role = await db("roles").where({ id: params.id }).first<RoleRow | undefined>();
  if (!role) throw new ValidationError("Role not found");
  if (role.type === SYSTEM || role.organization_id === null) {
    throw new ValidationError("System roles cannot be edited");
  }
  if (role.organization_id !== params.orgId) {
    throw new ValidationError("Role belongs to a different organization");
  }

  const update: Record<string, unknown> = { updated_at: new Date() };
  if (params.name !== undefined) {
    if (Object.keys(SYSTEM_ROLE_DEFAULTS).includes(params.name)) {
      throw new ValidationError(`Role name '${params.name}' is reserved`);
    }
    update.name = params.name;
  }
  if (params.description !== undefined) update.description = params.description;
  if (params.permissions !== undefined) {
    assertPermissionKeysValid(params.permissions);
    update.permissions = JSON.stringify([...new Set(params.permissions)]);
  }
  if (params.is_active !== undefined) update.is_active = params.is_active;

  await db("roles").where({ id: params.id }).update(update);
}

export async function deleteCustomRole(orgId: number, id: number): Promise<void> {
  const db = getDB();
  const role = await db("roles").where({ id }).first<RoleRow | undefined>();
  if (!role) throw new ValidationError("Role not found");
  if (role.type === SYSTEM || role.organization_id === null) {
    throw new ValidationError("System roles cannot be deleted");
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
