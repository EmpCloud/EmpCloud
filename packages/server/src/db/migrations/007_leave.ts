// =============================================================================
// MIGRATION 007 — Leave Management
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Leave Types ----
  if (!(await knex.schema.hasTable("leave_types"))) {
    await knex.schema.createTable("leave_types", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.string("code", 20).notNullable();
      t.text("description").nullable();
      t.boolean("is_paid").notNullable().defaultTo(true);
      t.boolean("is_carry_forward").notNullable().defaultTo(false);
      t.integer("max_carry_forward_days").unsigned().notNullable().defaultTo(0);
      t.boolean("is_encashable").notNullable().defaultTo(false);
      t.boolean("requires_approval").notNullable().defaultTo(true);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.string("color", 7).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "code"]);
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Leave Policies ----
  if (!(await knex.schema.hasTable("leave_policies"))) {
    await knex.schema.createTable("leave_policies", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("leave_type_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("leave_types")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.decimal("annual_quota", 5, 1).notNullable();
      t.string("accrual_type", 20).notNullable().defaultTo("annual");
      t.decimal("accrual_rate", 5, 2).nullable();
      t.integer("applicable_from_months").unsigned().notNullable().defaultTo(0);
      t.string("applicable_gender", 20).nullable();
      t.string("applicable_employment_types", 255).nullable();
      t.integer("max_consecutive_days").unsigned().nullable();
      t.integer("min_days_before_application").unsigned().notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "leave_type_id"]);
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Leave Balances ----
  if (!(await knex.schema.hasTable("leave_balances"))) {
    await knex.schema.createTable("leave_balances", (t) => {
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
      t.bigInteger("leave_type_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("leave_types")
        .onDelete("CASCADE");
      t.integer("year").unsigned().notNullable();
      t.decimal("total_allocated", 5, 1).notNullable().defaultTo(0);
      t.decimal("total_used", 5, 1).notNullable().defaultTo(0);
      t.decimal("total_carry_forward", 5, 1).notNullable().defaultTo(0);
      t.decimal("balance", 5, 1).notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "user_id", "leave_type_id", "year"]);
      t.index(["user_id", "year"]);
    });
  }

  // ---- Leave Applications ----
  if (!(await knex.schema.hasTable("leave_applications"))) {
    await knex.schema.createTable("leave_applications", (t) => {
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
      t.bigInteger("leave_type_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("leave_types")
        .onDelete("CASCADE");
      t.date("start_date").notNullable();
      t.date("end_date").notNullable();
      t.decimal("days_count", 4, 1).notNullable();
      t.boolean("is_half_day").notNullable().defaultTo(false);
      t.string("half_day_type", 20).nullable();
      t.text("reason").notNullable();
      t.string("status", 20).notNullable().defaultTo("pending");
      t.bigInteger("current_approver_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id", "status"]);
      t.index(["organization_id", "start_date", "end_date"]);
      t.index(["current_approver_id"]);
    });
  }

  // ---- Leave Approvals ----
  if (!(await knex.schema.hasTable("leave_approvals"))) {
    await knex.schema.createTable("leave_approvals", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("leave_application_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("leave_applications")
        .onDelete("CASCADE");
      t.bigInteger("approver_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.integer("level").unsigned().notNullable().defaultTo(1);
      t.string("status", 20).notNullable().defaultTo("pending");
      t.text("remarks").nullable();
      t.timestamp("acted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["leave_application_id"]);
      t.index(["approver_id", "status"]);
    });
  }

  // ---- Comp-Off Requests ----
  if (!(await knex.schema.hasTable("comp_off_requests"))) {
    await knex.schema.createTable("comp_off_requests", (t) => {
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
      t.date("worked_date").notNullable();
      t.date("expires_on").notNullable();
      t.text("reason").notNullable();
      t.decimal("days", 3, 1).notNullable().defaultTo(1);
      t.string("status", 20).notNullable().defaultTo("pending");
      t.bigInteger("approved_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("approved_at").nullable();
      t.text("rejection_reason").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["organization_id", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("comp_off_requests");
  await knex.schema.dropTableIfExists("leave_approvals");
  await knex.schema.dropTableIfExists("leave_applications");
  await knex.schema.dropTableIfExists("leave_balances");
  await knex.schema.dropTableIfExists("leave_policies");
  await knex.schema.dropTableIfExists("leave_types");
}
