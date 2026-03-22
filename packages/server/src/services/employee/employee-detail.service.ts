// =============================================================================
// EMP CLOUD — Employee Detail Service
// CRUD for addresses, education, work experience, dependents.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import type {
  CreateAddressInput,
  CreateEducationInput,
  CreateExperienceInput,
  CreateDependentInput,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function getAddresses(orgId: number, userId: number) {
  const db = getDB();
  return db("employee_addresses").where({
    organization_id: orgId,
    user_id: userId,
  });
}

export async function createAddress(
  orgId: number,
  userId: number,
  data: CreateAddressInput
) {
  const db = getDB();
  const [id] = await db("employee_addresses").insert({
    organization_id: orgId,
    user_id: userId,
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("employee_addresses").where({ id }).first();
}

export async function updateAddress(
  orgId: number,
  userId: number,
  addressId: number,
  data: Partial<CreateAddressInput>
) {
  const db = getDB();
  const existing = await db("employee_addresses")
    .where({ id: addressId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Address");

  await db("employee_addresses")
    .where({ id: addressId })
    .update({ ...data, updated_at: new Date() });
  return db("employee_addresses").where({ id: addressId }).first();
}

export async function deleteAddress(
  orgId: number,
  userId: number,
  addressId: number
) {
  const db = getDB();
  const existing = await db("employee_addresses")
    .where({ id: addressId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Address");

  await db("employee_addresses").where({ id: addressId }).delete();
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export async function getEducation(orgId: number, userId: number) {
  const db = getDB();
  return db("employee_education").where({
    organization_id: orgId,
    user_id: userId,
  });
}

export async function createEducation(
  orgId: number,
  userId: number,
  data: CreateEducationInput
) {
  const db = getDB();
  const [id] = await db("employee_education").insert({
    organization_id: orgId,
    user_id: userId,
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("employee_education").where({ id }).first();
}

export async function updateEducation(
  orgId: number,
  userId: number,
  educationId: number,
  data: Partial<CreateEducationInput>
) {
  const db = getDB();
  const existing = await db("employee_education")
    .where({ id: educationId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Education record");

  await db("employee_education")
    .where({ id: educationId })
    .update({ ...data, updated_at: new Date() });
  return db("employee_education").where({ id: educationId }).first();
}

export async function deleteEducation(
  orgId: number,
  userId: number,
  educationId: number
) {
  const db = getDB();
  const existing = await db("employee_education")
    .where({ id: educationId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Education record");

  await db("employee_education").where({ id: educationId }).delete();
}

// ---------------------------------------------------------------------------
// Work Experience
// ---------------------------------------------------------------------------

export async function getExperience(orgId: number, userId: number) {
  const db = getDB();
  return db("employee_work_experience").where({
    organization_id: orgId,
    user_id: userId,
  });
}

export async function createExperience(
  orgId: number,
  userId: number,
  data: CreateExperienceInput
) {
  const db = getDB();
  const [id] = await db("employee_work_experience").insert({
    organization_id: orgId,
    user_id: userId,
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("employee_work_experience").where({ id }).first();
}

export async function updateExperience(
  orgId: number,
  userId: number,
  experienceId: number,
  data: Partial<CreateExperienceInput>
) {
  const db = getDB();
  const existing = await db("employee_work_experience")
    .where({ id: experienceId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Work experience record");

  await db("employee_work_experience")
    .where({ id: experienceId })
    .update({ ...data, updated_at: new Date() });
  return db("employee_work_experience").where({ id: experienceId }).first();
}

export async function deleteExperience(
  orgId: number,
  userId: number,
  experienceId: number
) {
  const db = getDB();
  const existing = await db("employee_work_experience")
    .where({ id: experienceId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Work experience record");

  await db("employee_work_experience").where({ id: experienceId }).delete();
}

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

export async function getDependents(orgId: number, userId: number) {
  const db = getDB();
  return db("employee_dependents").where({
    organization_id: orgId,
    user_id: userId,
  });
}

export async function createDependent(
  orgId: number,
  userId: number,
  data: CreateDependentInput
) {
  const db = getDB();
  const [id] = await db("employee_dependents").insert({
    organization_id: orgId,
    user_id: userId,
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("employee_dependents").where({ id }).first();
}

export async function updateDependent(
  orgId: number,
  userId: number,
  dependentId: number,
  data: Partial<CreateDependentInput>
) {
  const db = getDB();
  const existing = await db("employee_dependents")
    .where({ id: dependentId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Dependent");

  await db("employee_dependents")
    .where({ id: dependentId })
    .update({ ...data, updated_at: new Date() });
  return db("employee_dependents").where({ id: dependentId }).first();
}

export async function deleteDependent(
  orgId: number,
  userId: number,
  dependentId: number
) {
  const db = getDB();
  const existing = await db("employee_dependents")
    .where({ id: dependentId, organization_id: orgId, user_id: userId })
    .first();
  if (!existing) throw new NotFoundError("Dependent");

  await db("employee_dependents").where({ id: dependentId }).delete();
}
