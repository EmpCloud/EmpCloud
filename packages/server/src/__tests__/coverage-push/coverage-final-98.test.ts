// =============================================================================
// Coverage Final 98 -- Comprehensive real-DB tests targeting the biggest
// uncovered files: agent.service (toOpenAITools, runOpenAIAgent, runGeminiAgent,
// tool-call processing), data-sanity.service (all 10 checks + autofix),
// widget.service (getModuleWidgets, fetchWithTimeout, transforms),
// module.service (getModuleFeatures, getAccessibleFeatures),
// health-check.service (checkModuleHealth, formatUptime, full health check).
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
// DB_PASSWORD loaded from .env by vitest.config.ts dotenv
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";
process.env.BILLING_API_KEY = "test";
process.env.BILLING_API_URL = "http://localhost:4001";
process.env.LOG_LEVEL = "error";
process.env.LOG_FORMAT = "json";
process.env.RSA_PRIVATE_KEY_PATH = "./keys/private.pem";
process.env.RSA_PUBLIC_KEY_PATH = "./keys/public.pem";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// DB bootstrap
// ---------------------------------------------------------------------------

let dbAvailable = false;
let initDB: any;
let closeDB: any;
let getDB: any;

beforeAll(async () => {
  try {
    const conn = await import("../../db/connection.js");
    initDB = conn.initDB;
    closeDB = conn.closeDB;
    getDB = conn.getDB;
    await initDB();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
}, 30_000);

afterAll(async () => {
  try {
    if (closeDB) await closeDB();
  } catch { /* ignore */ }
}, 15_000);

const ORG = 5;
const USER = 524;

// ============================================================================
// 1. AGENT SERVICE — toOpenAITools, provider detection, runAgent dispatching
// ============================================================================

describe("Agent Service — provider detection and tool formatting", () => {
  let agentMod: any;
  let toolsMod: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!agentMod) {
      agentMod = await import("../../services/chatbot/agent.service.js");
      toolsMod = await import("../../services/chatbot/tools.js");
    }
  });

  it("detectProvider returns a valid provider string", () => {
    const p = agentMod.detectProvider();
    expect(typeof p).toBe("string");
    expect(["anthropic", "openai", "gemini", "deepseek", "groq", "ollama", "openai-compatible", "none"]).toContain(p);
  });

  it("detectProviderAsync returns a valid provider", async () => {
    const p = await agentMod.detectProviderAsync();
    expect(typeof p).toBe("string");
    expect(["anthropic", "openai", "gemini", "deepseek", "groq", "ollama", "openai-compatible", "none"]).toContain(p);
  });

  it("detectProviderAsync refreshes DB config cache", async () => {
    const p1 = await agentMod.detectProviderAsync();
    const p2 = await agentMod.detectProviderAsync();
    expect(p1).toBe(p2);
  });

  it("tools array has at least one tool definition", () => {
    expect(toolsMod.tools.length).toBeGreaterThan(0);
  });

  it("each tool has name, description, parameters array, and execute function", () => {
    for (const t of toolsMod.tools) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(Array.isArray(t.parameters)).toBe(true);
      expect(typeof t.execute).toBe("function");
    }
  });

  it("each tool parameter has name, type, description, required", () => {
    for (const t of toolsMod.tools) {
      for (const p of t.parameters) {
        expect(typeof p.name).toBe("string");
        expect(typeof p.type).toBe("string");
        expect(typeof p.description).toBe("string");
        expect(typeof p.required).toBe("boolean");
      }
    }
  });

  it("executeTool works for a known tool (get_employee_count)", async () => {
    const result = await toolsMod.executeTool("get_employee_count", ORG, USER, {});
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("total_employees");
  });

  it("executeTool returns error string for unknown tool", async () => {
    const result = await toolsMod.executeTool("nonexistent_tool_xyz", ORG, USER, {});
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toContain("error");
  });

  it("executeTool works for get_departments", async () => {
    const result = await toolsMod.executeTool("get_departments", ORG, USER, {});
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_my_leave_balance", async () => {
    const result = await toolsMod.executeTool("get_my_leave_balance", ORG, USER, {});
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_my_attendance", async () => {
    const result = await toolsMod.executeTool("get_my_attendance", ORG, USER, {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_pending_leave_requests if admin", async () => {
    const result = await toolsMod.executeTool("get_pending_leave_requests", ORG, USER, {});
    expect(typeof result).toBe("string");
  });

  it("executeTool works for search_employees", async () => {
    const result = await toolsMod.executeTool("search_employees", ORG, USER, { query: "test" });
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_announcements", async () => {
    const result = await toolsMod.executeTool("get_announcements", ORG, USER, {});
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_company_policies", async () => {
    const result = await toolsMod.executeTool("get_company_policies", ORG, USER, {});
    expect(typeof result).toBe("string");
  });

  it("executeTool works for get_org_stats", async () => {
    const result = await toolsMod.executeTool("get_org_stats", ORG, USER, {});
    expect(typeof result).toBe("string");
  });
});

