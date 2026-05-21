// =============================================================================
// MIGRATION 071 — Backfill regularization times to proper UTC instants
//
// Why:
//   Until the regularization timezone fix shipped, requested_check_in /
//   requested_check_out were stored as the RAW wall-clock the employee typed
//   (e.g. "22:00") with no timezone conversion. The DB column is a DATETIME
//   read in the connection timezone (UTC in prod), so on the grid and the
//   request list that wall-clock was re-interpreted as UTC and rendered in the
//   org timezone shifted by the offset (22:00 IST showed as 03:30).
//
//   The fix now stores the real instant. This migration brings the EXISTING
//   rows onto the same basis: treat each stored value as wall-clock in the
//   row's resolved timezone (location -> org -> UTC) and rewrite it as the
//   instant it represents. Approved regularizations also copied their raw time
//   onto the linked attendance_records.check_in/out, so those are re-applied
//   from the corrected values.
//
// Assumption (valid):
//   The regularization tz-conversion code was never deployed before this
//   release, so 100% of existing rows are raw wall-clock — a single, uniform
//   convention. No mixed state to disambiguate.
//
// Safety:
//   - Once-only: guarded by a `_migration_state` marker so the auto-runner
//     (which re-imports every migration file on each boot) can't double-shift.
//   - All-or-nothing: the whole backfill runs in one transaction.
//   - Server-tz aware by construction: on a UTC server the stored string
//     genuinely changes (22:00 -> 16:30); on a server whose tz already equals
//     the row's tz the instant is unchanged (correct no-op).
// =============================================================================

import type { Knex } from "knex";

const MARKER = "071_backfill_regularization_tz";

/** Resolve the employee's wall-clock timezone: location -> org -> UTC. */
async function resolveTz(knex: Knex, userId: number, orgId: number): Promise<string> {
  const u = await knex("users").where({ id: userId }).select("location_id").first();
  if (u?.location_id) {
    const loc = await knex("organization_locations")
      .where({ id: u.location_id })
      .select("timezone")
      .first();
    if (loc?.timezone) return loc.timezone as string;
  }
  const org = await knex("organizations").where({ id: orgId }).select("timezone").first();
  return (org?.timezone as string) || "UTC";
}

/**
 * Treat a "YYYY-MM-DD HH:mm:ss" wall-clock string (in `tz`) as the instant it
 * represents and return a JS Date. Mirrors wallClockToInstant() in
 * regularization.service.ts.
 */
function wallClockToInstant(value: string, tz: string): Date | null {
  const v = String(value).trim().replace("T", " ");
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const asUtcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asUtcMs));
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
  let hh = g("hour");
  if (hh === 24) hh = 0;
  const tzAsUtcMs = Date.UTC(g("year"), g("month") - 1, g("day"), hh, g("minute"), g("second"));
  const offsetMs = tzAsUtcMs - asUtcMs;
  return new Date(asUtcMs - offsetMs);
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_regularizations"))) return;

  // Once-only marker so the re-running auto-migrator can't double-shift.
  if (!(await knex.schema.hasTable("_migration_state"))) {
    await knex.schema.createTable("_migration_state", (t) => {
      t.string("key", 191).primary();
      t.dateTime("applied_at").notNullable();
    });
  }
  const already = await knex("_migration_state").where({ key: MARKER }).first();
  if (already) return;

  // Read RAW wall-clock strings (CAST AS CHAR) so we get the literal stored
  // value, not a connection-tz-hydrated Date.
  const rows: Array<{
    id: number;
    user_id: number;
    organization_id: number;
    status: string;
    attendance_id: number | null;
    ci: string | null;
    co: string | null;
  }> = await knex("attendance_regularizations").select(
    "id",
    "user_id",
    "organization_id",
    "status",
    "attendance_id",
    knex.raw("CAST(requested_check_in AS CHAR) as ci"),
    knex.raw("CAST(requested_check_out AS CHAR) as co"),
  );

  let regFixed = 0;
  let attFixed = 0;
  const tzCache = new Map<string, string>();

  await knex.transaction(async (trx) => {
    for (const r of rows) {
      if (!r.ci && !r.co) continue;
      const cacheKey = `${r.user_id}:${r.organization_id}`;
      let tz = tzCache.get(cacheKey);
      if (!tz) {
        tz = await resolveTz(trx, r.user_id, r.organization_id);
        tzCache.set(cacheKey, tz);
      }
      // UTC tz means wall-clock already equals the instant — nothing to shift.
      const ciInstant = r.ci ? wallClockToInstant(r.ci, tz) : null;
      const coInstant = r.co ? wallClockToInstant(r.co, tz) : null;

      const regUpd: Record<string, unknown> = {};
      if (ciInstant) regUpd.requested_check_in = ciInstant;
      if (coInstant) regUpd.requested_check_out = coInstant;
      if (Object.keys(regUpd).length) {
        await trx("attendance_regularizations").where({ id: r.id }).update(regUpd);
        regFixed++;
      }

      // Approved regularizations stamped their (raw) time onto the linked
      // attendance row — re-apply the corrected instants there too.
      if (r.status === "approved" && r.attendance_id) {
        const attUpd: Record<string, unknown> = {};
        if (ciInstant) attUpd.check_in = ciInstant;
        if (coInstant) attUpd.check_out = coInstant;
        if (ciInstant && coInstant) {
          attUpd.worked_minutes = Math.max(
            0,
            Math.round((coInstant.getTime() - ciInstant.getTime()) / 60000),
          );
        }
        if (Object.keys(attUpd).length) {
          await trx("attendance_records").where({ id: r.attendance_id }).update(attUpd);
          attFixed++;
        }
      }
    }

    await trx("_migration_state").insert({ key: MARKER, applied_at: new Date() });
  });

  // eslint-disable-next-line no-console
  console.log(
    `[migration 071] regularization tz backfill: ${regFixed} request row(s), ${attFixed} approved attendance row(s) normalized`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // No-op. The shift is data-dependent and the marker makes it one-shot; a
  // blind reverse-shift would corrupt any rows written correctly after this.
}
