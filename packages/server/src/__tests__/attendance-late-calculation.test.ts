import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDB, getDB, initDB } from "../db/connection.js";
import { computeLateMinutes, recalculateAttendanceForAssignmentWindow } from "../services/attendance/attendance.service.js";

describe("attendance late calculation", () => {
  it("recalculates a 10:01 IST punch as on time for a 10:00 shift with grace", () => {
    const punch = new Date("2026-08-12T04:31:57.000Z");

    expect(computeLateMinutes(punch, 10 * 60, 15, false, "Asia/Kolkata")).toBe(0);
  });

  it("shows why the stale 09:00 shift produced Mohit's 61 late minutes", () => {
    const punch = new Date("2026-08-12T04:31:57.000Z");

    expect(computeLateMinutes(punch, 9 * 60, 15, false, "Asia/Kolkata")).toBe(61);
  });
});

describe("retroactive shift assignment recalculation", () => {
  const created: Record<string, number[]> = { shifts: [], assignments: [], attendance_records: [] };
  let userId = 0;

  beforeAll(async () => {
    await initDB();
    const db = getDB();
    userId = Number((await db("users").where({ organization_id: 5 }).first("id"))?.id);
  });

  afterAll(async () => {
    const db = getDB();
    if (created.attendance_records.length) await db("attendance_records").whereIn("id", created.attendance_records).del();
    if (created.assignments.length) await db("shift_assignments").whereIn("id", created.assignments).del();
    if (created.shifts.length) await db("shifts").whereIn("id", created.shifts).del();
    await closeDB();
  });

  it("updates a persisted stale shift and late value", async () => {
    const db = getDB();
    const date = "2037-08-12";
    const [shiftId] = await db("shifts").insert({ organization_id: 5, name: `Late recalculation ${Date.now()}`, start_time: "10:00:00", end_time: "19:00:00", grace_minutes_late: 15, grace_minutes_early: 0, break_minutes: 0, is_night_shift: false, is_default: false, is_active: true, created_at: new Date(), updated_at: new Date() });
    created.shifts.push(shiftId);
    const [assignmentId] = await db("shift_assignments").insert({ organization_id: 5, user_id: userId, shift_id: shiftId, effective_from: date, effective_to: date, created_by: userId, created_at: new Date(), updated_at: new Date() });
    created.assignments.push(assignmentId);
    const [recordId] = await db("attendance_records").insert({ organization_id: 5, user_id: userId, date, shift_id: null, check_in: new Date("2037-08-12T04:31:57.000Z"), check_in_source: "biometric", status: "present", late_minutes: 61, worked_minutes: 0, created_at: new Date(), updated_at: new Date() });
    created.attendance_records.push(recordId);

    await recalculateAttendanceForAssignmentWindow(5, [userId], date, date);

    const record = await db("attendance_records").where({ id: recordId, organization_id: 5 }).first();
    expect(record.shift_id).toBe(shiftId);
    expect(record.late_minutes).toBe(0);
  });
});