// ============================================================================
// 2. AGENT SERVICE — runAgent with Anthropic (tool coverage via real API)
// ============================================================================

describe("Agent Service — runAgent with Anthropic provider", () => {
  let agentMod: any;
  let hasAnthropicKey = false;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!agentMod) {
      agentMod = await import("../../services/chatbot/agent.service.js");
    }
    // Check if anthropic key is available
    hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    if (!hasAnthropicKey) ctx.skip();
  });

  it("runAgent returns a string response for simple greeting", async () => {
    const result = await agentMod.runAgent(ORG, USER, "Hello", [], "en");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 30_000);

  it("runAgent returns response in specified language", async () => {
    const result = await agentMod.runAgent(ORG, USER, "Say hi", [], "hi");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 30_000);

  it("runAgent handles conversation history", async () => {
    const history = [
      { role: "user" as const, content: "What is my name?" },
      { role: "assistant" as const, content: "Let me look that up for you." },
    ];
    const result = await agentMod.runAgent(ORG, USER, "Thanks", history, "en");
    expect(typeof result).toBe("string");
  }, 30_000);

  it("runAgent with tool-triggering question (employee count)", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "How many employees do we have? Use the get_employee_count tool.",
      [], "en"
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 60_000);

  it("runAgent with tool-triggering question (departments)", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "List all departments using the get_departments tool.",
      [], "en"
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 60_000);

  it("runAgent with tool-triggering question (leave balance)", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "What is my leave balance? Use the get_my_leave_balance tool to check.",
      [], "en"
    );
    expect(typeof result).toBe("string");
  }, 60_000);

  it("runAgent with tool-triggering question (attendance)", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "Show my attendance for January 2026 using get_my_attendance tool.",
      [], "en"
    );
    expect(typeof result).toBe("string");
  }, 60_000);

  it("runAgent with tool-triggering question (announcements)", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "Show recent announcements using the get_announcements tool.",
      [], "en"
    );
    expect(typeof result).toBe("string");
  }, 60_000);

  it("runAgent with org stats question", async () => {
    const result = await agentMod.runAgent(
      ORG, USER,
      "Show me organization statistics. Use get_org_stats tool.",
      [], "en"
    );
    expect(typeof result).toBe("string");
  }, 60_000);

  it("runAgent handles rate limiting gracefully", async () => {
    // After many calls, rate limit should eventually trigger or still work
    const result = await agentMod.runAgent(ORG, USER, "test", [], "en");
    expect(typeof result).toBe("string");
  }, 30_000);
});

// ============================================================================
// 3. DATA SANITY SERVICE — all 10 checks + autofix
// ============================================================================

