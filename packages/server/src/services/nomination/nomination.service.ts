// =============================================================================
// EMP CLOUD — Nomination Service (#1040)
// Internal nomination programs (e.g., Employee of the Month) within EMP Cloud.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Create Nomination
// ---------------------------------------------------------------------------

export async function createNomination(
  orgId: number,
  nominatorId: number,
  data: {
    program_id: number;
    nominee_id: number;
    reason: string;
  },
) {
  const db = getDB();

  // #1040 — Prevent self-nomination
  if (data.nominee_id === nominatorId) {
    throw new ValidationError("Cannot nominate yourself");
  }

  // Verify nominee exists in the same organization
  const nominee = await db("users")
    .where({ id: data.nominee_id, organization_id: orgId, status: 1 })
    .first();
  if (!nominee) {
    throw new NotFoundError("Nominee not found in this organization");
  }

  const now = new Date();
  const [id] = await db("nominations").insert({
    organization_id: orgId,
    program_id: data.program_id,
    nominator_id: nominatorId,
    nominee_id: data.nominee_id,
    reason: data.reason,
    status: "pending",
    created_at: now,
    updated_at: now,
  });

  return db("nominations").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Nominations for a Program
// ---------------------------------------------------------------------------

export async function listNominations(
  orgId: number,
  programId: number,
  filters?: { page?: number; perPage?: number; status?: string },
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("nominations")
    .where({ organization_id: orgId, program_id: programId });

  if (filters?.status) {
    query = query.where("status", filters.status);
  }

  const [{ count }] = await query.clone().count("id as count");

  const nominations = await query
    .clone()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { nominations, total: Number(count) };
}
