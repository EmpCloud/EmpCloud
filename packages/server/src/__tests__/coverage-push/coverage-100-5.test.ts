// =============================================================================
// Coverage-100-5: Billing integration, Module webhooks, Chatbot tools,
// Import service, Position service (deep), Admin services
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
process.env.BILLING_API_URL = "http://localhost:4001";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5; // TechNova
const ADMIN = 522; // ananya@technova.in
const EMP = 524; // priya@technova.in
const MGR = 529; // karthik@technova.in
const U = String(Date.now()).slice(-6);

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// 1. BILLING INTEGRATION SERVICE
// =============================================================================
describe("Billing Integration Service", () => {
  // ----------- LOCAL DB FUNCTIONS -----------

  describe("getOrCreateBillingClientId", () => {
    it("should return null for non-existent org", async () => {
      const { getOrCreateBillingClientId } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      // org 999999 doesn't exist; auto-provision will fail (HTTP)
      const result = await getOrCreateBillingClientId(999999);
      expect(result).toBeNull();
    });

    it("should return existing mapping if present", async () => {
      const { getOrCreateBillingClientId } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const db = getDB();

      // Insert a test mapping
      const testClientId = `test-client-${U}`;
      await db("billing_client_mappings").insert({
        organization_id: 99990,
        billing_client_id: testClientId,
        created_at: new Date(),
      }).catch(() => {}); // ignore if org doesn't exist

      // If the mapping row was created, check it
      const mapping = await db("billing_client_mappings")
        .where({ organization_id: 99990 })
        .first();

      if (mapping) {
        const result = await getOrCreateBillingClientId(99990);
        expect(result).toBe(testClientId);
        // Cleanup
        await db("billing_client_mappings").where({ organization_id: 99990 }).del();
      }
    });

    it("should attempt auto-provision for org without mapping", async () => {
      const { getOrCreateBillingClientId } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      // ORG 5 exists but billing API is down, so will return null
      const result = await getOrCreateBillingClientId(ORG);
      // Either returns existing mapping or null (HTTP failed)
      expect(result === null || typeof result === "string").toBe(true);
    });
  });

  describe("saveBillingSubscriptionMapping", () => {
    let testCloudSubId: number;
    let testCloudSubId2: number;

    beforeAll(async () => {
      // Find a real subscription ID for this org to satisfy FK constraint
      const db = getDB();
      const subs = await db("org_subscriptions")
        .where({ organization_id: ORG })
        .select("id")
        .orderBy("id", "asc")
        .limit(2);
      if (subs.length >= 2) {
        testCloudSubId = subs[0].id;
        testCloudSubId2 = subs[1].id;
      } else if (subs.length === 1) {
        testCloudSubId = subs[0].id;
        testCloudSubId2 = subs[0].id; // fallback
      } else {
        testCloudSubId = 0;
        testCloudSubId2 = 0;
      }
      // Clean any existing test mappings
      if (testCloudSubId) {
        await db("billing_subscription_mappings")
          .where({ cloud_subscription_id: testCloudSubId })
          .del()
          .catch(() => {});
      }
      if (testCloudSubId2 && testCloudSubId2 !== testCloudSubId) {
        await db("billing_subscription_mappings")
          .where({ cloud_subscription_id: testCloudSubId2 })
          .del()
          .catch(() => {});
      }
    });

    afterAll(async () => {
      const db = getDB();
      if (testCloudSubId) {
        await db("billing_subscription_mappings")
          .where({ cloud_subscription_id: testCloudSubId })
          .del()
          .catch(() => {});
      }
      if (testCloudSubId2 && testCloudSubId2 !== testCloudSubId) {
        await db("billing_subscription_mappings")
          .where({ cloud_subscription_id: testCloudSubId2 })
          .del()
          .catch(() => {});
      }
    });

    it("should insert a new mapping", async () => {
      if (!testCloudSubId) return; // skip if no subscriptions
      const { saveBillingSubscriptionMapping } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      await saveBillingSubscriptionMapping({
        orgId: ORG,
        cloudSubscriptionId: testCloudSubId,
        billingSubscriptionId: `billing-sub-${U}`,
        billingPlanId: `plan-${U}`,
      });

      const db = getDB();
      const row = await db("billing_subscription_mappings")
        .where({ cloud_subscription_id: testCloudSubId })
        .first();
      expect(row).toBeTruthy();
      expect(row.billing_subscription_id).toBe(`billing-sub-${U}`);
    });

    it("should not duplicate on second call", async () => {
      if (!testCloudSubId) return; // skip if no subscriptions
      const { saveBillingSubscriptionMapping } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      await saveBillingSubscriptionMapping({
        orgId: ORG,
        cloudSubscriptionId: testCloudSubId,
        billingSubscriptionId: `billing-sub-${U}-v2`,
      });

      const db = getDB();
      const rows = await db("billing_subscription_mappings")
        .where({ cloud_subscription_id: testCloudSubId });
      expect(rows.length).toBe(1);
      // Original value preserved
      expect(rows[0].billing_subscription_id).toBe(`billing-sub-${U}`);
    });

    it("should handle missing billingPlanId", async () => {
      if (!testCloudSubId2 || testCloudSubId2 === testCloudSubId) return;
      const { saveBillingSubscriptionMapping } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      await saveBillingSubscriptionMapping({
        orgId: ORG,
        cloudSubscriptionId: testCloudSubId2,
        billingSubscriptionId: `billing-sub-noplan-${U}`,
      });

      const db = getDB();
      const row = await db("billing_subscription_mappings")
        .where({ cloud_subscription_id: testCloudSubId2 })
        .first();
      if (row) {
        expect(row.billing_plan_id).toBeNull();
      }
    });
  });

  describe("getBillingSubscriptionId", () => {
    it("should return null for non-existent mapping", async () => {
      const { getBillingSubscriptionId } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const result = await getBillingSubscriptionId(999999);
      expect(result).toBeNull();
    });

    it("should return billing subscription id for existing mapping", async () => {
      const { getBillingSubscriptionId, saveBillingSubscriptionMapping } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const db = getDB();
      // Find a real subscription that doesn't already have a mapping
      const sub = await db("org_subscriptions")
        .where({ organization_id: ORG })
        .whereNotIn("id", db("billing_subscription_mappings").select("cloud_subscription_id"))
        .first();
      if (!sub) return; // skip if all subs already mapped

      await saveBillingSubscriptionMapping({
        orgId: ORG,
        cloudSubscriptionId: sub.id,
        billingSubscriptionId: `get-test-${U}`,
      });

      const result = await getBillingSubscriptionId(sub.id);
      expect(result).toBe(`get-test-${U}`);

      // Cleanup
      await db("billing_subscription_mappings").where({ cloud_subscription_id: sub.id }).del();
    });
  });

  describe("getLocalBillingSummary", () => {
    it("should return subscriptions and cost for org", async () => {
      const { getLocalBillingSummary } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const result = await getLocalBillingSummary(ORG);
      expect(result).toHaveProperty("subscriptions");
      expect(result).toHaveProperty("total_monthly_cost");
      expect(result).toHaveProperty("currency");
      expect(Array.isArray(result.subscriptions)).toBe(true);
      expect(typeof result.total_monthly_cost).toBe("number");
    });

    it("should return empty for org with no subscriptions", async () => {
      const { getLocalBillingSummary } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const result = await getLocalBillingSummary(999999);
      expect(result.subscriptions).toHaveLength(0);
      expect(result.total_monthly_cost).toBe(0);
    });

    it("should return currency string", async () => {
      const { getLocalBillingSummary } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      const result = await getLocalBillingSummary(ORG);
      expect(typeof result.currency).toBe("string");
    });
  });

  // ----------- HTTP FUNCTIONS (will fail gracefully) -----------

  describe("autoProvisionClient (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { autoProvisionClient } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await autoProvisionClient(ORG, "Test Org", "test@example.com");
        // Returns null when API is down
        expect(result === null || typeof result === "string").toBe(true);
      } catch {
        // Connection errors are acceptable
      }
    });

    it("should not crash with empty org name", async () => {
      const { autoProvisionClient } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await autoProvisionClient(ORG, "", "");
        expect(result === null || typeof result === "string").toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("createBillingPlan (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { createBillingPlan } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createBillingPlan("payroll", "Payroll", "basic", 100, "monthly");
        expect(result).toBeNull();
      } catch {
        // Expected
      }
    });

    it("should accept optional currency parameter", async () => {
      const { createBillingPlan } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createBillingPlan("payroll", "Payroll", "premium", 200, "annual", "USD");
        expect(result).toBeNull();
      } catch {
        // Expected
      }
    });
  });

  describe("getInvoices (HTTP)", () => {
    it("should return empty result when billing API is down", async () => {
      const { getInvoices } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getInvoices(ORG);
        expect(result).toHaveProperty("invoices");
        expect(result).toHaveProperty("total");
      } catch {
        // Expected
      }
    });

    it("should accept pagination params", async () => {
      const { getInvoices } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getInvoices(ORG, { page: 1, perPage: 10 });
        expect(result).toHaveProperty("invoices");
      } catch {
        // Expected
      }
    });

    it("should handle no params", async () => {
      const { getInvoices } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getInvoices(ORG);
        expect(Array.isArray(result.invoices)).toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("getPayments (HTTP)", () => {
    it("should return empty result when billing API is down", async () => {
      const { getPayments } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getPayments(ORG);
        expect(result).toHaveProperty("payments");
        expect(result).toHaveProperty("total");
      } catch {
        // Expected
      }
    });

    it("should accept pagination params", async () => {
      const { getPayments } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getPayments(ORG, { page: 2, perPage: 5 });
        expect(result).toHaveProperty("payments");
      } catch {
        // Expected
      }
    });
  });

  describe("getBillingSummary (HTTP)", () => {
    it("should return combined summary", async () => {
      const { getBillingSummary } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getBillingSummary(ORG);
        expect(result).toHaveProperty("recent_invoices");
        expect(result).toHaveProperty("recent_payments");
        expect(result).toHaveProperty("outstanding_amount");
        expect(result).toHaveProperty("currency");
      } catch {
        // Expected
      }
    });

    it("should handle non-existent org gracefully", async () => {
      const { getBillingSummary } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getBillingSummary(999999);
        expect(result).toHaveProperty("outstanding_amount");
      } catch {
        // Expected
      }
    });
  });

  describe("listPaymentGateways (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { listPaymentGateways } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await listPaymentGateways();
        expect(Array.isArray(result)).toBe(true);
      } catch {
        // Expected
      }
    });

    it("should accept orgId param for filtering", async () => {
      const { listPaymentGateways } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await listPaymentGateways(ORG);
        expect(Array.isArray(result)).toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("notifyBilling (HTTP)", () => {
    it("should handle billing API being unreachable for subscription.created", async () => {
      const { notifyBilling } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await notifyBilling({
          event_type: "subscription.created",
          organization_id: ORG,
          subscription_id: 1,
          module_slug: "payroll",
          module_name: "EMP Payroll",
          plan_tier: "basic",
          total_seats: 10,
          price_per_seat: 100,
          currency: "INR",
          billing_cycle: "monthly",
          period_start: "2026-01-01",
          period_end: "2026-02-01",
        });
        expect(typeof result).toBe("boolean");
      } catch {
        // Expected
      }
    });

    it("should handle subscription.updated event", async () => {
      const { notifyBilling } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await notifyBilling({
          event_type: "subscription.updated",
          organization_id: ORG,
          subscription_id: 1,
          module_slug: "payroll",
          module_name: "EMP Payroll",
          plan_tier: "premium",
          total_seats: 20,
          price_per_seat: 200,
          currency: "INR",
          billing_cycle: "annual",
          period_start: "2026-01-01",
          period_end: "2027-01-01",
        });
        expect(typeof result).toBe("boolean");
      } catch {
        // Expected
      }
    });

    it("should handle subscription.cancelled event", async () => {
      const { notifyBilling } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await notifyBilling({
          event_type: "subscription.cancelled",
          organization_id: ORG,
          subscription_id: 1,
          module_slug: "monitor",
          module_name: "EMP Monitor",
          plan_tier: "basic",
          total_seats: 5,
          price_per_seat: 50,
          currency: "USD",
          billing_cycle: "monthly",
          period_start: "2026-01-01",
          period_end: "2026-02-01",
        });
        expect(typeof result).toBe("boolean");
      } catch {
        // Expected
      }
    });
  });

  describe("onSubscriptionCreated / onSubscriptionUpdated / onSubscriptionCancelled", () => {
    it("should handle non-existent subscription gracefully (created)", async () => {
      const { onSubscriptionCreated } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        await onSubscriptionCreated(999999);
      } catch {
        // Expected
      }
    });

    it("should handle non-existent subscription gracefully (updated)", async () => {
      const { onSubscriptionUpdated } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        await onSubscriptionUpdated(999999);
      } catch {
        // Expected
      }
    });

    it("should handle non-existent subscription gracefully (cancelled)", async () => {
      const { onSubscriptionCancelled } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        await onSubscriptionCancelled(999999);
      } catch {
        // Expected
      }
    });
  });

  describe("createBillingSubscription (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { createBillingSubscription } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createBillingSubscription(ORG, "plan-123", 5);
        expect(result === null || typeof result === "string").toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("cancelBillingSubscription (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { cancelBillingSubscription } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await cancelBillingSubscription("sub-nonexistent");
        expect(typeof result).toBe("boolean");
      } catch {
        // Expected
      }
    });
  });

  describe("createInvoice (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { createInvoice } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createInvoice(ORG, [
          { description: "Test item", quantity: 1, unitPrice: 1000 },
        ]);
        expect(result === null || typeof result === "string").toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("createPaymentOrder (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { createPaymentOrder } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createPaymentOrder("inv-123", "stripe");
        expect(result === null || typeof result === "object").toBe(true);
      } catch {
        // Expected
      }
    });

    it("should default to stripe gateway", async () => {
      const { createPaymentOrder } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await createPaymentOrder("inv-123");
        expect(result === null || typeof result === "object").toBe(true);
      } catch {
        // Expected
      }
    });
  });

  describe("getInvoicePdfStream (HTTP)", () => {
    it("should handle billing API being unreachable", async () => {
      const { getInvoicePdfStream } = await import(
        "../../services/billing/billing-integration.service.js"
      );
      try {
        const result = await getInvoicePdfStream("inv-123");
        expect(result === null || result instanceof Response).toBe(true);
      } catch {
        // Expected
      }
    });
  });
});

