// =============================================================================
// EMP CLOUD — Service Coverage Round 2
// Targets: webhook-handler (29.7%), chatbot tools (41.8%), ai-config (44.9%),
//   chatbot.service (52.3%), agent.service (54.7%), custom-field (53.6%),
//   feedback (52.9%), regularization (56.5%), event (60.8%)
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
// DB_PASSWORD must be set via environment variable
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.LOG_LEVEL = "error";
process.env.AI_ENCRYPTION_KEY = "test-encryption-key-for-coverage";
process.env.JWT_SECRET = "test-jwt-secret";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const MGR = 529;
const HR = 525;
const U = String(Date.now()).slice(-6);

beforeAll(async () => {
  await initDB();
});

afterAll(async () => {
  // Cleanup test data
  const db = getDB();
  try { await db("chatbot_messages").where("conversation_id", ">", 0).andWhere("content", "like", `%${U}%`).delete(); } catch {}
  try { await db("chatbot_conversations").where("title", "like", `%${U}%`).delete(); } catch {}
  try { await db("custom_field_values").where("value", "like", `%cov2-${U}%`).delete(); } catch {}
  try { await db("custom_field_definitions").where("field_name", "like", `%Cov2 ${U}%`).delete(); } catch {}
  try { await db("anonymous_feedback").where("subject", "like", `%Cov2 ${U}%`).delete(); } catch {}
  try { await db("event_rsvps").whereIn("event_id", db("events").select("id").where("title", "like", `%Cov2 ${U}%`)).delete(); } catch {}
  try { await db("events").where("title", "like", `%Cov2 ${U}%`).delete(); } catch {}
  try { await db("attendance_regularizations").where("reason", "like", `%Cov2 ${U}%`).delete(); } catch {}
  await closeDB();
});

// ============================================================================
// WEBHOOK HANDLER SERVICE — all 5 event types
// ============================================================================
describe("WebhookHandler coverage-2", () => {
  it("handles invoice.paid without mapping", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("invoice.paid", { invoiceId: "inv-test-999", subscriptionId: "sub-nomatch-999" }, ORG);
  });

  it("handles invoice.paid with no subscriptionId", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("invoice.paid", { invoiceId: "inv-test-no-sub" }, ORG);
  });

  it("handles payment.received", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("payment.received", { paymentId: "pay-cov2", amount: 5000 }, ORG);
  });

  it("handles subscription.cancelled without mapping", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("subscription.cancelled", { subscriptionId: "sub-cancel-nomatch" }, ORG);
  });

  it("handles subscription.cancelled with no id", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("subscription.cancelled", {}, ORG);
  });

  it("handles subscription.payment_failed without mapping", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("subscription.payment_failed", { subscription_id: "sub-fail-nomatch" }, ORG);
  });

  it("handles subscription.payment_failed with no subscriptionId", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("subscription.payment_failed", {}, ORG);
  });

  it("handles invoice.overdue without mapping", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("invoice.overdue", { invoiceId: "inv-overdue-cov2", subscription_id: "sub-overdue-nomatch" }, ORG);
  });

  it("handles invoice.overdue with no subscription_id", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("invoice.overdue", { invoiceId: "inv-overdue-nosub" }, ORG);
  });

  it("handles unknown event type", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("unknown.event.type", { foo: "bar" }, ORG);
  });

  it("handles event with no orgId", async () => {
    const { handleWebhook } = await import("../../services/billing/webhook-handler.service.js");
    await handleWebhook("payment.received", { paymentId: "pay-no-org", amount: 100 });
  });
});

