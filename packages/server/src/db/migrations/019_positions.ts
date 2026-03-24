// =============================================================================
// MIGRATION 019 — Position Management & Headcount Planning
// Tables: positions, position_assignments, headcount_plans
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Positions ----
  if (!(await knex.schema.hasTable("positions"))) {
    await knex.schema.createTable("positions", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 200).notNullable();
      t.string("code", 50).nullable();
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
      t.bigInteger("reports_to_position_id")
        .unsigned()
        .nullable();
      t.text("job_description").nullable();
      t.text("requirements").nullable();
      t.bigint("min_salary").nullable();
      t.bigint("max_salary").nullable();
      t.string("currency", 3).notNullable().defaultTo("INR");
      t.enum("employment_type", ["full_time", "part_time", "contract", "intern"])
        .notNullable()
        .defaultTo("full_time");
      t.integer("headcount_budget").notNullable().defaultTo(1);
      t.integer("headcount_filled").notNullable().defaultTo(0);
      t.enum("status", ["active", "frozen", "closed"])
        .notNullable()
        .defaultTo("active");
      t.boolean("is_critical").notNullable().defaultTo(false);
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "status"]);
      t.index(["organization_id", "department_id"]);
      t.unique(["organization_id", "code"]);
    });

    // Self-referencing FK added after table creation
    await knex.schema.alterTable("positions", (t) => {
      t.foreign("reports_to_position_id")
        .references("id")
        .inTable("positions")
        .onDelete("SET NULL");
    });
  }

  // ---- Position Assignments ----
  if (!(await knex.schema.hasTable("position_assignments"))) {
    await knex.schema.createTable("position_assignments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("position_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("positions")
        .onDelete("CASCADE");
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
      t.date("start_date").notNullable();
      t.date("end_date").nullable();
      t.boolean("is_primary").notNullable().defaultTo(true);
      t.enum("status", ["active", "ended"])
        .notNullable()
        .defaultTo("active");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["position_id", "status"]);
      t.index(["user_id", "status"]);
    });
  }

  // ---- Headcount Plans ----
  if (!(await knex.schema.hasTable("headcount_plans"))) {
    await knex.schema.createTable("headcount_plans", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 200).notNullable();
      t.string("fiscal_year", 10).notNullable();
      t.enum("quarter", ["Q1", "Q2", "Q3", "Q4", "annual"]).nullable();
      t.bigInteger("department_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("organization_departments")
        .onDelete("SET NULL");
      t.integer("planned_headcount").notNullable().defaultTo(0);
      t.integer("approved_headcount").notNullable().defaultTo(0);
      t.integer("current_headcount").notNullable().defaultTo(0);
      t.bigint("budget_amount").nullable();
      t.string("currency", 3).notNullable().defaultTo("INR");
      t.enum("status", ["draft", "submitted", "approved", "rejected"])
        .notNullable()
        .defaultTo("draft");
      t.bigInteger("approved_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users");
      t.text("notes").nullable();
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "fiscal_year", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("headcount_plans");
  await knex.schema.dropTableIfExists("position_assignments");
  await knex.schema.dropTableIfExists("positions");
}
