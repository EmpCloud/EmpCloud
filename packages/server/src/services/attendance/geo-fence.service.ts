// =============================================================================
// EMP CLOUD — Geo-Fence Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";

interface CreateGeoFenceInput {
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export async function createGeoFence(orgId: number, data: CreateGeoFenceInput) {
  const db = getDB();

  const [id] = await db("geo_fence_locations").insert({
    organization_id: orgId,
    name: data.name,
    latitude: data.latitude,
    longitude: data.longitude,
    radius_meters: data.radius_meters,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("geo_fence_locations").where({ id }).first();
}

export async function updateGeoFence(orgId: number, fenceId: number, data: Partial<CreateGeoFenceInput>) {
  const db = getDB();
  const fence = await db("geo_fence_locations")
    .where({ id: fenceId, organization_id: orgId })
    .first();
  if (!fence) throw new NotFoundError("Geo-fence location");

  await db("geo_fence_locations")
    .where({ id: fenceId })
    .update({ ...data, updated_at: new Date() });

  return db("geo_fence_locations").where({ id: fenceId }).first();
}

export async function listGeoFences(orgId: number) {
  const db = getDB();
  return db("geo_fence_locations")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("name", "asc");
}

export async function deleteGeoFence(orgId: number, fenceId: number) {
  const db = getDB();
  const fence = await db("geo_fence_locations")
    .where({ id: fenceId, organization_id: orgId })
    .first();
  if (!fence) throw new NotFoundError("Geo-fence location");

  await db("geo_fence_locations")
    .where({ id: fenceId })
    .update({ is_active: false, updated_at: new Date() });
}
