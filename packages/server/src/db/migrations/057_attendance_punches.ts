// =============================================================================
// MIGRATION 057 — Attendance Punches (multi-punch timeline)
//
// Until now an attendance_records row stored exactly one check_in and one
// check_out timestamp. Real-world usage breaks that: people step out for
// lunch / meetings / errands and want to record those as separate taps,
// and the previous "Already checked out today" / "Already checked in"
// errors blocked legitimate punches.
//
// New shape: every physical tap (web button, biometric scan, mobile app)
// inserts a row in `attendance_punches`. The parent attendance_records
// row keeps its check_in / check_out columns as a denormalised view —
// check_in is the FIRST punch of the day (locked once set), check_out is
// the LATEST punch of the day (overwritten on each new punch). All
// existing readers (reports, payroll, dashboard, leave) continue to work
// without changes.
//
// Backfill: every existing attendance_records row that has a check_in
// timestamp gets a corresponding 'first' punch; rows with check_out get a
// second punch. This guarantees historical data has a valid timeline so
// the new admin timeline UI never shows an empty list for old days.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_records"))) return;

  if (!(await knex.schema.hasTable("attendance_punches"))) {
    await knex.schema.createTable("attendance_punches", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("attendance_record_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("attendance_records")
        .onDelete("CASCADE");
      // Denormalised so org-scoped queries (admin lists, audit) don't
      // need a join through attendance_records.
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
      t.timestamp("punch_time").notNullable();
      // Mirrors attendance_records.check_in_source values so the timeline
      // can render "biometric" / "dashboard" / "app" / "manual" badges.
      t.string("source", 20).notNullable().defaultTo("manual");
      t.decimal("latitude", 10, 7).nullable();
      t.decimal("longitude", 10, 7).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      // Timeline reads always order by punch_time, so index that.
      t.index(["attendance_record_id", "punch_time"]);
      t.index(["organization_id", "punch_time"]);
      t.index(["user_id", "punch_time"]);
    });
  }

  // Backfill — only insert if the punches table is empty for a given
  // record. Running this on a re-attempt is a no-op.
  const records: Array<{
    id: number;
    organization_id: number;
    user_id: number;
    check_in: Date | string | null;
    check_in_source: string | null;
    check_in_lat: string | number | null;
    check_in_lng: string | number | null;
    check_out: Date | string | null;
    check_out_source: string | null;
    check_out_lat: string | number | null;
    check_out_lng: string | number | null;
  }> = await knex("attendance_records")
    .whereNotNull("check_in")
    .select(
      "id",
      "organization_id",
      "user_id",
      "check_in",
      "check_in_source",
      "check_in_lat",
      "check_in_lng",
      "check_out",
      "check_out_source",
      "check_out_lat",
      "check_out_lng",
    );

  let inserted = 0;
  // Chunk the inserts so a tenant with millions of historical rows
  // doesn't blow the packet size or hold one giant transaction.
  const CHUNK = 500;
  const buffer: Array<Record<string, unknown>> = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    await knex("attendance_punches").insert(buffer);
    inserted += buffer.length;
    buffer.length = 0;
  };

  for (const r of records) {
    const existingCount = await knex("attendance_punches")
      .where({ attendance_record_id: r.id })
      .count<{ count: string | number }[]>("* as count")
      .first();
    if (Number(existingCount?.count ?? 0) > 0) continue;

    if (r.check_in) {
      buffer.push({
        attendance_record_id: r.id,
        organization_id: r.organization_id,
        user_id: r.user_id,
        punch_time: r.check_in,
        source: r.check_in_source || "manual",
        latitude: r.check_in_lat ?? null,
        longitude: r.check_in_lng ?? null,
      });
    }
    if (r.check_out) {
      buffer.push({
        attendance_record_id: r.id,
        organization_id: r.organization_id,
        user_id: r.user_id,
        punch_time: r.check_out,
        source: r.check_out_source || "manual",
        latitude: r.check_out_lat ?? null,
        longitude: r.check_out_lng ?? null,
      });
    }

    if (buffer.length >= CHUNK) await flush();
  }
  await flush();

  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[migration 057] Backfilled ${inserted} attendance punches from existing records`);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("attendance_punches")) {
    await knex.schema.dropTable("attendance_punches");
  }
}
