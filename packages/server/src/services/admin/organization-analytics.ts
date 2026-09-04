export interface OrganizationSubscriptionRow {
  id: number;
  organization_id: number;
  module_id: number;
  module_name: string;
  module_slug: string;
  plan_tier: string;
  status: string;
  total_seats: number;
  used_seats: number;
  billing_cycle: string;
  price_per_seat: number;
  currency: string;
  months_in_cycle: number;
  trial_ends_at: string | Date | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
  auto_renew: boolean | number;
  is_free: boolean | number;
}

export interface OrganizationSubscriptionDetail extends OrganizationSubscriptionRow {
  monthly_amount: number;
  available_seats: number;
}

export interface OrganizationSubscriptionSummary {
  active_module_count: number;
  plans: string[];
  subscription_statuses: string[];
  total_licenses: number;
  used_licenses: number;
  available_licenses: number;
  license_utilization: number;
  monthly_spend_by_currency: Array<{ currency: string; amount: number }>;
  subscriptions: OrganizationSubscriptionDetail[];
}

export type OrganizationPaymentStatus =
  | "paid"
  | "unpaid"
  | "overdue"
  | "no_invoice"
  | "not_configured"
  | "unavailable";

export interface OrganizationPaymentSummary {
  status: OrganizationPaymentStatus;
  outstanding_by_currency: Array<{ currency: string; amount: number }>;
  overdue_invoice_count: number;
  unpaid_invoice_count: number;
  latest_invoice: {
    id: string;
    invoice_number: string;
    status: string;
    amount_due: number;
    total: number;
    currency: string;
    issue_date: string | Date | null;
    due_date: string | Date | null;
  } | null;
}

export const ACCESS_SUBSCRIPTION_STATUSES = ["active", "trial"] as const;
export const SUBSCRIPTION_ATTENTION_STATUSES = [
  "past_due",
  "suspended",
  "deactivated",
] as const;
export const SUBSCRIPTION_PORTFOLIO_STATUSES = [
  ...ACCESS_SUBSCRIPTION_STATUSES,
  ...SUBSCRIPTION_ATTENTION_STATUSES,
] as const;

const ACCESS_SUBSCRIPTION_STATUS_SET = new Set<string>(ACCESS_SUBSCRIPTION_STATUSES);

export function emptyOrganizationSubscriptionSummary(): OrganizationSubscriptionSummary {
  return {
    active_module_count: 0,
    plans: [],
    subscription_statuses: [],
    total_licenses: 0,
    used_licenses: 0,
    available_licenses: 0,
    license_utilization: 0,
    monthly_spend_by_currency: [],
    subscriptions: [],
  };
}

export function summarizeSubscriptionsByOrganization(
  rows: OrganizationSubscriptionRow[],
): Map<number, OrganizationSubscriptionSummary> {
  const summaries = new Map<number, OrganizationSubscriptionSummary>();
  const spendByOrg = new Map<number, Map<string, number>>();

  for (const row of rows) {
    const orgId = Number(row.organization_id);
    const summary = summaries.get(orgId) ?? emptyOrganizationSubscriptionSummary();
    const totalSeats = Number(row.total_seats) || 0;
    const usedSeats = Number(row.used_seats) || 0;
    const availableSeats = Math.max(0, totalSeats - usedSeats);
    const monthsInCycle = Math.max(1, Number(row.months_in_cycle) || 1);
    const hasAccess = ACCESS_SUBSCRIPTION_STATUS_SET.has(row.status);
    const monthlyAmount = !hasAccess || row.is_free
      ? 0
      : Math.round(((Number(row.price_per_seat) || 0) * totalSeats) / monthsInCycle);

    summary.subscriptions.push({
      ...row,
      total_seats: totalSeats,
      used_seats: usedSeats,
      price_per_seat: Number(row.price_per_seat) || 0,
      months_in_cycle: monthsInCycle,
      auto_renew: Boolean(row.auto_renew),
      is_free: Boolean(row.is_free),
      monthly_amount: monthlyAmount,
      available_seats: availableSeats,
    });

    if (hasAccess) {
      summary.active_module_count += 1;
      summary.total_licenses += totalSeats;
      summary.used_licenses += usedSeats;
      if (!summary.plans.includes(row.plan_tier)) summary.plans.push(row.plan_tier);
      if (!summary.subscription_statuses.includes(row.status)) {
        summary.subscription_statuses.push(row.status);
      }

      const currency = String(row.currency || "INR").toUpperCase();
      const currencySpend = spendByOrg.get(orgId) ?? new Map<string, number>();
      currencySpend.set(currency, (currencySpend.get(currency) ?? 0) + monthlyAmount);
      spendByOrg.set(orgId, currencySpend);
    }

    summaries.set(orgId, summary);
  }

  for (const [orgId, summary] of summaries) {
    summary.plans.sort();
    summary.subscription_statuses.sort();
    summary.available_licenses = Math.max(0, summary.total_licenses - summary.used_licenses);
    summary.license_utilization = summary.total_licenses
      ? Math.round((summary.used_licenses / summary.total_licenses) * 100)
      : 0;
    summary.monthly_spend_by_currency = Array.from(spendByOrg.get(orgId) ?? [])
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  return summaries;
}