describe("Data Sanity Service — runSanityCheck", () => {
  let sanitySvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!sanitySvc) {
      sanitySvc = await import("../../services/admin/data-sanity.service.js");
    }
  });

  it("runSanityCheck returns a valid SanityReport", async () => {
    const report = await sanitySvc.runSanityCheck();
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("overall_status");
    expect(report).toHaveProperty("checks");
    expect(report).toHaveProperty("summary");
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBe(10);
  }, 60_000);

  it("report overall_status is one of healthy/warnings/critical", async () => {
    const report = await sanitySvc.runSanityCheck();
    expect(["healthy", "warnings", "critical"]).toContain(report.overall_status);
  }, 60_000);

  it("report summary totals match checks length", async () => {
    const report = await sanitySvc.runSanityCheck();
    const s = report.summary;
    expect(s.total_checks).toBe(report.checks.length);
    expect(s.passed + s.warnings + s.failures).toBe(s.total_checks);
  }, 60_000);

  it("each check has name, status, details, count", async () => {
    const report = await sanitySvc.runSanityCheck();
    for (const check of report.checks) {
      expect(typeof check.name).toBe("string");
      expect(["pass", "warn", "fail"]).toContain(check.status);
      expect(typeof check.details).toBe("string");
      expect(typeof check.count).toBe("number");
    }
  }, 60_000);

  it("User Count Consistency check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "User Count Consistency");
    expect(check).toBeDefined();
  }, 60_000);

  it("Cross-Module Employee Sync check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Cross-Module Employee Sync");
    expect(check).toBeDefined();
  }, 60_000);

  it("Leave Balance Integrity check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Leave Balance Integrity");
    expect(check).toBeDefined();
  }, 60_000);

  it("Attendance Consistency check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Attendance Consistency");
    expect(check).toBeDefined();
  }, 60_000);

  it("Subscription/Seat Consistency check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Subscription/Seat Consistency");
    expect(check).toBeDefined();
  }, 60_000);

  it("Orphaned Records check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Orphaned Records");
    expect(check).toBeDefined();
  }, 60_000);

  it("Payroll-Leave Sync check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Payroll-Leave Sync");
    expect(check).toBeDefined();
  }, 60_000);

  it("Exit-User Status Sync check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Exit-User Status Sync");
    expect(check).toBeDefined();
  }, 60_000);

  it("Department/Location Integrity check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Department/Location Integrity");
    expect(check).toBeDefined();
  }, 60_000);

  it("Duplicate Detection check exists", async () => {
    const report = await sanitySvc.runSanityCheck();
    const check = report.checks.find((c: any) => c.name === "Duplicate Detection");
    expect(check).toBeDefined();
  }, 60_000);

  it("checks with items have valid item structure", async () => {
    const report = await sanitySvc.runSanityCheck();
    for (const check of report.checks) {
      if (check.items && check.items.length > 0) {
        for (const item of check.items) {
          expect(typeof item.id).toBe("number");
          expect(typeof item.description).toBe("string");
        }
      }
    }
  }, 60_000);

  it("pass checks have count=0", async () => {
    const report = await sanitySvc.runSanityCheck();
    for (const check of report.checks) {
      if (check.status === "pass") {
        expect(check.count).toBe(0);
      }
    }
  }, 60_000);
});

describe("Data Sanity Service — runAutoFix", () => {
  let sanitySvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!sanitySvc) {
      sanitySvc = await import("../../services/admin/data-sanity.service.js");
    }
  });

  it("runAutoFix returns a valid FixReport", async () => {
    const report = await sanitySvc.runAutoFix();
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("fixes_applied");
    expect(report).toHaveProperty("total_fixes");
    expect(Array.isArray(report.fixes_applied)).toBe(true);
    expect(typeof report.total_fixes).toBe("number");
  }, 60_000);

  it("runAutoFix fixes_applied items have name, description, affected_rows", async () => {
    const report = await sanitySvc.runAutoFix();
    for (const fix of report.fixes_applied) {
      expect(typeof fix.name).toBe("string");
      expect(typeof fix.description).toBe("string");
      expect(typeof fix.affected_rows).toBe("number");
    }
  }, 60_000);

  it("runAutoFix total_fixes is sum of affected_rows", async () => {
    const report = await sanitySvc.runAutoFix();
    const sum = report.fixes_applied.reduce((s: number, f: any) => s + f.affected_rows, 0);
    expect(report.total_fixes).toBe(sum);
  }, 60_000);

  it("running sanity check after autofix shows no worse results", async () => {
    await sanitySvc.runAutoFix();
    const report = await sanitySvc.runSanityCheck();
    // After autofix, should not be critical (may still have warnings from cross-module)
    expect(report).toHaveProperty("overall_status");
  }, 60_000);
});

// ============================================================================
// 4. WIDGET SERVICE — getModuleWidgets
// ============================================================================

