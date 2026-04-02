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
  // Strip undefined values — only update fields that were actually provided
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }
  if (Object.keys(updateData).length > 0) {
    await db("organizations").where({ id: orgId }).update({ ...updateData, updated_at: new Date() });
  }
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

export async function getDepartment(orgId: number, deptId: number) {
  const db = getDB();
  const dept = await db("organization_departments")
    .where({ id: deptId, organization_id: orgId, is_deleted: false })
    .first();
  if (!dept) throw new NotFoundError("Department");
  return dept;
}

export async function updateDepartment(orgId: number, deptId: number, data: { name: string }) {
  const db = getDB();
  const dept = await db("organization_departments")
    .where({ id: deptId, organization_id: orgId, is_deleted: false })
    .first();
  if (!dept) throw new NotFoundError("Department");

  const existing = await db("organization_departments")
    .where({ organization_id: orgId, is_deleted: false })
    .whereRaw("LOWER(name) = LOWER(?)", [data.name.trim()])
    .whereNot({ id: deptId })
    .first();
  if (existing) throw new ConflictError("A department with this name already exists");

  await db("organization_departments")
    .where({ id: deptId, organization_id: orgId })
    .update({ name: data.name.trim(), updated_at: new Date() });
  return db("organization_departments").where({ id: deptId }).first();
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

export async function getLocation(orgId: number, locationId: number) {
  const db = getDB();
  const loc = await db("organization_locations")
    .where({ id: locationId, organization_id: orgId, is_active: true })
    .first();
  if (!loc) throw new NotFoundError("Location");
  return loc;
}

export async function updateLocation(orgId: number, locationId: number, data: { name?: string; address?: string; timezone?: string }) {
  const db = getDB();
  const loc = await db("organization_locations")
    .where({ id: locationId, organization_id: orgId, is_active: true })
    .first();
  if (!loc) throw new NotFoundError("Location");

  if (data.name) {
    const existing = await db("organization_locations")
      .where({ organization_id: orgId, is_active: true })
      .whereRaw("LOWER(name) = LOWER(?)", [data.name.trim()])
      .whereNot({ id: locationId })
      .first();
    if (existing) throw new ConflictError("A location with this name already exists");
    data.name = data.name.trim();
  }

  await db("organization_locations")
    .where({ id: locationId, organization_id: orgId })
    .update({ ...data, updated_at: new Date() });
  return db("organization_locations").where({ id: locationId }).first();
}

export async function deleteLocation(orgId: number, locationId: number) {
  const db = getDB();
  await db("organization_locations")
    .where({ id: locationId, organization_id: orgId })
    .update({ is_active: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// #1038 — Flag departments without a manager assigned
// ---------------------------------------------------------------------------

export async function getDepartmentsWithoutManager(orgId: number) {
  const db = getDB();

  // Return departments that have no user with role 'manager' or 'hr_admin' assigned
  const departments = await db("organization_departments as d")
    .leftJoin("users as u", function () {
      this.on("u.department_id", "=", "d.id")
        .andOn("u.organization_id", "=", "d.organization_id")
        .andOn("u.status", "=", db.raw("1"))
        .andOnIn("u.role", ["manager", "hr_admin"]);
    })
    .where({ "d.organization_id": orgId, "d.is_deleted": false })
    .whereNull("u.id")
    .select("d.id", "d.name", "d.created_at");

  return departments;
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
