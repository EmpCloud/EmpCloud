// =============================================================================
// MIGRATION 048 — Purge legacy soft-deleted users
//
// Until #1597-era code, DELETE /api/v1/users/:id was a soft delete (status=2)
// which left the row in place and locked the email behind a UNIQUE constraint.
// Re-adding a deleted user with the same email failed with
//   ConflictError: User with this email already exists
//
// Now that deactivateUser does a true hard delete, sweep up any rows that
// were soft-deleted before the change so their emails become available
// again. We mirror the FK cleanup the live deleteUser path performs:
//   1. clear reporting_manager_id on direct reports (self-FK is RESTRICT)
//   2. reassign created_by / assigned_by / invited_by NOT-NULL columns to
//      the org's first surviving org_admin (the original actor isn't
//      recoverable here)
//   3. NULL out app-level user references that have no DB constraint
//   4. DELETE the row — cascades take the long tail
//
// Idempotent: if no status=2 users exist, the migration is a no-op.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  const stale = await knex("users")
    .where({ status: 2 })
    .select("id", "organization_id", "email");

  if (stale.length === 0) return;

  // Reassignment targets (NOT NULL columns referencing users.id, no cascade).
  const reassignTargets: Array<{ table: string; column: string }> = [
    { table: "org_module_seats",  column: "assigned_by" },
    { table: "invitations",       column: "invited_by"  },
    { table: "shift_assignments", column: "created_by"  },
    { table: "announcements",     column: "created_by"  },
    { table: "company_policies",  column: "created_by"  },
    { table: "surveys",           column: "created_by"  },
    { table: "positions",         column: "created_by"  },
    { table: "headcount_plans",   column: "created_by"  },
  ];
  // App-level references with no DB constraint — won't block DELETE but
  // would leave dangling user_ids the app could dereference.
  const nullableOrphans: Array<{ table: string; column: string }> = [
    { table: "survey_responses",   column: "user_id"      },
    { table: "headcount_plans",    column: "approved_by"  },
    { table: "anonymous_feedback", column: "responded_by" },
  ];

  // Pre-check which target tables exist so we don't query missing ones once
  // per stale user.
  const existingReassign: typeof reassignTargets = [];
  for (const t of reassignTargets) {
    if (await knex.schema.hasTable(t.table)) existingReassign.push(t);
  }
  const existingOrphans: typeof nullableOrphans = [];
  for (const t of nullableOrphans) {
    if (await knex.schema.hasTable(t.table)) existingOrphans.push(t);
  }

  for (const u of stale) {
    await knex.transaction(async (trx) => {
      const fallback = await trx("users")
        .where({ organization_id: u.organization_id, role: "org_admin", status: 1 })
        .whereNot({ id: u.id })
        .orderBy("id", "asc")
        .first("id");
      const reassignTo = fallback?.id ?? null;

      await trx("users")
        .where({ reporting_manager_id: u.id })
        .update({ reporting_manager_id: null });

      if (reassignTo) {
        for (const { table, column } of existingReassign) {
          await trx(table).where({ [column]: u.id }).update({ [column]: reassignTo });
        }
      }

      for (const { table, column } of existingOrphans) {
        await trx(table).where({ [column]: u.id }).update({ [column]: null });
      }

      await trx("users").where({ id: u.id }).delete();
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible — soft-deleted rows are gone for good. No-op down so the
  // migration registry stays consistent.
}