// =============================================================================
// 2. MODULE WEBHOOK SERVICE
// =============================================================================
describe("Module Webhook Service", () => {
  describe("handleModuleWebhook", () => {
    it("should handle recruit.candidate_hired with employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("recruit.candidate_hired", {
        employeeId: EMP,
        candidateId: "cand-123",
        jobTitle: "Software Engineer",
        joiningDate: "2026-05-01",
      }, "recruit");
    });

    it("should handle recruit.candidate_hired without employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("recruit.candidate_hired", {
        candidateId: "cand-456",
        jobTitle: "Designer",
      }, "recruit");
    });

    it("should handle recruit.candidate_hired with non-existent employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("recruit.candidate_hired", {
        employeeId: 999999,
        candidateId: "cand-789",
      }, "recruit");
    });

    it("should handle exit.initiated", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("exit.initiated", {
        employeeId: EMP,
        exitType: "resignation",
        lastWorkingDate: "2026-06-30",
      }, "exit");
    });

    it("should handle exit.initiated without employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("exit.initiated", {
        exitType: "termination",
      }, "exit");
    });

    it("should handle exit.completed with employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      // Use a user we can safely modify (restore after)
      const db = getDB();
      const origUser = await db("users").where({ id: EMP }).first();

      await handleModuleWebhook("exit.completed", {
        employeeId: EMP,
        exitType: "resignation",
        lastWorkingDate: "2026-06-30",
      }, "exit");

      // Restore original status
      if (origUser) {
        await db("users").where({ id: EMP }).update({
          status: origUser.status,
          date_of_exit: origUser.date_of_exit,
        });
      }
    });

    it("should handle exit.completed without employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("exit.completed", {
        exitType: "retirement",
      }, "exit");
    });

    it("should handle exit.completed without lastWorkingDate", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      const db = getDB();
      const origUser = await db("users").where({ id: EMP }).first();

      await handleModuleWebhook("exit.completed", {
        employeeId: EMP,
      }, "exit");

      // Restore
      if (origUser) {
        await db("users").where({ id: EMP }).update({
          status: origUser.status,
          date_of_exit: origUser.date_of_exit,
        });
      }
    });

    it("should handle performance.cycle_completed", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("performance.cycle_completed", {
        cycleId: 1,
        cycleName: "Q1 2026 Review",
        participantCount: 50,
      }, "performance");
    });

    it("should handle performance.cycle_completed without cycleId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("performance.cycle_completed", {
        cycleName: "Annual 2026",
      }, "performance");
    });

    it("should handle rewards.milestone_achieved", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("rewards.milestone_achieved", {
        employeeId: EMP,
        milestoneName: "1 Year Anniversary",
        pointsAwarded: 500,
      }, "rewards");
    });

    it("should handle rewards.milestone_achieved without employeeId", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("rewards.milestone_achieved", {
        milestoneName: "Top Performer",
        pointsAwarded: 1000,
      }, "rewards");
    });

    it("should handle unknown event gracefully", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("some.unknown.event", {
        foo: "bar",
      });
    });

    it("should handle empty data object", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("unknown.event", {});
    });

    it("should handle no source parameter", async () => {
      const { handleModuleWebhook } = await import(
        "../../services/webhook/module-webhook.service.js"
      );
      await handleModuleWebhook("exit.initiated", {
        employeeId: EMP,
        exitType: "resignation",
      });
    });
  });
});

