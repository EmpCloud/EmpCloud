// =============================================================================
// MIGRATION 046 — Add "filled" to positions.status enum
// =============================================================================
// The zod `positionStatusEnum` + service layer (auto-fill on headcount reach,
// HR "Mark as Filled" button) all expect a `filled` status, but the DB column
// was never extended beyond the original 3 values, causing PUT /positions/:id
// { status: "filled" } to fail with MySQL error 1265 (Data truncated).
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE positions
    MODIFY COLUMN status ENUM('active','filled','frozen','closed')
      NOT NULL DEFAULT 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Map any 'filled' rows to 'active' so they don't break enum narrowing
  await knex("positions").where({ status: "filled" }).update({ status: "active" });
  await knex.raw(`
    ALTER TABLE positions
    MODIFY COLUMN status ENUM('active','frozen','closed')
      NOT NULL DEFAULT 'active'
  `);
}
