// =============================================================================
// MIGRATION 062 — RBAC v1: seed the four system roles
//
// Inserts the built-in templates (org_admin, hr_admin, manager, employee)
// with `organization_id = NULL` and `type = 0` (system). These rows are
// referenced by the permission resolver to compute a user's effective
// permission set from their `users.role` enum value.
//
// The defaults live in @empcloud/shared SYSTEM_ROLE_DEFAULTS so the same
// mapping is used by the role-builder UI when displaying read-only system
// roles.
//
// Idempotent: re-runs UPSERT the permission lists in case the catalogue
// gained new keys since last seed.
// =============================================================================

import { Knex } from "knex";
import { SYSTEM_ROLE_DEFAULTS } from "@empcloud/shared";

const TABLE = "roles";
const SYSTEM = 0;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;

  const labels: Record<string, { name: string; description: string }> = {
    org_admin: {
      name: "org_admin",
      description: "Full org access including billing, subscriptions, and roles management.",
    },
    hr_admin: {
      name: "hr_admin",
      description: "Full HR access (employees, payroll, leave, etc.) excluding billing and roles management.",
    },
    manager: {
      name: "manager",
      description: "Team-scoped access — view and approve for direct reports.",
    },
    employee: {
      name: "employee",
      description: "Self-service only — own profile, attendance, leave, payslip.",
    },
  };

  for (const [key, perms] of Object.entries(SYSTEM_ROLE_DEFAULTS)) {
    const meta = labels[key];
    if (!meta) continue;

    const existing = await knex(TABLE)
      .whereNull("organization_id")
      .andWhere({ name: meta.name, type: SYSTEM })
      .first();

    if (existing) {
      await knex(TABLE).where({ id: existing.id }).update({
        permissions: JSON.stringify(perms),
        description: meta.description,
        is_active: true,
        updated_at: new Date(),
      });
    } else {
      await knex(TABLE).insert({
        name: meta.name,
        organization_id: null,
        type: SYSTEM,
        is_active: true,
        permissions: JSON.stringify(perms),
        description: meta.description,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Leave system role rows in place on rollback. Removing them would orphan
  // any user_roles join rows that reference them.
}
