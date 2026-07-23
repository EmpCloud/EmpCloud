// =============================================================================
// EMP CLOUD — Daily Attendance Report (Telegram delivery)
//
// Builds an official, monospace-formatted attendance report for a single day
// and delivers it to every Telegram chat an org has configured.
//
// Source of truth: every ACTIVE employee is enumerated and LEFT JOINed to that
// day's attendance_records row. An employee with no row is reported ABSENT —
// so the headcount always reconciles (present + leave + absent = total).
// check_in is the first punch of the day, check_out the latest (migration 057).
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import { ValidationError } from "../../utils/errors.js";
import { listTelegramEnabledOrgs, getSettings } from "./attendance-settings.service.js";
import { sendTelegramMessage, isTelegramConfigured } from "../telegram/telegram.service.js";

interface ReportRow {
  id: number;
  first_name: string;
  last_name: string | null;
  emp_code: string | null;
  department: string | null;
  attendance_status: string | null;
  /**
   * Raw punch timestamps. The DB stores these in UTC and every EmpCloud
   * surface renders them in the viewer's local zone, so the report must
   * convert too — printing the raw stored value would under-report every
   * punch by the UTC offset (e.g. 04:42 UTC shown instead of 10:12 IST).
   */
  check_in_time: Date | string | null;
  check_out_time: Date | string | null;
  late_minutes: number | null;
}

