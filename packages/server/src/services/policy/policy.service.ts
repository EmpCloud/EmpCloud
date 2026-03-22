// =============================================================================
// EMP CLOUD — Policy Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import type { CreatePolicyInput } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Create Policy
// ---------------------------------------------------------------------------

export async function createPolicy(
  orgId: number,
  createdBy: number,
  data: CreatePolicyInput
) {
  const db = getDB();

  const [id] = await db("company_policies").insert({
    organization_id: orgId,
    title: data.title,
    content: data.content,
    version: 1,
    category: data.category || null,
    effective_date: data.effective_date || null,
    is_active: true,
    created_by: createdBy,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("company_policies").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Policies (with acknowledgment count)
// ---------------------------------------------------------------------------

export async function listPolicies(
  orgId: number,
  params?: { page?: number; perPage?: number; category?: string }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("company_policies")
    .where({ organization_id: orgId, is_active: true });

  if (params?.category) {
    query = query.where({ category: params.category });
  }

  const [{ count }] = await query.clone().count("* as count");

  const policies = await query
    .clone()
    .select("company_policies.*")
    .select(
      db.raw(
        "(SELECT COUNT(*) FROM policy_acknowledgments WHERE policy_acknowledgments.policy_id = company_policies.id) as acknowledgment_count"
      )
    )
    .orderBy("company_policies.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    policies,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Get Single Policy
// ---------------------------------------------------------------------------

export async function getPolicy(orgId: number, policyId: number) {
  const db = getDB();

  const policy = await db("company_policies")
    .where({ id: policyId, organization_id: orgId })
    .first();

  if (!policy) throw new NotFoundError("Policy");
  return policy;
}

// ---------------------------------------------------------------------------
// Update Policy (bumps version)
// ---------------------------------------------------------------------------

export async function updatePolicy(
  orgId: number,
  policyId: number,
  data: Partial<CreatePolicyInput>
) {
  const db = getDB();

  const existing = await db("company_policies")
    .where({ id: policyId, organization_id: orgId, is_active: true })
    .first();

  if (!existing) throw new NotFoundError("Policy");

  await db("company_policies")
    .where({ id: policyId })
    .update({
      ...data,
      version: existing.version + 1,
      updated_at: new Date(),
    });

  return db("company_policies").where({ id: policyId }).first();
}

// ---------------------------------------------------------------------------
// Delete Policy (soft delete — set is_active = false)
// ---------------------------------------------------------------------------

export async function deletePolicy(orgId: number, policyId: number) {
  const db = getDB();

  const existing = await db("company_policies")
    .where({ id: policyId, organization_id: orgId, is_active: true })
    .first();

  if (!existing) throw new NotFoundError("Policy");

  await db("company_policies")
    .where({ id: policyId })
    .update({ is_active: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Acknowledge Policy
// ---------------------------------------------------------------------------

export async function acknowledgePolicy(policyId: number, userId: number, orgId: number) {
  const db = getDB();

  // Verify policy belongs to org and is active
  const policy = await db("company_policies")
    .where({ id: policyId, organization_id: orgId, is_active: true })
    .first();

  if (!policy) throw new NotFoundError("Policy");

  // Upsert — ignore if already acknowledged
  await db("policy_acknowledgments")
    .insert({
      policy_id: policyId,
      user_id: userId,
      acknowledged_at: new Date(),
    })
    .onConflict(["policy_id", "user_id"])
    .ignore();

  return { policy_id: policyId, user_id: userId, acknowledged: true };
}

// ---------------------------------------------------------------------------
// Get Acknowledgments for a Policy
// ---------------------------------------------------------------------------

export async function getAcknowledgments(orgId: number, policyId: number) {
  const db = getDB();

  // Verify policy belongs to org
  const policy = await db("company_policies")
    .where({ id: policyId, organization_id: orgId })
    .first();

  if (!policy) throw new NotFoundError("Policy");

  const acknowledgments = await db("policy_acknowledgments")
    .join("users", "policy_acknowledgments.user_id", "users.id")
    .where({ "policy_acknowledgments.policy_id": policyId })
    .select(
      "policy_acknowledgments.id",
      "policy_acknowledgments.policy_id",
      "policy_acknowledgments.user_id",
      "policy_acknowledgments.acknowledged_at",
      "users.first_name",
      "users.last_name",
      "users.email"
    );

  return acknowledgments;
}

// ---------------------------------------------------------------------------
// Get Pending Acknowledgments for Current User
// ---------------------------------------------------------------------------

export async function getPendingAcknowledgments(orgId: number, userId: number) {
  const db = getDB();

  const pending = await db("company_policies")
    .where({ organization_id: orgId, is_active: true })
    .whereNotExists(function () {
      this.select(db.raw(1))
        .from("policy_acknowledgments")
        .whereRaw("policy_acknowledgments.policy_id = company_policies.id")
        .where("policy_acknowledgments.user_id", userId);
    })
    .select("company_policies.*")
    .orderBy("company_policies.created_at", "desc");

  return pending;
}
