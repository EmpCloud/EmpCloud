// =============================================================================
// MIGRATION 070 — Backfill PAN / UAN across EmpCloud <-> payroll
//
// Why:
//   PAN and UAN are entered on EITHER product's profile screen but stored in
//   two separate schemas on the same MySQL server:
//     - EmpCloud: empcloud.employee_profiles.pan_number / uan_number
//     - payroll:  emp_payroll.employee_payroll_profiles.tax_info (JSON, keys
//                 `pan` / `uan`)
//   Going forward the two services mirror every save to each other
//   (EmpCloud employee-profile.service.ts <-> payroll employee.service.ts).
//   But that only fires on NEW edits — rows that already diverged stay broken
//   until someone re-saves. This migration reconciles the existing data once.
//
// What it does (per user that has a payroll profile):
//   - If one side has a value and the other is empty -> copy the value across.
//   - If both sides have the SAME value -> nothing to do.
//   - If both sides have DIFFERENT non-empty values -> leave both alone and log
//     a conflict (we never silently clobber a real identifier).
//
// Direction guards:
//   - Writing INTO EmpCloud respects the column widths: pan_number is
//     VARCHAR(10) and uan_number VARCHAR(12). A payroll value that doesn't fit
//     (e.g. a malformed 11-char PAN) is skipped rather than truncated — that
//     was the source of the earlier "Data too long" failure.
//   - Writing INTO payroll just merges the key into the tax_info JSON blob.
//   - We only ever UPDATE an existing payroll profile, and we INSERT an
//     EmpCloud employee_profiles row only when the user genuinely exists in
//     empcloud.users (a payroll profile always points at a real EmpCloud user).
//
// Safety:
//   - If the emp_payroll schema / table isn't reachable (single-product
//     deployment, or the migration DB user lacks cross-schema grants) the
//     whole migration is a clean no-op.
//   - Idempotent: a second run finds everything already in agreement and
//     writes nothing.
// =============================================================================

import type { Knex } from "knex";

const PAYROLL_DB = process.env.PAYROLL_DB_NAME || "emp_payroll";

interface PayrollProfileRow {
  id: string;
  empcloud_user_id: number;
  empcloud_org_id: number;
  tax_info: unknown;
}

interface EcProfileRow {
  id: number;
  organization_id: number;
  user_id: number;
  pan_number: string | null;
  uan_number: string | null;
}