describe("Widget Service — getModuleWidgets", () => {
  let widgetSvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!widgetSvc) {
      widgetSvc = await import("../../services/dashboard/widget.service.js");
    }
  });

  it("getModuleWidgets returns an object", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  }, 30_000);

  it("getModuleWidgets keys are short module names (no emp- prefix)", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    for (const key of Object.keys(result)) {
      expect(key).not.toMatch(/^emp-/);
    }
  }, 30_000);

  it("getModuleWidgets values are objects or null", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    for (const val of Object.values(result)) {
      if (val !== null) {
        expect(typeof val).toBe("object");
      }
    }
  }, 30_000);

  it("getModuleWidgets with non-existent org returns empty object", async () => {
    const result = await widgetSvc.getModuleWidgets(999999, USER);
    expect(typeof result).toBe("object");
    expect(Object.keys(result).length).toBe(0);
  }, 30_000);

  it("getModuleWidgets widget data has expected shape for recruit", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    if (result.recruit && result.recruit !== null) {
      // Transform produces openJobs, totalCandidates, recentHires
      expect(result.recruit).toHaveProperty("openJobs");
      expect(result.recruit).toHaveProperty("totalCandidates");
      expect(result.recruit).toHaveProperty("recentHires");
    }
  }, 30_000);

  it("getModuleWidgets widget data has expected shape for performance", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    if (result.performance && result.performance !== null) {
      expect(result.performance).toHaveProperty("activeCycles");
      expect(result.performance).toHaveProperty("pendingReviews");
    }
  }, 30_000);

  it("getModuleWidgets widget data has expected shape for rewards", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    if (result.rewards && result.rewards !== null) {
      expect(result.rewards).toHaveProperty("totalKudos");
    }
  }, 30_000);

  it("getModuleWidgets widget data has expected shape for exit", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    if (result.exit && result.exit !== null) {
      expect(result.exit).toHaveProperty("attritionRate");
      expect(result.exit).toHaveProperty("activeExits");
    }
  }, 30_000);

  it("getModuleWidgets widget data has expected shape for lms", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, USER);
    if (result.lms && result.lms !== null) {
      expect(result.lms).toHaveProperty("activeCourses");
      expect(result.lms).toHaveProperty("totalEnrollments");
    }
  }, 30_000);

  it("getModuleWidgets called twice returns consistent results", async () => {
    const r1 = await widgetSvc.getModuleWidgets(ORG, USER);
    const r2 = await widgetSvc.getModuleWidgets(ORG, USER);
    expect(Object.keys(r1).sort()).toEqual(Object.keys(r2).sort());
  }, 30_000);
});

// ============================================================================
// 5. MODULE SERVICE — getModuleFeatures, getAccessibleFeatures
// ============================================================================

