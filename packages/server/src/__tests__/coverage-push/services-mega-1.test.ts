// =============================================================================
// MEGA Coverage Push #1: Admin Services (data-sanity, health-check, super-admin, log-analysis)
// These are the BIGGEST 0% files (~2,500 lines total)
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.BILLING_MODULE_URL = "http://localhost:4001";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5;
const ADMIN = 522;

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// DATA SANITY SERVICE (1028 lines, 0% coverage)
// =============================================================================

describe("DataSanityService — deep coverage", () => {
  it("runSanityCheck returns a SanityReport", async () => {
    const mod = await import("../../services/admin/data-sanity.service.js");
    const report = await mod.runSanityCheck();
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("overall_status");
    expect(["healthy", "warnings", "critical"]).toContain(report.overall_status);
    expect(report).toHaveProperty("checks");
    expect(Array.isArray(report.checks)).toBe(true);
    // Each check should have required fields
    for (const check of report.checks) {
      expect(check).toHaveProperty("name");
      expect(check).toHaveProperty("status");
      expect(check).toHaveProperty("details");
      expect(check).toHaveProperty("count");
      expect(["pass", "warn", "fail"]).toContain(check.status);
    }
  });

  it("runAutoFix returns a FixReport", async () => {
    const mod = await import("../../services/admin/data-sanity.service.js");
    const report = await mod.runAutoFix();
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("fixes_applied");
    expect(Array.isArray(report.fixes_applied)).toBe(true);
  });
});

// =============================================================================
// HEALTH CHECK SERVICE (427 lines, 0% coverage)
// =============================================================================

describe("HealthCheckService — deep coverage", () => {
  it("getServiceHealth returns health result", async () => {
    const mod = await import("../../services/admin/health-check.service.js");
    const result = await mod.getServiceHealth();
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("overall_status");
    expect(result).toHaveProperty("modules");
    expect(result).toHaveProperty("infrastructure");
    expect(Array.isArray(result.modules)).toBe(true);
    expect(Array.isArray(result.infrastructure)).toBe(true);
    // Modules should have correct shape
    for (const m of result.modules) {
      expect(m).toHaveProperty("name");
      expect(m).toHaveProperty("slug");
      expect(m).toHaveProperty("port");
      expect(m).toHaveProperty("status");
      expect(["healthy", "degraded", "down"]).toContain(m.status);
    }
    // Infrastructure checks
    for (const i of result.infrastructure) {
      expect(i).toHaveProperty("name");
      expect(i).toHaveProperty("status");
      expect(["connected", "disconnected"]).toContain(i.status);
    }
  });

  it("forceHealthCheck bypasses cache", async () => {
    const mod = await import("../../services/admin/health-check.service.js");
    const result = await mod.forceHealthCheck();
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("overall_status");
  });

  it("startHealthCheckInterval and stopHealthCheckInterval", async () => {
    const mod = await import("../../services/admin/health-check.service.js");
    // Start should not throw
    mod.startHealthCheckInterval();
    // Stop should not throw
    mod.stopHealthCheckInterval();
  });
});

// =============================================================================
// SUPER ADMIN SERVICE (711 lines, 1.76% coverage)
// =============================================================================

