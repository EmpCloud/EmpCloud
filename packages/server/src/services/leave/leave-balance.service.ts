// =============================================================================
// EMP CLOUD — Leave Balance Service
//
// Period-aware balance lifecycle:
//   - getBalances() returns the persisted row enriched with derived
//     `available_now`, `period_quota`, and `fiscal_year_label` so callers
//     don't recompute period math everywhere.
//   - initializeBalances() seeds rows for the current fiscal year, pro-rating
//     the first period for employees who joined mid-period.
//   - deductBalance() updates both `total_used` and `period_used` so non-CF
//     policies can enforce per-period caps without scanning applications.
//   - applyLazyRollover() runs on every read/write — when the date crosses a
//     period or fiscal-year boundary, it forfeits unused period_used (for
//     non-CF) and snapshots the prior fiscal year into leave_balances_history
//     before resetting.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { sanitizePlainText as cleanReason } from "../../utils/sanitize-html.js";
import type { LeaveBalance } from "@empcloud/shared";
import {
  type AccrualType,
  getAccruedToDate,
  getFiscalYear,
  getFiscalYearLabel,
  getPeriodInfo,
  getPeriodQuota,
  getProRatedJoiningQuota,
  roundToHalf,
} from "./period.helper.js";

const DEFAULT_FY_START = 4; // April

// ---------------------------------------------------------------------------
// Org config helper (kept here to avoid circular import with org service).
// ---------------------------------------------------------------------------

async function getFiscalYearStartMonth(orgId: number): Promise<number> {
  const db = getDB();
  const org = await db("organizations")
    .where({ id: orgId })
    .select("fiscal_year_start_month")
    .first();
  return Number(org?.fiscal_year_start_month) || DEFAULT_FY_START;
}

// ---------------------------------------------------------------------------
// Lazy rollover — run before any read/write that depends on period state.
// ---------------------------------------------------------------------------

/**
 * Inspect a balance row and, if the current period's key has advanced,
 * perform the appropriate rollover:
 *   - non-period-carry-forward → reset period_used to 0 (forfeit unused)
 *   - period-carry-forward     → no-op (cumulative continues)
 *
 * Fiscal-year rollover is handled separately in archiveAndRollFiscalYear()
 * because it spans every row of an org and writes to the history table.
 */
async function applyLazyPeriodRollover(
  balance: any,
  policy: { accrual_type: AccrualType; period_carry_forward: boolean },
  fyStartMonth: number,
): Promise<any> {
  const now = new Date();
  const info = getPeriodInfo(now, fyStartMonth, policy.accrual_type);

  // Same period → nothing to do.
  if (balance.period_key === info.periodKey) return balance;

  const db = getDB();
  const updates: any = {
    period_key: info.periodKey,
    updated_at: new Date(),
  };

  // For non-carry-forward policies, period_used resets at every period
  // boundary so the next period starts fresh. For carry-forward, period_used
  // is informational only — total balance comes from accrued-to-date.
  if (!policy.period_carry_forward) {
    updates.period_used = 0;
  }

  await db("leave_balances").where({ id: balance.id }).update(updates);
  return { ...balance, ...updates };
}

/**
 * Find the active policy for a (org, leave_type) tuple. Falls back to the
 * leave_type's defaults when no policy exists (legacy data).
 */
async function getPolicyForType(
  orgId: number,
  leaveTypeId: number,
): Promise<{ accrual_type: AccrualType; period_carry_forward: boolean; annual_quota: number } | null> {
  const db = getDB();
  const policy = await db("leave_policies")
    .where({ organization_id: orgId, leave_type_id: leaveTypeId, is_active: true })
    .orderBy("id", "desc")
    .first();
  if (!policy) return null;
  return {
    accrual_type: (policy.accrual_type as AccrualType) ?? "annual",
    period_carry_forward: !!policy.period_carry_forward,
    annual_quota: Number(policy.annual_quota),
  };
}

// ---------------------------------------------------------------------------
// Balance derivation — converts persisted row + policy into the numbers HR
// and the dashboard actually want to display.
// ---------------------------------------------------------------------------

