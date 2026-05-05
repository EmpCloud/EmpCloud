// =============================================================================
// EMP CLOUD — Team Resolver
// Returns the set of user IDs that "report to" a given manager.
//
// Reads from BOTH:
//   - users.reporting_manager_id   (the primary manager — single FK)
//   - user_additional_managers     (matrix / co-manager rows)
//
// Used by every `*:view_team` / `*:approve` permission check so that
// additional-manager assignments confer the same team scope as primary
// manager assignments.
// =============================================================================

import { getDB } from "../../db/connection.js";

/**
 * Resolve direct + additional reports for a given manager. Result excludes
 * the manager themselves and only includes active employees in the same
 * organization.
 *
 * Two integer-only queries + JS dedup. Cheap even for orgs with thousands
 * of users; avoids the cross-dialect headaches of `.union()` in Knex.
 */
export async function resolveTeamMemberIds(
  orgId: number,
  managerId: number,
): Promise<number[]> {
  const db = getDB();
  const primary = await db("users")
    .where({ reporting_manager_id: managerId, organization_id: orgId, status: 1 })
    .pluck("id");
  const additional = await db("user_additional_managers as uam")
    .join("users", "users.id", "uam.user_id")
    .where("uam.manager_id", managerId)
    .andWhere("users.organization_id", orgId)
    .andWhere("users.status", 1)
    .pluck("users.id");
  return [...new Set([...primary, ...additional])];
}

/**
 * Convenience: does `managerId` manage `userId` (either as primary or
 * additional manager) in the given org?
 */
export async function isManagerOf(
  orgId: number,
  managerId: number,
  userId: number,
): Promise<boolean> {
  const db = getDB();

  const primary = await db("users")
    .where({ id: userId, organization_id: orgId, reporting_manager_id: managerId })
    .first("id");
  if (primary) return true;

  const additional = await db("user_additional_managers")
    .where({ user_id: userId, manager_id: managerId })
    .first("id");
  return !!additional;
}

/**
 * Set the additional managers for a user in one shot — replaces the existing
 * set with the given list. Caller is responsible for permission-checks (only
 * org_admin / hr_admin / roles:manage should be able to call this).
 *
 * Throws if any manager_id is the same as user_id or doesn't exist in the org.
 */
export async function setAdditionalManagers(
  orgId: number,
  userId: number,
  managerIds: number[],
): Promise<void> {
  const db = getDB();

  // De-dup + drop self-references (user can't be their own additional manager).
  const cleaned = [...new Set(managerIds)].filter((m) => m !== userId);

  if (cleaned.length > 0) {
    const validCount = await db("users")
      .where({ organization_id: orgId, status: 1 })
      .whereIn("id", cleaned)
      .count<[{ c: number }]>("id as c");
    if (Number(validCount[0].c) !== cleaned.length) {
      throw new Error("One or more manager IDs are invalid (different org, inactive, or not found)");
    }
  }

  await db.transaction(async (trx) => {
    await trx("user_additional_managers").where({ user_id: userId }).delete();
    if (cleaned.length > 0) {
      await trx("user_additional_managers").insert(
        cleaned.map((manager_id) => ({
          user_id: userId,
          manager_id,
          created_at: new Date(),
        })),
      );
    }
  });
}

/**
 * Read the additional manager IDs for a user.
 */
export async function getAdditionalManagerIds(userId: number): Promise<number[]> {
  const db = getDB();
  const rows = await db("user_additional_managers")
    .where({ user_id: userId })
    .pluck("manager_id");
  return rows;
}

/**
 * Read the additional managers for a user, enriched with name + email + role
 * from the users table. The frontend renders chips from this directly so it
 * doesn't depend on a separate paginated /users fetch.
 */
export async function getAdditionalManagers(
  userId: number,
): Promise<Array<{ id: number; first_name: string; last_name: string; email: string; role: string }>> {
  const db = getDB();
  return db("user_additional_managers as uam")
    .join("users", "users.id", "uam.manager_id")
    .where("uam.user_id", userId)
    .select("users.id", "users.first_name", "users.last_name", "users.email", "users.role")
    .orderBy(["users.first_name", "users.last_name"]);
}
