// =============================================================================
// MIGRATION 055 — Purge shifts with SQL-injection / XSS payload names
//
// Reported: production has shift rows with names like
//   '; DROP TABLE shifts; --
//   <script>alert(document.cookie)</script>
// These were left over from a security probe that the (overly permissive)
// validator accepted. PR adds a strict regex on `shifts.name` going
// forward; this migration cleans up the rows already in the DB.
//
// Strategy: any shift whose name contains a character outside the
// allowed set (letters, digits, space, _, -, ., /, (, ), &, comma) is
// purged. The shifts.shift_assignments FK has ON DELETE CASCADE and
// attendance_records.shift_id is ON DELETE SET NULL (per migration 006),
// so deleting a shift cleans up its assignments and preserves
// attendance history with a null shift_id.
//
// Logged loudly so an operator running the migration sees exactly what
// got deleted and from which org. Idempotent — re-running matches no
// rows on a clean dataset.
// =============================================================================

import type { Knex } from "knex";

// Mirror of SHIFT_NAME_REGEX in packages/shared/src/validators/index.ts
// (kept inline so the migration doesn't depend on the shared package).
// MySQL doesn't support \p{L}\p{N} in REGEXP for older versions, so we
// approximate by rejecting the dangerous characters explicitly. Any
// shift whose name CONTAINS one of these is treated as unsafe.
const UNSAFE_CHARS_REGEX = "[<>'\"`;\\\\{}]";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("shifts"))) return;

  const unsafeShifts: Array<{ id: number; organization_id: number; name: string }> =
    await knex("shifts")
      .whereRaw(`name REGEXP ?`, [UNSAFE_CHARS_REGEX])
      .orWhereRaw(`name LIKE ?`, ["%--%"])
      .orWhereRaw(`LOWER(name) LIKE ?`, ["%<script%"])
      .orWhereRaw(`LOWER(name) LIKE ?`, ["%drop table%"])
      .orWhereRaw(`LOWER(name) LIKE ?`, ["%union select%"])
      .select("id", "organization_id", "name");

  if (unsafeShifts.length === 0) return;

  // Surface what's about to disappear in the migration log so operators
  // can confirm the cleanup matches what they expected. Truncate the
  // name in case the payload is huge.
  for (const row of unsafeShifts) {
    const preview = String(row.name).slice(0, 120);
    // eslint-disable-next-line no-console
    console.warn(
      `[migration 055] Purging unsafe shift id=${row.id} org=${row.organization_id} name="${preview}"`,
    );
  }

  // CASCADE on shift_assignments takes care of dependents.
  // attendance_records.shift_id is ON DELETE SET NULL — history is
  // preserved with a null shift link.
  await knex("shifts")
    .whereIn(
      "id",
      unsafeShifts.map((r) => r.id),
    )
    .delete();
}

export async function down(_knex: Knex): Promise<void> {
  // One-way data fix; restoring purged probe payloads would re-introduce
  // the security issue. No-op so the migration registry stays consistent
  // if someone migrates down.
}
