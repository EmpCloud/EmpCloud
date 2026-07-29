// =============================================================================
// MIGRATION 104 — Fix mispaired attendance check-outs
//
// A next-day check-in could be recorded as the PREVIOUS day's check-out,
// because findActiveAttendanceRecord kept a day-shift's open record "active"
// for a full 24h (MIN_ACTIVE_WINDOW_HOURS) — so the next morning's punch
// (~24h later, near the same time) closed yesterday's still-open row instead
// of opening a new one. Result: records spanning ~24h+ (bogus), and the
// employee's real check-in swallowed. The code fix (findActiveAttendanceRecord
// day-boundary guard) stops new occurrences; this repairs the existing rows.
//
// Repair per corrupted record (single-day span >= 20h — impossible for one
// day, so this never touches a legitimate night shift):
//   • The bogus check-out is really the next day's punch. If the user has no
//     record for that day, create one (check-in = the punch) and move the punch
//     row onto it. If they already have that day's record, the punch is a
//     duplicate — drop it.
//   • Clear the original record's check-out so it becomes an honest
//     missed-checkout (status 'checked_in', worked_minutes 0).
//
// Idempotent: only >= 20h-span records are touched, so once repaired a re-run
// finds none. Each record is repaired in its own transaction.
// =============================================================================

import { Knex } from "knex";

const SPAN_MINUTES = 1200; // 20h — a single attendance day can never span this

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_records"))) return;
  const hasPunches = await knex.schema.hasTable("attendance_punches");

  const rows: any[] = await knex("attendance_records")
    .whereNotNull("check_out")
    .whereRaw("TIMESTAMPDIFF(MINUTE, check_in, check_out) >= ?", [SPAN_MINUTES])
    .select(
      "id",
      "organization_id",
      "user_id",
      "shift_id",
      "check_in",
      "check_out",
      "check_out_source",
      "check_out_lat",
      "check_out_lng",
      // The day the swallowed punch belongs to, in the same UTC basis the
      // `date` column is assigned (recordPunch dates rows by UTC date).
      knex.raw("DATE_FORMAT(check_out, '%Y-%m-%d') AS next_date"),
    );

  for (const r of rows) {
    await knex.transaction(async (trx) => {
      const nextDate: string = String(r.next_date).slice(0, 10);

      // The mispaired punch is the record's latest punch (if punch rows exist).
      const lastPunch = hasPunches
        ? await trx("attendance_punches")
            .where({ attendance_record_id: r.id })
            .orderBy("punch_time", "desc")
            .first()
        : null;

      const existing = await trx("attendance_records")
        .where({ organization_id: r.organization_id, user_id: r.user_id, date: nextDate })
        .first();

      if (!existing) {
        // Swallowed check-in — recreate the next-day record from the punch.
        const [newId] = await trx("attendance_records").insert({
          organization_id: r.organization_id,
          user_id: r.user_id,
          date: nextDate,
          shift_id: r.shift_id,
          check_in: r.check_out,
          check_in_source: r.check_out_source,
          check_in_lat: r.check_out_lat,
          check_in_lng: r.check_out_lng,
          status: "checked_in",
          worked_minutes: 0,
          created_at: new Date(),
          updated_at: new Date(),
        });
        if (lastPunch) {
          await trx("attendance_punches")
            .where({ id: lastPunch.id })
            .update({ attendance_record_id: newId });
        }
      } else if (lastPunch) {
        // Next-day record already exists — the mispaired punch is a duplicate.
        await trx("attendance_punches").where({ id: lastPunch.id }).del();
      }

      // Un-corrupt the original: it becomes a genuine missed-checkout.
      await trx("attendance_records").where({ id: r.id }).update({
        check_out: null,
        check_out_source: null,
        check_out_lat: null,
        check_out_lng: null,
        worked_minutes: 0,
        status: "checked_in",
        updated_at: new Date(),
      });
    });
  }
}

export async function down(): Promise<void> {
  // Non-reversible: the original mispairing is corrupt data, not a state worth
  // restoring, and the split records may since have been edited.
}
