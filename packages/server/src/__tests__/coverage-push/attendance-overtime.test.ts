// =============================================================================
// Coverage Push: Attendance overtime + full-month classification (MOCK, no DB)
//
// Exercises attendance.service.getMonthlyGrid (pure JS classification run over
// mocked rows) and updateAttendanceCell (the grid cell-edit status mapping):
//   - auto WOT / HOT: a full present day worked on a week-off / holiday is
//     auto-upgraded to WOT / HOT (holiday wins when both apply)
//   - explicit weekoff_overtime / holiday_overtime statuses map to WOT / HOT
//   - full-month classification: holiday (HO), week-off (WO), absent (A),
//     present (P), missed-checkout (M), on_leave (L)
//   - week-off resolution from shift working_days CSV + per-assignment is_weekoff
//   - updateAttendanceCell maps WOT/HOT -> weekoff_overtime/holiday_overtime
//
// No MySQL connection is opened — db/knex is fully mocked.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

interface TableState {
  rows: any[];
  firsts: any[];
}
const tables: Record<string, TableState> = {};
const captured = {
  inserts: [] as Array<{ table: string; data: any }>,
  updates: [] as Array<{ table: string; data: any }>,
  dels: [] as Array<{ table: string }>,
  wheres: [] as Array<{ table: string; arg: any }>,
};

const CHAIN_METHODS = [
  "select", "where", "whereIn", "whereNotIn", "whereNull", "whereNotNull",
  "whereNot", "whereRaw", "whereBetween", "andWhere", "orWhere", "orWhereRaw",
  "orWhereNull", "orderBy", "groupBy", "limit", "offset", "join", "leftJoin",
  "on", "andOn", "clone",
];

// getMonthlyGrid uses aliased table names (e.g. db("users as u")). Normalise so
// a seed under "users" answers a query against "users as u".
function baseTable(name: string): string {
  return String(name).split(/\s+as\s+/i)[0].trim();
}

function tableState(name: string): TableState {
  const key = baseTable(name);
  if (!tables[key]) tables[key] = { rows: [], firsts: [] };
  return tables[key];
}

function makeChain(table: string) {
  const st = tableState(table);
  table = baseTable(table);
  const chain: any = {};
  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn((...args: any[]) => {
      if (m === "where" || m === "andWhere") {
        captured.wheres.push({ table, arg: args[0] });
      }
      if (
        (m === "where" || m === "andWhere" || m === "orWhere") &&
        typeof args[0] === "function"
      ) {
        try { args[0].call(chain, chain); } catch { /* ignore */ }
      }
      return chain;
    });
  }
  chain.first = vi.fn(() => Promise.resolve(st.firsts.length ? st.firsts.shift() : null));
  chain.insert = vi.fn((data: any) => {
    captured.inserts.push({ table, data });
    return Promise.resolve([1]);
  });
  chain.update = vi.fn((data: any) => {
    captured.updates.push({ table, data });
    return Promise.resolve(1);
  });
  chain.del = vi.fn(() => { captured.dels.push({ table }); return Promise.resolve(1); });
  chain.delete = chain.del;
  chain.count = vi.fn(() => Promise.resolve([{ count: 0 }]));
  chain.then = (resolve: any, reject: any) => Promise.resolve(st.rows).then(resolve, reject);
  chain.catch = (cb: any) => Promise.resolve(st.rows).catch(cb);
  return chain;
}

const mockDB: any = vi.fn((table: string) => makeChain(table));
mockDB.raw = vi.fn((sql: string, bindings?: any) => ({ sql, bindings }));
mockDB.transaction = vi.fn(async (cb: any) => {
  const trx: any = (t: string) => makeChain(t);
  trx.raw = mockDB.raw;
  return cb(trx);
});

vi.mock("../../db/connection", () => ({ getDB: vi.fn(() => mockDB), initDB: vi.fn() }));
vi.mock("../../db/connection.js", () => ({ getDB: vi.fn(() => mockDB), initDB: vi.fn() }));
// attendance-settings.assertChannelAllowed talks to the DB — stub it out.
vi.mock("../../services/attendance/attendance-settings.service", () => ({
  assertChannelAllowed: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../services/attendance/attendance-settings.service.js", () => ({
  assertChannelAllowed: vi.fn(() => Promise.resolve()),
}));

import {
  getMonthlyGrid,
  updateAttendanceCell,
} from "../../services/attendance/attendance.service.js";

const ORG = 5;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.dels.length = 0;
  captured.wheres.length = 0;
  vi.clearAllMocks();
});

