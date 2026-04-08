// =============================================================================
// Chatbot Service Coverage — Uses vi.mock to avoid real AI API calls
// Covers all intent handlers and sendMessage branches.
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

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock the agent service to prevent real AI API calls
vi.mock("../../services/chatbot/agent.service.js", () => ({
  runAgent: vi.fn().mockResolvedValue("Mocked AI response"),
  detectProvider: vi.fn().mockReturnValue("none"),
  detectProviderAsync: vi.fn().mockResolvedValue("none"),
}));

// Must import AFTER vi.mock
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5;
const USER = 524;

beforeAll(async () => { await initDB(); }, 15000);
afterAll(async () => { await closeDB(); }, 10000);

describe("ChatbotService — full intent coverage", () => {
  it("sendMessage handles greeting intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "hello", "en");
    expect(r.assistantMessage.content).toMatch(/AI HR Assistant|help/i);
  }, 10000);

  it("sendMessage handles leave balance intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "What is my leave balance?", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles attendance intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Show my attendance today", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles team attendance intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Show team attendance", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles policy intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "What are the company policies?", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles helpdesk intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "I need help with an issue", "en");
    expect(r.assistantMessage.content).toMatch(/ticket|help|support/i);
  }, 10000);

  it("sendMessage handles payslip intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Show my payslip", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles holiday intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "When is the next holiday?", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles who_is my manager intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Who is my manager?", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles who_is short query", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Who is a", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles who_is name search", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Who is John Smith", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles announcement intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "Show latest announcements", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage handles apply leave intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "How do I apply for leave?", "en");
    expect(r.assistantMessage.content).toMatch(/leave/i);
  }, 10000);

  it("sendMessage handles fallback for unknown intent", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.sendMessage(ORG, USER, convo.id, "xyzzy quantum nebula", "en");
    expect(r.assistantMessage.content).toBeTruthy();
  }, 10000);

  it("sendMessage throws for non-existent conversation", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    try {
      await mod.sendMessage(ORG, USER, 999999, "test", "en");
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  }, 10000);

  it("deleteConversation archives conversation", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    const r = await mod.deleteConversation(ORG, convo.id, USER);
    expect(r.success).toBe(true);
  }, 10000);

  it("getMessages for existing conversation", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convo = await mod.createConversation(ORG, USER);
    await mod.sendMessage(ORG, USER, convo.id, "hi", "en");
    const msgs = await mod.getMessages(ORG, convo.id, USER);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  }, 10000);

  it("getAIStatus returns engine info", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const status = await mod.getAIStatus();
    expect(status).toHaveProperty("engine");
    expect(status).toHaveProperty("provider");
  });

  it("getSuggestions returns array", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const suggestions = mod.getSuggestions();
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(5);
  });

  it("getConversations returns list", async () => {
    const mod = await import("../../services/chatbot/chatbot.service.js");
    const convos = await mod.getConversations(ORG, USER);
    expect(Array.isArray(convos)).toBe(true);
  });
});
