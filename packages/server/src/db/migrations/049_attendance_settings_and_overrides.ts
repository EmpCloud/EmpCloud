// =============================================================================
// MIGRATION 049 — Attendance settings + per-user overrides
//
// Adds the policy layer on top of the existing attendance_records / shift /
// geo_fence_locations tables so we can:
//   • restrict which channels (dashboard / biometric / app) are allowed for
//     check-in/out — at org level and overridable per user
//   • expose the geofence list to the EmpCloud mobile app (Android validates
//     locally; server doesn't enforce distance)
//
// Two new tables. `geo_fence_locations` (from migration 006) is reused as-is
// for storing the actual lat/lng/radius rows.
// =============================================================================

import type { Knex } from "knex";

const SETTINGS_TABLE = "attendance_settings";
const OVERRIDES_TABLE = "user_attendance_overrides";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(SETTINGS_TABLE))) {
    await knex.schema.createTable(SETTINGS_TABLE, (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .unique()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      // CSV of allowed channels. Stored as VARCHAR (not MySQL SET) so the
      // app can do simple includes() checks and we keep portability across
      // MySQL / MariaDB. Default = all three channels enabled.
      t.string("allowed_channels", 64).notNullable().defaultTo("dashboard,biometric,app");
      // Hint to the mobile app: "is the org using geofencing at all?". Server
      // does not enforce distance — Android validates locally and decides
      // what to do when the user is out of range.
      t.boolean("geofence_advisory").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(OVERRIDES_TABLE))) {
    await knex.schema.createTable(OVERRIDES_TABLE, (t) => {
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
      // NULL = inherit org `allowed_channels`. Otherwise CSV subset.
      t.string("allowed_channels", 64).nullable();
      // 'inherit' = use org-level geofences as-is.
      // 'off'     = report no geofences for this user (Android sees empty).
      // 'custom'  = use only the geofence pinned in `custom_geofence_id`.
      t.enum("geofence_mode", ["inherit", "off", "custom"]).notNullable().defaultTo("inherit");
      t.bigInteger("custom_geofence_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("geo_fence_locations")
        .onDelete("SET NULL");
      // Date-range semantics mirror shift_assignments: latest `start_date`
      // that's currently active wins. NULL `end_date` = open-ended.
      t.date("start_date").notNullable();
      t.date("end_date").nullable();
      t.string("note", 255).nullable();
      t.bigInteger("created_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id", "start_date", "end_date"], "idx_uao_user_dates");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(OVERRIDES_TABLE);
  await knex.schema.dropTableIfExists(SETTINGS_TABLE);
}
