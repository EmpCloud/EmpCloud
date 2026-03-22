// =============================================================================
// MIGRATION 006 — Attendance Management
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Shifts ----
  if (!(await knex.schema.hasTable("shifts"))) {
    await knex.schema.createTable("shifts", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.time("start_time").notNullable();
      t.time("end_time").notNullable();
      t.integer("break_minutes").unsigned().notNullable().defaultTo(0);
      t.integer("grace_minutes_late").unsigned().notNullable().defaultTo(0);
      t.integer("grace_minutes_early").unsigned().notNullable().defaultTo(0);
      t.boolean("is_night_shift").notNullable().defaultTo(false);
      t.boolean("is_default").notNullable().defaultTo(false);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Shift Assignments ----
  if (!(await knex.schema.hasTable("shift_assignments"))) {
    await knex.schema.createTable("shift_assignments", (t) => {
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
      t.bigInteger("shift_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("shifts")
        .onDelete("CASCADE");
      t.date("effective_from").notNullable();
      t.date("effective_to").nullable();
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["shift_id"]);
    });
  }

  // ---- Geo-Fence Locations ----
  if (!(await knex.schema.hasTable("geo_fence_locations"))) {
    await knex.schema.createTable("geo_fence_locations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.decimal("latitude", 10, 7).notNullable();
      t.decimal("longitude", 10, 7).notNullable();
      t.integer("radius_meters").unsigned().notNullable().defaultTo(100);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Attendance Records ----
  if (!(await knex.schema.hasTable("attendance_records"))) {
    await knex.schema.createTable("attendance_records", (t) => {
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
      t.date("date").notNullable();
      t.bigInteger("shift_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("shifts")
        .onDelete("SET NULL");
      t.timestamp("check_in").nullable();
      t.timestamp("check_out").nullable();
      t.string("check_in_source", 20).nullable();
      t.string("check_out_source", 20).nullable();
      t.decimal("check_in_lat", 10, 7).nullable();
      t.decimal("check_in_lng", 10, 7).nullable();
      t.decimal("check_out_lat", 10, 7).nullable();
      t.decimal("check_out_lng", 10, 7).nullable();
      t.string("status", 20).notNullable().defaultTo("present");
      t.integer("worked_minutes").unsigned().nullable();
      t.integer("overtime_minutes").unsigned().nullable();
      t.integer("late_minutes").unsigned().nullable();
      t.integer("early_departure_minutes").unsigned().nullable();
      t.text("remarks").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "user_id", "date"]);
      t.index(["organization_id", "date"]);
      t.index(["user_id", "date"]);
    });
  }

  // ---- Attendance Regularizations ----
  if (!(await knex.schema.hasTable("attendance_regularizations"))) {
    await knex.schema.createTable("attendance_regularizations", (t) => {
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
      t.bigInteger("attendance_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("attendance_records")
        .onDelete("SET NULL");
      t.date("date").notNullable();
      t.timestamp("original_check_in").nullable();
      t.timestamp("original_check_out").nullable();
      t.timestamp("requested_check_in").nullable();
      t.timestamp("requested_check_out").nullable();
      t.text("reason").notNullable();
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
      t.index(["organization_id", "status"]);
      t.index(["user_id", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("attendance_regularizations");
  await knex.schema.dropTableIfExists("attendance_records");
  await knex.schema.dropTableIfExists("geo_fence_locations");
  await knex.schema.dropTableIfExists("shift_assignments");
  await knex.schema.dropTableIfExists("shifts");
}
