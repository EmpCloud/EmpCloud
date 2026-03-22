// =============================================================================
// MIGRATION 005 — Employee Extended Profile Tables
// employee_profiles, employee_addresses, employee_education,
// employee_work_experience, employee_dependents.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Employee Profiles ----
  if (!(await knex.schema.hasTable("employee_profiles"))) {
    await knex.schema.createTable("employee_profiles", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .unique()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("personal_email", 128).nullable();
      t.string("emergency_contact_name", 128).nullable();
      t.string("emergency_contact_phone", 20).nullable();
      t.string("emergency_contact_relation", 50).nullable();
      t.string("blood_group", 5).nullable();
      t.string("marital_status", 20).nullable();
      t.string("nationality", 55).nullable();
      t.string("aadhar_number", 12).nullable();
      t.string("pan_number", 10).nullable();
      t.string("passport_number", 20).nullable();
      t.date("passport_expiry").nullable();
      t.string("visa_status", 50).nullable();
      t.date("visa_expiry").nullable();
      t.date("probation_start_date").nullable();
      t.date("probation_end_date").nullable();
      t.date("confirmation_date").nullable();
      t.integer("notice_period_days").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
    });
  }

  // ---- Employee Addresses ----
  if (!(await knex.schema.hasTable("employee_addresses"))) {
    await knex.schema.createTable("employee_addresses", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("type", 20).notNullable();
      t.string("line1", 255).notNullable();
      t.string("line2", 255).nullable();
      t.string("city", 55).notNullable();
      t.string("state", 55).notNullable();
      t.string("country", 55).notNullable().defaultTo("IN");
      t.string("zipcode", 20).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
      t.index(["user_id"]);
    });
  }

  // ---- Employee Education ----
  if (!(await knex.schema.hasTable("employee_education"))) {
    await knex.schema.createTable("employee_education", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("degree", 100).notNullable();
      t.string("institution", 255).notNullable();
      t.string("field_of_study", 100).nullable();
      t.integer("start_year").nullable();
      t.integer("end_year").nullable();
      t.string("grade", 20).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
      t.index(["user_id"]);
    });
  }

  // ---- Employee Work Experience ----
  if (!(await knex.schema.hasTable("employee_work_experience"))) {
    await knex.schema.createTable("employee_work_experience", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("company_name", 255).notNullable();
      t.string("designation", 100).notNullable();
      t.date("start_date").notNullable();
      t.date("end_date").nullable();
      t.boolean("is_current").notNullable().defaultTo(false);
      t.text("description").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
      t.index(["user_id"]);
    });
  }

  // ---- Employee Dependents ----
  if (!(await knex.schema.hasTable("employee_dependents"))) {
    await knex.schema.createTable("employee_dependents", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("name", 128).notNullable();
      t.string("relationship", 50).notNullable();
      t.date("date_of_birth").nullable();
      t.string("gender", 10).nullable();
      t.boolean("is_nominee").notNullable().defaultTo(false);
      t.decimal("nominee_percentage", 5, 2).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "employee_dependents",
    "employee_work_experience",
    "employee_education",
    "employee_addresses",
    "employee_profiles",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
