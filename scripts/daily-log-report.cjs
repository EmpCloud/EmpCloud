#!/usr/bin/env node
// =============================================================================
// EMP CLOUD — Daily Log Report
// Parses PM2 logs from all modules and generates a summary report.
//
// Usage:
//   node scripts/daily-log-report.cjs
//   PM2_LOG_DIR=/custom/path node scripts/daily-log-report.cjs
//   node scripts/daily-log-report.cjs --hours 48
//
// Schedule via cron:
//   0 8 * * * node /path/to/daily-log-report.cjs >> /var/log/emp-daily-report.log
// =============================================================================

const fs = require("fs");
const path = require("path");
const os = require("os");

const PM2_LOG_DIR =
  process.env.PM2_LOG_DIR || path.join(os.homedir(), ".pm2", "logs");

const HOURS = parseInt(process.argv.find((a) => a.startsWith("--hours="))?.split("=")[1] || "24", 10);
const SINCE = Date.now() - HOURS * 60 * 60 * 1000;

const MODULES = [
  { name: "empcloud", outLog: "empcloud-out.log", errLog: "empcloud-error.log" },
  { name: "emp-recruit", outLog: "emp-recruit-out.log", errLog: "emp-recruit-error.log" },
  { name: "emp-performance", outLog: "emp-performance-out.log", errLog: "emp-performance-error.log" },
  { name: "emp-rewards", outLog: "emp-rewards-out.log", errLog: "emp-rewards-error.log" },
  { name: "emp-exit", outLog: "emp-exit-out.log", errLog: "emp-exit-error.log" },
  { name: "emp-billing", outLog: "emp-billing-out.log", errLog: "emp-billing-error.log" },
  { name: "emp-lms", outLog: "emp-lms-out.log", errLog: "emp-lms-error.log" },
  { name: "emp-payroll", outLog: "emp-payroll-out.log", errLog: "emp-payroll-error.log" },
  { name: "emp-monitor", outLog: "emp-monitor-out.log", errLog: "emp-monitor-error.log" },
];

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function tryParseJSON(line) {
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

function extractTimestamp(entry) {
  if (entry && entry.timestamp) {
    return new Date(entry.timestamp).getTime();
  }
  // Try to find ISO date in raw text
  const match = (typeof entry === "string" ? entry : "").match(
    /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/
  );
  return match ? new Date(match[1]).getTime() : 0;
}

function readLogLines(filePath, since) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const entries = [];

  for (const line of lines) {
    const parsed = tryParseJSON(line);
    const ts = extractTimestamp(parsed || line);
    if (ts && ts < since) continue; // skip old entries
    entries.push(parsed || { raw: line, timestamp: ts ? new Date(ts).toISOString() : null });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyzeModule(mod) {
  const outPath = path.join(PM2_LOG_DIR, mod.outLog);
  const errPath = path.join(PM2_LOG_DIR, mod.errLog);

  const outEntries = readLogLines(outPath, SINCE);
  const errEntries = readLogLines(errPath, SINCE);

  const stats = {
    name: mod.name,
    totalLines: outEntries.length + errEntries.length,
    infoCount: 0,
    warnCount: 0,
    errorCount: 0,
    errors: [],         // { message, endpoint, statusCode, count }
    slowQueries: [],    // { sql, duration_ms }
    authFailures: 0,
    rateLimited: 0,
    restarts: 0,
    statusCodes: {},    // { "500": count, "401": count, etc. }
    responseTimes: [],
  };

  const errorMap = new Map(); // key -> { message, endpoint, statusCode, count }

  function processEntry(entry) {
    const level = (entry.level || "").toLowerCase();
    const message = entry.message || entry.raw || "";

    if (level === "error" || level === "err") stats.errorCount++;
    else if (level === "warn" || level === "warning") stats.warnCount++;
    else stats.infoCount++;

    // Detect HTTP status codes
    const statusMatch = message.match(/\b([45]\d{2})\b/);
    if (statusMatch) {
      const code = statusMatch[1];
      stats.statusCodes[code] = (stats.statusCodes[code] || 0) + 1;
    }

    // Detect specific patterns
    if (/slow query/i.test(message) || entry.duration_ms > 1000) {
      stats.slowQueries.push({
        sql: (entry.sql || message).substring(0, 150),
        duration_ms: entry.duration_ms || 0,
      });
    }

    if (/invalid.*password|auth.*fail|login.*fail|unauthorized/i.test(message)) {
      stats.authFailures++;
    }

    if (/rate.*limit/i.test(message)) {
      stats.rateLimited++;
    }

    if (/restart|SIGTERM|SIGINT|forced shutdown|process.*exit/i.test(message)) {
      stats.restarts++;
    }

    // Track response times
    if (entry.duration_ms || entry.responseTime) {
      stats.responseTimes.push(entry.duration_ms || entry.responseTime);
    }

    // Group errors
    if (level === "error" || level === "err" || statusMatch) {
      const endpoint = entry.url || entry.path || entry.endpoint || "";
      const code = statusMatch ? statusMatch[1] : "ERR";
      const key = `${code}:${endpoint}:${message.substring(0, 80)}`;
      const existing = errorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorMap.set(key, {
          statusCode: code,
          endpoint: endpoint || "N/A",
          message: message.substring(0, 120),
          count: 1,
        });
      }
    }
  }

  outEntries.forEach(processEntry);
  errEntries.forEach(processEntry);

  stats.errors = Array.from(errorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  stats.slowQueries = stats.slowQueries
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 10);

  return stats;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function pad(str, len) {
  return String(str).padEnd(len);
}

function formatNumber(n) {
  return n.toLocaleString("en-US");
}

function generateReport(analyses) {
  const totals = {
    requests: 0,
    errors: 0,
    warnings: 0,
    authFailures: 0,
    rateLimited: 0,
    slowQueries: 0,
    responseTimes: [],
  };

  const allErrors = [];
  const allSlowQueries = [];

  for (const a of analyses) {
    totals.requests += a.totalLines;
    totals.errors += a.errorCount;
    totals.warnings += a.warnCount;
    totals.authFailures += a.authFailures;
    totals.rateLimited += a.rateLimited;
    totals.slowQueries += a.slowQueries.length;
    totals.responseTimes.push(...a.responseTimes);
    allErrors.push(...a.errors.map((e) => ({ ...e, module: a.name })));
    allSlowQueries.push(...a.slowQueries.map((q) => ({ ...q, module: a.name })));
  }

  const successRate =
    totals.requests > 0
      ? (((totals.requests - totals.errors) / totals.requests) * 100).toFixed(1)
      : "100.0";

  const avgResponseTime =
    totals.responseTimes.length > 0
      ? Math.round(
          totals.responseTimes.reduce((a, b) => a + b, 0) / totals.responseTimes.length
        )
      : "N/A";

  const topErrors = allErrors.sort((a, b) => b.count - a.count).slice(0, 10);
  const topSlowQueries = allSlowQueries.sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5);

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const lines = [];
  const sep = "=".repeat(60);

  lines.push("");
  lines.push(sep);
  lines.push("  EMP CLOUD -- Daily Log Report");
  lines.push(`  Date: ${dateStr} | Period: Last ${HOURS} hours`);
  lines.push(sep);
  lines.push("");

  // Summary
  lines.push("  SUMMARY");
  lines.push(`  Total Log Entries:  ${formatNumber(totals.requests)}`);
  lines.push(`  Success Rate:       ${successRate}%`);
  lines.push(`  Error Rate:         ${(100 - parseFloat(successRate)).toFixed(1)}% (${formatNumber(totals.errors)} errors)`);
  lines.push(`  Warnings:           ${formatNumber(totals.warnings)}`);
  lines.push(`  Avg Response Time:  ${avgResponseTime}ms`);
  lines.push("");

  // Top Errors
  lines.push("  TOP ERRORS (by frequency)");
  if (topErrors.length === 0) {
    lines.push("    No errors found in the last " + HOURS + " hours.");
  } else {
    topErrors.forEach((err, i) => {
      lines.push(
        `  ${i + 1}. ${err.statusCode} ${err.endpoint} -- ${err.count} occurrences [${err.module}]`
      );
      lines.push(`     Error: "${err.message}"`);
    });
  }
  lines.push("");

  // Slow Queries
  lines.push("  SLOW QUERIES (>1s)");
  if (topSlowQueries.length === 0) {
    lines.push("    No slow queries detected.");
  } else {
    topSlowQueries.forEach((q, i) => {
      lines.push(
        `  ${i + 1}. ${q.duration_ms}ms [${q.module}] -- ${q.sql}`
      );
    });
  }
  lines.push("");

  // Security
  lines.push("  SECURITY");
  lines.push(`  Failed Logins:      ${totals.authFailures}`);
  lines.push(`  Rate Limited:       ${formatNumber(totals.rateLimited)} requests`);
  lines.push("");

  // Module Health
  lines.push("  MODULE HEALTH");
  for (const a of analyses) {
    const exists =
      fs.existsSync(path.join(PM2_LOG_DIR, MODULES.find((m) => m.name === a.name)?.outLog || ""));
    let status;
    if (!exists) {
      status = "-- no logs found";
    } else if (a.restarts > 2) {
      status = `!! ${a.restarts} restarts (check memory)`;
    } else if (a.errorCount > 50) {
      status = `!! high error count (${a.errorCount})`;
    } else if (a.restarts > 0) {
      status = `~  ${a.restarts} restart(s)`;
    } else {
      status = "OK healthy (0 restarts)";
    }
    lines.push(`  ${pad(a.name, 22)} ${status}`);
  }

  lines.push("");
  lines.push(sep);
  lines.push(`  Report generated: ${now.toISOString()}`);
  lines.push(`  Log directory: ${PM2_LOG_DIR}`);
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(PM2_LOG_DIR)) {
    console.error(`PM2 log directory not found: ${PM2_LOG_DIR}`);
    console.error("Set PM2_LOG_DIR environment variable to the correct path.");
    process.exit(1);
  }

  const analyses = MODULES.map(analyzeModule);
  const report = generateReport(analyses);
  console.log(report);

  // Optionally write to file
  const outDir = process.env.REPORT_OUTPUT_DIR;
  if (outDir) {
    const dateStr = new Date().toISOString().split("T")[0];
    const outPath = path.join(outDir, `emp-daily-report-${dateStr}.txt`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, report, "utf-8");
    console.log(`Report saved to: ${outPath}`);
  }
}

main();
