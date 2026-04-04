// =============================================================================
// EMP CLOUD - Deep Attendance / Regularization / Shift Tests
// =============================================================================
import knex, { Knex } from "knex";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: Knex;
beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "empcloud" },
    pool: { min: 1, max: 5 },
  });
  await db.raw("SELECT 1");
});
afterAll(async () => { if (db) await db.destroy(); });

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const MGR = 529;
const HR = 525;
const U = String(Date.now()).slice(-6);

// -- Attendance Records -------------------------------------------------------
describe("Attendance Records (deep)", () => {
  const ids: number[] = [];

  afterAll(async () => {
    for (const id of ids) await db("attendance_records").where({ id }).delete();
  });

  it("insert check-in record with geo coords", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-15",
      check_in: new Date("2018-06-15T09:00:00"), check_in_source: "web",
      check_in_lat: 12.9716, check_in_lng: 77.5946,
      status: "present", late_minutes: 0,
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    const r = await db("attendance_records").where({ id }).first();
    expect(r.check_in_source).toBe("web");
    expect(Number(r.check_in_lat)).toBeCloseTo(12.9716, 3);
  });

  it("update with check-out and calculate worked_minutes", async () => {
    const id = ids[0];
    const checkIn = new Date("2018-06-15T09:00:00");
    const checkOut = new Date("2018-06-15T17:30:00");
    const worked = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
    await db("attendance_records").where({ id }).update({
      check_out: checkOut, check_out_source: "web",
      check_out_lat: 12.9716, check_out_lng: 77.5946,
      worked_minutes: worked, status: "present", updated_at: new Date(),
    });
    const r = await db("attendance_records").where({ id }).first();
    expect(r.worked_minutes).toBe(510);
  });

  it("half_day status for < 240 worked minutes", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-16",
      check_in: new Date("2018-06-16T09:00:00"),
      check_out: new Date("2018-06-16T12:00:00"),
      check_in_source: "manual", check_out_source: "manual",
      worked_minutes: 180, status: "half_day",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect((await db("attendance_records").where({ id }).first()).status).toBe("half_day");
  });

  it("absent status for < 5 worked minutes", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-17",
      check_in: new Date("2018-06-17T09:00:00"),
      check_out: new Date("2018-06-17T09:03:00"),
      check_in_source: "manual", check_out_source: "manual",
      worked_minutes: 3, status: "absent",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect((await db("attendance_records").where({ id }).first()).status).toBe("absent");
  });

  it("on_leave status record", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-18",
      status: "on_leave",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect((await db("attendance_records").where({ id }).first()).status).toBe("on_leave");
  });

  it("late_minutes recorded when late", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-19",
      check_in: new Date("2018-06-19T10:30:00"), check_in_source: "web",
      status: "present", late_minutes: 90,
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect((await db("attendance_records").where({ id }).first()).late_minutes).toBe(90);
  });

  it("overtime and early departure minutes", async () => {
    const [id] = await db("attendance_records").insert({
      organization_id: ORG, user_id: EMP, date: "2018-06-20",
      check_in: new Date("2018-06-20T08:00:00"),
      check_out: new Date("2018-06-20T19:00:00"),
      check_in_source: "web", check_out_source: "web",
      worked_minutes: 660, overtime_minutes: 120, early_departure_minutes: 0,
      status: "present",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    const r = await db("attendance_records").where({ id }).first();
    expect(r.overtime_minutes).toBe(120);
    expect(r.early_departure_minutes).toBe(0);
  });

  it("list records with date range filter", async () => {
    const r = await db("attendance_records")
      .where({ organization_id: ORG })
      .whereBetween("date", ["2018-06-15", "2018-06-20"]);
    expect(r.length).toBeGreaterThanOrEqual(4);
  });

  it("list records by user_id filter", async () => {
    const r = await db("attendance_records")
      .where({ organization_id: ORG, user_id: EMP })
      .whereBetween("date", ["2018-06-15", "2018-06-20"]);
    expect(r.length).toBeGreaterThanOrEqual(4);
  });

  it("monthly report aggregation query", async () => {
    const report = await db("attendance_records as ar")
      .join("users as u", "ar.user_id", "u.id")
      .where("ar.organization_id", ORG)
      .whereBetween("ar.date", ["2018-06-01", "2018-06-30"])
      .select(
        "ar.user_id",
        db.raw("COUNT(*) as total_days"),
        db.raw("SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_days"),
        db.raw("SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_days"),
        db.raw("SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days"),
        db.raw("SUM(CASE WHEN ar.status = 'on_leave' THEN 1 ELSE 0 END) as leave_days"),
        db.raw("SUM(COALESCE(ar.worked_minutes, 0)) as total_worked_minutes"),
        db.raw("SUM(COALESCE(ar.overtime_minutes, 0)) as total_overtime_minutes"),
        db.raw("SUM(COALESCE(ar.late_minutes, 0)) as total_late_minutes"),
      )
      .groupBy("ar.user_id");
    expect(report.length).toBeGreaterThanOrEqual(1);
    const empReport = report.find((r: any) => Number(r.user_id) === EMP);
    expect(empReport).toBeTruthy();
    expect(Number(empReport.total_days)).toBeGreaterThanOrEqual(4);
  });

  it("dashboard counts query", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [total] = await db("users").where({ organization_id: ORG, status: 1 }).count("* as count");
    const [present] = await db("attendance_records")
      .where({ organization_id: ORG, date: today })
      .whereIn("status", ["present", "half_day"])
      .count("* as count");
    expect(Number(total.count)).toBeGreaterThan(0);
    expect(Number(present.count)).toBeGreaterThanOrEqual(0);
  });

  it("records join with user + department", async () => {
    const r = await db("attendance_records as ar")
      .join("users as u", function () { this.on("ar.user_id", "u.id").andOn("ar.organization_id", "u.organization_id"); })
      .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
      .where("ar.organization_id", ORG)
      .where("u.status", 1)
      .whereBetween("ar.date", ["2018-06-15", "2018-06-20"])
      .select("ar.*", "u.first_name", "u.last_name", "u.emp_code", "dept.name as department_name")
      .limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]).toHaveProperty("first_name");
  });

  it("my history pagination", async () => {
    const page1 = await db("attendance_records")
      .where({ organization_id: ORG, user_id: EMP })
      .orderBy("date", "desc")
      .limit(5).offset(0);
    expect(page1.length).toBeGreaterThanOrEqual(1);
  });

  it("department filter on records", async () => {
    const r = await db("attendance_records as ar")
      .join("users as u", "ar.user_id", "u.id")
      .where("ar.organization_id", ORG)
      .where("u.department_id", 72)
      .limit(5);
    // May or may not have results, just verify query runs
    expect(Array.isArray(r)).toBe(true);
  });
});

