// =============================================================================
// EMP CLOUD — Log Analysis Service
// Reads audit_logs from DB and log files from disk for the Super Admin
// log dashboard.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import fs from "fs";
import path from "path";
import os from "os";

const PM2_LOG_DIR =
  process.env.PM2_LOG_DIR || path.join(os.homedir(), ".pm2", "logs");

const MODULES = [
  "empcloud-server",
  "emp-recruit",
  "emp-performance",
  "emp-rewards",
  "emp-exit",
  "emp-billing",
  "emp-lms",
  "emp-payroll",
  "emp-monitor",
  "emp-field",
  "emp-project-api",
  "emp-project-task-api",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseJSON(line: string) {
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

function readRecentLogLines(
  filename: string,
  maxLines = 500
): Array<Record<string, any>> {
  const filePath = path.join(PM2_LOG_DIR, filename);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    // Take last N lines for efficiency
    const recent = lines.slice(-maxLines);
    return recent
      .map((line) => tryParseJSON(line) || { raw: line })
      .filter(Boolean);
  } catch (err: any) {
    logger.warn("Failed to read log file", { filename, error: err.message });
    return [];
  }
}

function last24hFilter(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Summary: last 24h overview
// ---------------------------------------------------------------------------

export async function getLogSummary() {
  const db = getDB();
  const since = last24hFilter();

  // Count audit log events from DB
  const [totalEvents] = await db("audit_logs")
    .where("created_at", ">=", since)
    .count("* as count");

  const errorsByAction = await db("audit_logs")
    .where("created_at", ">=", since)
    .whereIn("action", [
      "login_failed",
      "token_revoked",
      "password_reset_failed",
    ])
    .select("action")
    .count("* as count")
    .groupBy("action");

  // Read error log files for each module
  let totalFileErrors = 0;
  const moduleErrors: Record<string, number> = {};

  for (const mod of MODULES) {
    const entries = readRecentLogLines(`${mod}-error.log`, 200);
    const recentErrors = entries.filter((e) => {
      if (!e.timestamp) return true; // can't filter, include anyway
      return new Date(e.timestamp).getTime() >= since.getTime();
    });
    moduleErrors[mod] = recentErrors.length;
    totalFileErrors += recentErrors.length;
  }

  // Count frontend (client-side) errors from server out log
  const frontendEntries = readRecentLogLines("empcloud-server-out.log", 1000);
  const frontendErrors = frontendEntries.filter((e) => {
    if (!e.message?.startsWith("CLIENT_ERROR")) return false;
    if (!e.timestamp) return true;
    return new Date(e.timestamp).getTime() >= since.getTime();
  });
  moduleErrors["frontend"] = frontendErrors.length;
  totalFileErrors += frontendErrors.length;

  return {
    period: "last_24h",
    since: since.toISOString(),
    audit_events: Number((totalEvents as any).count || 0),
    file_errors: totalFileErrors,
    errors_by_action: errorsByAction.map((r: any) => ({
      action: r.action,
      count: Number(r.count),
    })),
    module_error_counts: moduleErrors,
  };
}

// ---------------------------------------------------------------------------
// Recent errors (paginated)
// ---------------------------------------------------------------------------

export async function getRecentErrors(page = 1, perPage = 20) {
  const allErrors: Array<{
    module: string;
    level: string;
    message: string;
    timestamp: string;
    stack?: string;
    sql?: string;
    source?: string;
    url?: string;
    component?: string;
  }> = [];

  for (const mod of MODULES) {
    const entries = readRecentLogLines(`${mod}-error.log`, 300);
    for (const entry of entries) {
      allErrors.push({
        module: mod,
        level: entry.level || "error",
        message: entry.message || entry.raw || "",
        timestamp: entry.timestamp || "",
        stack: entry.stack,
        sql: entry.sql,
        source: "backend",
      });
    }
  }

  // Include frontend (client-side) errors from empcloud-server-out.log
  const outEntries = readRecentLogLines("empcloud-server-out.log", 1000);
  for (const entry of outEntries) {
    if (entry.message?.startsWith("CLIENT_ERROR") && entry.source === "frontend") {
      allErrors.push({
        module: "frontend",
        level: entry.errorLevel || entry.level || "error",
        message: entry.errorMessage || entry.message || "Unknown frontend error",
        timestamp: entry.timestamp || "",
        stack: entry.stack,
        source: "frontend",
        url: entry.url,
        component: entry.component,
      });
    }
  }

  // Sort by timestamp descending
  allErrors.sort(
    (a, b) =>
      new Date(b.timestamp || 0).getTime() -
      new Date(a.timestamp || 0).getTime()
  );

  const total = allErrors.length;
  const start = (page - 1) * perPage;
  const data = allErrors.slice(start, start + perPage);

  return { data, total, page, per_page: perPage };
}

// ---------------------------------------------------------------------------
// Slow queries
// ---------------------------------------------------------------------------

export async function getSlowQueries(page = 1, perPage = 20) {
  const slowEntries: Array<{
    module: string;
    sql: string;
    duration_ms: number;
    timestamp: string;
    bindings?: any[];
  }> = [];

  for (const mod of MODULES) {
    const entries = readRecentLogLines(`${mod}-out.log`, 1000);
    for (const entry of entries) {
      if (
        entry.message === "Slow query" ||
        (entry.duration_ms && entry.duration_ms > 1000)
      ) {
        slowEntries.push({
          module: mod,
          sql: (entry.sql || "").substring(0, 300),
          duration_ms: entry.duration_ms || 0,
          timestamp: entry.timestamp || "",
          bindings: entry.bindings,
        });
      }
    }
  }

  slowEntries.sort((a, b) => b.duration_ms - a.duration_ms);

  const total = slowEntries.length;
  const start = (page - 1) * perPage;
  const data = slowEntries.slice(start, start + perPage);

  return { data, total, page, per_page: perPage };
}

// ---------------------------------------------------------------------------
// Auth events (from audit_logs table)
// ---------------------------------------------------------------------------

export async function getAuthEvents(page = 1, perPage = 30) {
  const db = getDB();
  const since = last24hFilter();

  const authActions = [
    "login",
    "login_failed",
    "logout",
    "register",
    "password_reset",
    "password_reset_failed",
    "password_change",
    "token_issued",
    "token_revoked",
    "token_refreshed",
  ];

  const [countResult] = await db("audit_logs")
    .where("created_at", ">=", since)
    .whereIn("action", authActions)
    .count("* as count");

  const total = Number((countResult as any).count || 0);

  const events = await db("audit_logs")
    .where("created_at", ">=", since)
    .whereIn("action", authActions)
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage)
    .select(
      "id",
      "user_id",
      "action",
      "ip_address",
      "user_agent",
      "details",
      "created_at"
    );

  return {
    data: events.map((e: any) => ({
      id: e.id,
      user_id: e.user_id,
      action: e.action,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      details: typeof e.details === "string" ? tryParseJSON(e.details) : e.details,
      created_at: e.created_at,
    })),
    total,
    page,
    per_page: perPage,
  };
}

// ---------------------------------------------------------------------------
// Module health (PM2 log-based heuristics)
// ---------------------------------------------------------------------------

export async function getModuleHealth() {
  const health: Array<{
    name: string;
    status: "healthy" | "warning" | "critical" | "unknown";
    restarts: number;
    recent_errors: number;
    last_log_at: string | null;
  }> = [];

  for (const mod of MODULES) {
    const outPath = path.join(PM2_LOG_DIR, `${mod}-out.log`);
    const errPath = path.join(PM2_LOG_DIR, `${mod}-error.log`);
    const outExists = fs.existsSync(outPath);
    const errExists = fs.existsSync(errPath);

    if (!outExists && !errExists) {
      health.push({
        name: mod,
        status: "unknown",
        restarts: 0,
        recent_errors: 0,
        last_log_at: null,
      });
      continue;
    }

    const errEntries = errExists ? readRecentLogLines(`${mod}-error.log`, 200) : [];
    const outEntries = outExists ? readRecentLogLines(`${mod}-out.log`, 200) : [];

    // Count restarts (SIGTERM, restart keywords)
    let restarts = 0;
    for (const entry of outEntries) {
      const msg = entry.message || entry.raw || "";
      if (/restart|SIGTERM|SIGINT|forced shutdown/i.test(msg)) {
        restarts++;
      }
    }

    // Last log timestamp
    const allEntries = [...outEntries, ...errEntries];
    let lastLogAt: string | null = null;
    for (const entry of allEntries) {
      if (entry.timestamp && (!lastLogAt || entry.timestamp > lastLogAt)) {
        lastLogAt = entry.timestamp;
      }
    }

    const recentErrors = errEntries.length;
    let status: "healthy" | "warning" | "critical" = "healthy";
    if (restarts > 3 || recentErrors > 100) status = "critical";
    else if (restarts > 0 || recentErrors > 20) status = "warning";

    health.push({
      name: mod,
      status,
      restarts,
      recent_errors: recentErrors,
      last_log_at: lastLogAt,
    });
  }

  return health;
}
