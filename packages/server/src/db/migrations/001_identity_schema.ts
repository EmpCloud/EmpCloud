// =============================================================================
// MIGRATION 001 — Identity & Organization Tables
// The core empcloud tables: orgs, users, departments, locations, roles.
// These are the existing tables from the empcloud schema used by emp-payroll.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Organizations ----
  if (!(await knex.schema.hasTable("organizations"))) {
    await knex.schema.createTable("organizations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("name", 100).notNullable();
      t.string("legal_name", 255).nullable();
      t.string("email", 128).nullable();
      t.string("contact_number", 20).nullable();
      t.string("website", 255).nullable();
      t.string("logo", 255).nullable();
      t.string("timezone", 50).nullable();
      t.string("country", 55).defaultTo("IN");
      t.string("state", 55).nullable();
      t.string("city", 55).nullable();
      t.string("zipcode", 20).nullable();
      t.text("address").nullable();
      t.string("language", 10).notNullable().defaultTo("en");
      t.string("weekday_start", 10).defaultTo("monday");
      t.integer("current_user_count").notNullable().defaultTo(0);
      t.integer("total_allowed_user_count").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // ---- Organization Departments ----
  if (!(await knex.schema.hasTable("organization_departments"))) {
    await knex.schema.createTable("organization_departments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("name", 100).notNullable();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.boolean("is_deleted").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
    });
  }

  // ---- Organization Locations ----
  if (!(await knex.schema.hasTable("organization_locations"))) {
    await knex.schema.createTable("organization_locations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("name", 100).notNullable();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.text("address").nullable();
      t.string("timezone", 50).nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id"]);
    });
  }

  // ---- Users ----
  if (!(await knex.schema.hasTable("users"))) {
    await knex.schema.createTable("users", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("first_name", 64).notNullable();
      t.string("last_name", 64).notNullable();
      t.string("email", 128).notNullable().unique();
      t.string("password", 512).nullable();
      t.string("emp_code", 50).nullable();
      t.string("contact_number", 20).nullable();
      t.date("date_of_birth").nullable();
      t.string("gender", 10).nullable();
      t.date("date_of_joining").nullable();
      t.date("date_of_exit").nullable();
      t.string("designation", 100).nullable();
      t.bigInteger("department_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("organization_departments")
        .onDelete("SET NULL");
      t.bigInteger("location_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("organization_locations")
        .onDelete("SET NULL");
      t.bigInteger("reporting_manager_id").unsigned().nullable().references("id").inTable("users");
      t.string("employment_type", 20).defaultTo("full_time");
      t.string("photo_path", 512).nullable();
      t.string("address", 512).nullable();
      t.string("role", 20).notNullable().defaultTo("employee");
      t.tinyint("status").notNullable().defaultTo(1);
      t.string("language", 5).notNullable().defaultTo("en");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["organization_id", "department_id"]);
    });
  }

  // ---- Roles ----
  if (!(await knex.schema.hasTable("roles"))) {
    await knex.schema.createTable("roles", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("name", 256).notNullable();
      t.bigInteger("organization_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.tinyint("type").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.text("permissions").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "name"]);
    });
  }

  // ---- User Roles ----
  if (!(await knex.schema.hasTable("user_roles"))) {
    await knex.schema.createTable("user_roles", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("role_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("roles")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["user_id", "role_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "user_roles",
    "roles",
    "users",
    "organization_locations",
    "organization_departments",
    "organizations",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