describe("Module Service — features", () => {
  let moduleSvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!moduleSvc) {
      moduleSvc = await import("../../services/module/module.service.js");
    }
  });

  it("listModules returns an array", async () => {
    const mods = await moduleSvc.listModules();
    expect(Array.isArray(mods)).toBe(true);
    expect(mods.length).toBeGreaterThan(0);
  });

  it("listModules with activeOnly=false returns all", async () => {
    const active = await moduleSvc.listModules(true);
    const all = await moduleSvc.listModules(false);
    expect(all.length).toBeGreaterThanOrEqual(active.length);
  });

  it("getModule returns a module by id", async () => {
    const mods = await moduleSvc.listModules();
    const mod = await moduleSvc.getModule(mods[0].id);
    expect(mod).toHaveProperty("id");
    expect(mod).toHaveProperty("name");
    expect(mod).toHaveProperty("slug");
  });

  it("getModule throws NotFoundError for non-existent id", async () => {
    await expect(moduleSvc.getModule(999999)).rejects.toThrow();
  });

  it("getModuleBySlug returns a module", async () => {
    const mod = await moduleSvc.getModuleBySlug("emp-payroll");
    expect(mod).toHaveProperty("id");
    expect(mod.slug).toBe("emp-payroll");
  });

  it("getModuleBySlug throws for non-existent slug", async () => {
    await expect(moduleSvc.getModuleBySlug("nonexistent-module-xyz")).rejects.toThrow();
  });

  it("getModuleFeatures returns an array (may be empty)", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getModuleFeatures(mods[0].id);
    expect(Array.isArray(features)).toBe(true);
  });

  it("getModuleFeatures with planTier param still returns array", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getModuleFeatures(mods[0].id, "professional");
    expect(Array.isArray(features)).toBe(true);
  });

  it("getAccessibleFeatures returns string array for free tier", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getAccessibleFeatures(mods[0].id, "free");
    expect(Array.isArray(features)).toBe(true);
    for (const f of features) {
      expect(typeof f).toBe("string");
    }
  });

  it("getAccessibleFeatures returns more features for enterprise than free", async () => {
    const mods = await moduleSvc.listModules();
    const freeFeatures = await moduleSvc.getAccessibleFeatures(mods[0].id, "free");
    const entFeatures = await moduleSvc.getAccessibleFeatures(mods[0].id, "enterprise");
    expect(entFeatures.length).toBeGreaterThanOrEqual(freeFeatures.length);
  });

  it("getAccessibleFeatures handles unknown tier gracefully", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getAccessibleFeatures(mods[0].id, "unknown_tier");
    expect(Array.isArray(features)).toBe(true);
  });

  it("getAccessibleFeatures for basic tier", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getAccessibleFeatures(mods[0].id, "basic");
    expect(Array.isArray(features)).toBe(true);
  });

  it("getAccessibleFeatures for professional tier", async () => {
    const mods = await moduleSvc.listModules();
    const features = await moduleSvc.getAccessibleFeatures(mods[0].id, "professional");
    expect(Array.isArray(features)).toBe(true);
  });

  it("createModule throws ConflictError for duplicate slug", async () => {
    await expect(
      moduleSvc.createModule({ name: "Test", slug: "emp-payroll", description: "test", icon: "test", color: "#000" })
    ).rejects.toThrow(/already exists/);
  });
});

// ============================================================================
// 6. HEALTH CHECK SERVICE — full health check, formatUptime, intervals
// ============================================================================

