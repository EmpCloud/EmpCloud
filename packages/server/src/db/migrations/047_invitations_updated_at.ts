// =============================================================================
// MIGRATION 047 — Add updated_at to invitations
//
// PR #1594 (resendInvitation) writes `updated_at` when rotating the token,
// but migration 004_audit_invitations created the invitations table with
// only `created_at`. So every Resend call from the Pending Invitations
// modal returns 500 with:
//   ER_BAD_FIELD_ERROR: Unknown column 'updated_at' in 'field list'
//
// Add the missing column with a CURRENT_TIMESTAMP default so the resend
// path (and any future writer) just works. Idempotent.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("invitations"))) return;
  if (await knex.schema.hasColumn("invitations", "updated_at")) return;
  await knex.schema.alterTable("invitations", (t) => {
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("invitations"))) return;
  if (!(await knex.schema.hasColumn("invitations", "updated_at"))) return;
  await knex.schema.alterTable("invitations", (t) => {
    t.dropColumn("updated_at");
  });
}
