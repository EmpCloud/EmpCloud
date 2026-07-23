// =============================================================================
// EMP CLOUD — Daily attendance report scheduler
//
// Runs every day at 00:00 server time and delivers the previous day's
// attendance report (the day that just ended) over Telegram to every org that
// enabled it in Attendance Settings.
//
// Mirrors the trial-expiration interval contract: single instance, no overlap,
// errors logged but never rethrown.
// =============================================================================

import cron from "node-cron";
import { logger } from "../../utils/logger.js";
import { sendDailyAttendanceReports } from "./attendance-report.service.js";

// Inferred from cron.schedule so we don't depend on the package's exported
// type names (they differ between node-cron majors).
let task: ReturnType<typeof cron.schedule> | null = null;
let running = false;

// Midnight, every day.
const SCHEDULE = "0 0 * * *";

async function runOnce(): Promise<void> {
  // Guard against a long run overlapping the next tick.
  if (running) {
    logger.warn("Daily attendance report already running — skipping this tick");
    return;
  }
  running = true;
  try {
    await sendDailyAttendanceReports();
  } catch (err: any) {
    logger.error("Daily attendance report sweep failed", { error: err?.message });
  } finally {
    running = false;
  }
}

export function startAttendanceReportCron(): void {
  if (task) return;
  if (!cron.validate(SCHEDULE)) {
    logger.error("Invalid attendance report cron expression", { schedule: SCHEDULE });
    return;
  }
  task = cron.schedule(SCHEDULE, () => {
    void runOnce();
  });
  logger.info("Daily attendance report cron started (00:00 daily)");
}

export function stopAttendanceReportCron(): void {
  if (task) {
    void task.stop();
    task = null;
  }
}

/** Manual trigger (admin "send now" / testing). Optional explicit date. */
export async function triggerAttendanceReportNow(dateIso?: string): Promise<void> {
  await sendDailyAttendanceReports(dateIso);
}