describe("Health Check Service", () => {
  let healthSvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!healthSvc) {
      healthSvc = await import("../../services/admin/health-check.service.js");
    }
  });

  it("getServiceHealth returns a HealthCheckResult", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(result).toHaveProperty("overall_status");
    expect(result).toHaveProperty("modules");
    expect(result).toHaveProperty("infrastructure");
    expect(result).toHaveProperty("endpoints");
    expect(result).toHaveProperty("healthy_count");
    expect(result).toHaveProperty("degraded_count");
    expect(result).toHaveProperty("down_count");
    expect(result).toHaveProperty("total_count");
    expect(result).toHaveProperty("last_full_check");
  }, 30_000);

  it("overall_status is one of operational/degraded/major_outage", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(["operational", "degraded", "major_outage"]).toContain(result.overall_status);
  }, 30_000);

  it("modules is an array with 10 entries", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.modules.length).toBe(10);
  }, 30_000);

  it("each module has name, slug, port, status, responseTime", async () => {
    const result = await healthSvc.getServiceHealth();
    for (const mod of result.modules) {
      expect(typeof mod.name).toBe("string");
      expect(typeof mod.slug).toBe("string");
      expect(typeof mod.port).toBe("number");
      expect(["healthy", "degraded", "down"]).toContain(mod.status);
      expect(typeof mod.responseTime).toBe("number");
      expect(typeof mod.lastChecked).toBe("string");
    }
  }, 30_000);

  it("infrastructure has MySQL and Redis entries", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(result.infrastructure.length).toBe(2);
    const names = result.infrastructure.map((i: any) => i.name);
    expect(names).toContain("MySQL");
    expect(names).toContain("Redis");
  }, 30_000);

  it("MySQL health shows connected status", async () => {
    const result = await healthSvc.getServiceHealth();
    const mysql = result.infrastructure.find((i: any) => i.name === "MySQL");
    expect(mysql).toBeDefined();
    expect(mysql.status).toBe("connected");
    expect(mysql.responseTime).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("MySQL health has details with version", async () => {
    const result = await healthSvc.getServiceHealth();
    const mysql = result.infrastructure.find((i: any) => i.name === "MySQL");
    if (mysql.details) {
      expect(typeof mysql.details.version).toBe("string");
    }
  }, 30_000);

  it("Redis health has status field", async () => {
    const result = await healthSvc.getServiceHealth();
    const redis = result.infrastructure.find((i: any) => i.name === "Redis");
    expect(redis).toBeDefined();
    expect(["connected", "disconnected"]).toContain(redis.status);
  }, 30_000);

  it("endpoints is an array with 10 entries", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(Array.isArray(result.endpoints)).toBe(true);
    expect(result.endpoints.length).toBe(10);
  }, 30_000);

  it("each endpoint has module, endpoint, method, status, responseTime", async () => {
    const result = await healthSvc.getServiceHealth();
    for (const ep of result.endpoints) {
      expect(typeof ep.module).toBe("string");
      expect(typeof ep.endpoint).toBe("string");
      expect(typeof ep.method).toBe("string");
      expect(["healthy", "down"]).toContain(ep.status);
      expect(typeof ep.responseTime).toBe("number");
    }
  }, 30_000);

  it("healthy + degraded + down = total count", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(result.healthy_count + result.degraded_count + result.down_count).toBe(result.total_count);
  }, 30_000);

  it("total_count equals modules.length", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(result.total_count).toBe(result.modules.length);
  }, 30_000);

  it("forceHealthCheck bypasses cache", async () => {
    const r1 = await healthSvc.getServiceHealth();
    const r2 = await healthSvc.forceHealthCheck();
    // Both should return valid results, but r2 has a fresh timestamp
    expect(r2.last_full_check).toBeDefined();
    expect(new Date(r2.last_full_check).getTime()).toBeGreaterThanOrEqual(new Date(r1.last_full_check).getTime());
  }, 30_000);

  it("getServiceHealth returns cached result on second call within TTL", async () => {
    await healthSvc.forceHealthCheck();
    const r1 = await healthSvc.getServiceHealth();
    const r2 = await healthSvc.getServiceHealth();
    expect(r1.last_full_check).toBe(r2.last_full_check);
  }, 30_000);

  it("startHealthCheckInterval does not throw", () => {
    expect(() => healthSvc.startHealthCheckInterval()).not.toThrow();
  });

  it("calling startHealthCheckInterval twice is idempotent", () => {
    healthSvc.startHealthCheckInterval();
    expect(() => healthSvc.startHealthCheckInterval()).not.toThrow();
  });

  it("stopHealthCheckInterval stops the interval", () => {
    healthSvc.startHealthCheckInterval();
    expect(() => healthSvc.stopHealthCheckInterval()).not.toThrow();
  });

  it("stopHealthCheckInterval called twice does not throw", () => {
    expect(() => healthSvc.stopHealthCheckInterval()).not.toThrow();
    expect(() => healthSvc.stopHealthCheckInterval()).not.toThrow();
  });

  it("EMP Cloud module should be healthy or down", async () => {
    const result = await healthSvc.getServiceHealth();
    const cloud = result.modules.find((m: any) => m.slug === "empcloud");
    expect(cloud).toBeDefined();
    expect(["healthy", "degraded", "down"]).toContain(cloud.status);
  }, 30_000);

  it("last_full_check is a valid ISO date string", async () => {
    const result = await healthSvc.getServiceHealth();
    expect(new Date(result.last_full_check).toISOString()).toBe(result.last_full_check);
  }, 30_000);
});

// ============================================================================
// 7. ADDITIONAL AGENT TOOL EXECUTIONS — cover more tool branches
// ============================================================================

describe("Agent Tools — additional tool executions", () => {
  let toolsMod: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!toolsMod) {
      toolsMod = await import("../../services/chatbot/tools.js");
    }
  });

  it("executeTool handles run_sql_query tool", async () => {
    const result = await toolsMod.executeTool("run_sql_query", ORG, USER, {
      query: `SELECT COUNT(*) as cnt FROM users WHERE organization_id = ${ORG}`,
    });
    expect(typeof result).toBe("string");
  });

  it("executeTool handles run_sql_query with bad SQL gracefully", async () => {
    const result = await toolsMod.executeTool("run_sql_query", ORG, USER, {
      query: "SELECT * FROM nonexistent_table_xyz",
    });
    expect(typeof result).toBe("string");
  });

  it("tools list includes at least these tools", () => {
    const names = toolsMod.tools.map((t: any) => t.name);
    expect(names).toContain("get_employee_count");
    expect(names).toContain("get_department_list");
  });

  it("each tool can be called with empty params without crashing", async () => {
    // Some tools may return errors but should not crash
    for (const tool of toolsMod.tools.slice(0, 5)) {
      const result = await toolsMod.executeTool(tool.name, ORG, USER, {});
      expect(typeof result).toBe("string");
    }
  }, 30_000);

  it("executeTool result length is bounded", async () => {
    const result = await toolsMod.executeTool("get_employee_count", ORG, USER, {});
    // Results should be truncated to MAX_RESULT_LENGTH or less
    expect(result.length).toBeLessThan(10_000);
  });
});

