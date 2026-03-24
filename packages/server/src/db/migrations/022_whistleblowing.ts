// =============================================================================
// MIGRATION 022 — Whistleblowing / Anonymous Reporting (EU Directive 2019/1937)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Whistleblower Reports ----
  if (!(await knex.schema.hasTable("whistleblower_reports"))) {
    await knex.schema.createTable("whistleblower_reports", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("case_number", 20).notNullable().unique();
      t.string("category", 30).notNullable();
      t.string("severity", 10).notNullable().defaultTo("medium");
      t.string("subject", 255).notNullable();
      t.text("description").notNullable();
      t.json("evidence_paths").nullable();
      t.string("status", 30).notNullable().defaultTo("submitted");
      t.boolean("is_anonymous").notNullable().defaultTo(true);
      t.string("reporter_hash", 64).nullable();
      t.bigInteger("reporter_user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users");
      t.bigInteger("assigned_investigator_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users");
      t.text("investigation_notes").nullable();
      t.text("resolution").nullable();
      t.dateTime("resolved_at").nullable();
      t.string("escalated_to", 255).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["reporter_hash"]);
    });
  }

  // ---- Whistleblower Updates ----
  if (!(await knex.schema.hasTable("whistleblower_updates"))) {
    await knex.schema.createTable("whistleblower_updates", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("report_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("whistleblower_reports")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("update_type", 30).notNullable();
      t.text("content").notNullable();
      t.boolean("is_visible_to_reporter").notNullable().defaultTo(false);
      t.bigInteger("created_by").unsigned().nullable().references("id").inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["report_id", "created_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("whistleblower_updates");
  await knex.schema.dropTableIfExists("whistleblower_reports");
}
