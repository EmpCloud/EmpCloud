// =============================================================================
// MIGRATION 027 — Custom Fields & Forms
// Allows HR admins to add custom data fields to employees, departments, etc.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Custom Field Definitions ----
  if (!(await knex.schema.hasTable("custom_field_definitions"))) {
    await knex.schema.createTable("custom_field_definitions", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.enum("entity_type", [
        "employee",
        "department",
        "location",
        "project",
        "document",
      ]).notNullable();
      t.string("field_name", 100).notNullable();
      t.string("field_key", 100).notNullable();
      t.enum("field_type", [
        "text",
        "textarea",
        "number",
        "decimal",
        "date",
        "datetime",
        "dropdown",
        "multi_select",
        "checkbox",
        "email",
        "phone",
        "url",
        "file",
      ]).notNullable();
      t.json("options").nullable();
      t.text("default_value").nullable();
      t.string("placeholder", 200).nullable();
      t.boolean("is_required").notNullable().defaultTo(false);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.boolean("is_searchable").notNullable().defaultTo(false);
      t.string("validation_regex", 255).nullable();
      t.decimal("min_value", 15, 4).nullable();
      t.decimal("max_value", 15, 4).nullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.string("section", 100).notNullable().defaultTo("Custom Fields");
      t.text("help_text").nullable();
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "entity_type", "is_active"]);
      t.unique(["organization_id", "entity_type", "field_key"]);
    });
  }

  // ---- Custom Field Values ----
  if (!(await knex.schema.hasTable("custom_field_values"))) {
    await knex.schema.createTable("custom_field_values", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("field_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("custom_field_definitions")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.enum("entity_type", [
        "employee",
        "department",
        "location",
        "project",
        "document",
      ]).notNullable();
      t.bigInteger("entity_id").unsigned().notNullable();
      t.text("value_text").nullable();
      t.decimal("value_number", 15, 4).nullable();
      t.dateTime("value_date").nullable();
      t.boolean("value_boolean").nullable();
      t.json("value_json").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "entity_type", "entity_id"]);
      t.unique(["field_id", "entity_id"]);
      t.index(["organization_id", "field_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("custom_field_values");
  await knex.schema.dropTableIfExists("custom_field_definitions");
}