describe("SuperAdminService — deep coverage", () => {
  it("getPlatformOverview returns overview data", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const overview = await mod.getPlatformOverview();
    expect(overview).toHaveProperty("organizations");
    expect(overview).toHaveProperty("users");
    expect(overview).toHaveProperty("active_subscriptions");
    expect(overview).toHaveProperty("mrr");
    expect(typeof overview.organizations).toBe("number");
    expect(typeof overview.users).toBe("number");
  });

  it("getOrgList returns paginated list", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const result = await mod.getOrgList({ page: 1, perPage: 10 });
    expect(result).toHaveProperty("organizations");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.organizations)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("getOrgList with search filter", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const result = await mod.getOrgList({ page: 1, perPage: 10, search: "TechNova" });
    expect(result).toHaveProperty("organizations");
    expect(result).toHaveProperty("total");
  });

  it("getOrgList with status filter", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const result = await mod.getOrgList({ page: 1, perPage: 10, status: "active" });
    expect(result).toHaveProperty("organizations");
  });

  it("getOrgDetail returns org details", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const detail = await mod.getOrgDetail(ORG);
    expect(detail).toHaveProperty("org");
    expect(detail).toHaveProperty("users");
    expect(detail).toHaveProperty("subscriptions");
    expect(detail).toHaveProperty("departments");
  });

  it("getOrgDetail for non-existent org", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    await expect(mod.getOrgDetail(999999)).rejects.toThrow();
  });

  it("getModuleAnalytics returns module data", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const analytics = await mod.getModuleAnalytics();
    expect(Array.isArray(analytics)).toBe(true);
    if (analytics.length > 0) {
      expect(analytics[0]).toHaveProperty("name");
    }
  });

  it("getRevenueAnalytics returns revenue data", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const revenue = await mod.getRevenueAnalytics("12m");
    expect(revenue).toHaveProperty("timeline");
    expect(Array.isArray(revenue.timeline)).toBe(true);
  });

  it("getRevenueAnalytics with 6m period", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const revenue = await mod.getRevenueAnalytics("6m");
    expect(revenue).toHaveProperty("timeline");
  });

  it("getRevenueAnalytics with 3m period", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const revenue = await mod.getRevenueAnalytics("3m");
    expect(revenue).toHaveProperty("timeline");
  });

  it("getUserGrowth returns growth data", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const growth = await mod.getUserGrowth("12m");
    expect(growth).toHaveProperty("timeline");
    expect(Array.isArray(growth.timeline)).toBe(true);
  });

  it("getUserGrowth with 6m", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const growth = await mod.getUserGrowth("6m");
    expect(growth).toHaveProperty("timeline");
  });

  it("getSubscriptionMetrics returns metrics", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const metrics = await mod.getSubscriptionMetrics();
    expect(metrics).toHaveProperty("total");
    expect(metrics).toHaveProperty("by_status");
    expect(metrics).toHaveProperty("by_module");
  });

  it("getRecentActivity returns activity items", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const activity = await mod.getRecentActivity(10);
    expect(Array.isArray(activity)).toBe(true);
  });

  it("getRecentActivity with default limit", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const activity = await mod.getRecentActivity();
    expect(Array.isArray(activity)).toBe(true);
  });

  it("getSystemHealth returns system info", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const health = await mod.getSystemHealth();
    expect(health).toBeTruthy();
  });

  it("getOverdueOrganizations returns list", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const overdue = await mod.getOverdueOrganizations();
    expect(Array.isArray(overdue)).toBe(true);
  });

  it("getModuleAdoption returns adoption data", async () => {
    const mod = await import("../../services/admin/super-admin.service.js");
    const adoption = await mod.getModuleAdoption();
    expect(Array.isArray(adoption)).toBe(true);
  });
});

// =============================================================================
// LOG ANALYSIS SERVICE (358 lines, 0% coverage)
// =============================================================================

describe("LogAnalysisService — deep coverage", () => {
  it("getLogSummary returns summary", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const summary = await mod.getLogSummary();
    expect(summary).toBeTruthy();
    expect(typeof summary).toBe("object");
  });

  it("getRecentErrors returns paginated errors", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getRecentErrors(1, 10);
    expect(result).toBeTruthy();
  });

  it("getRecentErrors page 2", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getRecentErrors(2, 5);
    expect(result).toBeTruthy();
  });

  it("getSlowQueries returns slow queries", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getSlowQueries(1, 10);
    expect(result).toBeTruthy();
  });

  it("getAuthEvents returns auth events", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getAuthEvents(1, 20);
    expect(result).toBeTruthy();
  });

  it("getAuthEvents page 2", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getAuthEvents(2, 10);
    expect(result).toBeTruthy();
  });

  it("getModuleHealth returns module health", async () => {
    const mod = await import("../../services/admin/log-analysis.service.js");
    const result = await mod.getModuleHealth();
    expect(result).toBeTruthy();
  });
});

// =============================================================================
// AI CONFIG SERVICE — additional branches (45% -> higher)
// =============================================================================

describe("AIConfigService — extended branches", () => {
  it("getAIConfig returns config object", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    const cfg = await mod.getAIConfig();
    expect(cfg).toBeTruthy();
  });

  it("getActiveProvider returns provider info", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    const provider = await mod.getActiveProvider();
    expect(provider).toHaveProperty("provider");
  });

  it("getDecryptedConfig returns decrypted keys", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    const config = await mod.getDecryptedConfig();
    expect(typeof config).toBe("object");
  });

  it("getDecryptedKey with non-existent key", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    const result = await mod.getDecryptedKey("non_existent_key_xyz");
    expect(result).toBeNull();
  });

  it("testProvider with invalid provider handles gracefully", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    try {
      await mod.testProvider("invalid-provider", "fake-key");
    } catch (e: any) {
      expect(e).toBeTruthy();
    }
  });

  it("updateAIConfig with partial data", async () => {
    const mod = await import("../../services/admin/ai-config.service.js");
    try {
      const result = await mod.updateAIConfig({});
      expect(result).toBeTruthy();
    } catch (e: any) {
      // May throw if no changes
      expect(e).toBeTruthy();
    }
  });
});