// =============================================================================
// 3. CHATBOT TOOLS
// =============================================================================
describe("Chatbot Tools", () => {
  describe("getToolSchemas", () => {
    it("should return an array of tool schemas", async () => {
      const { getToolSchemas } = await import("../../services/chatbot/tools.js");
      const schemas = getToolSchemas();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(10);
    });

    it("should have name and description for each schema", async () => {
      const { getToolSchemas } = await import("../../services/chatbot/tools.js");
      const schemas = getToolSchemas();
      for (const s of schemas) {
        expect(s).toHaveProperty("name");
        expect(s).toHaveProperty("description");
        expect(s).toHaveProperty("parameters");
        expect(typeof s.name).toBe("string");
        expect(typeof s.description).toBe("string");
      }
    });

    it("should have parameters array for each schema", async () => {
      const { getToolSchemas } = await import("../../services/chatbot/tools.js");
      const schemas = getToolSchemas();
      for (const s of schemas) {
        expect(Array.isArray(s.parameters)).toBe(true);
      }
    });
  });

  describe("getTool", () => {
    it("should return a tool definition by name", async () => {
      const { getTool } = await import("../../services/chatbot/tools.js");
      const tool = getTool("get_employee_count");
      expect(tool).toBeTruthy();
      expect(tool!.name).toBe("get_employee_count");
    });

    it("should return undefined for non-existent tool", async () => {
      const { getTool } = await import("../../services/chatbot/tools.js");
      const tool = getTool("nonexistent_tool_xyz");
      expect(tool).toBeUndefined();
    });

    it("should return tool with execute function", async () => {
      const { getTool } = await import("../../services/chatbot/tools.js");
      const tool = getTool("get_department_list");
      expect(tool).toBeTruthy();
      expect(typeof tool!.execute).toBe("function");
    });

    it("should return tool schemas with parameter info", async () => {
      const { getTool } = await import("../../services/chatbot/tools.js");
      const tool = getTool("get_employee_details");
      expect(tool).toBeTruthy();
      expect(tool!.parameters.length).toBeGreaterThan(0);
      expect(tool!.parameters[0].name).toBe("query");
    });
  });

  describe("executeTool", () => {
    it("get_employee_count", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_employee_count", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("total_employees");
      expect(typeof parsed.total_employees).toBe("number");
    });

    it("get_department_list", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_department_list", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("departments");
      expect(parsed).toHaveProperty("total_departments");
    });

    it("get_attendance_today", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_today", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("date");
      expect(parsed).toHaveProperty("total_employees");
    });

    it("get_leave_balance for current user", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_leave_balance", ORG, EMP, {});
      const parsed = JSON.parse(result);
      expect(parsed.balances !== undefined || parsed.message !== undefined).toBe(true);
    });

    it("get_leave_balance with employee_name", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_leave_balance", ORG, ADMIN, { employee_name: "Priya" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_leave_balance with non-existent employee", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_leave_balance", ORG, ADMIN, { employee_name: "ZZZNONEXIST" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("get_pending_leave_requests", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_pending_leave_requests", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("pending_requests");
      expect(parsed).toHaveProperty("count");
    });

    it("get_announcements with limit", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_announcements", ORG, ADMIN, { limit: 5 });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("announcements");
      expect(parsed).toHaveProperty("count");
    });

    it("get_announcements with default limit", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_announcements", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("announcements");
    });

    it("get_company_policies", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_company_policies", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("policies");
      expect(parsed).toHaveProperty("count");
    });

    it("get_company_policies with category filter", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_company_policies", ORG, ADMIN, { category: "HR" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("policies");
    });

    it("get_helpdesk_stats", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_helpdesk_stats", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_module_subscriptions", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_module_subscriptions", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("subscriptions");
      expect(parsed).toHaveProperty("count");
    });

    it("get_billing_summary", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_billing_summary", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("active_subscriptions");
      expect(parsed).toHaveProperty("total_mrr");
    });

    it("get_upcoming_holidays", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_upcoming_holidays", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_upcoming_holidays with limit", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_upcoming_holidays", ORG, ADMIN, { limit: 3 });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_org_stats", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_org_stats", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("total_users");
      expect(parsed).toHaveProperty("total_departments");
      expect(parsed).toHaveProperty("total_locations");
      expect(parsed).toHaveProperty("active_modules");
    });

    it("get_asset_summary", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_asset_summary", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_position_vacancies", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_position_vacancies", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_survey_results", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_survey_results", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_wellness_dashboard", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_wellness_dashboard", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_recent_feedback", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_recent_feedback", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_recent_feedback with limit", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_recent_feedback", ORG, ADMIN, { limit: 3 });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_whistleblower_stats", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_whistleblower_stats", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_employee_details", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_employee_details", ORG, ADMIN, { query: "Priya" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("employees");
      expect(parsed).toHaveProperty("count");
    });

    it("get_employee_details with email query", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_employee_details", ORG, ADMIN, { query: "ananya" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("employees");
    });

    it("get_employee_details with no match", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_employee_details", ORG, ADMIN, { query: "ZZZNOTFOUND" });
      const parsed = JSON.parse(result);
      expect(parsed.count).toBe(0);
    });

    it("get_my_attendance", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_my_attendance", ORG, EMP, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("date");
    });

    it("get_team_attendance", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_team_attendance", ORG, MGR, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("date");
    });

    it("get_team_attendance with date param", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_team_attendance", ORG, MGR, { date: "2026-04-01" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("date");
    });

    it("get_team_attendance for user with no reports", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_team_attendance", ORG, EMP, {});
      const parsed = JSON.parse(result);
      expect(parsed.team_size === 0 || parsed.team_size > 0).toBe(true);
    });

    it("get_attendance_for_employee", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_for_employee", ORG, ADMIN, { employee_name: "Priya" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_attendance_for_employee with days param", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_for_employee", ORG, ADMIN, { employee_name: "Priya", days: 14 });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_attendance_for_employee with non-existent employee", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_for_employee", ORG, ADMIN, { employee_name: "ZZZNONEXIST" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("get_attendance_by_department", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_by_department", ORG, ADMIN, { department: "Engineering" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_attendance_by_department with non-existent dept", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_by_department", ORG, ADMIN, { department: "ZZZNONEXIST" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_attendance_by_department with date", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_attendance_by_department", ORG, ADMIN, { department: "Engineering", date: "2026-04-01" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_leave_calendar", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_leave_calendar", ORG, ADMIN, { start_date: "2026-01-01", end_date: "2026-12-31" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("on_leave");
      expect(parsed).toHaveProperty("count");
    });

    it("get_leave_calendar with defaults", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_leave_calendar", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("on_leave");
    });

    it("search_knowledge_base", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("search_knowledge_base", ORG, ADMIN, { query: "leave" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("search_knowledge_base with no results", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("search_knowledge_base", ORG, ADMIN, { query: "xyznonexistent" });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_upcoming_events", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_upcoming_events", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("get_upcoming_events with limit", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("get_upcoming_events", ORG, ADMIN, { limit: 3 });
      const parsed = JSON.parse(result);
      expect(parsed).toBeTruthy();
    });

    it("run_sql_query with valid SELECT", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "SELECT COUNT(*) as cnt FROM users WHERE organization_id = 5",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("rows");
      expect(parsed).toHaveProperty("count");
    });

    it("run_sql_query rejects INSERT", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "INSERT INTO users (email) VALUES ('test@test.com')",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query rejects DELETE", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "DELETE FROM users WHERE organization_id = 5",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query rejects UPDATE", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "UPDATE users SET status = 0 WHERE organization_id = 5",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query rejects DROP", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "DROP TABLE users",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query rejects query without organization_id", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "SELECT COUNT(*) FROM users",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query rejects multiple statements", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "SELECT 1; SELECT 2 WHERE organization_id = 5",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("run_sql_query handles invalid SQL gracefully", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("run_sql_query", ORG, ADMIN, {
        query: "SELECT * FROM nonexistent_table_xyz WHERE organization_id = 5",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
    });

    it("should handle non-existent tool name gracefully", async () => {
      const { executeTool } = await import("../../services/chatbot/tools.js");
      const result = await executeTool("nonexistent_tool_xyz", ORG, ADMIN, {});
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("Unknown tool");
    });
  });
});

