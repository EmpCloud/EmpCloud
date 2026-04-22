// =============================================================================
// MIGRATION 046 — Biometric Legacy Full Parity
//
// Fills the remaining gaps between emp-monitor's /v3/bioMetric surface and
// EmpCloud's /api/v3/biometric shim so response payloads match byte-for-byte.
//
// Adds:
//  - organization_holidays     (powers GET /holidays)
//  - biometric_departments     (powers /get-department + department_status)
//  - biometric_access_counters (device metering per-day + per-dept)
//  - biometric_access_logs     (per-scan access history)
//  - organizations.camera_overlay_status          (0/1 feature flag)
//  - organizations.biometrics_confirmation_status (0/1 feature flag)
//  - organizations.is_biometrics_employee         (0/1 feature flag)
//  - organizations.org_secret_key_hash            (org-level kiosk secret)
//  - organizations.attendance_hours_seconds       (defaults to 28800 / 8h)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- organizations columns ----
  await knex.schema.alterTable("organizations", (t) => {
    t.tinyint("camera_overlay_status").notNullable().defaultTo(0);
    t.tinyint("biometrics_confirmation_status").notNullable().defaultTo(0);
    t.tinyint("is_biometrics_employee").notNullable().defaultTo(0);
    t.string("org_secret_key_hash", 255).nullable();
    t.integer("attendance_hours_seconds").notNullable().defaultTo(28800);
  });

  // ---- organization_holidays ----
  if (!(await knex.schema.hasTable("organization_holidays"))) {
    await knex.schema.createTable("organization_holidays", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("holiday_name", 255).notNullable();
      t.date("holiday_date").notNullable();
      t.text("description").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "holiday_date"]);
    });
  }

  // ---- biometric_departments ----
  if (!(await knex.schema.hasTable("biometric_departments"))) {
    await knex.schema.createTable("biometric_departments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("department_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organization_departments")
        .onDelete("CASCADE");
      t.string("name", 255).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "department_id"], { indexName: "uq_biometric_dept_org_dept" });
    });
  }

  // ---- biometric_access_counters ----
  if (!(await knex.schema.hasTable("biometric_access_counters"))) {
    await knex.schema.createTable("biometric_access_counters", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.date("date").notNullable();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("department_id").unsigned().nullable();
      t.integer("access_count").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "date"], "idx_bac_org_date");
    });
  }

  // ---- biometric_access_logs ----
  if (!(await knex.schema.hasTable("biometric_access_logs"))) {
    await knex.schema.createTable("biometric_access_logs", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("department_id").unsigned().nullable();
      t.dateTime("start_time").notNullable();
      t.dateTime("end_time").nullable();
      t.integer("yyyymmdd").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "yyyymmdd"], "idx_bal_org_date");
      t.index(["user_id", "yyyymmdd"], "idx_bal_user_date");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("biometric_access_logs");
  await knex.schema.dropTableIfExists("biometric_access_counters");
  await knex.schema.dropTableIfExists("biometric_departments");
  await knex.schema.dropTableIfExists("organization_holidays");
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("attendance_hours_seconds");
    t.dropColumn("org_secret_key_hash");
    t.dropColumn("is_biometrics_employee");
    t.dropColumn("biometrics_confirmation_status");
    t.dropColumn("camera_overlay_status");
  });
}
