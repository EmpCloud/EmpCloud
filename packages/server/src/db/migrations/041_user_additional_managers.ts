// =============================================================================
// MIGRATION 041 — user_additional_managers junction table
//
// Lets a user have more than one reporting manager (co-managers, matrix
// structure, etc.). The primary manager still lives in users.reporting_manager_id
// for backward compatibility with code that reads a single manager; any
// additional managers are stored here. Bulk import populates this table when
// the CSV has multiple values in the reporting_manager_* column.
// =============================================================================

import { Knex } from "knex";

const TABLE = "user_additional_managers";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TABLE)) return;

  await knex.schema.createTable(TABLE, (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.bigInteger("manager_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.timestamp("created_at").defaultTo(knex.fn.now());

    // A (user, manager) pair is unique and the reverse query (all direct
    // reports of a manager) is also common, so index both columns.
    t.unique(["user_id", "manager_id"], { indexName: "uq_uam_user_manager" });
    t.index(["manager_id"], "idx_uam_manager");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE);
}
