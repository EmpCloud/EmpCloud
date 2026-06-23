// =============================================================================
// MIGRATION 081 — Per-conversation mute
//
// Adds `muted_until` to conversation_participants. When set to a future time the
// user has muted that conversation: notifications (@mention + desktop) are
// suppressed for them, but unread counts still accrue silently. NULL / past =
// not muted. A "mute forever" is stored as a far-future timestamp.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversation_participants"))) return;
  if (await knex.schema.hasColumn("conversation_participants", "muted_until")) return;
  await knex.schema.alterTable("conversation_participants", (t) => {
    t.timestamp("muted_until").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversation_participants"))) return;
  if (!(await knex.schema.hasColumn("conversation_participants", "muted_until"))) return;
  await knex.schema.alterTable("conversation_participants", (t) => {
    t.dropColumn("muted_until");
  });
}
