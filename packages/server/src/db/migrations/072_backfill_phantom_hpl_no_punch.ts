// =============================================================================
// MIGRATION 072 — Backfill phantom `half_present_half_leave` (HPL) rows
//
// The old leave-approval code stamped EVERY half-day leave as HPL on the
// attendance row. The payroll engine pays HPL's "worked" half UNCONDITIONALLY
// (it only charges LOP on the leave half, and only when that leave is unpaid),
// so a half-day-leave taker who NEVER actually punched in was paid a FULL day
// for a day they were half-absent (e.g. Rama / 12-Jun: HPL + paid EL + zero
// punches => 0 LOP => full pay).
//
// The code fix now records `half_day` for that case (½ paid + ½ LOP). This
// migration repairs rows the old code already wrote, with a PRECISE scope:
//   convert HPL -> half_day ONLY where the row has NO punches AND is backed by
//   an approved half-day leave covering that date (exactly the no-show case).
//
// Deliberately LEFT UNTOUCHED:
//   • HPL rows that carry real punches      -> genuinely worked + half leave
//                                              (legitimate full pay)
//   • HPL rows with no backing half-day
//     leave (HR set HPL by hand on the grid) -> respect the manual decision
//
// Idempotent: after it runs there are no matching HPL rows left, so a re-run is
// a no-op. `down` is intentionally a no-op — reversing would re-introduce the
// over-pay bug; this is a data correction, not a schema change.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE attendance_records ar
    SET ar.status = 'half_day', ar.updated_at = NOW()
    WHERE ar.status = 'half_present_half_leave'
      AND NOT EXISTS (
        SELECT 1 FROM attendance_punches p
        WHERE p.attendance_record_id = ar.id
      )
      AND EXISTS (
        SELECT 1 FROM leave_applications la
        WHERE la.user_id = ar.user_id
          AND la.organization_id = ar.organization_id
          AND la.status = 'approved'
          AND la.is_half_day = 1
          AND la.start_date <= ar.date
          AND la.end_date >= ar.date
      )
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // No-op. Reversing would re-create the half-day-leave over-pay bug.
}
