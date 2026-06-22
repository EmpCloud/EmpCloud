// =============================================================================
// EMP CLOUD — Field Tracking Legacy Routes
//
// Drop-in compatibility layer for the EMP Field app. Paths, request bodies and
// response shapes mirror emp-monitor's field-tracking endpoints so the existing
// field client keeps working without an update. Mounted at /api/v3 so the
// public paths are exactly:
//
//   POST /api/v3/user/fieldAllEmployeeList
//   POST /api/v3/hrms/getAttendanceField
//   POST /api/v3/hrms/attendance-fieldtracking
//   POST /api/v3/hrms/markAttendanceField
//   POST /api/v3/hrms/fetch-attendance-field
//   POST /api/v3/hrms/attendance-field-request
//   POST /api/v3/hrms/fetch-holidays
//   POST /api/v3/hrms/fetch-leaves
//   POST /api/v3/hrms/field-leave-type
//   POST /api/v3/hrms/create-field-leaves
//   POST /api/v3/hrms/update-field-leaves
//   POST /api/v3/hrms/delete-field-leaves
//
// Every route is gated by the shared FIELD_TRACKING_SECRET_KEY (fieldAuthenticate)
// and answers with emp-monitor's { code, message, error, data } envelope —
// always HTTP 200, real status carried in `code`. See field-legacy.service.ts
// for the mapping onto EmpCloud's native HRMS tables.
// =============================================================================

import { Router, Response } from "express";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { sendLegacyResponse } from "../../utils/legacy-response.js";
import { fieldAuthenticate } from "../../services/field-legacy/field-auth.middleware.js";
import * as svc from "../../services/field-legacy/field-legacy.service.js";

const router = Router();

// emp-monitor always responded HTTP 200 with the logical status in body `code`.
function resp(res: Response, code: number, data: unknown, message: string | null, error: unknown = null) {
  return sendLegacyResponse(res, code, data, message, error);
}

// Translate a thrown error into the legacy envelope. Operational AppErrors
// (validation, not-found, forbidden, channel-not-allowed) surface their own
// status + message; anything else is logged and returned as a generic 400 so
// the client still gets a well-formed 200/{code} response instead of an HTML
// 500 from the global handler.
function fail(res: Response, err: unknown) {
  if (err instanceof AppError) {
    return resp(res, err.statusCode, null, err.message, err.code);
  }
  logger.error("Field-legacy handler error", { error: (err as Error)?.message });
  return resp(res, 400, null, "Something went wrong");
}

// The shared-secret gate is attached PER ROUTE (not via router.use) on
// purpose: this router is mounted at the bare /api/v3 prefix, so a blanket
// router.use(fieldAuthenticate) would also run on — and reject —
// /api/v3/nas/* and any other /api/v3 path that falls through to here. With
// per-route auth, non-field paths simply don't match and pass to the next
// mounted router untouched.

// ---------------------------------------------------------------------------
// /user/fieldAllEmployeeList
// ---------------------------------------------------------------------------
router.post("/user/fieldAllEmployeeList", fieldAuthenticate, async (req, res) => {
  try {
    const users = await svc.listFieldEmployees(req.body || {});
    if (!users.length) return resp(res, 400, null, "Employees not found.");
    return resp(res, 200, users, "User data.");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /user/info — resolve a user by email.
// OPEN (no shared-secret gate) by request, and returns a PLAIN
// { data: [{ id, email }] } shape (not the legacy code/message envelope) to
// match the consumer's expected response. Empty array when no user matches.
// ---------------------------------------------------------------------------
router.post("/user/info", async (req, res) => {
  try {
    const data = await svc.lookupUserByEmail(req.body || {});
    return res.json({ data });
  } catch (err) {
    logger.error("Field-legacy /user/info error", { error: (err as Error)?.message });
    return res.json({ data: [] });
  }
});

// ---------------------------------------------------------------------------
// /hrms/getAttendanceField + /hrms/attendance-fieldtracking
// ---------------------------------------------------------------------------
async function attendanceSheetHandler(req: any, res: Response) {
  try {
    // emp-monitor returned the employees array directly as `data` (each
    // employee carries its own attendance[] + total_count).
    const sheet = await svc.getAttendanceSheet(req.body || {});
    if (!sheet.length) return resp(res, 400, null, "No Employee found.");
    return resp(res, 200, sheet, "Employees attendance fetched successfully.");
  } catch (err) {
    return fail(res, err);
  }
}
router.post("/hrms/getAttendanceField", fieldAuthenticate, attendanceSheetHandler);
router.post("/hrms/attendance-fieldtracking", fieldAuthenticate, attendanceSheetHandler);

// ---------------------------------------------------------------------------
// /hrms/markAttendanceField
// ---------------------------------------------------------------------------
router.post("/hrms/markAttendanceField", fieldAuthenticate, async (req, res) => {
  try {
    const result = await svc.markAttendance(req.body || {});
    const message = result.status === "checked_out" ? "Successfully Checked Out" : "Successfully Checked In";
    return resp(res, 200, { time: result.time }, message);
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/fetch-attendance-field
// ---------------------------------------------------------------------------
router.post("/hrms/fetch-attendance-field", fieldAuthenticate, async (req, res) => {
  try {
    const data = await svc.fetchTodayAttendance(req.body || {});
    return resp(res, 200, data, "Successfully Fetched");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/attendance-field-request
// ---------------------------------------------------------------------------
router.post("/hrms/attendance-field-request", fieldAuthenticate, async (req, res) => {
  try {
    await svc.submitAttendanceRequest(req.body || {});
    return resp(res, 200, null, "Request created Successfully.");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/fetch-holidays
// ---------------------------------------------------------------------------
router.post("/hrms/fetch-holidays", fieldAuthenticate, async (req, res) => {
  try {
    const holidays = await svc.getHolidays(req.body || {});
    if (!holidays.length) return resp(res, 400, null, "No holidays found");
    return resp(res, 200, holidays, "Holidays Fetched Successfully");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/fetch-leaves
// ---------------------------------------------------------------------------
router.post("/hrms/fetch-leaves", fieldAuthenticate, async (req, res) => {
  try {
    const leaves = await svc.fetchFieldLeaves(req.body || {});
    if (!leaves.length) return resp(res, 400, null, "No Leaves found");
    return resp(res, 200, leaves, "leaves fetched successfully");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/field-leave-type
// ---------------------------------------------------------------------------
router.post("/hrms/field-leave-type", fieldAuthenticate, async (req, res) => {
  try {
    const types = await svc.getFieldLeaveTypes(req.body || {});
    if (!types.length) return resp(res, 400, null, "Unable to fetch Leave types.");
    return resp(res, 200, types, "Leave types fetched successfully.");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/create-field-leaves
// ---------------------------------------------------------------------------
router.post("/hrms/create-field-leaves", fieldAuthenticate, async (req, res) => {
  try {
    const data = await svc.createFieldLeave(req.body || {});
    return resp(res, 200, data, "Leave created successfully.");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/update-field-leaves
// ---------------------------------------------------------------------------
router.post("/hrms/update-field-leaves", fieldAuthenticate, async (req, res) => {
  try {
    const data = await svc.updateFieldLeave(req.body || {});
    return resp(res, 200, data, "Leave updated successfully.");
  } catch (err) {
    return fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// /hrms/delete-field-leaves
// ---------------------------------------------------------------------------
router.post("/hrms/delete-field-leaves", fieldAuthenticate, async (req, res) => {
  try {
    await svc.deleteFieldLeave(req.body || {});
    return resp(res, 200, [], "Leave deleted successfully.");
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
