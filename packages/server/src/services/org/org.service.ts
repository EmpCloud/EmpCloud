// =============================================================================
// EMP CLOUD — Organization Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
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
  const [id] = await db("organization_departments").insert({
    name,
    organization_id: orgId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("organization_departments").where({ id }).first();
}

export async function deleteDepartment(orgId: number, deptId: number) {
  const db = getDB();
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

export async function createLocation(orgId: number, data: { name: string; address?: string; timezone?: string }) {
  const db = getDB();
  const [id] = await db("organization_locations").insert({
    ...data,
    organization_id: orgId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("organization_locations").where({ id }).first();
}