function deriveAvailable(
  balance: any,
  policy: { accrual_type: AccrualType; period_carry_forward: boolean; annual_quota: number },
  fyStartMonth: number,
): { available_now: number; period_quota: number; fiscal_year_label: string } {
  const now = new Date();
  const info = getPeriodInfo(now, fyStartMonth, policy.accrual_type);
  const periodQuota = getPeriodQuota(policy.annual_quota, policy.accrual_type);
  const extra = Number(balance.extra_allocated ?? 0);

  let available: number;
  if (policy.period_carry_forward) {
    // Cumulative: accrued-to-date minus everything used so far (+ overrides).
    const accrued = getAccruedToDate(
      Number(balance.total_allocated),
      policy.accrual_type,
      now,
      fyStartMonth,
    );
    available = accrued + extra - Number(balance.total_used);
  } else {
    // Reset every period: this period's quota minus this period's usage (+ overrides).
    available = periodQuota + extra - Number(balance.period_used);
  }

  return {
    available_now: Math.max(0, roundToHalf(available)),
    period_quota: periodQuota,
    fiscal_year_label: getFiscalYearLabel(info.fiscalYear, fyStartMonth),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getBalances(
  orgId: number,
  userId: number,
  year?: number,
): Promise<LeaveBalance[]> {
  const db = getDB();
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const fiscalYear = year ?? getFiscalYear(new Date(), fyStartMonth);

  const rows = await db("leave_balances")
    .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
    .where({
      "leave_balances.organization_id": orgId,
      "leave_balances.user_id": userId,
      "leave_balances.year": fiscalYear,
    })
    .select(
      "leave_balances.*",
      "leave_types.name as leave_type_name",
      "leave_types.code as leave_type_code",
      "leave_types.color as leave_type_color",
    )
    .orderBy("leave_balances.leave_type_id", "asc");

  const enriched: LeaveBalance[] = [];
  for (const row of rows) {
    const policy = await getPolicyForType(orgId, row.leave_type_id);
    if (!policy) {
      enriched.push(row as LeaveBalance);
      continue;
    }
    const rolled = await applyLazyPeriodRollover(row, policy, fyStartMonth);
    const derived = deriveAvailable(rolled, policy, fyStartMonth);
    enriched.push({ ...rolled, ...derived } as LeaveBalance);
  }
  return enriched;
}

export async function initializeBalances(
  orgId: number,
  year?: number,
): Promise<number> {
  const db = getDB();
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const fiscalYear = year ?? getFiscalYear(new Date(), fyStartMonth);
  const fiscalStart = new Date(fiscalYear, fyStartMonth - 1, 1);

  const policies = await db("leave_policies")
    .where({ organization_id: orgId, is_active: true });

  const users = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id", "date_of_joining");

  let created = 0;

  for (const user of users) {
    for (const policy of policies) {
      const existing = await db("leave_balances")
        .where({
          organization_id: orgId,
          user_id: user.id,
          leave_type_id: policy.leave_type_id,
          year: fiscalYear,
        })
        .first();
      if (existing) continue;

      const accrual = (policy.accrual_type as AccrualType) ?? "annual";
      let totalAllocated = Number(policy.annual_quota);

      // Pro-rate the *first* period for employees joined mid-period within
      // the current fiscal year. Joiners in prior fiscal years get the full
      // annual quota.
      const joinDate = user.date_of_joining ? new Date(user.date_of_joining) : null;
      if (joinDate && joinDate > fiscalStart && joinDate < new Date(fiscalYear + 1, fyStartMonth - 1, 1)) {
        const periodQuota = getPeriodQuota(Number(policy.annual_quota), accrual);
        const remainingPeriods =
          12 / { annual: 12, monthly: 1, quarterly: 3 }[accrual] -
          getPeriodInfo(joinDate, fyStartMonth, accrual).periodIndex -
          1;
        const proRatedFirst = getProRatedJoiningQuota(
          Number(policy.annual_quota),
          accrual,
          joinDate,
          fyStartMonth,
        );
        totalAllocated = roundToHalf(proRatedFirst + remainingPeriods * periodQuota);
      }

      const periodInfo = getPeriodInfo(new Date(), fyStartMonth, accrual);
      await db("leave_balances").insert({
        organization_id: orgId,
        user_id: user.id,
        leave_type_id: policy.leave_type_id,
        year: fiscalYear,
        total_allocated: totalAllocated,
        extra_allocated: 0,
        total_used: 0,
        total_carry_forward: 0,
        balance: totalAllocated,
        period_used: 0,
        period_key: periodInfo.periodKey,
        created_at: new Date(),
        updated_at: new Date(),
      });
      created++;
    }
  }

  return created;
}

/**
 * Deduct on approval. Updates both `balance`/`total_used` (annual rollup)
 * and `period_used` (current-period bucket). The deduction is applied to
 * the period containing `applicationStartDate` so retroactive leaves debit
 * the correct quarter.
 */
export async function deductBalance(
  orgId: number,
  userId: number,
  leaveTypeId: number,
  days: number,
  year?: number,
  applicationStartDate?: Date,
): Promise<LeaveBalance> {
  const db = getDB();
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const refDate = applicationStartDate ?? new Date();
  const fiscalYear = year ?? getFiscalYear(refDate, fyStartMonth);

  const balance = await db("leave_balances")
    .where({
      organization_id: orgId,
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: fiscalYear,
    })
    .first();
  if (!balance) throw new NotFoundError("Leave balance");

  const policy = await getPolicyForType(orgId, leaveTypeId);
  const periodInfoOfApplication = policy
    ? getPeriodInfo(refDate, fyStartMonth, policy.accrual_type)
    : null;
  const currentPeriodInfo = policy
    ? getPeriodInfo(new Date(), fyStartMonth, policy.accrual_type)
    : null;

  // For non-CF policies: a retroactive leave applied for a *past* period
  // can't debit the current period_used because that period already closed.
  // We only update period_used when the application's period equals the
  // current period; otherwise we still update total_used so reporting is
  // correct, but the cap check at apply-time should have already rejected
  // a retroactive leave that exceeded the past period's quota.
  const sameCurrentPeriod =
    !!periodInfoOfApplication &&
    !!currentPeriodInfo &&
    periodInfoOfApplication.periodKey === currentPeriodInfo.periodKey;

  await db("leave_balances")
    .where({ id: balance.id })
    .update({
      total_used: Number(balance.total_used) + days,
      balance: Math.max(0, Number(balance.balance) - days),
      period_used: sameCurrentPeriod
        ? Number(balance.period_used ?? 0) + days
        : Number(balance.period_used ?? 0),
      updated_at: new Date(),
    });

  return db("leave_balances").where({ id: balance.id }).first();
}

export async function creditBalance(
  orgId: number,
  userId: number,
  leaveTypeId: number,
  days: number,
  year?: number,
  applicationStartDate?: Date,
): Promise<LeaveBalance> {
  const db = getDB();
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const refDate = applicationStartDate ?? new Date();
  const fiscalYear = year ?? getFiscalYear(refDate, fyStartMonth);

  const balance = await db("leave_balances")
    .where({
      organization_id: orgId,
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: fiscalYear,
    })
    .first();
  if (!balance) throw new NotFoundError("Leave balance");

  const policy = await getPolicyForType(orgId, leaveTypeId);
  const periodInfoOfApplication = policy
    ? getPeriodInfo(refDate, fyStartMonth, policy.accrual_type)
    : null;
  const currentPeriodInfo = policy
    ? getPeriodInfo(new Date(), fyStartMonth, policy.accrual_type)
    : null;
  const sameCurrentPeriod =
    !!periodInfoOfApplication &&
    !!currentPeriodInfo &&
    periodInfoOfApplication.periodKey === currentPeriodInfo.periodKey;

  await db("leave_balances")
    .where({ id: balance.id })
    .update({
      total_used: Math.max(0, Number(balance.total_used) - days),
      balance: Number(balance.balance) + days,
      period_used: sameCurrentPeriod
        ? Math.max(0, Number(balance.period_used ?? 0) - days)
        : Number(balance.period_used ?? 0),
      updated_at: new Date(),
    });

  return db("leave_balances").where({ id: balance.id }).first();
}

// ---------------------------------------------------------------------------
// Admin: per-employee balance view + override
// ---------------------------------------------------------------------------

export interface EmployeeBalanceSummary {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  emp_code: string | null;
  department_id: number | null;
  department_name: string | null;
  date_of_joining: string | null;
  balances: LeaveBalance[];
}

export async function listEmployeeBalances(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    departmentId?: number;
    locationId?: number;
    year?: number;
  } = {},
): Promise<{ employees: EmployeeBalanceSummary[]; total: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = Math.min(params.perPage ?? 25, 100);
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const fiscalYear = params.year ?? getFiscalYear(new Date(), fyStartMonth);

  let query = db("users")
    .leftJoin(
      "organization_departments",
      "users.department_id",
      "organization_departments.id",
    )
    .where("users.organization_id", orgId)
    .where("users.status", 1)
    .where("users.role", "!=", "super_admin");

  if (params.search) {
    const s = `%${params.search}%`;
    query = query.where((b) => {
      b.where("users.first_name", "like", s)
        .orWhere("users.last_name", "like", s)
        .orWhere("users.email", "like", s)
        .orWhere("users.emp_code", "like", s);
    });
  }
  if (params.departmentId) {
    query = query.where("users.department_id", params.departmentId);
  }
  if (params.locationId) {
    query = query.where("users.location_id", params.locationId);
  }

  const [{ count }] = await query.clone().count("users.id as count");
  const users = await query
    .clone()
    .select(
      "users.id as user_id",
      "users.first_name",
      "users.last_name",
      "users.email",
      "users.emp_code",
      "users.department_id",
      "organization_departments.name as department_name",
      "users.date_of_joining",
    )
    .orderBy("users.first_name", "asc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  const employees: EmployeeBalanceSummary[] = [];
  for (const u of users) {
    const balances = await getBalances(orgId, u.user_id, fiscalYear);
    employees.push({ ...u, balances });
  }

  return { employees, total: Number(count) };
}

/**
 * Update one employee's balance row. Caller must check RBAC and pass the
 * acting user id for audit purposes.
 */
export async function overrideBalance(
  orgId: number,
  balanceId: number,
  actingUserId: number,
  data: { extra_allocated?: number; total_used?: number; reason: string },
): Promise<{ before: any; after: LeaveBalance }> {
  const db = getDB();
  const before = await db("leave_balances")
    .where({ id: balanceId, organization_id: orgId })
    .first();
  if (!before) throw new NotFoundError("Leave balance");

  const updates: any = {
    override_reason: cleanReason(data.reason),
    overridden_by: actingUserId,
    overridden_at: new Date(),
    updated_at: new Date(),
  };
  if (typeof data.extra_allocated === "number") {
    updates.extra_allocated = data.extra_allocated;
  }
  if (typeof data.total_used === "number") {
    if (data.total_used < 0) throw new ValidationError("total_used cannot be negative");
    updates.total_used = data.total_used;
    // Keep `balance` in sync for legacy consumers (Payroll). Available_now
    // is computed at read time, so this only matters for old clients that
    // read `balance` directly.
    updates.balance = Math.max(
      0,
      Number(before.total_allocated) +
        (typeof data.extra_allocated === "number"
          ? data.extra_allocated
          : Number(before.extra_allocated ?? 0)) -
        data.total_used,
    );
  } else if (typeof data.extra_allocated === "number") {
    updates.balance = Math.max(
      0,
      Number(before.total_allocated) + data.extra_allocated - Number(before.total_used),
    );
  }

  await db("leave_balances").where({ id: balanceId }).update(updates);
  const after = await db("leave_balances").where({ id: balanceId }).first();
  return { before, after };
}

/**
 * Bulk-grant or remove `extra_allocated_delta` days for a list of users on
 * a single leave type. If a user has no balance row for the fiscal year,
 * one is created. Returns the user_ids actually affected.
 */
export async function bulkOverrideBalance(
  orgId: number,
  actingUserId: number,
  data: {
    user_ids: number[];
    leave_type_id: number;
    extra_allocated_delta: number;
    reason: string;
    year?: number;
  },
): Promise<number[]> {
  const db = getDB();
  const fyStartMonth = await getFiscalYearStartMonth(orgId);
  const fiscalYear = data.year ?? getFiscalYear(new Date(), fyStartMonth);

  const policy = await getPolicyForType(orgId, data.leave_type_id);
  const accrual = policy?.accrual_type ?? "annual";
  const periodInfo = getPeriodInfo(new Date(), fyStartMonth, accrual);

  const affected: number[] = [];
  for (const userId of data.user_ids) {
    const existing = await db("leave_balances")
      .where({
        organization_id: orgId,
        user_id: userId,
        leave_type_id: data.leave_type_id,
        year: fiscalYear,
      })
      .first();

    if (existing) {
      const newExtra = roundToHalf(
        Number(existing.extra_allocated ?? 0) + data.extra_allocated_delta,
      );
      await db("leave_balances")
        .where({ id: existing.id })
        .update({
          extra_allocated: newExtra,
          override_reason: cleanReason(data.reason),
          overridden_by: actingUserId,
          overridden_at: new Date(),
          balance: Math.max(
            0,
            Number(existing.total_allocated) + newExtra - Number(existing.total_used),
          ),
          updated_at: new Date(),
        });
    } else {
      await db("leave_balances").insert({
        organization_id: orgId,
        user_id: userId,
        leave_type_id: data.leave_type_id,
        year: fiscalYear,
        total_allocated: policy?.annual_quota ?? 0,
        extra_allocated: data.extra_allocated_delta,
        total_used: 0,
        total_carry_forward: 0,
        balance: Math.max(
          0,
          (policy?.annual_quota ?? 0) + data.extra_allocated_delta,
        ),
        period_used: 0,
        period_key: periodInfo.periodKey,
        override_reason: cleanReason(data.reason),
        overridden_by: actingUserId,
        overridden_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    affected.push(userId);
  }
  return affected;
}

/**
 * Reset usage to 0 for the current fiscal-year balance row — for use when
 * HR is correcting a mistaken approval.
 *
 * Originally this only zeroed `period_used`, which is the column read by
 * the available-now formula for non-carry-forward (period-resetting)
 * policies. For cumulative (carry-forward) policies, however, available
 * is computed against `total_used`, so the button silently did nothing
 * visible -- HR clicked Reset, the UI's Used cell still showed the old
 * value, and Available didn't budge. Reset both so the action behaves
 * the same way regardless of accrual type.
 *
 * `total_allocated` and `extra_allocated` are intentionally untouched
 * so the entitlement isn't disturbed.
 */
export async function resetPeriodUsage(
  orgId: number,
  balanceId: number,
  actingUserId: number,
  reason: string,
): Promise<LeaveBalance> {
  const db = getDB();
  const balance = await db("leave_balances")
    .where({ id: balanceId, organization_id: orgId })
    .first();
  if (!balance) throw new NotFoundError("Leave balance");

  await db("leave_balances")
    .where({ id: balanceId })
    .update({
      period_used: 0,
      total_used: 0,
      override_reason: reason,
      overridden_by: actingUserId,
      overridden_at: new Date(),
      updated_at: new Date(),
    });
  return db("leave_balances").where({ id: balanceId }).first();
}

// ---------------------------------------------------------------------------
// Fiscal-year archive (snapshot before reset)
// ---------------------------------------------------------------------------

export async function archiveFiscalYear(
  orgId: number,
  fiscalYear: number,
  reason = "fiscal_year_rollover",
): Promise<number> {
  const db = getDB();
  const rows = await db("leave_balances").where({
    organization_id: orgId,
    year: fiscalYear,
  });
  if (rows.length === 0) return 0;

  const snapshots = rows.map((r) => ({
    organization_id: r.organization_id,
    user_id: r.user_id,
    leave_type_id: r.leave_type_id,
    year: r.year,
    total_allocated: r.total_allocated,
    extra_allocated: r.extra_allocated ?? 0,
    total_used: r.total_used,
    total_carry_forward: r.total_carry_forward,
    balance: r.balance,
    archived_reason: reason,
    archived_at: new Date(),
  }));
  await db("leave_balances_history").insert(snapshots);
  return snapshots.length;
}