function parseTaxInfo(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}") || {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("employee_profiles"))) return;
  if (!(await knex.schema.hasTable("users"))) return;

  // Confirm the payroll schema + table are reachable from this connection.
  // information_schema is readable by any grant; a 0-count means we can't (or
  // shouldn't) touch payroll — bail out as a no-op.
  let payrollReachable = false;
  try {
    const [{ c }] = await knex.raw(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = 'employee_payroll_profiles'",
      [PAYROLL_DB],
    ).then((r: any) => r[0]);
    payrollReachable = Number(c) > 0;
  } catch {
    payrollReachable = false;
  }
  if (!payrollReachable) {
    // eslint-disable-next-line no-console
    console.log("[migration 070] emp_payroll schema not reachable — skipping PAN/UAN backfill");
    return;
  }

  const payrollTable = `${PAYROLL_DB}.employee_payroll_profiles`;

  const payrollProfiles: PayrollProfileRow[] = await knex(payrollTable).select(
    "id",
    "empcloud_user_id",
    "empcloud_org_id",
    "tax_info",
  );
  if (payrollProfiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[migration 070] no payroll profiles — nothing to backfill");
    return;
  }

  // EmpCloud profiles keyed by `${org}-${user}` for O(1) lookup.
  const ecProfiles: EcProfileRow[] = await knex("employee_profiles").select(
    "id",
    "organization_id",
    "user_id",
    "pan_number",
    "uan_number",
  );
  const ecByKey = new Map<string, EcProfileRow>();
  for (const p of ecProfiles) {
    ecByKey.set(`${p.organization_id}-${p.user_id}`, p);
  }

  const now = new Date();
  let ecUpdated = 0;
  let ecInserted = 0;
  let payrollUpdated = 0;
  const conflicts: string[] = [];

  for (const pr of payrollProfiles) {
    const orgId = pr.empcloud_org_id;
    const userId = pr.empcloud_user_id;
    if (!orgId || !userId) continue;

    const tax = parseTaxInfo(pr.tax_info);
    const payrollPan = str(tax.pan);
    const payrollUan = str(tax.uan);

    const key = `${orgId}-${userId}`;
    const ec = ecByKey.get(key);
    const ecPan = str(ec?.pan_number);
    const ecUan = str(ec?.uan_number);

    // ---- Resolve PAN ----
    let pushPanToEc: string | null = null; // value to write into EmpCloud
    let pushPanToPayroll: string | null = null; // value to write into payroll
    if (payrollPan && !ecPan) {
      // payroll -> EmpCloud, but only if it fits VARCHAR(10).
      if (payrollPan.length === 10) pushPanToEc = payrollPan.toUpperCase();
      else conflicts.push(`PAN for user ${userId} not 10 chars ("${payrollPan}") — skipped EC write`);
    } else if (ecPan && !payrollPan) {
      pushPanToPayroll = ecPan.toUpperCase();
    } else if (ecPan && payrollPan && ecPan.toUpperCase() !== payrollPan.toUpperCase()) {
      conflicts.push(`PAN mismatch user ${userId}: EmpCloud="${ecPan}" payroll="${payrollPan}" — left as-is`);
    }

    // ---- Resolve UAN ----
    let pushUanToEc: string | null = null;
    let pushUanToPayroll: string | null = null;
    if (payrollUan && !ecUan) {
      if (payrollUan.length <= 12) pushUanToEc = payrollUan;
      else conflicts.push(`UAN for user ${userId} >12 chars ("${payrollUan}") — skipped EC write`);
    } else if (ecUan && !payrollUan) {
      pushUanToPayroll = ecUan;
    } else if (ecUan && payrollUan && ecUan !== payrollUan) {
      conflicts.push(`UAN mismatch user ${userId}: EmpCloud="${ecUan}" payroll="${payrollUan}" — left as-is`);
    }

    // ---- Apply EmpCloud-side write ----
    if (pushPanToEc !== null || pushUanToEc !== null) {
      if (ec) {
        const upd: Record<string, unknown> = { updated_at: now };
        if (pushPanToEc !== null) upd.pan_number = pushPanToEc;
        if (pushUanToEc !== null) upd.uan_number = pushUanToEc;
        await knex("employee_profiles").where({ id: ec.id }).update(upd);
        ecUpdated++;
      } else {
        // No EmpCloud profile row yet — only insert if the user really exists.
        const user = await knex("users").where({ id: userId, organization_id: orgId }).first();
        if (user) {
          await knex("employee_profiles").insert({
            organization_id: orgId,
            user_id: userId,
            pan_number: pushPanToEc,
            uan_number: pushUanToEc,
            created_at: now,
            updated_at: now,
          });
          ecInserted++;
        }
      }
    }

    // ---- Apply payroll-side write ----
    if (pushPanToPayroll !== null || pushUanToPayroll !== null) {
      const nextTax = { ...tax };
      if (pushPanToPayroll !== null) nextTax.pan = pushPanToPayroll;
      if (pushUanToPayroll !== null) nextTax.uan = pushUanToPayroll;
      await knex(payrollTable)
        .where({ id: pr.id })
        .update({ tax_info: JSON.stringify(nextTax) });
      payrollUpdated++;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[migration 070] PAN/UAN backfill: EmpCloud updated=${ecUpdated} inserted=${ecInserted}, payroll updated=${payrollUpdated}, conflicts=${conflicts.length}`,
  );
  for (const c of conflicts) {
    // eslint-disable-next-line no-console
    console.log(`[migration 070]   ${c}`);
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op. This migration only fills in MISSING values (and never overwrites a
  // conflicting one), so there's no clean automatic reversal — rolling back
  // would mean guessing which side originally had the blank. Leave the data in
  // its now-consistent state.
}
