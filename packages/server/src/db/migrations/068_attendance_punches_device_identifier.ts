// =============================================================================
// MIGRATION 068 — attendance_punches.device_identifier
//
// Adds a free-text identifier for the physical device that recorded a punch
// (kiosk tablet, biometric reader serial, mobile app device id, etc.). Carried
// optionally on every check-in/check-out — the kiosk passes it on the
// /api/v3/biometric/get-user-info call and we persist it onto the per-tap
// attendance_punches row, alongside source/latitude/longitude.
//
// Nullable so existing rows and non-biometric punches (manual / app) stay
// valid without backfill. UI hides the field when null.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_punches"))) return;
  if (await knex.schema.hasColumn("attendance_punches", "device_identifier")) return;
  await knex.schema.alterTable("attendance_punches", (t) => {
    t.string("device_identifier", 128).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_punches"))) return;
  if (!(await knex.schema.hasColumn("attendance_punches", "device_identifier"))) return;
  await knex.schema.alterTable("attendance_punches", (t) => {
    t.dropColumn("device_identifier");
  });
}