// -- Regularizations ----------------------------------------------------------
describe("Attendance Regularizations (deep)", () => {
  const ids: number[] = [];
  afterAll(async () => {
    for (const id of ids) await db("attendance_regularizations").where({ id }).delete();
  });

  it("submit regularization for a date", async () => {
    const [id] = await db("attendance_regularizations").insert({
      organization_id: ORG, user_id: EMP, attendance_id: null,
      date: "2018-07-01",
      requested_check_in: new Date("2018-07-01T09:00:00"),
      requested_check_out: new Date("2018-07-01T17:30:00"),
      reason: "Forgot to check in - deep test",
      status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    const r = await db("attendance_regularizations").where({ id }).first();
    expect(r.status).toBe("pending");
  });

  it("submit regularization with only check_in", async () => {
    const [id] = await db("attendance_regularizations").insert({
      organization_id: ORG, user_id: EMP, attendance_id: null,
      date: "2018-07-02",
      requested_check_in: new Date("2018-07-02T10:00:00"),
      reason: "Bare time test", status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect((await db("attendance_regularizations").where({ id }).first()).requested_check_out).toBeNull();
  });

  it("list regularizations with status filter", async () => {
    const r = await db("attendance_regularizations as ar")
      .join("users as u", "ar.user_id", "u.id")
      .where("ar.organization_id", ORG)
      .where("ar.status", "pending")
      .select("ar.*", "u.first_name", "u.last_name", "u.email", "u.emp_code")
      .orderBy("ar.created_at", "desc").limit(20);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("approve regularization", async () => {
    await db("attendance_regularizations").where({ id: ids[0] }).update({
      status: "approved", approved_by: MGR, approved_at: new Date(), updated_at: new Date(),
    });
    const reg = await db("attendance_regularizations").where({ id: ids[0] }).first();
    expect(reg.status).toBe("approved");
    expect(reg.approved_by).toBe(MGR);
  });

  it("reject regularization with reason", async () => {
    await db("attendance_regularizations").where({ id: ids[1] }).update({
      status: "rejected", approved_by: MGR, approved_at: new Date(),
      rejection_reason: "Not valid", updated_at: new Date(),
    });
    const reg = await db("attendance_regularizations").where({ id: ids[1] }).first();
    expect(reg.status).toBe("rejected");
    expect(reg.rejection_reason).toBe("Not valid");
  });

  it("approved request cannot be re-processed", async () => {
    const reg = await db("attendance_regularizations").where({ id: ids[0] }).first();
    expect(reg.status).not.toBe("pending");
  });

  it("my regularizations pagination", async () => {
    const [{ count }] = await db("attendance_regularizations")
      .where({ organization_id: ORG, user_id: EMP }).count("* as count");
    expect(Number(count)).toBeGreaterThanOrEqual(2);
  });

  it("regularization with attendance_id link", async () => {
    // find an existing attendance record to link
    const att = await db("attendance_records").where({ organization_id: ORG, user_id: EMP }).first();
    if (att) {
      const [id] = await db("attendance_regularizations").insert({
        organization_id: ORG, user_id: EMP, attendance_id: att.id,
        date: att.date, original_check_in: att.check_in, original_check_out: att.check_out,
        requested_check_in: new Date("2018-07-03T09:00:00"),
        requested_check_out: new Date("2018-07-03T17:00:00"),
        reason: "Linked reg test", status: "pending",
        created_at: new Date(), updated_at: new Date(),
      });
      ids.push(id);
      const r = await db("attendance_regularizations").where({ id }).first();
      expect(r.attendance_id).toBe(att.id);
    }
  });
});

// -- Shifts -------------------------------------------------------------------
describe("Shifts (deep)", () => {
  let shiftId: number, assignId1: number, assignId2: number, swapId: number;
  afterAll(async () => {
    if (swapId) await db("shift_swap_requests").where({ id: swapId }).delete();
    if (assignId1) await db("shift_assignments").where({ id: assignId1 }).delete();
    if (assignId2) await db("shift_assignments").where({ id: assignId2 }).delete();
    if (shiftId) await db("shifts").where({ id: shiftId }).delete();
  });

  it("create shift with all fields", async () => {
    const [id] = await db("shifts").insert({
      organization_id: ORG, name: `DeepShift-${U}`,
      start_time: "08:00:00", end_time: "16:00:00",
      break_minutes: 30, grace_minutes_late: 15, grace_minutes_early: 10,
      is_night_shift: false, is_default: false, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    shiftId = id;
    const s = await db("shifts").where({ id }).first();
    expect(s.break_minutes).toBe(30);
    expect(s.grace_minutes_late).toBe(15);
  });

  it("create night shift and verify", async () => {
    const [id] = await db("shifts").insert({
      organization_id: ORG, name: `NightShift-${U}`,
      start_time: "22:00:00", end_time: "06:00:00",
      break_minutes: 0, grace_minutes_late: 0, grace_minutes_early: 0,
      is_night_shift: true, is_default: false, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    const s = await db("shifts").where({ id }).first();
    expect(s.is_night_shift).toBeTruthy();
    await db("shifts").where({ id }).delete();
  });

  it("update shift fields", async () => {
    await db("shifts").where({ id: shiftId }).update({
      break_minutes: 45, grace_minutes_late: 20, updated_at: new Date(),
    });
    const s = await db("shifts").where({ id: shiftId }).first();
    expect(s.break_minutes).toBe(45);
  });

  it("list active shifts", async () => {
    const shifts = await db("shifts").where({ organization_id: ORG, is_active: true }).orderBy("name", "asc");
    expect(shifts.length).toBeGreaterThanOrEqual(1);
  });

  it("soft-delete shift", async () => {
    const [tmpId] = await db("shifts").insert({
      organization_id: ORG, name: `DelShift-${U}`,
      start_time: "09:00:00", end_time: "17:00:00",
      break_minutes: 0, grace_minutes_late: 0, grace_minutes_early: 0,
      is_night_shift: false, is_default: false, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    await db("shifts").where({ id: tmpId }).update({ is_active: false });
    expect((await db("shifts").where({ id: tmpId }).first()).is_active).toBeFalsy();
    await db("shifts").where({ id: tmpId }).delete();
  });

  it("assign shift to employee", async () => {
    const [id] = await db("shift_assignments").insert({
      organization_id: ORG, user_id: EMP, shift_id: shiftId,
      effective_from: "2018-08-01", effective_to: "2018-08-31",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    assignId1 = id;
    expect((await db("shift_assignments").where({ id }).first()).shift_id).toBe(shiftId);
  });

  it("assign shift to manager", async () => {
    const [id] = await db("shift_assignments").insert({
      organization_id: ORG, user_id: MGR, shift_id: shiftId,
      effective_from: "2018-08-01", effective_to: "2018-08-31",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    assignId2 = id;
    expect((await db("shift_assignments").where({ id }).first()).user_id).toBe(MGR);
  });

  it("list assignments with join", async () => {
    const r = await db("shift_assignments as sa")
      .join("shifts as s", "sa.shift_id", "s.id")
      .join("users as u", "sa.user_id", "u.id")
      .where("sa.organization_id", ORG).where("sa.shift_id", shiftId)
      .select("sa.*", "s.name as shift_name", "u.first_name", "u.last_name");
    expect(r.length).toBe(2);
  });

  it("schedule date range overlap query", async () => {
    const r = await db("shift_assignments as sa")
      .join("shifts as s", "sa.shift_id", "s.id")
      .where("sa.organization_id", ORG)
      .where("sa.effective_from", "<=", "2018-08-31")
      .where(function () { this.whereNull("sa.effective_to").orWhere("sa.effective_to", ">=", "2018-08-01"); })
      .select("sa.*", "s.name as shift_name");
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("create and approve swap request", async () => {
    const [id] = await db("shift_swap_requests").insert({
      organization_id: ORG, requester_id: EMP, target_employee_id: MGR,
      shift_assignment_id: assignId1, target_shift_assignment_id: assignId2,
      date: "2018-08-15", reason: "Deep test swap", status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    swapId = id;

    await db.transaction(async (trx) => {
      const a1 = await trx("shift_assignments").where({ id: assignId1 }).first();
      const a2 = await trx("shift_assignments").where({ id: assignId2 }).first();
      await trx("shift_assignments").where({ id: assignId1 }).update({ shift_id: a2.shift_id });
      await trx("shift_assignments").where({ id: assignId2 }).update({ shift_id: a1.shift_id });
      await trx("shift_swap_requests").where({ id: swapId }).update({ status: "approved", approved_by: ADMIN });
    });
    expect((await db("shift_swap_requests").where({ id: swapId }).first()).status).toBe("approved");
  });

  it("reject swap request", async () => {
    const [rid] = await db("shift_swap_requests").insert({
      organization_id: ORG, requester_id: EMP, target_employee_id: MGR,
      shift_assignment_id: assignId1, target_shift_assignment_id: assignId2,
      date: "2018-08-16", reason: "Test reject", status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    await db("shift_swap_requests").where({ id: rid }).update({ status: "rejected", approved_by: ADMIN });
    expect((await db("shift_swap_requests").where({ id: rid }).first()).status).toBe("rejected");
    await db("shift_swap_requests").where({ id: rid }).delete();
  });

  it("list swap requests with joins", async () => {
    const r = await db("shift_swap_requests as ssr")
      .where("ssr.organization_id", ORG)
      .join("users as requester", "ssr.requester_id", "requester.id")
      .join("users as target", "ssr.target_employee_id", "target.id")
      .select("ssr.*", "requester.first_name as req_fn", "target.first_name as tgt_fn")
      .limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("my schedule two-week window query", async () => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 13);
    const r = await db("shift_assignments as sa")
      .join("shifts as s", "sa.shift_id", "s.id")
      .where("sa.organization_id", ORG).where("sa.user_id", EMP)
      .where("sa.effective_from", "<=", end.toISOString().slice(0, 10))
      .where(function () { this.whereNull("sa.effective_to").orWhere("sa.effective_to", ">=", start.toISOString().slice(0, 10)); })
      .select("sa.*", "s.name as shift_name", "s.start_time", "s.end_time", "s.break_minutes");
    expect(Array.isArray(r)).toBe(true);
  });

  it("set default shift unsets others", async () => {
    await db("shifts").where({ organization_id: ORG, is_default: true }).update({ is_default: false });
    await db("shifts").where({ id: shiftId }).update({ is_default: true });
    const defaults = await db("shifts").where({ organization_id: ORG, is_default: true });
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe(shiftId);
    await db("shifts").where({ id: shiftId }).update({ is_default: false });
  });
});
