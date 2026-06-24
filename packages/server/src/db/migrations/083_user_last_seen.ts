// =============================================================================
// MIGRATION 077 — User last-seen (chat presence)
//
// Adds a `last_seen` timestamp to users, written when a user's last chat socket
// disconnects. Live online/offline is tracked in-memory by the realtime gateway;
// this column is the durable "last seen 5m ago" fallback shown when a user has
// no active connection.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  if (await knex.schema.hasColumn("users", "last_seen")) return;
  await knex.schema.alterTable("users", (t) => {
    t.timestamp("last_seen").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  if (!(await knex.schema.hasColumn("users", "last_seen"))) return;
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("last_seen");
  });
}