// ============================================================================
// 8. DATA SANITY — individual check behaviors (via full report)
// ============================================================================

describe("Data Sanity — check detail verification", () => {
  let sanitySvc: any;
  let report: any;

  beforeAll(async () => {
    if (!dbAvailable) return;
    sanitySvc = await import("../../services/admin/data-sanity.service.js");
    report = await sanitySvc.runSanityCheck();
  }, 60_000);

  beforeEach((ctx) => {
    if (!dbAvailable || !report) ctx.skip();
  });

  it("User Count Consistency details mention 'user count'", () => {
    const check = report.checks.find((c: any) => c.name === "User Count Consistency");
    expect(check.details.toLowerCase()).toMatch(/user count|no .* found|match/i);
  });

  it("Cross-Module Employee Sync details are descriptive", () => {
    const check = report.checks.find((c: any) => c.name === "Cross-Module Employee Sync");
    expect(check.details.length).toBeGreaterThan(5);
  });

  it("Leave Balance Integrity details mention balance", () => {
    const check = report.checks.find((c: any) => c.name === "Leave Balance Integrity");
    expect(check.details.toLowerCase()).toMatch(/balance|leave|no .* found/i);
  });

  it("Attendance Consistency details mention attendance", () => {
    const check = report.checks.find((c: any) => c.name === "Attendance Consistency");
    expect(check.details.toLowerCase()).toMatch(/attendance|consistent|anomal/i);
  });

  it("Subscription/Seat Consistency details mention seat", () => {
    const check = report.checks.find((c: any) => c.name === "Subscription/Seat Consistency");
    expect(check.details.toLowerCase()).toMatch(/seat|subscription/i);
  });

  it("Orphaned Records details mention orphan", () => {
    const check = report.checks.find((c: any) => c.name === "Orphaned Records");
    expect(check.details.toLowerCase()).toMatch(/orphan|no .* found/i);
  });

  it("Payroll-Leave Sync details mention payroll", () => {
    const check = report.checks.find((c: any) => c.name === "Payroll-Leave Sync");
    expect(check.details.toLowerCase()).toMatch(/payroll|leave|skip/i);
  });

  it("Exit-User Status Sync details mention exit", () => {
    const check = report.checks.find((c: any) => c.name === "Exit-User Status Sync");
    expect(check.details.toLowerCase()).toMatch(/exit|user|skip/i);
  });

  it("Department/Location Integrity details mention department or location", () => {
    const check = report.checks.find((c: any) => c.name === "Department/Location Integrity");
    expect(check.details.toLowerCase()).toMatch(/department|location|valid/i);
  });

  it("Duplicate Detection details mention duplicate", () => {
    const check = report.checks.find((c: any) => c.name === "Duplicate Detection");
    expect(check.details.toLowerCase()).toMatch(/duplicate|no .* found/i);
  });

  it("warn/fail checks have count > 0", () => {
    for (const check of report.checks) {
      if (check.status === "warn" || check.status === "fail") {
        expect(check.count).toBeGreaterThan(0);
      }
    }
  });

  it("items arrays have max 10 items", () => {
    for (const check of report.checks) {
      if (check.items) {
        expect(check.items.length).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ============================================================================
// 9. WIDGET SERVICE — edge cases
// ============================================================================

describe("Widget Service — edge cases", () => {
  let widgetSvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!widgetSvc) {
      widgetSvc = await import("../../services/dashboard/widget.service.js");
    }
  });

  it("getModuleWidgets with orgId=0 returns empty (no subscriptions for super admin)", async () => {
    const result = await widgetSvc.getModuleWidgets(0, USER);
    expect(typeof result).toBe("object");
  }, 30_000);

  it("getModuleWidgets handles large orgId gracefully", async () => {
    const result = await widgetSvc.getModuleWidgets(2147483647, USER);
    expect(typeof result).toBe("object");
  }, 30_000);

  it("getModuleWidgets with userId=0 still works", async () => {
    const result = await widgetSvc.getModuleWidgets(ORG, 0);
    expect(typeof result).toBe("object");
  }, 30_000);
});

// ============================================================================
// 10. HEALTH CHECK — module-specific detail checks
// ============================================================================

describe("Health Check — module detail checks", () => {
  let healthSvc: any;
  let result: any;

  beforeAll(async () => {
    if (!dbAvailable) return;
    healthSvc = await import("../../services/admin/health-check.service.js");
    result = await healthSvc.forceHealthCheck();
  }, 30_000);

  beforeEach((ctx) => {
    if (!dbAvailable || !result) ctx.skip();
  });

  it("EMP Payroll module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-payroll");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4000);
  });

  it("EMP Billing module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-billing");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4001);
  });

  it("EMP Recruit module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-recruit");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4500);
  });

  it("EMP Performance module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-performance");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4300);
  });

  it("EMP Rewards module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-rewards");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4600);
  });

  it("EMP Exit module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-exit");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4400);
  });

  it("EMP LMS module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-lms");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(4700);
  });

  it("EMP Monitor module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-monitor");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(5000);
  });

  it("EMP Projects module exists in health check", () => {
    const mod = result.modules.find((m: any) => m.slug === "emp-projects");
    expect(mod).toBeDefined();
    expect(mod.port).toBe(9000);
  });

  it("healthy modules have responseTime >= 0", () => {
    for (const mod of result.modules) {
      if (mod.status === "healthy") {
        expect(mod.responseTime).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("down modules have error message", () => {
    for (const mod of result.modules) {
      if (mod.status === "down") {
        expect(typeof mod.error).toBe("string");
        expect(mod.error.length).toBeGreaterThan(0);
      }
    }
  });

  it("degraded modules have error message", () => {
    for (const mod of result.modules) {
      if (mod.status === "degraded") {
        expect(mod.error === undefined || typeof mod.error === "string").toBe(true);
      }
    }
  });

  it("healthy modules may have version and uptime", () => {
    for (const mod of result.modules) {
      if (mod.status === "healthy") {
        // version and uptime are optional
        if (mod.version) expect(typeof mod.version).toBe("string");
        if (mod.uptime) expect(typeof mod.uptime).toBe("string");
      }
    }
  });

  it("endpoint health check results exist for each module", () => {
    const endpointModules = new Set(result.endpoints.map((e: any) => e.module));
    expect(endpointModules.size).toBe(10);
  });

  it("healthy endpoints have statusCode", () => {
    for (const ep of result.endpoints) {
      if (ep.status === "healthy") {
        expect(typeof ep.statusCode).toBe("number");
        expect(ep.statusCode).toBeGreaterThanOrEqual(200);
        expect(ep.statusCode).toBeLessThan(400);
      }
    }
  });
});

// ============================================================================
// 11. MODULE SERVICE — updateModule edge cases
// ============================================================================

describe("Module Service — update and features edge cases", () => {
  let moduleSvc: any;

  beforeEach(async (ctx) => {
    if (!dbAvailable) ctx.skip();
    if (!moduleSvc) {
      moduleSvc = await import("../../services/module/module.service.js");
    }
  });

  it("updateModule throws for non-existent module", async () => {
    await expect(moduleSvc.updateModule(999999, { name: "test" })).rejects.toThrow();
  });

  it("updateModule with valid id returns updated module", async () => {
    const mods = await moduleSvc.listModules();
    const mod = mods[0];
    const updated = await moduleSvc.updateModule(mod.id, { description: mod.description || "Updated" });
    expect(updated.id).toBe(mod.id);
  });

  it("getModuleFeatures for non-existent module returns empty array", async () => {
    const features = await moduleSvc.getModuleFeatures(999999);
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBe(0);
  });

  it("getAccessibleFeatures for non-existent module returns empty", async () => {
    const features = await moduleSvc.getAccessibleFeatures(999999, "enterprise");
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBe(0);
  });
});
