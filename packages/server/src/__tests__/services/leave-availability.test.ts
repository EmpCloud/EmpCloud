import { afterEach, describe, expect, it, vi } from "vitest";

const { db, state } = vi.hoisted(() => {
  const state = { balance: 0.5, periodUsed: 0 };
  const db = vi.fn((table: string) => {
    const row = table === "organizations"
      ? { fiscal_year_start_month: 4 }
      : table === "leave_policies"
        ? { accrual_type: "quarterly", period_carry_forward: 0, annual_quota: 8 }
        : [{ id: 1815, organization_id: 5, user_id: 662, leave_type_id: 12,
            year: 2026, total_allocated: 4.5, total_used: 4,
            balance: state.balance, extra_allocated: 0,
            period_used: state.periodUsed, period_key: "2026-Q3" }];
    const query: any = {};
    for (const method of ["where", "leftJoin", "select", "orderBy"]) {
      query[method] = () => query;
    }
    query.first = async () => row;
    query.then = (resolve: any) => Promise.resolve(row).then(resolve);
    return query;
  });
  return { db, state };
});

vi.mock("../../db/connection.js", () => ({ getDB: () => db }));
import { getBalances } from "../../services/leave/leave-balance.service.js";

afterEach(() => vi.useRealTimers());

describe("leave availability respects the remaining allocation", () => {
  it.each([
    [0.5, 0, 0.5], // Screenshot: quarterly quota is 2, remaining allocation is 0.5.
    [0, 0, 0],
    [5, 1.5, 0.5], // The period limit still applies when annual balance is larger.
    [5, 0, 2],
  ])("balance %s with period usage %s exposes %s days", async (balance, periodUsed, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    state.balance = balance;
    state.periodUsed = periodUsed;
    const [result] = await getBalances(5, 662, 2026);
    expect((result as any).available_now).toBe(expected);
  });
});