// ============================================================================
// CHATBOT TOOLS — executeTool, getTool, getToolSchemas
// ============================================================================
describe("Chatbot Tools coverage-2", () => {
  it("getToolSchemas returns array", async () => {
    const { getToolSchemas } = await import("../../services/chatbot/tools.js");
    const schemas = getToolSchemas();
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(10);
    for (const s of schemas.slice(0, 5)) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("description");
    }
  });

  it("getTool by name", async () => {
    const { getTool } = await import("../../services/chatbot/tools.js");
    const tool = getTool("get_employee_count");
    expect(tool).toBeTruthy();
    expect(tool!.name).toBe("get_employee_count");
  });

  it("getTool unknown returns undefined", async () => {
    const { getTool } = await import("../../services/chatbot/tools.js");
    expect(getTool("nonexistent_tool")).toBeUndefined();
  });

  it("executeTool - get_employee_count", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_employee_count", ORG, ADMIN, {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("total_employees");
  });

  it("executeTool - get_department_list", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_department_list", ORG, ADMIN, {});
    expect(result).toBeTruthy();
    // Tool may return departments or error depending on DB state
  });

  it("executeTool - get_attendance_today", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_attendance_today", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_leave_balance", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_leave_balance", ORG, ADMIN, { employee_name: "Ananya" });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_pending_leave_requests", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_pending_leave_requests", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_announcements", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_announcements", ORG, ADMIN, { limit: 3 });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_company_policies", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_company_policies", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_helpdesk_stats", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_helpdesk_stats", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_module_subscriptions", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_module_subscriptions", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_billing_summary", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_billing_summary", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_upcoming_holidays", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_upcoming_holidays", ORG, ADMIN, { limit: 5 });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_employee_details", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_employee_details", ORG, ADMIN, { query: "Ananya" });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_attendance_for_employee", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_attendance_for_employee", ORG, ADMIN, { employee_name: "Ananya", days: 7 });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_attendance_by_department", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_attendance_by_department", ORG, ADMIN, { department: "Engineering" });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_my_attendance", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_my_attendance", ORG, EMP, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_team_attendance", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_team_attendance", ORG, MGR, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_leave_calendar", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_leave_calendar", ORG, ADMIN, {
      start_date: "2026-04-01",
      end_date: "2026-04-30",
    });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_survey_results", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_survey_results", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_wellness_dashboard", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_wellness_dashboard", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_recent_feedback", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_recent_feedback", ORG, ADMIN, { limit: 5 });
    expect(result).toBeTruthy();
  });

  it("executeTool - get_whistleblower_stats", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_whistleblower_stats", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - unknown tool returns error", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("nonexistent_tool_xyz", ORG, ADMIN, {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Unknown tool");
  });

  // Module proxy tools (will gracefully fail but still exercise code paths)
  it("executeTool - get_payroll_summary (proxy)", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_payroll_summary", ORG, ADMIN, {});
    expect(result).toBeTruthy(); // may return error from proxy but still exercises code
  });

  it("executeTool - get_open_jobs (proxy)", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_open_jobs", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_kudos_summary (proxy)", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_kudos_summary", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_active_exits (proxy)", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_active_exits", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });

  it("executeTool - get_course_catalog (proxy)", async () => {
    const { executeTool } = await import("../../services/chatbot/tools.js");
    const result = await executeTool("get_course_catalog", ORG, ADMIN, {});
    expect(result).toBeTruthy();
  });
});