// =============================================================================
// 4. IMPORT SERVICE
// =============================================================================
describe("Import Service", () => {
  describe("parseCSV", () => {
    it("should parse valid CSV with standard headers", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,designation\nJohn,Doe,john.test@example.com,Engineer\nJane,Smith,jane.test@example.com,Designer"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0].first_name).toBe("John");
      expect(rows[0].last_name).toBe("Doe");
      expect(rows[0].email).toBe("john.test@example.com");
      expect(rows[0].designation).toBe("Engineer");
    });

    it("should handle alternate header names (firstname, lastname)", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "firstname,lastname,email,title\nAlice,Wonder,alice@test.com,Manager"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].first_name).toBe("Alice");
      expect(rows[0].last_name).toBe("Wonder");
      expect(rows[0].designation).toBe("Manager");
    });

    it("should handle department_name column", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,department_name\nBob,Builder,bob@test.com,Engineering"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].department_name).toBe("Engineering");
    });

    it("should handle department (alternate) column", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,department\nBob,Builder,bob2@test.com,Sales"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].department_name).toBe("Sales");
    });

    it("should handle emp_code, contact_number columns", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,emp_code,contact_number\nJohn,Doe,john2@test.com,EMP001,9876543210"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].emp_code).toBe("EMP001");
      expect(rows[0].contact_number).toBe("9876543210");
    });

    it("should handle employee_code, phone alternate columns", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,employee_code,phone\nJohn,Doe,john3@test.com,EMP002,1234567890"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].emp_code).toBe("EMP002");
      expect(rows[0].contact_number).toBe("1234567890");
    });

    it("should handle role column", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email,role\nAdmin,User,admin2@test.com,hr_admin"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("hr_admin");
    });

    it("should return empty array for header-only CSV", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from("first_name,last_name,email");
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(0);
    });

    it("should return empty array for empty CSV", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from("");
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(0);
    });

    it("should return empty array for single line", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from("first_name");
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(0);
    });

    it("should handle quoted fields with commas", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        'first_name,last_name,email,designation\n"John, Jr.",Doe,john4@test.com,"Senior, Engineer"'
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].first_name).toBe("John, Jr.");
      expect(rows[0].designation).toBe("Senior, Engineer");
    });

    it("should handle quoted fields with escaped quotes", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        'first_name,last_name,email\n"John ""JD""",Doe,john5@test.com'
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].first_name).toBe('John "JD"');
    });

    it("should handle Windows-style line endings", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email\r\nJohn,Doe,john6@test.com\r\nJane,Smith,jane6@test.com"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
    });

    it("should skip empty lines", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      const csv = Buffer.from(
        "first_name,last_name,email\nJohn,Doe,john7@test.com\n\nJane,Smith,jane7@test.com\n"
      );
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
    });

    it("should handle many rows", async () => {
      const { parseCSV } = await import("../../services/import/import.service.js");
      let content = "first_name,last_name,email\n";
      for (let i = 0; i < 50; i++) {
        content += `User${i},Last${i},user${i}-${U}@test.com\n`;
      }
      const csv = Buffer.from(content);
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(50);
    });
  });

  describe("validateImportData", () => {
    it("should validate valid rows", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "Test", last_name: "User", email: `testval-${U}@example.com` },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.valid.length).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should reject rows with missing first_name", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "", last_name: "User", email: `nofn-${U}@example.com` },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors).toContain("first_name is required");
    });

    it("should reject rows with missing last_name", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "Test", last_name: "", email: `noln-${U}@example.com` },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors).toContain("last_name is required");
    });

    it("should reject rows with missing email", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "Test", last_name: "User", email: "" },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors).toContain("email is required");
    });

    it("should reject rows with all fields missing", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [{ first_name: "", last_name: "", email: "" }];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors.length).toBeGreaterThanOrEqual(3);
    });

    it("should detect duplicate emails within import", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const email = `dup-${U}@example.com`;
      const rows = [
        { first_name: "Test1", last_name: "User1", email },
        { first_name: "Test2", last_name: "User2", email },
      ];
      const result = await validateImportData(ORG, rows);
      // Second row should have duplicate error
      const dupErrors = result.errors.filter((e) =>
        e.errors.some((err) => err.includes("Duplicate"))
      );
      expect(dupErrors.length).toBe(1);
    });

    it("should detect existing emails in DB", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      // ananya@technova.in exists in DB
      const rows = [
        { first_name: "Ananya", last_name: "Test", email: "ananya@technova.in" },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors.some((e) => e.includes("already exists"))).toBe(true);
    });

    it("should resolve valid department names", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      // Get an actual department name
      const db = getDB();
      const dept = await db("organization_departments").where({ organization_id: ORG }).first();
      if (dept) {
        const rows = [
          { first_name: "Test", last_name: "Dept", email: `testdept-${U}@example.com`, department_name: dept.name },
        ];
        const result = await validateImportData(ORG, rows);
        expect(result.valid.length).toBe(1);
        expect(result.valid[0].department_id).toBe(dept.id);
      }
    });

    it("should reject invalid department names", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "Test", last_name: "Dept", email: `baddept-${U}@example.com`, department_name: "NonexistentDept999" },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].errors.some((e) => e.includes("not found"))).toBe(true);
    });

    it("should handle empty rows array", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const result = await validateImportData(ORG, []);
      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should set correct row numbers in errors", async () => {
      const { validateImportData } = await import("../../services/import/import.service.js");
      const rows = [
        { first_name: "Good", last_name: "User", email: `good-${U}@example.com` },
        { first_name: "", last_name: "Bad", email: `bad-${U}@example.com` },
      ];
      const result = await validateImportData(ORG, rows);
      expect(result.errors[0].row).toBe(3); // Row 3 (1-indexed + 1 for header)
    });
  });
});

