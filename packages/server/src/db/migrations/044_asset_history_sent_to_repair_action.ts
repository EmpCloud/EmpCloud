// =============================================================================
// MIGRATION 044 — Add "sent_to_repair" to asset_history.action enum
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE asset_history
    MODIFY COLUMN action ENUM(
      'created','assigned','returned','repaired','retired','lost','found','sent_to_repair','damaged','updated'
    ) NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE asset_history
    MODIFY COLUMN action ENUM(
      'created','assigned','returned','repaired','retired','lost','found','damaged','updated'
    ) NOT NULL
  `);
}