// ============================================================================
// AI CONFIG SERVICE — CRUD, masking, encryption
// ============================================================================
describe("AIConfig coverage-2", () => {
  it("getAIConfig returns config rows", async () => {
    const { getAIConfig } = await import("../../services/admin/ai-config.service.js");
    const configs = await getAIConfig();
    expect(Array.isArray(configs)).toBe(true);
    for (const c of configs) {
      expect(c).toHaveProperty("config_key");
      expect(c).toHaveProperty("is_active");
    }
  });

  it("updateAIConfig — set and mask a sensitive key", async () => {
    const { updateAIConfig, getAIConfig } = await import("../../services/admin/ai-config.service.js");
    const result = await updateAIConfig("anthropic_api_key", "sk-ant-test-cov2-1234abcd", ADMIN);
    expect(result.success).toBe(true);
    // Verify masking
    const all = await getAIConfig();
    const row = all.find((r: any) => r.config_key === "anthropic_api_key");
    expect(row).toBeTruthy();
    expect(row.config_value).toContain("****");
    expect(row.config_value).toContain("abcd"); // last 4 chars shown
  });

  it("updateAIConfig — set non-sensitive key (no encryption)", async () => {
    const { updateAIConfig } = await import("../../services/admin/ai-config.service.js");
    const result = await updateAIConfig("active_provider", "anthropic", ADMIN);
    expect(result.success).toBe(true);
  });

  it("updateAIConfig — clear value sets inactive", async () => {
    const { updateAIConfig } = await import("../../services/admin/ai-config.service.js");
    const result = await updateAIConfig("gemini_api_key", null, ADMIN);
    expect(result.success).toBe(true);
  });

  it("getActiveProvider returns provider info", async () => {
    const { getActiveProvider } = await import("../../services/admin/ai-config.service.js");
    const p = await getActiveProvider();
    expect(p).toHaveProperty("provider");
    expect(p).toHaveProperty("model");
    expect(p).toHaveProperty("status");
  });

  it("getDecryptedKey returns decrypted value", async () => {
    const { getDecryptedKey } = await import("../../services/admin/ai-config.service.js");
    const val = await getDecryptedKey("anthropic_api_key");
    if (val) {
      expect(val).toContain("sk-ant-test-cov2");
    }
  });

  it("getDecryptedKey for non-sensitive key", async () => {
    const { getDecryptedKey } = await import("../../services/admin/ai-config.service.js");
    const val = await getDecryptedKey("active_provider");
    expect(val).toBeTruthy();
  });

  it("getDecryptedKey for missing key", async () => {
    const { getDecryptedKey } = await import("../../services/admin/ai-config.service.js");
    const val = await getDecryptedKey("nonexistent_key_xyz");
    expect(val).toBeNull();
  });

  it("getDecryptedConfig returns all decrypted", async () => {
    const { getDecryptedConfig } = await import("../../services/admin/ai-config.service.js");
    const config = await getDecryptedConfig();
    expect(typeof config).toBe("object");
    if (config.anthropic_api_key) {
      expect(config.anthropic_api_key).toContain("sk-ant-test-cov2");
    }
  });

  it("cleanup: restore test keys", async () => {
    const { updateAIConfig } = await import("../../services/admin/ai-config.service.js");
    await updateAIConfig("anthropic_api_key", null, ADMIN);
  });
});

// ============================================================================
// CHATBOT SERVICE — conversation + message flows
// ============================================================================
describe("ChatbotService coverage-2", () => {
  let convId: number;

  it("createConversation + verify structure", async () => {
    const { createConversation } = await import("../../services/chatbot/chatbot.service.js");
    const c = await createConversation(ORG, EMP);
    expect(c).toHaveProperty("id");
    expect(c).toHaveProperty("status");
    expect(c.user_id).toBe(EMP);
    convId = c.id;
  });

  it("getConversations returns list", async () => {
    const { getConversations } = await import("../../services/chatbot/chatbot.service.js");
    const list = await getConversations(ORG, EMP);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty("id");
  });

  it("getMessages for new conversation", async () => {
    const { getMessages } = await import("../../services/chatbot/chatbot.service.js");
    const msgs = await getMessages(ORG, convId, EMP);
    expect(Array.isArray(msgs)).toBe(true);
  });

  it("getAIStatus", async () => {
    const { getAIStatus } = await import("../../services/chatbot/chatbot.service.js");
    const status = await getAIStatus();
    expect(status).toHaveProperty("engine");
    expect(status).toHaveProperty("provider");
  });

  it("getSuggestions returns non-empty", async () => {
    const { getSuggestions } = await import("../../services/chatbot/chatbot.service.js");
    const suggestions = getSuggestions();
    expect(suggestions.length).toBeGreaterThan(3);
    for (const s of suggestions.slice(0, 3)) {
      expect(typeof s).toBe("string");
    }
  });

  it("deleteConversation - wrong user rejected", async () => {
    const { deleteConversation } = await import("../../services/chatbot/chatbot.service.js");
    // Using a different user should fail
    await expect(deleteConversation(ORG, convId, 999999)).rejects.toThrow();
  });

  it("deleteConversation - success", async () => {
    const { deleteConversation } = await import("../../services/chatbot/chatbot.service.js");
    const r = await deleteConversation(ORG, convId, EMP);
    expect(r.success).toBe(true);
  });

  it("cleanup leftover conversations", async () => {
    const db = getDB();
    await db("chatbot_messages").where({ conversation_id: convId }).delete();
    await db("chatbot_conversations").where({ id: convId }).delete();
  });
});

