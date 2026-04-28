// =============================================================================
// MIGRATION 052 — Purge placeholder invitations
//
// Issue #1647: a number of tenants ended up with rows in `invitations` whose
// email is shaped `invite-NNNNNN@<domain>` (six characters between the dash
// and the `@`). They were created outside the regular inviteUser() path and
// have no real recipient — admins on /employees see 16+ pending invites that
// can never be resent or accepted. Drop the dead rows so the panel becomes
// useful. The listInvitations() filter already excludes them at read-time,
// but we still want them out of the table so re-invite-all and the seat-limit
// math don't include phantom pending rows.
//
// Idempotent: matches only the placeholder shape; rerunning is a no-op.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("invitations"))) return;

  await knex("invitations")
    .where("status", "pending")
    .andWhere("email", "like", "invite-______@%")
    .delete();
}

export async function down(_knex: Knex): Promise<void> {
  // Re-creating dead rows would reintroduce the bug. No-op.
}
