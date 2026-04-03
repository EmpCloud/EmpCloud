import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = process.env.DASHBOARD_OUTPUT_DIR || __dirname;
const OUTPUT_FILE = path.join(OUTPUT_DIR, "test-results-live.json");

interface TestEntry {
  name: string;
  file: string;
  path: string;
  status: "pending" | "passed" | "failed" | "skipped" | "timedOut";
  duration: number | null;
  error: string | null;
}

interface ModuleData {
  tests: TestEntry[];
}

interface DashboardData {
  startTime: string;
  status: "running" | "finished";
  elapsed: number | null;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    pending: number;
  };
  modules: Record<string, ModuleData>;
}

// Map file basenames to module names
function getModuleName(fileName: string): string {
  const base = path.basename(fileName, ".spec.ts").toLowerCase();

  // EmpCloud Core
  if (
    /^(e2e-auth|e2e-empcloud|e2e-employee|e2e-attendance|e2e-leave|e2e-document|e2e-announcement|e2e-polic|e2e-admin|e2e-whistleblow|e2e-walkthrough|e2e-self-service|e2e-orgchart|e2e-oauth|e2e-password|e2e-user-management|e2e-positions|e2e-helpdesk|e2e-events|e2e-surveys|e2e-logs|e2e-migration|e2e-custom-fields|e2e-scheduled|e2e-super-admin|e2e-subscription|e2e-asset|e2e-email|functional-tests|workflow-tests|deep-workflow-tests|empcloud|e2e-back-to-dashboard|login-|super-admin-check|nexgen-|verify-|feature-screenshots|all-pages|e2e-data-export|e2e-file-operations|e2e-edge-cases|e2e-regression|e2e-business-logic|sso-)/.test(
      base
    )
  ) {
    return "EmpCloud Core";
  }

  if (/^e2e-payroll/.test(base)) return "Payroll";
  if (/^e2e-lms/.test(base)) return "LMS";
  if (/^e2e-recruit/.test(base)) return "Recruit";
  if (/^e2e-performance/.test(base)) return "Performance";
  if (/^e2e-exit/.test(base)) return "Exit";
  if (/^e2e-rewards/.test(base)) return "Rewards";
  if (/^e2e-field/.test(base)) return "Field";
  if (/^e2e-monitor/.test(base)) return "Monitor";
  if (/^(security-tests|e2e-security|e2e-race-condition|e2e-rate-limit)/.test(base)) return "Security";
  if (/^e2e-billing/.test(base)) return "Billing";
  if (/^e2e-biometrics/.test(base)) return "Biometrics";
  if (/^(e2e-stripe|e2e-webhook)/.test(base)) return "Billing";
  if (/^(e2e-cross-module|e2e-realtime|e2e-browser-compat|e2e-mobile|e2e-load|e2e-scale|e2e-database|e2e-accessibility|monitor-sso|project-sso)/.test(base))
    return "Cross-Module & Infra";

  return "Cross-Module & Misc";
}

// Build a human-readable path from the test's title path
function buildTestPath(test: TestCase): string {
  const parts: string[] = [];
  let current: Suite | undefined = test.parent;
  while (current) {
    if (current.title && current.title.length > 0) {
      parts.unshift(current.title);
    }
    current = current.parent;
  }
  parts.push(test.title);
  // Remove the top-level project name if present (e.g., "chromium")
  if (parts.length > 0 && /^(chromium|firefox|webkit)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(" > ");
}

class DashboardReporter implements Reporter {
  private data: DashboardData;
  private startMs: number;
  private testIndex: Map<string, { module: string; index: number }>;

  constructor() {
    this.startMs = Date.now();
    this.testIndex = new Map();
    this.data = {
      startTime: new Date().toISOString(),
      status: "running",
      elapsed: null,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, timedOut: 0, pending: 0 },
      modules: {},
    };
  }

  onBegin(_config: FullConfig, suite: Suite) {
    this.startMs = Date.now();
    const allTests = suite.allTests();

    for (const test of allTests) {
      const fileName = path.basename(test.location.file);
      const moduleName = getModuleName(fileName);
      const testPath = buildTestPath(test);

      if (!this.data.modules[moduleName]) {
        this.data.modules[moduleName] = { tests: [] };
      }

      const entry: TestEntry = {
        name: test.title,
        file: fileName,
        path: testPath,
        status: "pending",
        duration: null,
        error: null,
      };

      const idx = this.data.modules[moduleName].tests.length;
      this.data.modules[moduleName].tests.push(entry);
      this.testIndex.set(test.id, { module: moduleName, index: idx });
    }

    this.data.summary.total = allTests.length;
    this.data.summary.pending = allTests.length;

    // Sort modules: EmpCloud Core first, then alphabetical
    const sorted: Record<string, ModuleData> = {};
    const keys = Object.keys(this.data.modules).sort((a, b) => {
      if (a === "EmpCloud Core") return -1;
      if (b === "EmpCloud Core") return 1;
      return a.localeCompare(b);
    });
    for (const k of keys) {
      sorted[k] = this.data.modules[k];
    }
    this.data.modules = sorted;

    this.flush();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const loc = this.testIndex.get(test.id);
    if (!loc) return;

    const entry = this.data.modules[loc.module].tests[loc.index];
    const prevStatus = entry.status;

    if (result.status === "passed") {
      entry.status = "passed";
    } else if (result.status === "failed") {
      entry.status = "failed";
    } else if (result.status === "skipped") {
      entry.status = "skipped";
    } else if (result.status === "timedOut") {
      entry.status = "timedOut";
    }

    entry.duration = result.duration;

    // Capture first error message if failed
    if (result.status === "failed" && result.errors && result.errors.length > 0) {
      const msg = result.errors[0].message || "";
      entry.error = msg.substring(0, 300);
    }

    // Update summary counts
    if (prevStatus === "pending") {
      this.data.summary.pending--;
    }
    if (entry.status === "passed") this.data.summary.passed++;
    else if (entry.status === "failed") this.data.summary.failed++;
    else if (entry.status === "skipped") this.data.summary.skipped++;
    else if (entry.status === "timedOut") this.data.summary.timedOut++;

    this.data.elapsed = Date.now() - this.startMs;
    this.flush();
  }

  onEnd(_result: FullResult) {
    this.data.status = "finished";
    this.data.elapsed = Date.now() - this.startMs;
    this.flush();
  }

  private flush() {
    try {
      const tmp = OUTPUT_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf-8");
      fs.renameSync(tmp, OUTPUT_FILE);
    } catch {
      // If rename fails (Windows), fall back to direct write
      try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(this.data, null, 2), "utf-8");
      } catch {
        // Silently ignore write errors during test run
      }
    }
  }
}

export default DashboardReporter;