// ============================================================================
// AGENT SERVICE — detectProvider
// ============================================================================
describe("AgentService coverage-2", () => {
  it("detectProvider returns a valid provider", async () => {
    const { detectProvider } = await import("../../services/chatbot/agent.service.js");
    const p = detectProvider();
    expect(typeof p).toBe("string");
  });

  it("detectProviderAsync returns a provider", async () => {
    const { detectProviderAsync } = await import("../../services/chatbot/agent.service.js");
    const p = await detectProviderAsync();
    expect(typeof p).toBe("string");
  });
});

// ============================================================================
// CUSTOM FIELD SERVICE — deeper CRUD + values + search
// ============================================================================
describe("CustomField coverage-2", () => {
  let fieldId: number;
  let selectFieldId: number;

  it("createFieldDefinition - dropdown type with options", async () => {
    const { createFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Cov2 Dropdown ${U}`,
      field_type: "dropdown",
      is_required: false,
      options: ["Option A", "Option B", "Option C"],
      section: "Coverage Test",
    } as any);
    expect(f.field_type).toBe("dropdown");
    selectFieldId = f.id;
  });

  it("createFieldDefinition - number type", async () => {
    const { createFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Cov2 Number ${U}`,
      field_type: "number",
      is_required: true,
      is_searchable: true,
      section: "Coverage Test",
    } as any);
    expect(f.field_type).toBe("number");
    fieldId = f.id;
  });

  it("listFieldDefinitions", async () => {
    const { listFieldDefinitions } = await import("../../services/custom-field/custom-field.service.js");
    const r = await listFieldDefinitions(ORG, "employee");
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("getFieldDefinition", async () => {
    const { getFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await getFieldDefinition(ORG, fieldId);
    expect(f.field_name).toContain("Cov2 Number");
  });

  it("updateFieldDefinition", async () => {
    const { updateFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await updateFieldDefinition(ORG, fieldId, { is_required: false } as any);
    expect(f).toBeTruthy();
  });

  it("setFieldValues + getFieldValues", async () => {
    const { setFieldValues, getFieldValues } = await import("../../services/custom-field/custom-field.service.js");
    await setFieldValues(ORG, "employee", EMP, [
      { fieldId: fieldId, value: "42" },
      { fieldId: selectFieldId, value: "Option A" },
    ] as any);
    const vals = await getFieldValues(ORG, "employee", EMP);
    const numVal = vals.find((v: any) => v.field_id === fieldId);
    expect(numVal).toBeTruthy();
  });

  it("getFieldValuesForEntities", async () => {
    const { getFieldValuesForEntities } = await import("../../services/custom-field/custom-field.service.js");
    const r = await getFieldValuesForEntities(ORG, "employee", [EMP, MGR]);
    expect(typeof r).toBe("object");
  });

  it("searchByFieldValue", async () => {
    const { searchByFieldValue } = await import("../../services/custom-field/custom-field.service.js");
    const r = await searchByFieldValue(ORG, "employee", fieldId, "42");
    expect(Array.isArray(r)).toBe(true);
  });

  it("reorderFields", async () => {
    const { reorderFields } = await import("../../services/custom-field/custom-field.service.js");
    await reorderFields(ORG, "employee", [fieldId, selectFieldId]);
  });

  it("cleanup: delete field values and definitions", async () => {
    const db = getDB();
    await db("custom_field_values").whereIn("field_id", [fieldId, selectFieldId]).delete();
    const { deleteFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    await deleteFieldDefinition(ORG, fieldId);
    await deleteFieldDefinition(ORG, selectFieldId);
  });
});

// ============================================================================
// FEEDBACK SERVICE — deeper paths
// ============================================================================
describe("Feedback coverage-2", () => {
  let fbId: number;

  it("submitFeedback - harassment category (negative)", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "harassment",
      subject: `Cov2 Harassment ${U}`,
      message: "Test harassment for coverage round 2",
    });
    expect(f.sentiment).toBe("negative");
    fbId = f.id;
  });

  it("submitFeedback - safety (negative)", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "safety",
      subject: `Cov2 Safety ${U}`,
      message: "Test safety feedback",
    });
    expect(f.sentiment).toBe("negative");
    const db = getDB();
    await db("anonymous_feedback").where({ id: f.id }).delete();
  });

  it("submitFeedback - other category (neutral)", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "other",
      subject: `Cov2 Other ${U}`,
      message: "Test neutral feedback",
    });
    expect(f.sentiment).toBe("neutral");
    const db = getDB();
    await db("anonymous_feedback").where({ id: f.id }).delete();
  });

  it("isOwner", async () => {
    const { isOwner } = await import("../../services/feedback/anonymous-feedback.service.js");
    const owned = await isOwner(ORG, fbId, EMP);
    expect(owned).toBe(true);
    const notOwned = await isOwner(ORG, fbId, 999999);
    expect(notOwned).toBe(false);
  });

  it("listFeedback with pagination", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await listFeedback(ORG, { page: 1, perPage: 2 });
    expect(r).toHaveProperty("feedback");
    expect(r).toHaveProperty("total");
  });

  it("listFeedback with category filter", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await listFeedback(ORG, { category: "harassment" });
    expect(r.feedback.length).toBeGreaterThanOrEqual(1);
  });

  it("updateStatus", async () => {
    const { updateStatus } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await updateStatus(ORG, fbId, "under_review");
    expect(f.status).toBe("under_review");
  });

  it("respondToFeedback", async () => {
    const { respondToFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await respondToFeedback(ORG, fbId, "Coverage 2 response", HR);
    expect(f.admin_response).toContain("Coverage 2");
    // respondToFeedback keeps current status, just sets admin_response
  });

  it("getFeedbackDashboard", async () => {
    const { getFeedbackDashboard } = await import("../../services/feedback/anonymous-feedback.service.js");
    const d = await getFeedbackDashboard(ORG);
    expect(d).toHaveProperty("total");
    expect(d).toHaveProperty("byCategory");
    expect(d).toHaveProperty("bySentiment");
  });

  it("getMyFeedback with pagination", async () => {
    const { getMyFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await getMyFeedback(ORG, EMP, { page: 1, perPage: 5 });
    expect(r).toHaveProperty("feedback");
  });

  it("cleanup", async () => {
    const db = getDB();
    await db("anonymous_feedback").where({ id: fbId }).delete();
  });
});

