// =============================================================================
// EMP CLOUD — Module Registry Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError } from "../../utils/errors.js";
import type { Module, CreateModuleInput, UpdateModuleInput } from "@empcloud/shared";

export async function listModules(activeOnly = true): Promise<Module[]> {
  const db = getDB();
  let query = db("modules");
  if (activeOnly) query = query.where({ is_active: true });
  return query.orderBy("name", "asc");
}

export async function getModule(moduleId: number): Promise<Module> {
  const db = getDB();
  const mod = await db("modules").where({ id: moduleId }).first();
  if (!mod) throw new NotFoundError("Module");
  return mod;
}

export async function getModuleBySlug(slug: string): Promise<Module> {
  const db = getDB();
  const mod = await db("modules").where({ slug }).first();
  if (!mod) throw new NotFoundError("Module");
  /* v8 ignore next */
  return mod;
}

export async function createModule(data: CreateModuleInput): Promise<Module> {
  const db = getDB();
  const existing = await db("modules").where({ slug: data.slug }).first();
  if (existing) throw new ConflictError(`Module with slug '${data.slug}' already exists`);

  const [id] = await db("modules").insert({
    ...data,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  /* v8 ignore next */
  return getModule(id);
}

export async function updateModule(moduleId: number, data: UpdateModuleInput): Promise<Module> {
  const db = getDB();
  await getModule(moduleId); // throws if not found
  await db("modules").where({ id: moduleId }).update({ ...data, updated_at: new Date() });
  return getModule(moduleId);
}

export async function getModuleFeatures(moduleId: number, planTier?: string) {
  const db = getDB();
  let query = db("module_features").where({ module_id: moduleId, is_active: true });
  return query;
}

export async function getAccessibleFeatures(moduleId: number, planTier: string): Promise<string[]> {
  const db = getDB();
  const tierOrder = { free: 0, basic: 1, professional: 2, enterprise: 3 };
  const userLevel = tierOrder[planTier as keyof typeof tierOrder] ?? 0;

  const features = await db("module_features")
    .where({ module_id: moduleId, is_active: true });

  return features
    .filter((f: any) => (tierOrder[f.min_plan_tier as keyof typeof tierOrder] ?? 0) <= userLevel)
    .map((f: any) => f.feature_key);
}