/** YYYY-MM-DD for the day that just ended (the midnight run reports it). */
export function previousDateIso(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Punch times are stored UTC and displayed in local time everywhere else in
 * EmpCloud (the grid does `new Date(check_in).toLocaleTimeString()`), so the
 * report converts the same way. Formatting the raw stored value instead would
 * print 04:42 where the dashboard — and the employee — sees 10:12.
 */
function fmtTime(v: Date | string | null): string {
  const d = toDate(v);
  if (!d) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Local-date key, for spotting a check-out that rolled past midnight. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Marks a check-out that crossed midnight, e.g. "05:18+1d". */
function fmtCheckOut(row: ReportRow): string {
  const out = toDate(row.check_out_time);
  if (!out) return "--:--";
  const time = fmtTime(out);
  const inn = toDate(row.check_in_time);
  if (!inn) return time;
  const days = Math.round(
    (Date.parse(`${localDayKey(out)}T00:00:00Z`) - Date.parse(`${localDayKey(inn)}T00:00:00Z`)) /
      86400000,
  );
  return days > 0 ? `${time}+${days}d` : time;
}

function fmtDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function pad(s: string | null | undefined, width: number): string {
  const v = (s ?? "").toString();
  return (v.length > width ? `${v.slice(0, width - 1)}…` : v).padEnd(width);
}

function fullName(r: ReportRow): string {
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
}

/** Fetch every active employee + their record for the date. */
async function fetchDayRows(orgId: number, dateIso: string): Promise<ReportRow[]> {
  const db = getDB();
  return db("users as u")
    .leftJoin("organization_departments as d", "u.department_id", "d.id")
    .leftJoin("attendance_records as ar", function () {
      this.on("ar.user_id", "=", "u.id").andOnVal("ar.date", "=", dateIso);
    })
    .where("u.organization_id", orgId)
    .where("u.status", 1)
    .whereNot("u.role", "super_admin")
    .select(
      "u.id",
      "u.first_name",
      "u.last_name",
      "u.emp_code",
      "d.name as department",
      "ar.status as attendance_status",
      // Raw timestamps — converted to local time at format time so the report
      // matches what the dashboard shows (see fmtTime).
      "ar.check_in as check_in_time",
      "ar.check_out as check_out_time",
      "ar.late_minutes",
    )
    .orderBy([{ column: "d.name" }, { column: "u.first_name" }, { column: "u.last_name" }]);
}

const PRESENT_STATUSES = new Set(["present", "checked_in", "half_day", "half_present_half_leave"]);
const NON_WORKING_STATUSES = new Set(["weekoff", "holiday"]);

function statusLabel(status: string | null): string {
  switch (status) {
    case "present":
      return "Present";
    case "checked_in":
      return "In";
    case "half_day":
      return "Half Day";
    case "half_present_half_leave":
      return "Half/Leave";
    case "on_leave":
      return "Leave";
    case "weekoff":
      return "Week Off";
    case "holiday":
      return "Holiday";
    default:
      return "Absent";
  }
}

export interface DailyReport {
  date: string;
  orgName: string;
  total: number;
  presentCount: number;
  leaveCount: number;
  absentCount: number;
  lateCount: number;
  text: string;
}

/**
 * Build the formatted report for one org + date. Returns null when the org has
 * no active employees (nothing worth sending).
 */
export async function buildDailyAttendanceReport(
  orgId: number,
  dateIso: string,
): Promise<DailyReport | null> {
  const db = getDB();
  const org = await db("organizations").where({ id: orgId }).select("name").first();
  const rows = await fetchDayRows(orgId, dateIso);
  if (rows.length === 0) return null;

  const present: ReportRow[] = [];
  const onLeave: ReportRow[] = [];
  const absent: ReportRow[] = [];
  const nonWorking: ReportRow[] = [];

  for (const r of rows) {
    const s = r.attendance_status;
    if (s && PRESENT_STATUSES.has(s)) present.push(r);
    else if (s === "on_leave") onLeave.push(r);
    else if (s && NON_WORKING_STATUSES.has(s)) nonWorking.push(r);
    else absent.push(r);
  }
  const lateCount = present.filter((r) => Number(r.late_minutes) > 0).length;

  const L: string[] = [];
  const rule = "=".repeat(64);
  const thin = "-".repeat(64);

  L.push("EMP CLOUD — DAILY ATTENDANCE REPORT");
  L.push(rule);
  L.push(`Organization : ${org?.name ?? `Org #${orgId}`}`);
  L.push(`Date         : ${fmtDateLong(dateIso)}`);
  const now = new Date();
  const genTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const genDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  L.push(`Generated    : ${fmtDateLong(genDate)} ${genTime}`);
  L.push(rule);
  L.push("SUMMARY");
  L.push(`  Total Employees : ${rows.length}`);
  L.push(`  Present         : ${present.length}`);
  L.push(`  On Leave        : ${onLeave.length}`);
  L.push(`  Absent          : ${absent.length}`);
  if (nonWorking.length) L.push(`  Week Off/Holiday: ${nonWorking.length}`);
  L.push(`  Late Arrivals   : ${lateCount}`);
  L.push(rule);

  // ---- Present / worked ----
  L.push(`PRESENT (${present.length})`);
  L.push(thin);
  if (present.length === 0) {
    L.push("  None");
  } else {
    // Columns are space-separated so a truncated value can never run into the
    // next one (emp codes here look like "EMP/BHI/2025/23" — 15 chars — and a
    // report that prints "EMP/BHI/…" is useless for payroll reconciliation).
    L.push(
      `${pad("#", 3)} ${pad("EMPLOYEE", 18)} ${pad("CODE", 16)} ${pad("DEPT", 12)} ${pad("IN", 5)} ${pad("OUT", 8)} STATUS`,
    );
    present.forEach((r, i) => {
      const late = Number(r.late_minutes) > 0 ? ` (+${r.late_minutes}m)` : "";
      L.push(
        `${pad(String(i + 1), 3)} ${pad(fullName(r), 18)} ${pad(r.emp_code, 16)} ${pad(r.department, 12)} ` +
          `${pad(fmtTime(r.check_in_time), 5)} ${pad(fmtCheckOut(r), 8)} ${statusLabel(r.attendance_status)}${late}`,
      );
    });
    // Flag anyone who never checked out — common payroll follow-up.
    const missingOut = present.filter((r) => !r.check_out_time);
    if (missingOut.length) {
      L.push("");
      L.push(`  ⚠ Missing check-out: ${missingOut.length}`);
      missingOut.forEach((r) => L.push(`     - ${fullName(r)} (${r.emp_code ?? "—"})`));
    }
  }
  L.push(rule);

  // ---- On leave ----
  L.push(`ON LEAVE (${onLeave.length})`);
  L.push(thin);
  if (onLeave.length === 0) L.push("  None");
  else
    onLeave.forEach((r, i) =>
      L.push(`${pad(String(i + 1), 3)} ${pad(fullName(r), 24)} ${pad(r.emp_code, 16)} ${r.department ?? "—"}`),
    );
  L.push(rule);

  // ---- Absent ----
  L.push(`ABSENT (${absent.length})`);
  L.push(thin);
  if (absent.length === 0) L.push("  None — full attendance ✅");
  else
    absent.forEach((r, i) =>
      L.push(`${pad(String(i + 1), 3)} ${pad(fullName(r), 24)} ${pad(r.emp_code, 16)} ${r.department ?? "—"}`),
    );

  if (nonWorking.length) {
    L.push(rule);
    L.push(`WEEK OFF / HOLIDAY (${nonWorking.length})`);
    L.push(thin);
    nonWorking.forEach((r, i) =>
      L.push(`${pad(String(i + 1), 3)} ${pad(fullName(r), 24)} ${pad(r.emp_code, 16)} ${statusLabel(r.attendance_status)}`),
    );
  }

  L.push(rule);
  L.push("This is a system-generated report from EMP Cloud.");

  return {
    date: dateIso,
    orgName: org?.name ?? `Org #${orgId}`,
    total: rows.length,
    presentCount: present.length,
    leaveCount: onLeave.length,
    absentCount: absent.length,
    lateCount,
    text: L.join("\n"),
  };
}

export interface SendResult {
  date: string;
  chats: number;
  sent: number;
  total: number;
  present: number;
  absent: number;
}

/**
 * Send the report for ONE org on demand — powers the "Send test report" button
 * in Attendance Settings. Defaults to the last completed day, exactly what the
 * midnight cron would deliver, so admins can preview the real thing.
 *
 * Unlike the cron path this THROWS on misconfiguration, so the UI can show a
 * precise reason (no token / not enabled / no chat IDs / no employees).
 */
export async function sendTestReportForOrg(orgId: number, dateIso?: string): Promise<SendResult> {
  if (!isTelegramConfigured()) {
    throw new ValidationError(
      "Telegram is not configured on the server. Ask your administrator to set TELEGRAM_BOT_TOKEN.",
    );
  }
  const settings = await getSettings(orgId);
  if (settings.telegram_chat_ids.length === 0) {
    throw new ValidationError("Add at least one recipient chat ID before sending a test report.");
  }

  const date = dateIso ?? previousDateIso();
  const report = await buildDailyAttendanceReport(orgId, date);
  if (!report) {
    throw new ValidationError("No active employees found — there is nothing to report.");
  }

  let sent = 0;
  for (const chatId of settings.telegram_chat_ids) {
    if (await sendTelegramMessage(chatId, report.text)) sent++;
  }
  if (sent === 0) {
    throw new ValidationError(
      "Could not deliver to any configured chat. Check the chat IDs, and make sure the bot has been started (/start) or added to the group.",
    );
  }

  logger.info("Test attendance report sent", { orgId, date, chats: settings.telegram_chat_ids.length, sent });
  return {
    date,
    chats: settings.telegram_chat_ids.length,
    sent,
    total: report.total,
    present: report.presentCount,
    absent: report.absentCount,
  };
}

/**
 * Build + deliver the report for every opted-in org. Called by the midnight
 * cron; also callable manually (e.g. an admin "send test report" action).
 * Never throws — a failure for one org must not stop the others.
 */
export async function sendDailyAttendanceReports(dateIso?: string): Promise<void> {
  if (!isTelegramConfigured()) {
    logger.info("Daily attendance report skipped (TELEGRAM_BOT_TOKEN not set)");
    return;
  }
  const date = dateIso ?? previousDateIso();
  let orgs: Array<{ organization_id: number; chat_ids: string[] }> = [];
  try {
    orgs = await listTelegramEnabledOrgs();
  } catch (err: any) {
    logger.error("Daily attendance report: failed to load enabled orgs", { error: err?.message });
    return;
  }
  if (orgs.length === 0) {
    logger.info("Daily attendance report: no orgs have Telegram reporting enabled");
    return;
  }

  for (const { organization_id: orgId, chat_ids } of orgs) {
    try {
      const report = await buildDailyAttendanceReport(orgId, date);
      if (!report) {
        logger.info("Daily attendance report: no active employees", { orgId, date });
        continue;
      }
      let sent = 0;
      for (const chatId of chat_ids) {
        if (await sendTelegramMessage(chatId, report.text)) sent++;
      }
      logger.info("Daily attendance report delivered", {
        orgId,
        date,
        chats: chat_ids.length,
        sent,
        total: report.total,
        present: report.presentCount,
        absent: report.absentCount,
      });
    } catch (err: any) {
      logger.error("Daily attendance report failed for org", { orgId, date, error: err?.message });
    }
  }
}
