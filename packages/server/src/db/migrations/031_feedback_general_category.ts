// =============================================================================
// MIGRATION 031 — Add 'general' to anonymous_feedback category enum
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // MySQL ALTER COLUMN to expand the ENUM
  await knex.raw(`
    ALTER TABLE anonymous_feedback
    MODIFY COLUMN category ENUM(
      'workplace', 'management', 'process', 'culture',
      'harassment', 'safety', 'suggestion', 'other', 'general'
    ) NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE anonymous_feedback
    MODIFY COLUMN category ENUM(
      'workplace', 'management', 'process', 'culture',
      'harassment', 'safety', 'suggestion', 'other'
    ) NOT NULL
  `);
}