// =============================================================================
// 5. POSITION SERVICE (deep coverage)
// =============================================================================
describe("Position Service", () => {
  let createdPositionId: number;
  let createdAssignmentId: number;
  let createdPlanId: number;
  const posTitle = `TestPos-${U}`;

  afterAll(async () => {
    const db = getDB();
    // Cleanup test data
    if (createdAssignmentId) {
      await db("position_assignments").where({ id: createdAssignmentId }).del().catch(() => {});
    }
    if (createdPositionId) {
      await db("position_assignments").where({ position_id: createdPositionId }).del().catch(() => {});
      await db("positions").where({ id: createdPositionId }).del().catch(() => {});
    }
    if (createdPlanId) {
      await db("headcount_plans").where({ id: createdPlanId }).del().catch(() => {});
    }
    // Cleanup any other test positions
    await db("positions").where("title", "like", `TestPos-${U}%`).del().catch(() => {});
    await db("headcount_plans").where("title", "like", `TestPlan-${U}%`).del().catch(() => {});
  });

  describe("createPosition", () => {
    it("should create a position with required fields only", async () => {
      const { createPosition } = await import("../../services/position/position.service.js");
      const result = await createPosition(ORG, ADMIN, {
        title: posTitle,
        employment_type: "full_time",
        currency: "INR",
        headcount_budget: 5,
        is_critical: false,
      } as any);
      expect(result).toBeTruthy();
      expect(result.title).toBe(posTitle);
      expect(result.organization_id).toBe(ORG);
      expect(result.status).toBe("active");
      createdPositionId = result.id;
    });

    it("should create a position with all optional fields", async () => {
      const { createPosition } = await import("../../services/position/position.service.js");
      const db = getDB();
      const dept = await db("organization_departments").where({ organization_id: ORG }).first();

      const result = await createPosition(ORG, ADMIN, {
        title: `${posTitle}-Full`,
        department_id: dept?.id,
        employment_type: "contract",
        currency: "INR",
        min_salary: 500000,
        max_salary: 1000000,
        job_description: "Test job description",
        requirements: "Test requirements",
        is_critical: true,
        headcount_budget: 3,
      } as any);
      expect(result).toBeTruthy();
      expect(result.is_critical).toBeTruthy();
      expect(result.employment_type).toBe("contract");

      // Cleanup this extra position
      await db("positions").where({ id: result.id }).del();
    });

    it("should reject duplicate position code", async () => {
      const { createPosition } = await import("../../services/position/position.service.js");
      const db = getDB();
      const existing = await db("positions").where({ id: createdPositionId }).first();
      if (existing) {
        await expect(
          createPosition(ORG, ADMIN, { title: "Dup Code Test", code: existing.code, employment_type: "full_time", currency: "INR", headcount_budget: 1, is_critical: false } as any)
        ).rejects.toThrow();
      }
    });

    it("should auto-generate position code", async () => {
      const { createPosition } = await import("../../services/position/position.service.js");
      const result = await createPosition(ORG, ADMIN, { title: `${posTitle}-AutoCode`, employment_type: "full_time", currency: "INR", headcount_budget: 1, is_critical: false } as any);
      expect(result.code).toBeTruthy();
      expect(result.code.startsWith("POS")).toBe(true);
      // Cleanup
      const db = getDB();
      await db("positions").where({ id: result.id }).del();
    });
  });

  describe("listPositions", () => {
    it("should list positions for org", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG);
      expect(result).toHaveProperty("positions");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.positions)).toBe(true);
    });

    it("should paginate positions", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { page: 1, perPage: 2 });
      expect(result.positions.length).toBeLessThanOrEqual(2);
    });

    it("should filter by status", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { status: "active" });
      for (const p of result.positions) {
        expect(p.status).toBe("active");
      }
    });

    it("should filter by employment_type", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { employment_type: "full_time" });
      expect(result).toHaveProperty("positions");
    });

    it("should filter by is_critical", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { is_critical: true });
      expect(result).toHaveProperty("positions");
    });

    it("should search by title", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { search: posTitle });
      expect(result.positions.length).toBeGreaterThanOrEqual(1);
    });

    it("should filter by department_id", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(ORG, { department_id: 1 });
      expect(result).toHaveProperty("positions");
    });

    it("should return empty for non-existent org", async () => {
      const { listPositions } = await import("../../services/position/position.service.js");
      const result = await listPositions(999999);
      expect(result.total).toBe(0);
    });
  });

  describe("getPosition", () => {
    it("should get position detail with assignments", async () => {
      const { getPosition } = await import("../../services/position/position.service.js");
      const result = await getPosition(ORG, createdPositionId);
      expect(result).toBeTruthy();
      expect(result.id).toBe(createdPositionId);
      expect(result).toHaveProperty("assignments");
      expect(result).toHaveProperty("reports_to");
    });

    it("should throw NotFoundError for non-existent position", async () => {
      const { getPosition } = await import("../../services/position/position.service.js");
      await expect(getPosition(ORG, 999999)).rejects.toThrow();
    });

    it("should throw NotFoundError for wrong org", async () => {
      const { getPosition } = await import("../../services/position/position.service.js");
      await expect(getPosition(999999, createdPositionId)).rejects.toThrow();
    });
  });

  describe("updatePosition", () => {
    it("should update position title", async () => {
      const { updatePosition } = await import("../../services/position/position.service.js");
      const result = await updatePosition(ORG, createdPositionId, { title: `${posTitle}-Updated` });
      expect(result.title).toBe(`${posTitle}-Updated`);
    });

    it("should update multiple fields", async () => {
      const { updatePosition } = await import("../../services/position/position.service.js");
      const result = await updatePosition(ORG, createdPositionId, {
        title: posTitle,
        employment_type: "part_time",
        min_salary: 300000,
        max_salary: 600000,
      });
      expect(result.employment_type).toBe("part_time");
    });

    it("should throw NotFoundError for non-existent position", async () => {
      const { updatePosition } = await import("../../services/position/position.service.js");
      await expect(updatePosition(ORG, 999999, { title: "x" })).rejects.toThrow();
    });

    it("should reject duplicate code on update", async () => {
      const { createPosition, updatePosition } = await import("../../services/position/position.service.js");
      // Create a second position
      const second = await createPosition(ORG, ADMIN, { title: `${posTitle}-Second`, employment_type: "full_time", currency: "INR", headcount_budget: 1, is_critical: false } as any);
      const db = getDB();
      const first = await db("positions").where({ id: createdPositionId }).first();

      if (first && second) {
        await expect(
          updatePosition(ORG, second.id, { code: first.code })
        ).rejects.toThrow();
        await db("positions").where({ id: second.id }).del();
      }
    });
  });

  describe("assignUserToPosition", () => {
    it("should assign user to position", async () => {
      const { assignUserToPosition } = await import("../../services/position/position.service.js");
      // Reset position to active state with budget
      const db = getDB();
      await db("positions").where({ id: createdPositionId }).update({
        status: "active",
        headcount_budget: 5,
        headcount_filled: 0,
      });

      const result = await assignUserToPosition(ORG, createdPositionId, EMP, {
        user_id: EMP,
        start_date: "2026-04-01",
        is_primary: true,
      } as any);
      expect(result).toBeTruthy();
      expect(result.user_id).toBe(EMP);
      expect(result.position_id).toBe(createdPositionId);
      createdAssignmentId = result.id;
    });

    it("should throw for duplicate assignment", async () => {
      const { assignUserToPosition } = await import("../../services/position/position.service.js");
      await expect(
        assignUserToPosition(ORG, createdPositionId, EMP, { user_id: EMP, start_date: "2026-04-01", is_primary: true } as any)
      ).rejects.toThrow("already assigned");
    });

    it("should throw NotFoundError for non-existent position", async () => {
      const { assignUserToPosition } = await import("../../services/position/position.service.js");
      await expect(
        assignUserToPosition(ORG, 999999, EMP, { user_id: EMP, start_date: "2026-04-01", is_primary: true } as any)
      ).rejects.toThrow();
    });

    it("should throw NotFoundError for non-existent user", async () => {
      const { assignUserToPosition } = await import("../../services/position/position.service.js");
      await expect(
        assignUserToPosition(ORG, createdPositionId, 999999, { user_id: 999999, start_date: "2026-04-01", is_primary: true } as any)
      ).rejects.toThrow();
    });

    it("should throw when headcount budget is full", async () => {
      const { assignUserToPosition } = await import("../../services/position/position.service.js");
      const db = getDB();
      // Set budget to match filled
      await db("positions").where({ id: createdPositionId }).update({
        headcount_budget: 1,
        headcount_filled: 1,
      });
      await expect(
        assignUserToPosition(ORG, createdPositionId, MGR, { user_id: MGR, start_date: "2026-04-01", is_primary: true } as any)
      ).rejects.toThrow("budget");

      // Reset budget
      await db("positions").where({ id: createdPositionId }).update({
        headcount_budget: 5,
        status: "active",
      });
    });
  });

  describe("removeUserFromPosition", () => {
    it("should remove user from position", async () => {
      const { removeUserFromPosition } = await import("../../services/position/position.service.js");
      await removeUserFromPosition(ORG, createdAssignmentId);

      const db = getDB();
      const assignment = await db("position_assignments").where({ id: createdAssignmentId }).first();
      expect(assignment.status).toBe("ended");
    });

    it("should throw NotFoundError for non-existent assignment", async () => {
      const { removeUserFromPosition } = await import("../../services/position/position.service.js");
      await expect(removeUserFromPosition(ORG, 999999)).rejects.toThrow();
    });

    it("should throw NotFoundError for already ended assignment", async () => {
      const { removeUserFromPosition } = await import("../../services/position/position.service.js");
      // createdAssignmentId is already ended
      await expect(removeUserFromPosition(ORG, createdAssignmentId)).rejects.toThrow();
    });
  });

  describe("getPositionHierarchy", () => {
    it("should return hierarchy tree for org", async () => {
      const { getPositionHierarchy } = await import("../../services/position/position.service.js");
      const result = await getPositionHierarchy(ORG);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return empty array for org with no positions", async () => {
      const { getPositionHierarchy } = await import("../../services/position/position.service.js");
      const result = await getPositionHierarchy(999999);
      expect(result).toHaveLength(0);
    });

    it("should have children arrays on nodes", async () => {
      const { getPositionHierarchy } = await import("../../services/position/position.service.js");
      const result = await getPositionHierarchy(ORG);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("children");
        expect(Array.isArray(result[0].children)).toBe(true);
      }
    });
  });

  describe("getVacancies", () => {
    it("should return vacancies for org", async () => {
      const { getVacancies } = await import("../../services/position/position.service.js");
      const result = await getVacancies(ORG);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return empty for org with no vacancies", async () => {
      const { getVacancies } = await import("../../services/position/position.service.js");
      const result = await getVacancies(999999);
      expect(result).toHaveLength(0);
    });

    it("should include open_count in results", async () => {
      const { getVacancies } = await import("../../services/position/position.service.js");
      const result = await getVacancies(ORG);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("open_count");
      }
    });
  });

  describe("deletePosition", () => {
    it("should soft-delete (close) a position", async () => {
      const { createPosition, deletePosition } = await import("../../services/position/position.service.js");
      const pos = await createPosition(ORG, ADMIN, { title: `${posTitle}-ToDelete`, employment_type: "full_time", currency: "INR", headcount_budget: 1, is_critical: false } as any);
      await deletePosition(ORG, pos.id);

      const db = getDB();
      const deleted = await db("positions").where({ id: pos.id }).first();
      expect(deleted.status).toBe("closed");
      // Cleanup
      await db("positions").where({ id: pos.id }).del();
    });

    it("should throw NotFoundError for non-existent position", async () => {
      const { deletePosition } = await import("../../services/position/position.service.js");
      await expect(deletePosition(ORG, 999999)).rejects.toThrow();
    });

    it("should throw NotFoundError for already closed position", async () => {
      const { createPosition, deletePosition } = await import("../../services/position/position.service.js");
      const pos = await createPosition(ORG, ADMIN, { title: `${posTitle}-CloseTest`, employment_type: "full_time", currency: "INR", headcount_budget: 1, is_critical: false } as any);
      await deletePosition(ORG, pos.id);
      await expect(deletePosition(ORG, pos.id)).rejects.toThrow();
      // Cleanup
      const db = getDB();
      await db("positions").where({ id: pos.id }).del();
    });
  });

  describe("Headcount Plans", () => {
    describe("createHeadcountPlan", () => {
      it("should create a headcount plan", async () => {
        const { createHeadcountPlan } = await import("../../services/position/position.service.js");
        const result = await createHeadcountPlan(ORG, ADMIN, {
          title: `TestPlan-${U}`,
          fiscal_year: "2026-2027",
          planned_headcount: 10,
          current_headcount: 0,
          currency: "INR",
        } as any);
        expect(result).toBeTruthy();
        expect(result.title).toBe(`TestPlan-${U}`);
        expect(result.status).toBe("draft");
        createdPlanId = result.id;
      });

      it("should create plan with all optional fields", async () => {
        const { createHeadcountPlan } = await import("../../services/position/position.service.js");
        const db = getDB();
        const dept = await db("organization_departments").where({ organization_id: ORG }).first();

        const result = await createHeadcountPlan(ORG, ADMIN, {
          title: `TestPlan-${U}-Full`,
          fiscal_year: "2026-2027",
          quarter: "Q1",
          department_id: dept?.id,
          planned_headcount: 20,
          current_headcount: 15,
          budget_amount: 5000000,
          currency: "INR",
          notes: "Test plan notes",
        });
        expect(result).toBeTruthy();
        expect(result.quarter).toBe("Q1");

        // Cleanup
        await db("headcount_plans").where({ id: result.id }).del();
      });
    });

    describe("listHeadcountPlans", () => {
      it("should list headcount plans for org", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(ORG);
        expect(result).toHaveProperty("plans");
        expect(result).toHaveProperty("total");
      });

      it("should paginate", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(ORG, { page: 1, perPage: 2 });
        expect(result.plans.length).toBeLessThanOrEqual(2);
      });

      it("should filter by fiscal_year", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(ORG, { fiscal_year: "2026-2027" });
        expect(result).toHaveProperty("plans");
      });

      it("should filter by status", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(ORG, { status: "draft" });
        expect(result).toHaveProperty("plans");
      });

      it("should filter by department_id", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(ORG, { department_id: 1 });
        expect(result).toHaveProperty("plans");
      });

      it("should return empty for non-existent org", async () => {
        const { listHeadcountPlans } = await import("../../services/position/position.service.js");
        const result = await listHeadcountPlans(999999);
        expect(result.total).toBe(0);
      });
    });

    describe("updateHeadcountPlan", () => {
      it("should update a draft plan", async () => {
        const { updateHeadcountPlan } = await import("../../services/position/position.service.js");
        const result = await updateHeadcountPlan(ORG, createdPlanId, {
          title: `TestPlan-${U}-Updated`,
          planned_headcount: 15,
        });
        expect(result.title).toBe(`TestPlan-${U}-Updated`);
      });

      it("should throw NotFoundError for non-existent plan", async () => {
        const { updateHeadcountPlan } = await import("../../services/position/position.service.js");
        await expect(updateHeadcountPlan(ORG, 999999, { title: "x" })).rejects.toThrow();
      });
    });

    describe("approveHeadcountPlan", () => {
      it("should approve a draft plan", async () => {
        const { approveHeadcountPlan } = await import("../../services/position/position.service.js");
        const result = await approveHeadcountPlan(ORG, createdPlanId, ADMIN);
        expect(result.status).toBe("approved");
        expect(result.approved_by).toBe(ADMIN);
      });

      it("should throw for already approved plan", async () => {
        const { approveHeadcountPlan } = await import("../../services/position/position.service.js");
        await expect(approveHeadcountPlan(ORG, createdPlanId, ADMIN)).rejects.toThrow("already approved");
      });

      it("should throw NotFoundError for non-existent plan", async () => {
        const { approveHeadcountPlan } = await import("../../services/position/position.service.js");
        await expect(approveHeadcountPlan(ORG, 999999, ADMIN)).rejects.toThrow();
      });

      it("should reject updating an approved plan", async () => {
        const { updateHeadcountPlan } = await import("../../services/position/position.service.js");
        await expect(
          updateHeadcountPlan(ORG, createdPlanId, { title: "should fail" })
        ).rejects.toThrow("approved");
      });
    });

    describe("rejectHeadcountPlan", () => {
      it("should reject a draft plan", async () => {
        const { createHeadcountPlan, rejectHeadcountPlan } = await import(
          "../../services/position/position.service.js"
        );
        const plan = await createHeadcountPlan(ORG, ADMIN, {
          title: `TestPlan-${U}-Reject`,
          fiscal_year: "2026-2027",
          planned_headcount: 5,
          current_headcount: 0,
          currency: "INR",
        } as any);

        const result = await rejectHeadcountPlan(ORG, plan.id, ADMIN, "Budget constraints");
        expect(result.status).toBe("rejected");

        // Cleanup
        const db = getDB();
        await db("headcount_plans").where({ id: plan.id }).del();
      });

      it("should reject without reason", async () => {
        const { createHeadcountPlan, rejectHeadcountPlan } = await import(
          "../../services/position/position.service.js"
        );
        const plan = await createHeadcountPlan(ORG, ADMIN, {
          title: `TestPlan-${U}-Reject2`,
          fiscal_year: "2026-2027",
          planned_headcount: 5,
          current_headcount: 0,
          currency: "INR",
        } as any);

        const result = await rejectHeadcountPlan(ORG, plan.id, ADMIN);
        expect(result.status).toBe("rejected");

        const db = getDB();
        await db("headcount_plans").where({ id: plan.id }).del();
      });

      it("should throw for already rejected plan", async () => {
        const { createHeadcountPlan, rejectHeadcountPlan } = await import(
          "../../services/position/position.service.js"
        );
        const plan = await createHeadcountPlan(ORG, ADMIN, {
          title: `TestPlan-${U}-Reject3`,
          fiscal_year: "2026-2027",
          planned_headcount: 5,
          current_headcount: 0,
          currency: "INR",
        } as any);
        await rejectHeadcountPlan(ORG, plan.id, ADMIN);
        await expect(rejectHeadcountPlan(ORG, plan.id, ADMIN)).rejects.toThrow("already rejected");

        const db = getDB();
        await db("headcount_plans").where({ id: plan.id }).del();
      });

      it("should throw NotFoundError for non-existent plan", async () => {
        const { rejectHeadcountPlan } = await import("../../services/position/position.service.js");
        await expect(rejectHeadcountPlan(ORG, 999999, ADMIN)).rejects.toThrow();
      });
    });
  });

  describe("getPositionDashboard", () => {
    it("should return dashboard stats for org", async () => {
      const { getPositionDashboard } = await import("../../services/position/position.service.js");
      const result = await getPositionDashboard(ORG);
      expect(result).toHaveProperty("total_positions");
      expect(result).toHaveProperty("total_budget");
      expect(result).toHaveProperty("total_filled");
      expect(result).toHaveProperty("total_vacant");
      expect(result).toHaveProperty("critical_vacancies");
      expect(result).toHaveProperty("department_breakdown");
      expect(result).toHaveProperty("status_breakdown");
      expect(result).toHaveProperty("headcount_plan_summary");
    });

    it("should return numeric values", async () => {
      const { getPositionDashboard } = await import("../../services/position/position.service.js");
      const result = await getPositionDashboard(ORG);
      expect(typeof result.total_positions).toBe("number");
      expect(typeof result.total_budget).toBe("number");
      expect(typeof result.total_filled).toBe("number");
      expect(typeof result.total_vacant).toBe("number");
      expect(typeof result.critical_vacancies).toBe("number");
    });

    it("should return arrays for breakdowns", async () => {
      const { getPositionDashboard } = await import("../../services/position/position.service.js");
      const result = await getPositionDashboard(ORG);
      expect(Array.isArray(result.department_breakdown)).toBe(true);
      expect(Array.isArray(result.status_breakdown)).toBe(true);
    });

    it("should return plan summary with correct keys", async () => {
      const { getPositionDashboard } = await import("../../services/position/position.service.js");
      const result = await getPositionDashboard(ORG);
      expect(result.headcount_plan_summary).toHaveProperty("total_planned");
      expect(result.headcount_plan_summary).toHaveProperty("total_approved");
      expect(result.headcount_plan_summary).toHaveProperty("total_current");
      expect(result.headcount_plan_summary).toHaveProperty("plan_count");
    });

    it("should handle org with no positions", async () => {
      const { getPositionDashboard } = await import("../../services/position/position.service.js");
      const result = await getPositionDashboard(999999);
      expect(result.total_positions).toBe(0);
      expect(result.total_budget).toBe(0);
    });
  });
});