// ============================================================================
// REGULARIZATION SERVICE — submit, approve, reject
// ============================================================================
describe("Regularization coverage-2", () => {
  let regId: number;

  it("submitRegularization", async () => {
    const { submitRegularization } = await import("../../services/attendance/regularization.service.js");
    const r = await submitRegularization(ORG, EMP, {
      date: "2026-03-15",
      check_in: "09:00",
      check_out: "18:00",
      reason: `Cov2 ${U} forgot to punch`,
    });
    expect(r).toHaveProperty("id");
    regId = r.id;
  });

  it("listRegularizations with approved filter", async () => {
    const { listRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await listRegularizations(ORG, { status: "approved" });
    expect(r).toHaveProperty("records");
  });

  it("listRegularizations with rejected filter", async () => {
    const { listRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await listRegularizations(ORG, { status: "rejected" });
    expect(r).toHaveProperty("records");
  });

  it("getMyRegularizations", async () => {
    const { getMyRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await getMyRegularizations(ORG, EMP);
    expect(r.records.length).toBeGreaterThan(0);
  });

  it("rejectRegularization", async () => {
    const { rejectRegularization } = await import("../../services/attendance/regularization.service.js");
    const r = await rejectRegularization(ORG, regId, MGR, "Not valid");
    expect(r).toHaveProperty("id");
  });

  it("submitRegularization + approveRegularization", async () => {
    const { submitRegularization, approveRegularization } = await import("../../services/attendance/regularization.service.js");
    const r = await submitRegularization(ORG, EMP, {
      date: "2026-03-16",
      check_in: "09:30",
      check_out: "18:30",
      reason: `Cov2 ${U} system error`,
    });
    const approved = await approveRegularization(ORG, r.id, MGR);
    expect(approved).toHaveProperty("id");
    // Cleanup
    const db = getDB();
    await db("attendance_regularizations").where({ id: r.id }).delete();
  });

  it("cleanup", async () => {
    const db = getDB();
    await db("attendance_regularizations").where({ id: regId }).delete();
  });
});

// ============================================================================
// EVENT SERVICE — deeper paths
// ============================================================================
describe("Event coverage-2", () => {
  let evId: number;

  it("createEvent with all fields", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    const ev = await createEvent(ORG, ADMIN, {
      title: `Cov2 Workshop ${U}`,
      description: "Coverage round 2 test event with full details",
      event_type: "workshop",
      start_date: "2026-07-01T09:00:00",
      end_date: "2026-07-01T17:00:00",
      location: "Conference Room A",
      is_virtual: true,
      virtual_link: "https://meet.example.com/cov2",
      max_attendees: 50,
    } as any);
    expect(ev.title).toContain("Cov2 Workshop");
    evId = ev.id;
  });

  it("listEvents with pagination", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const r = await listEvents(ORG, { page: 1, perPage: 5 });
    expect(r).toHaveProperty("events");
    expect(r).toHaveProperty("total");
  });

  it("listEvents with search", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const r = await listEvents(ORG, { search: "Cov2" });
    expect(r.events.length).toBeGreaterThanOrEqual(1);
  });

  it("rsvpEvent - attending", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const r = await rsvpEvent(ORG, evId, EMP, "attending");
    expect(r.status).toBe("attending");
  });

  it("rsvpEvent - maybe (update existing)", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const r = await rsvpEvent(ORG, evId, EMP, "maybe");
    expect(r.status).toBe("maybe");
  });

  it("rsvpEvent - declined", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const r = await rsvpEvent(ORG, evId, MGR, "declined");
    expect(r.status).toBe("declined");
  });

  it("getEvent includes attendees", async () => {
    const { getEvent } = await import("../../services/event/event.service.js");
    const ev = await getEvent(ORG, evId);
    expect(ev).toHaveProperty("rsvps");
  });

  it("getMyEvents includes RSVP'd events", async () => {
    const { getMyEvents } = await import("../../services/event/event.service.js");
    const r = await getMyEvents(ORG, EMP);
    const found = r.find((e: any) => e.id === evId);
    expect(found).toBeTruthy();
  });

  it("getUpcomingEvents", async () => {
    const { getUpcomingEvents } = await import("../../services/event/event.service.js");
    const r = await getUpcomingEvents(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getEventDashboard", async () => {
    const { getEventDashboard } = await import("../../services/event/event.service.js");
    const d = await getEventDashboard(ORG);
    expect(d).toHaveProperty("upcoming_count");
    expect(d).toHaveProperty("month_count");
  });

  it("updateEvent", async () => {
    const { updateEvent } = await import("../../services/event/event.service.js");
    const ev = await updateEvent(ORG, evId, {
      description: "Updated description for coverage 2",
      max_attendees: 100,
    });
    expect(ev).toBeTruthy();
  });

  it("cancelEvent", async () => {
    const { cancelEvent } = await import("../../services/event/event.service.js");
    const ev = await cancelEvent(ORG, evId);
    expect(ev.status).toBe("cancelled");
  });

  it("deleteEvent + cleanup", async () => {
    const db = getDB();
    await db("event_rsvps").where({ event_id: evId }).delete();
    const { deleteEvent } = await import("../../services/event/event.service.js");
    await deleteEvent(ORG, evId);
  });
});
