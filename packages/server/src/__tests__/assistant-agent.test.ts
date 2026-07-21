import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config/index.js";

const mocks = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn(), constructor: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor(options: unknown) {
      mocks.constructor(options);
    }
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock("../services/assistant/tools.js", () => ({
  openAITools: () => [{ type: "function", function: { name: "search_employees", description: "search", parameters: { type: "object", properties: {} } } }],
  executeAssistantTool: mocks.execute,
}));

import { runAssistantAgent } from "../services/assistant/agent.service.js";

describe("assistant Chat Completions loop", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.execute.mockReset();
    mocks.constructor.mockReset();
    config.assistant.openaiApiKey = "test-key";
    config.assistant.openaiBaseUrl = "";
    config.assistant.openaiOrganization = "";
    config.assistant.openaiProject = "";
    config.assistant.useLegacyMaxTokens = false;
    config.assistant.model = "gpt-5.6";
    config.assistant.providerMaxRetries = 2;
    config.assistant.providerRetryBaseMs = 100;
    config.assistant.maxToolRounds = 8;
  });

  it("executes a function call and feeds its result into the next completion", async () => {
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "search_employees", arguments: '{"query":"Priya"}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Priya was found." } }] });
    mocks.execute.mockResolvedValue('{"employees":[{"employee_id":42}]}');

    const result = await runAssistantAgent(
      { orgId: 7, userId: 9, role: "employee", permissions: new Set(["assistant:use"]) },
      "Find Priya",
      [],
    );

    expect(result).toEqual({ answer: "Priya was found.", toolsUsed: ["search_employees"] });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), "search_employees", { query: "Priya" });
    const secondRequest = mocks.create.mock.calls[1][0];
    expect(secondRequest.model).toBe("gpt-5.6");
    expect(secondRequest.max_completion_tokens).toBe(config.assistant.maxTokens);
    expect(mocks.create.mock.calls[0][0].tool_choice).toBe("auto");
    expect(secondRequest.tool_choice).toBe("auto");
    expect(secondRequest.messages).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "call-1" }));
  });

  it("requires a tool call for net-pay questions", async () => {
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-pay", type: "function", function: { name: "get_net_pay", arguments: '{"employee_id":42,"month":6,"year":2026}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Priya's net pay was ₹75,000." } }] });
    mocks.execute.mockResolvedValue('{"net_pay":7500000,"currency":"INR"}');

    const result = await runAssistantAgent(
      { orgId: 7, userId: 9, role: "org_admin", permissions: new Set(["assistant:use", "payroll:view_all"]) },
      "What is Priya Patel's net pay for June 2026?",
      [],
    );

    expect(mocks.create.mock.calls[0][0].tool_choice).toBe("required");
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), "get_net_pay", { employee_id: 42, month: 6, year: 2026 });
    expect(result.toolsUsed).toContain("get_net_pay");
  });

  it("supports OpenAI-compatible endpoints and their legacy token field", async () => {
    config.assistant.openaiBaseUrl = "https://gateway.example.test/v1/";
    config.assistant.openaiOrganization = "org_123";
    config.assistant.openaiProject = "proj_123";
    config.assistant.useLegacyMaxTokens = true;
    mocks.create.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "Compatible response." } }],
    });

    await runAssistantAgent(
      { orgId: 7, userId: 9, role: "employee", permissions: new Set(["assistant:use"]) },
      "Hello",
      [],
    );

    expect(mocks.constructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://gateway.example.test/v1",
      organization: "org_123",
      project: "proj_123",
      maxRetries: 0,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: config.assistant.maxTokens,
      }),
    );
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("max_completion_tokens");
  });

  it("retries transient provider failures and then succeeds", async () => {
    mocks.create
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Recovered." } }] });

    const result = await runAssistantAgent(
      { orgId: 7, userId: 9, role: "employee", permissions: new Set(["assistant:use"]) },
      "Hello",
      [],
    );

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(result.answer).toBe("Recovered.");
  });

  it("does not retry insufficient-credit errors and returns a stable code", async () => {
    mocks.create.mockRejectedValueOnce({ status: 402 });

    await expect(runAssistantAgent(
      { orgId: 7, userId: 9, role: "employee", permissions: new Set(["assistant:use"]) },
      "Hello",
      [],
    )).rejects.toMatchObject({
      statusCode: 402,
      code: "ASSISTANT_PROVIDER_CREDITS_REQUIRED",
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a false aggregate-only claim when Payroll returned deduction lines", async () => {
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-pay", type: "function", function: { name: "get_net_pay", arguments: '{"employee_id":3,"month":6,"year":2026}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "The tool only returns aggregate totals and does not expose a breakdown." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "The ₹504 deduction is Welfare Fund ₹8, Canteen ₹492, and ESI ₹4." } }] });
    mocks.execute.mockResolvedValue(JSON.stringify({
      total_deductions: 504,
      deduction_breakdown_available: true,
      deduction_breakdown: [
        { name: "Welfare Fund", amount: 8 },
        { name: "Canteen", amount: 492 },
        { name: "ESI", amount: 4 },
      ],
    }));

    const result = await runAssistantAgent(
      { orgId: 1, userId: 1, role: "org_admin", permissions: new Set(["assistant:use", "payroll:view_all"]) },
      "Explain Priya Patel's deductions for June 2026",
      [],
    );

    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(result.answer).toContain("Welfare Fund");
    expect(mocks.create.mock.calls[2][0].messages).toContainEqual(expect.objectContaining({
      role: "system",
      content: expect.stringContaining("factually incorrect"),
    }));
  });

  it("requires every requested domain tool and does not apply Monitor retention to attendance", async () => {
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "productivity", type: "function", function: { name: "get_productivity_summary", arguments: '{"employee_id":3,"scope":"own","days":31}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Attendance is outside the 165-day EmpMonitor window; payroll was not checked." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [
        { id: "attendance", type: "function", function: { name: "get_attendance", arguments: '{"employee_id":3,"start_date":"2026-06-01","end_date":"2026-06-30"}' } },
        { id: "payroll", type: "function", function: { name: "get_net_pay", arguments: '{"employee_id":3,"month":6,"year":2026}' } },
      ] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Priya's attendance, payroll, and productivity comparison is complete." } }] });
    mocks.execute.mockResolvedValue("{}");

    const result = await runAssistantAgent(
      { orgId: 1, userId: 1, role: "org_admin", permissions: new Set(["assistant:use"]) },
      "Compare Priya Patel attendance, payroll and productivity for June 2026",
      [],
    );

    expect(result.toolsUsed).toEqual(expect.arrayContaining(["get_attendance", "get_net_pay", "get_productivity_summary"]));
    expect(mocks.create.mock.calls[2][0].messages).toContainEqual(expect.objectContaining({
      role: "system",
      content: expect.stringContaining("comparison is incomplete"),
    }));
  });

  it("forces a final no-tools synthesis instead of throwing at the tool-round limit", async () => {
    config.assistant.maxToolRounds = 2;
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "pay-1", type: "function", function: { name: "get_net_pay", arguments: '{"employee_id":3,"month":6,"year":2026}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "pay-2", type: "function", function: { name: "get_net_pay", arguments: '{"employee_id":3,"month":6,"year":2026}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Payroll is temporarily unavailable; available comparison data is shown above." } }] });
    mocks.execute.mockResolvedValue('{"error":"The connected HR module is temporarily unavailable."}');

    const result = await runAssistantAgent(
      { orgId: 1, userId: 1, role: "org_admin", permissions: new Set(["assistant:use"]) },
      "Show Priya Patel payroll for June 2026",
      [],
    );

    expect(result.answer).toContain("temporarily unavailable");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[2][0]).not.toHaveProperty("tools");
  });

  it("requires the pending-leave tool instead of accepting a leave-balance proxy", async () => {
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "balance", type: "function", function: { name: "get_leave_balance", arguments: "{}" } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "I do not have a tool for pending leave requests." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "pending", type: "function", function: { name: "get_pending_leave_requests", arguments: "{}" } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "There are 2 pending leave requests." } }] });
    mocks.execute
      .mockResolvedValueOnce('{"balances":[]}')
      .mockResolvedValueOnce('{"requests":[{"request_id":1},{"request_id":2}],"total":2}');

    const result = await runAssistantAgent(
      { orgId: 1, userId: 1, role: "org_admin", permissions: new Set(["assistant:use", "leave:approve"]) },
      "Get all pending leaves request",
      [],
    );

    expect(result.answer).toContain("2 pending leave requests");
    expect(result.toolsUsed).toContain("get_pending_leave_requests");
    expect(mocks.create.mock.calls[2][0].messages).toContainEqual(expect.objectContaining({
      role: "system",
      content: expect.stringContaining("get_pending_leave_requests"),
    }));
  });

  it("emits only the approved final answer as safe SSE deltas", async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "Streaming works without exposing system instructions." } }] });
    const deltas: string[] = [];

    const result = await runAssistantAgent(
      { orgId: 1, userId: 1, role: "employee", permissions: new Set(["assistant:use"]) },
      "Hello",
      [],
      { onDelta: (delta) => deltas.push(delta) },
    );

    expect(deltas.join("")).toBe(result.answer);
    expect(result.answer).toBe("Streaming works without exposing system instructions.");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
