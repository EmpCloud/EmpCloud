// =============================================================================
// EMP CLOUD — Organization Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors.js";
import type { Organization, UpdateOrgInput } from "@empcloud/shared";

export async function getOrg(orgId: number): Promise<Organization> {
  const db = getDB();
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) throw new NotFoundError("Organization");
  return org;
}

export async function updateOrg(orgId: number, data: UpdateOrgInput): Promise<Organization> {
  const db = getDB();
  await db("organizations").where({ id: orgId }).update({ ...data, updated_at: new Date() });
  return getOrg(orgId);
}

export async function getOrgStats(orgId: number): Promise<object> {
  const db = getDB();
  const [{ userCount }] = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .count("* as userCount");
  const [{ deptCount }] = await db("organization_departments")
    .where({ organization_id: orgId, is_deleted: false })
    .count("* as deptCount");
  const [{ subCount }] = await db("org_subscriptions")
    .where({ organization_id: orgId, status: "active" })
    .count("* as subCount");

  return {
    total_users: Number(userCount),
    total_departments: Number(deptCount),
    active_subscriptions: Number(subCount),
  };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(orgId: number) {
  const db = getDB();
  return db("organization_departments").where({ organization_id: orgId, is_deleted: false });
}

export async function createDepartment(orgId: number, name: string) {
  const db = getDB();

  const existing = await db("organization_departments")
    .where({ organization_id: orgId, is_deleted: false })
    .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
    .first();
  if (existing) throw new ConflictError("A department with this name already exists");

  const [id] = await db("organization_departments").insert({
    name: name.trim(),
    organization_id: orgId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("organization_departments").where({ id }).first();
}

export async function deleteDepartment(orgId: number, deptId: number) {
  const db = getDB();

  // #1039 — Prevent deleting department with active employees
  const [{ count }] = await db("users")
    .where({ organization_id: orgId, department_id: deptId, status: 1 })
    .count("* as count");
  if (Number(count) > 0) {
    throw new ValidationError(
      `Cannot delete department with ${count} active employee(s). Reassign them first.`,
    );
  }

  await db("organization_departments")
    .where({ id: deptId, organization_id: orgId })
    .update({ is_deleted: true, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function listLocations(orgId: number) {
  const db = getDB();
  return db("organization_locations").where({ organization_id: orgId, is_active: true });
}

export async function deleteLocation(orgId: number, locationId: number) {
  const db = getDB();
  await db("organization_locations")
    .where({ id: locationId, organization_id: orgId })
    .update({ is_active: false, updated_at: new Date() });
}

export async function createLocation(orgId: number, data: { name: string; address?: string; timezone?: string }) {
  const db = getDB();

  const existing = await db("organization_locations")
    .where({ organization_id: orgId, is_active: true })
    .whereRaw("LOWER(name) = LOWER(?)", [data.name.trim()])
    .first();
  if (existing) throw new ConflictError("A location with this name already exists");

  const [id] = await db("organization_locations").insert({
    ...data,
    name: data.name.trim(),
    organization_id: orgId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("organization_locations").where({ id }).first();
}
