// =============================================================================
// MIGRATION 065 — Liveness detection settings on biometric_legacy_credentials
//
// Adds two columns so the kiosk owner can configure liveness detection from
// the Biometric Kiosk Access page:
//
//   - liveness_enabled (boolean, default false) — when true, the kiosk
//     auth flow runs a liveness check on each face capture (anti-spoof:
//     blink / micro-movement detection) before issuing the JWT.
//   - liveness_level (varchar(16), default 'moderate') — sensitivity
//     threshold the on-device check applies. "moderate" tolerates more
//     ambient variance; "high" rejects on subtler signals (better
//     security, more legitimate retries).
//
// Defaults preserve current behaviour (liveness off) so existing
// deployments don't lock anyone out on the next kiosk login.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("biometric_legacy_credentials"))) return;
  await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
    return t;
  });
  if (!(await knex.schema.hasColumn("biometric_legacy_credentials", "liveness_enabled"))) {
    await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
      t.boolean("liveness_enabled").notNullable().defaultTo(false);
    });
  }
  if (!(await knex.schema.hasColumn("biometric_legacy_credentials", "liveness_level"))) {
    await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
      t.string("liveness_level", 16).notNullable().defaultTo("moderate");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("biometric_legacy_credentials"))) return;
  if (await knex.schema.hasColumn("biometric_legacy_credentials", "liveness_level")) {
    await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
      t.dropColumn("liveness_level");
    });
  }
  if (await knex.schema.hasColumn("biometric_legacy_credentials", "liveness_enabled")) {
    await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
      t.dropColumn("liveness_enabled");
    });
  }
}