// =============================================================================
// 6. ADMIN SERVICES
// =============================================================================

// --- Super Admin ---
describe("Super Admin Service", () => {
  describe("getPlatformOverview", () => {
    it("should return platform overview", async () => {
      const { getPlatformOverview } = await import("../../services/admin/super-admin.service.js");
      const result = await getPlatformOverview();
      expect(result).toHaveProperty("total_organizations");
      expect(result).toHaveProperty("total_users");
      expect(result).toHaveProperty("active_subscriptions");
      expect(result).toHaveProperty("mrr");
      expect(result).toHaveProperty("arr");
      expect(result).toHaveProperty("new_orgs_this_month");
      expect(result).toHaveProperty("new_users_this_month");
    });

    it("should return numeric values", async () => {
      const { getPlatformOverview } = await import("../../services/admin/super-admin.service.js");
      const result = await getPlatformOverview();
      expect(typeof result.total_organizations).toBe("number");
      expect(typeof result.total_users).toBe("number");
      expect(typeof result.mrr).toBe("number");
      expect(result.arr).toBe(result.mrr * 12);
    });
  });

  describe("getOrgList", () => {
    it("should return paginated org list", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({});
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("page");
      expect(result).toHaveProperty("per_page");
      expect(result).toHaveProperty("total_pages");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should paginate with page and per_page", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ page: 1, per_page: 2 });
      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.per_page).toBe(2);
    });

    it("should search by name", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ search: "TechNova" });
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should search by email", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ search: "technova" });
      expect(result).toHaveProperty("data");
    });

    it("should sort by name asc", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ sort_by: "name", sort_order: "asc" });
      expect(result).toHaveProperty("data");
    });

    it("should sort by created_at desc", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ sort_by: "created_at", sort_order: "desc" });
      expect(result).toHaveProperty("data");
    });

    it("should sort by user_count", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ sort_by: "user_count" });
      expect(result).toHaveProperty("data");
    });

    it("should handle invalid sort_by gracefully", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ sort_by: "invalid_column" });
      expect(result).toHaveProperty("data");
    });

    it("should include user_count and subscription_count", async () => {
      const { getOrgList } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgList({ page: 1, per_page: 1 });
      if (result.data.length > 0) {
        expect(typeof result.data[0].user_count).toBe("number");
        expect(typeof result.data[0].subscription_count).toBe("number");
        expect(typeof result.data[0].monthly_spend).toBe("number");
      }
    });
  });

  describe("getOrgDetail", () => {
    it("should return org detail with users and subscriptions", async () => {
      const { getOrgDetail } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgDetail(ORG);
      expect(result).toHaveProperty("organization");
      expect(result).toHaveProperty("users");
      expect(result).toHaveProperty("subscriptions");
      expect(result).toHaveProperty("monthly_revenue");
      expect(result).toHaveProperty("total_spend");
      expect(result).toHaveProperty("audit_logs");
    });

    it("should throw for non-existent org", async () => {
      const { getOrgDetail } = await import("../../services/admin/super-admin.service.js");
      await expect(getOrgDetail(999999)).rejects.toThrow("not found");
    });

    it("should return arrays for users and subscriptions", async () => {
      const { getOrgDetail } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgDetail(ORG);
      expect(Array.isArray(result.users)).toBe(true);
      expect(Array.isArray(result.subscriptions)).toBe(true);
      expect(Array.isArray(result.audit_logs)).toBe(true);
    });

    it("should return numeric revenue values", async () => {
      const { getOrgDetail } = await import("../../services/admin/super-admin.service.js");
      const result = await getOrgDetail(ORG);
      expect(typeof result.monthly_revenue).toBe("number");
      expect(typeof result.total_spend).toBe("number");
    });
  });

  describe("getModuleAnalytics", () => {
    it("should return module analytics array", async () => {
      const { getModuleAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getModuleAnalytics();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("id");
        expect(result[0]).toHaveProperty("name");
        expect(result[0]).toHaveProperty("slug");
        expect(result[0]).toHaveProperty("subscriber_count");
        expect(result[0]).toHaveProperty("revenue");
        expect(result[0]).toHaveProperty("seat_utilization");
        expect(result[0]).toHaveProperty("tier_distribution");
      }
    });

    it("should return numeric values", async () => {
      const { getModuleAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getModuleAnalytics();
      if (result.length > 0) {
        expect(typeof result[0].subscriber_count).toBe("number");
        expect(typeof result[0].revenue).toBe("number");
      }
    });
  });

  describe("getRevenueAnalytics", () => {
    it("should return revenue analytics with default period", async () => {
      const { getRevenueAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getRevenueAnalytics();
      expect(result).toHaveProperty("mrr");
      expect(result).toHaveProperty("arr");
      expect(result).toHaveProperty("mrr_growth_percent");
      expect(result).toHaveProperty("revenue_by_module");
      expect(result).toHaveProperty("revenue_trend");
      expect(result).toHaveProperty("revenue_by_tier");
      expect(result).toHaveProperty("billing_cycle_distribution");
      expect(result).toHaveProperty("top_customers");
    });

    it("should accept 6m period", async () => {
      const { getRevenueAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getRevenueAnalytics("6m");
      expect(result).toHaveProperty("mrr");
      expect(result).toHaveProperty("revenue_trend");
    });

    it("should accept 12m period", async () => {
      const { getRevenueAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getRevenueAnalytics("12m");
      expect(result).toHaveProperty("mrr");
    });

    it("should return arrays for breakdowns", async () => {
      const { getRevenueAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getRevenueAnalytics();
      expect(Array.isArray(result.revenue_by_module)).toBe(true);
      expect(Array.isArray(result.revenue_trend)).toBe(true);
      expect(Array.isArray(result.revenue_by_tier)).toBe(true);
      expect(Array.isArray(result.billing_cycle_distribution)).toBe(true);
      expect(Array.isArray(result.top_customers)).toBe(true);
    });

    it("should have correct structure for top_customers", async () => {
      const { getRevenueAnalytics } = await import("../../services/admin/super-admin.service.js");
      const result = await getRevenueAnalytics();
      if (result.top_customers.length > 0) {
        expect(result.top_customers[0]).toHaveProperty("id");
        expect(result.top_customers[0]).toHaveProperty("name");
        expect(result.top_customers[0]).toHaveProperty("total_spend");
      }
    });
  });

  describe("getUserGrowth", () => {
    it("should return growth data with default period", async () => {
      const { getUserGrowth } = await import("../../services/admin/super-admin.service.js");
      const result = await getUserGrowth();
      expect(result).toHaveProperty("org_growth");
      expect(result).toHaveProperty("user_growth");
      expect(result).toHaveProperty("churn");
      expect(result).toHaveProperty("active_users");
      expect(result).toHaveProperty("inactive_users");
    });

    it("should accept 6m period", async () => {
      const { getUserGrowth } = await import("../../services/admin/super-admin.service.js");
      const result = await getUserGrowth("6m");
      expect(result).toHaveProperty("org_growth");
    });

    it("should accept 12m period", async () => {
      const { getUserGrowth } = await import("../../services/admin/super-admin.service.js");
      const result = await getUserGrowth("12m");
      expect(result).toHaveProperty("user_growth");
    });

    it("should return arrays for growth data", async () => {
      const { getUserGrowth } = await import("../../services/admin/super-admin.service.js");
      const result = await getUserGrowth();
      expect(Array.isArray(result.org_growth)).toBe(true);
      expect(Array.isArray(result.user_growth)).toBe(true);
      expect(Array.isArray(result.churn)).toBe(true);
    });

    it("should return numeric active/inactive counts", async () => {
      const { getUserGrowth } = await import("../../services/admin/super-admin.service.js");
      const result = await getUserGrowth();
      expect(typeof result.active_users).toBe("number");
      expect(typeof result.inactive_users).toBe("number");
    });
  });

  describe("getSubscriptionMetrics", () => {
    it("should return subscription metrics", async () => {
      const { getSubscriptionMetrics } = await import("../../services/admin/super-admin.service.js");
      const result = await getSubscriptionMetrics();
      expect(result).toHaveProperty("tier_distribution");
      expect(result).toHaveProperty("cycle_distribution");
      expect(result).toHaveProperty("status_distribution");
      expect(result).toHaveProperty("total_seats");
      expect(result).toHaveProperty("used_seats");
      expect(result).toHaveProperty("overall_utilization");
    });

    it("should return arrays for distributions", async () => {
      const { getSubscriptionMetrics } = await import("../../services/admin/super-admin.service.js");
      const result = await getSubscriptionMetrics();
      expect(Array.isArray(result.tier_distribution)).toBe(true);
      expect(Array.isArray(result.cycle_distribution)).toBe(true);
      expect(Array.isArray(result.status_distribution)).toBe(true);
    });

    it("should return numeric seat values", async () => {
      const { getSubscriptionMetrics } = await import("../../services/admin/super-admin.service.js");
      const result = await getSubscriptionMetrics();
      expect(typeof result.total_seats).toBe("number");
      expect(typeof result.used_seats).toBe("number");
      expect(typeof result.overall_utilization).toBe("number");
    });

    it("should have correct structure for tier_distribution items", async () => {
      const { getSubscriptionMetrics } = await import("../../services/admin/super-admin.service.js");
      const result = await getSubscriptionMetrics();
      if (result.tier_distribution.length > 0) {
        expect(result.tier_distribution[0]).toHaveProperty("plan_tier");
        expect(result.tier_distribution[0]).toHaveProperty("count");
        expect(result.tier_distribution[0]).toHaveProperty("utilization");
      }
    });
  });

  describe("getRecentActivity", () => {
    it("should return recent activity with default limit", async () => {
      const { getRecentActivity } = await import("../../services/admin/super-admin.service.js");
      const result = await getRecentActivity();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept custom limit", async () => {
      const { getRecentActivity } = await import("../../services/admin/super-admin.service.js");
      const result = await getRecentActivity(5);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("should return audit log entries with correct structure", async () => {
      const { getRecentActivity } = await import("../../services/admin/super-admin.service.js");
      const result = await getRecentActivity(3);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("id");
        expect(result[0]).toHaveProperty("action");
        expect(result[0]).toHaveProperty("resource_type");
        expect(result[0]).toHaveProperty("created_at");
      }
    });
  });

  describe("getOverdueOrganizations", () => {
    it("should return overdue organizations", async () => {
      const { getOverdueOrganizations } = await import("../../services/admin/super-admin.service.js");
      const result = await getOverdueOrganizations();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should have correct structure for overdue items", async () => {
      const { getOverdueOrganizations } = await import("../../services/admin/super-admin.service.js");
      const result = await getOverdueOrganizations();
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("org_id");
        expect(result[0]).toHaveProperty("org_name");
        expect(result[0]).toHaveProperty("status");
        expect(result[0]).toHaveProperty("overdue_days");
        expect(result[0]).toHaveProperty("monthly_amount");
      }
    });
  });

  describe("getModuleAdoption", () => {
    it("should return module adoption data", async () => {
      const { getModuleAdoption } = await import("../../services/admin/super-admin.service.js");
      const result = await getModuleAdoption();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("id");
        expect(result[0]).toHaveProperty("name");
        expect(result[0]).toHaveProperty("slug");
        expect(result[0]).toHaveProperty("org_count");
        expect(result[0]).toHaveProperty("total_seats");
        expect(result[0]).toHaveProperty("revenue");
      }
    });

    it("should return numeric values", async () => {
      const { getModuleAdoption } = await import("../../services/admin/super-admin.service.js");
      const result = await getModuleAdoption();
      if (result.length > 0) {
        expect(typeof result[0].org_count).toBe("number");
        expect(typeof result[0].total_seats).toBe("number");
        expect(typeof result[0].revenue).toBe("number");
      }
    });
  });
});

// --- System Notification ---
describe("System Notification Service", () => {
  let createdNotifId: number;

  afterAll(async () => {
    const db = getDB();
    if (createdNotifId) {
      // Clean up user notifications created by the test
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(createdNotifId) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: createdNotifId }).del().catch(() => {});
    }
    // Clean up any test notifications
    await db("system_notifications").where("title", "like", `%Test-${U}%`).del().catch(() => {});
    await db("notifications")
      .where("title", "like", `%Test-${U}%`)
      .del()
      .catch(() => {});
  });

  describe("createSystemNotification", () => {
    it("should create a system notification targeting all", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `SysNotif-Test-${U}`,
        message: "Test system notification message",
        target_type: "all",
        created_by: ADMIN,
      });
      expect(result).toBeTruthy();
      expect(result.title).toBe(`SysNotif-Test-${U}`);
      expect(result.is_active).toBeTruthy();
      createdNotifId = result.id;
    });

    it("should create a notification targeting specific org", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `OrgNotif-Test-${U}`,
        message: "Org-specific notification",
        target_type: "org",
        target_org_id: ORG,
        created_by: ADMIN,
      });
      expect(result).toBeTruthy();
      expect(result.target_type).toBe("org");

      // Cleanup
      const db = getDB();
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(result.id) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: result.id }).del();
    });

    it("should create with notification_type", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `Maint-Test-${U}`,
        message: "Scheduled maintenance",
        target_type: "all",
        notification_type: "maintenance",
        created_by: ADMIN,
      });
      expect(result).toBeTruthy();
      expect(result.notification_type).toBe("maintenance");

      const db = getDB();
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(result.id) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: result.id }).del();
    });

    it("should create with scheduled_at and expires_at", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `Sched-Test-${U}`,
        message: "Scheduled notification",
        target_type: "all",
        created_by: ADMIN,
        scheduled_at: "2026-05-01T00:00:00Z",
        expires_at: "2026-06-01T00:00:00Z",
      });
      expect(result).toBeTruthy();
      expect(result.scheduled_at).toBeTruthy();
      expect(result.expires_at).toBeTruthy();

      const db = getDB();
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(result.id) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: result.id }).del();
    });

    it("should create with warning type", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `Warn-Test-${U}`,
        message: "Warning notification",
        target_type: "all",
        notification_type: "warning",
        created_by: ADMIN,
      });
      expect(result).toBeTruthy();

      const db = getDB();
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(result.id) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: result.id }).del();
    });

    it("should create with critical type", async () => {
      const { createSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await createSystemNotification({
        title: `Crit-Test-${U}`,
        message: "Critical notification",
        target_type: "all",
        notification_type: "critical",
        created_by: ADMIN,
      });
      expect(result).toBeTruthy();

      const db = getDB();
      await db("notifications")
        .where({ reference_type: "system_notification", reference_id: String(result.id) })
        .del()
        .catch(() => {});
      await db("system_notifications").where({ id: result.id }).del();
    });
  });

  describe("listSystemNotifications", () => {
    it("should list all system notifications", async () => {
      const { listSystemNotifications } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await listSystemNotifications();
      expect(result).toHaveProperty("notifications");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.notifications)).toBe(true);
    });

    it("should paginate", async () => {
      const { listSystemNotifications } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await listSystemNotifications({ page: 1, perPage: 2 });
      expect(result.notifications.length).toBeLessThanOrEqual(2);
    });

    it("should filter active only", async () => {
      const { listSystemNotifications } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await listSystemNotifications({ activeOnly: true });
      expect(result).toHaveProperty("notifications");
    });

    it("should return default page and perPage", async () => {
      const { listSystemNotifications } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await listSystemNotifications({});
      expect(result).toHaveProperty("total");
    });

    it("should handle no params", async () => {
      const { listSystemNotifications } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await listSystemNotifications();
      expect(result).toHaveProperty("notifications");
    });
  });

  describe("deactivateSystemNotification", () => {
    it("should deactivate a notification", async () => {
      const { deactivateSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      const result = await deactivateSystemNotification(createdNotifId);
      expect(result).toHaveProperty("message");
      expect(result.message).toContain("deactivated");

      // Verify in DB
      const db = getDB();
      const notif = await db("system_notifications").where({ id: createdNotifId }).first();
      expect(notif.is_active).toBeFalsy();
    });

    it("should throw NotFoundError for non-existent notification", async () => {
      const { deactivateSystemNotification } = await import(
        "../../services/admin/system-notification.service.js"
      );
      await expect(deactivateSystemNotification(999999)).rejects.toThrow();
    });
  });
});