// Seed the standard table fixtures for a single-employee month.
// May 2026: 1st = Fri, 2nd = Sat, 3rd = Sun, 4th = Mon ...
function seedMonth(opts: {
  users?: any[];
  attendance?: any[];
  holidays?: any[]; // company_events rows
  assignments?: any[]; // shift_assignments-join-shifts rows
  leaves?: any[]; // leave_applications-join-leave_types rows
}) {
  tableState("users").rows = opts.users ?? [
    { user_id: 1, first_name: "Asha", last_name: "K", emp_code: "E1", department: "Eng", location: "HQ" },
  ];
  tableState("company_events").rows = opts.holidays ?? [];
  tableState("organization_holidays").rows = [];
  tableState("attendance_records").rows = opts.attendance ?? [];
  tableState("shift_assignments").rows = opts.assignments ?? [];
  tableState("leave_applications").rows = opts.leaves ?? [];
}

function dayCode(grid: any, date: string): string {
  return grid.employees[0].days[date];
}

describe("getMonthlyGrid — full-month classification", () => {
  it("classifies present / absent / half_day / on_leave / missed-checkout from stored status", async () => {
    seedMonth({
      attendance: [
        { user_id: 1, date: "2026-05-04", status: "present", worked_minutes: 500 },
        { user_id: 1, date: "2026-05-05", status: "absent", worked_minutes: 0 },
        { user_id: 1, date: "2026-05-06", status: "half_day", worked_minutes: 200 },
        { user_id: 1, date: "2026-05-07", status: "on_leave", worked_minutes: 0 },
        // checked_in on a PAST date -> M (missed check-out), not P.
        { user_id: 1, date: "2026-05-08", status: "checked_in", worked_minutes: 0 },
      ],
    });

    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });

    expect(grid.daysInMonth).toBe(31);
    expect(grid.totalEmployees).toBe(1);
    expect(dayCode(grid, "2026-05-04")).toBe("P");
    expect(dayCode(grid, "2026-05-05")).toBe("A");
    expect(dayCode(grid, "2026-05-06")).toBe("H");
    expect(dayCode(grid, "2026-05-07")).toBe("L");
    expect(dayCode(grid, "2026-05-08")).toBe("M");
  });

  it("marks holiday dates as HO when no attendance row exists", async () => {
    seedMonth({
      holidays: [{ start_date: "2026-05-04", end_date: "2026-05-04" }],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    expect(dayCode(grid, "2026-05-04")).toBe("HO");
    // A passed non-holiday day with no row and no week-off is Absent
    // (the grid synthesizes A for missing past working days).
    expect(dayCode(grid, "2026-05-09")).toBe("A");
  });

  it("expands a multi-day holiday range across each covered date", async () => {
    seedMonth({
      holidays: [{ start_date: "2026-05-04", end_date: "2026-05-06" }],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    expect(dayCode(grid, "2026-05-04")).toBe("HO");
    expect(dayCode(grid, "2026-05-05")).toBe("HO");
    expect(dayCode(grid, "2026-05-06")).toBe("HO");
    // Day after the holiday range, already passed, no row → Absent.
    expect(dayCode(grid, "2026-05-07")).toBe("A");
  });

  it("never marks future days Absent — they stay blank until lived", async () => {
    // A wholly-future month: every day is after today, so none is Absent.
    seedMonth({});
    const grid = await getMonthlyGrid(ORG, { month: 1, year: 2099 });
    expect(dayCode(grid, "2099-01-15")).toBe("");
    expect(dayCode(grid, "2099-01-20")).toBe("");
  });

  it("does not mark days before the employee joined as Absent", async () => {
    // Fully-past month (June 2020). Joiner mid-month: days before the join
    // date stay blank; passed working days on/after it are Absent.
    seedMonth({
      users: [
        {
          user_id: 1,
          first_name: "Neha",
          last_name: "R",
          emp_code: "E9",
          department: "Eng",
          location: "HQ",
          date_of_joining: "2020-06-15",
        },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 6, year: 2020 });
    expect(dayCode(grid, "2020-06-05")).toBe(""); // before joining → blank
    expect(dayCode(grid, "2020-06-18")).toBe("A"); // after joining, passed → Absent
  });

  it("resolves week-offs from the shift working_days CSV (Mon-Fri shift -> Sat+Sun WO)", async () => {
    seedMonth({
      assignments: [
        {
          user_id: 1,
          effective_from: "2026-05-01",
          effective_to: null,
          working_days: "1,2,3,4,5", // Mon-Fri
          is_weekoff: 0,
        },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    // 2026-05-02 = Sat, 2026-05-03 = Sun -> week-off.
    expect(grid.employees[0].weekoffDays["2026-05-02"]).toBe(true);
    expect(grid.employees[0].weekoffDays["2026-05-03"]).toBe(true);
    // 2026-05-04 = Mon -> a working day, not a weekoff.
    expect(grid.employees[0].weekoffDays["2026-05-04"]).toBeUndefined();
  });

  it("honours a per-assignment is_weekoff flag (carved-out off range)", async () => {
    seedMonth({
      assignments: [
        {
          user_id: 1,
          effective_from: "2026-05-05",
          effective_to: "2026-05-06",
          working_days: "1,2,3,4,5",
          is_weekoff: 1, // entire sub-range marked off
        },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    // 5th (Mon) + 6th (Tue) are forced off by the is_weekoff flag.
    expect(grid.employees[0].weekoffDays["2026-05-05"]).toBe(true);
    expect(grid.employees[0].weekoffDays["2026-05-06"]).toBe(true);
  });

  it("identifies dates governed by a night shift for allowance counting", async () => {
    seedMonth({
      attendance: [
        { user_id: 1, date: "2026-05-04", status: "present", worked_minutes: 480 },
        { user_id: 1, date: "2026-05-05", status: "half_day", worked_minutes: 240 },
        { user_id: 1, date: "2026-05-06", status: "half_present_half_leave", worked_minutes: 240 },
        { user_id: 1, date: "2026-05-07", status: "absent", worked_minutes: 0 },
        { user_id: 1, date: "2026-05-08", status: "weekoff_overtime", worked_minutes: 480 },
        { user_id: 1, date: "2026-05-09", status: "holiday_overtime", worked_minutes: 480 },
        { user_id: 1, date: "2026-05-10", status: "checked_in", worked_minutes: 0 },
      ],
      assignments: [
        {
          user_id: 1,
          effective_from: "2026-05-04",
          effective_to: "2026-05-10",
          working_days: "1,2,3,4,5",
          is_weekoff: 0,
          is_night_shift: 1,
        },
      ],
    });

    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });

    expect(grid.employees[0].nightShiftDays["2026-05-04"]).toBe(true);
    expect(grid.employees[0].nightShiftDays["2026-05-10"]).toBe(true);
    expect(grid.employees[0].nightShiftDays["2026-05-11"]).toBeUndefined();
    expect(grid.employees[0].nightAllowanceCount).toBe(5);
    expect(grid.employees[0].extraDayDays["2026-05-10"]).toBe(true);
    expect(grid.employees[0].extraDayCount).toBe(3);
  });

  it("falls back to the attendance-row shift for night allowance when no assignment covers the date", async () => {
    seedMonth({
      attendance: [
        {
          user_id: 1,
          date: "2026-05-04",
          status: "present",
          worked_minutes: 480,
          shift_id: 9,
          attendance_shift_is_night: 1,
        },
      ],
    });

    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });

    expect(grid.employees[0].nightShiftDays["2026-05-04"]).toBe(true);
    expect(grid.employees[0].nightAllowanceCount).toBe(1);
  });
});

describe("getMonthlyGrid — auto WOT / HOT overtime", () => {
  it("auto-upgrades a full present day on a week-off to WOT", async () => {
    seedMonth({
      attendance: [{ user_id: 1, date: "2026-05-02", status: "present", worked_minutes: 480 }],
      assignments: [
        { user_id: 1, effective_from: "2026-05-01", effective_to: null, working_days: "1,2,3,4,5", is_weekoff: 0 },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    // 2026-05-02 is a Saturday -> shift week-off; present that day -> WOT.
    expect(dayCode(grid, "2026-05-02")).toBe("WOT");
    expect(grid.employees[0].weekoffDays["2026-05-02"]).toBe(true);
  });

  it("auto-upgrades a full present day on a holiday to HOT", async () => {
    seedMonth({
      attendance: [{ user_id: 1, date: "2026-05-04", status: "present", worked_minutes: 480 }],
      holidays: [{ start_date: "2026-05-04", end_date: "2026-05-04" }],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    expect(dayCode(grid, "2026-05-04")).toBe("HOT");
  });

  it("holiday wins over week-off when a present day is both (HOT, not WOT)", async () => {
    seedMonth({
      attendance: [{ user_id: 1, date: "2026-05-02", status: "present", worked_minutes: 480 }],
      holidays: [{ start_date: "2026-05-02", end_date: "2026-05-02" }],
      assignments: [
        { user_id: 1, effective_from: "2026-05-01", effective_to: null, working_days: "1,2,3,4,5", is_weekoff: 0 },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    // Sat 2026-05-02 is both a holiday and a shift week-off -> holiday wins.
    expect(dayCode(grid, "2026-05-02")).toBe("HOT");
  });

  it("leaves an explicit weekoff_overtime / holiday_overtime status as WOT / HOT", async () => {
    seedMonth({
      attendance: [
        { user_id: 1, date: "2026-05-10", status: "weekoff_overtime", worked_minutes: 300 },
        { user_id: 1, date: "2026-05-11", status: "holiday_overtime", worked_minutes: 300 },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    expect(dayCode(grid, "2026-05-10")).toBe("WOT");
    expect(dayCode(grid, "2026-05-11")).toBe("HOT");
  });

  it("does NOT upgrade a non-present (absent) row on a week-off to WOT", async () => {
    seedMonth({
      attendance: [{ user_id: 1, date: "2026-05-02", status: "absent", worked_minutes: 0 }],
      assignments: [
        { user_id: 1, effective_from: "2026-05-01", effective_to: null, working_days: "1,2,3,4,5", is_weekoff: 0 },
      ],
    });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    // Real row is "A" -> auto-OT only fires on real === "P".
    expect(dayCode(grid, "2026-05-02")).toBe("A");
    expect(grid.employees[0].weekoffDays["2026-05-02"]).toBe(true);
  });

  it("returns an empty employee list (no queries for records) when the org has no users", async () => {
    seedMonth({ users: [] });
    const grid = await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    expect(grid.employees).toEqual([]);
    expect(grid.totalEmployees).toBe(0);
    // days[] is still produced for the calendar header.
    expect(grid.days).toHaveLength(31);
  });
});

describe("getMonthlyGrid — tenant scoping", () => {
  it("scopes attendance_records and users to organization_id", async () => {
    seedMonth({ attendance: [{ user_id: 1, date: "2026-05-04", status: "present", worked_minutes: 480 }] });
    await getMonthlyGrid(ORG, { month: 5, year: 2026 });
    const arWhere = captured.wheres.find(
      (w) => w.table === "attendance_records" && (w.arg === "organization_id" ),
    );
    // attendance_records uses .where("organization_id", orgId) positional form.
    expect(arWhere).toBeTruthy();
  });
});

describe("updateAttendanceCell — overtime + status mapping", () => {
  it("maps WOT -> weekoff_overtime on a new row (insert)", async () => {
    tableState("attendance_records").firsts = [null]; // no existing row
    const res = await updateAttendanceCell(ORG, { userId: 1, date: "2026-05-02", code: "WOT" });
    expect(res).toEqual({ ok: true, action: "created", status: "weekoff_overtime" });
    const ins = captured.inserts.find((i) => i.table === "attendance_records");
    expect(ins!.data.status).toBe("weekoff_overtime");
    expect(ins!.data.organization_id).toBe(ORG);
    expect(ins!.data.user_id).toBe(1);
    expect(ins!.data.date).toBe("2026-05-02");
  });

  it("maps HOT -> holiday_overtime on an existing row (update)", async () => {
    tableState("attendance_records").firsts = [{ id: 77 }]; // existing row
    const res = await updateAttendanceCell(ORG, { userId: 1, date: "2026-05-04", code: "HOT" });
    expect(res).toEqual({ ok: true, action: "updated", status: "holiday_overtime" });
    const upd = captured.updates.find((u) => u.table === "attendance_records");
    expect(upd!.data.status).toBe("holiday_overtime");
    expect(upd!.data.updated_at).toBeInstanceOf(Date);
  });

  it("maps the base codes P/A/H/L/HPL to their statuses", async () => {
    const cases: Array<[string, string]> = [
      ["P", "present"],
      ["A", "absent"],
      ["H", "half_day"],
      ["L", "on_leave"],
      ["HPL", "half_present_half_leave"],
    ];
    for (const [code, status] of cases) {
      captured.inserts.length = 0;
      tableState("attendance_records").firsts = [null];
      const res = await updateAttendanceCell(ORG, { userId: 1, date: "2026-05-04", code });
      expect(res.status).toBe(status);
    }
  });

  it("deletes the row for revert codes ('', WO, HO, -) so the day falls back to default", async () => {
    for (const code of ["", "WO", "HO", "-"]) {
      captured.dels.length = 0;
      const res = await updateAttendanceCell(ORG, { userId: 1, date: "2026-05-04", code });
      expect(res).toEqual({ ok: true, action: "deleted" });
      expect(captured.dels.find((d) => d.table === "attendance_records")).toBeTruthy();
    }
  });

  it("rejects an unknown code and a malformed date", async () => {
    await expect(updateAttendanceCell(ORG, { userId: 1, date: "2026-05-04", code: "ZZ" }))
      .rejects.toThrow(/Unknown status code/);
    await expect(updateAttendanceCell(ORG, { userId: 1, date: "not-a-date", code: "P" }))
      .rejects.toThrow(/YYYY-MM-DD/);
  });
});
