// =============================================================================
// EMP CLOUD -- Agentic AI Service
// LLM-powered chatbot with tool calling. Supports Claude (Anthropic) and
// OpenAI, with automatic fallback to the rule-based engine.
// =============================================================================

import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";
import { getDB } from "../../db/connection.js";
import { tools, executeTool, type ToolParameter } from "./tools.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per-user)
// ---------------------------------------------------------------------------

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_AI_CALLS_PER_MINUTE = 20;

function checkRateLimit(userId: number): boolean {
  const key = `ai:${userId}`;
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= MAX_AI_CALLS_PER_MINUTE) {
    return false;
  }

  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

export type AIProvider = "anthropic" | "openai" | "deepseek" | "groq" | "ollama" | "openai-compatible" | "none";

// Provider presets: base URLs for popular OpenAI-compatible providers
const PROVIDER_PRESETS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai",
  together: "https://api.together.xyz",
  fireworks: "https://api.fireworks.ai/inference",
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
};

export function detectProvider(): AIProvider {
  if (config.ai.anthropicApiKey) return "anthropic";
  if (config.ai.openaiApiKey) {
    const baseUrl = config.ai.openaiBaseUrl?.toLowerCase() || "";
    if (baseUrl.includes("deepseek")) return "deepseek";
    if (baseUrl.includes("groq")) return "groq";
    if (baseUrl.includes("localhost:11434") || baseUrl.includes("ollama")) return "ollama";
    if (baseUrl) return "openai-compatible";
    return "openai";
  }
  return "none";
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

async function buildSystemPrompt(
  orgId: number,
  userId: number
): Promise<string> {
  const db = getDB();

  // Fetch org info
  const org = await db("organizations").where({ id: orgId }).first();
  const orgName = org?.name || "your organization";

  // Employee count
  const [empRow] = await db("users")
    .where({ organization_id: orgId, is_active: true })
    .count("id as count");
  const empCount = Number(empRow?.count ?? 0);

  // Department count
  const [deptRow] = await db("departments")
    .where({ organization_id: orgId })
    .count("id as count");
  const deptCount = Number(deptRow?.count ?? 0);

  // Current user info
  const user = await db("users").where({ id: userId, organization_id: orgId }).first();
  const userName = user ? `${user.first_name} ${user.last_name}` : "User";
  const userRole = user?.role || "employee";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are an AI HR assistant for **${orgName}**. You help employees and admins with HR-related queries by using the tools available to you.

## Key Facts
- Organization: ${orgName}
- Total employees: ${empCount}
- Total departments: ${deptCount}
- Current date: ${today}
- Current user: ${userName} (role: ${userRole})
- Organization ID: ${orgId} (use this for any SQL queries)

## Guidelines
- Always use tools to get real-time data. NEVER make up numbers, dates, or employee details.
- Be concise but helpful. Use bullet points and tables (markdown) to organize data.
- If a tool returns an error or empty data, say so honestly.
- When showing employee data, format names properly and include relevant details.
- For attendance and leave data, always mention the date range covered.
- If the user asks something you cannot answer with the available tools, say so and suggest they contact HR.
- You can use the run_sql_query tool for complex queries that other tools don't cover, but always include organization_id = ${orgId} in the WHERE clause.
- Format monetary values with proper currency symbols.
- When showing tables with more than a few rows, use markdown table format.
- Be friendly and professional. Address the user by name when appropriate.
- If the user asks about their own data (leave balance, attendance), use their user context.
- For admin queries (org-wide stats, pending approvals), check the user role first.`;
}

// ---------------------------------------------------------------------------
// Convert tool definitions to Anthropic format
// ---------------------------------------------------------------------------

function toAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((t) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of t.parameters) {
      properties[p.name] = {
        type: p.type === "number" ? "number" : "string",
        description: p.description,
      };
      if (p.required) required.push(p.name);
    }

    return {
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Convert tool definitions to OpenAI format
// ---------------------------------------------------------------------------

function toOpenAITools(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((t) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of t.parameters) {
      properties[p.name] = {
        type: p.type === "number" ? "number" : "string",
        description: p.description,
      };
      if (p.required) required.push(p.name);
    }

    return {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Anthropic Agent Loop
// ---------------------------------------------------------------------------

async function runAnthropicAgent(
  orgId: number,
  userId: number,
  message: string,
  history: ConversationMessage[]
): Promise<string> {
  // Dynamic import to avoid crash if package not installed
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.ai.anthropicApiKey });

  const systemPrompt = await buildSystemPrompt(orgId, userId);
  const anthropicTools = toAnthropicTools();

  // Build message history
  const messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }> = [];
  for (const h of history.slice(-20)) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: message });

  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system: systemPrompt,
      tools: anthropicTools as any,
      messages: messages as any,
    });

    // Check if the model wants to use tools
    const toolUseBlocks = response.content.filter(
      (b: any) => b.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (b: any) => b.type === "text"
    );

    if (toolUseBlocks.length === 0) {
      // Final text response
      const text = textBlocks.map((b: any) => b.text).join("\n");
      return text || "I apologize, but I was unable to generate a response. Please try again.";
    }

    // Model wants to call tools -- add assistant message with all content blocks
    messages.push({ role: "assistant", content: response.content as any });

    // Execute each tool call and build tool_result blocks
    const toolResults: Array<Record<string, unknown>> = [];
    for (const block of toolUseBlocks) {
      const toolBlock = block as any;
      logger.info(`AI tool call: ${toolBlock.name}`, {
        params: toolBlock.input,
        orgId,
      });

      const result = await executeTool(
        toolBlock.name,
        orgId,
        userId,
        toolBlock.input || {}
      );

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    // Add tool results as a user message
    messages.push({ role: "user", content: toolResults });
  }

  return "I performed too many tool calls without reaching a conclusion. Please try a simpler question.";
}

// ---------------------------------------------------------------------------
// OpenAI Agent Loop
// ---------------------------------------------------------------------------

async function runOpenAIAgent(
  orgId: number,
  userId: number,
  message: string,
  history: ConversationMessage[]
): Promise<string> {
  const apiKey = config.ai.openaiApiKey;
  const model = config.ai.model.startsWith("claude")
    ? "gpt-4o"
    : config.ai.model;

  const systemPrompt = await buildSystemPrompt(orgId, userId);
  const openaiTools = toOpenAITools();

  // Build messages
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
  ];
  for (const h of history.slice(-20)) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: message });

  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const baseUrl = config.ai.openaiBaseUrl || "https://api.openai.com";
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        max_tokens: config.ai.maxTokens,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      logger.error("OpenAI API error:", { status: resp.status, body: errText });
      throw new Error(`OpenAI API error: ${resp.status}`);
    }

    const data = (await resp.json()) as any;
    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from OpenAI");

    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    // If no tool calls, return text
    if (
      !assistantMsg.tool_calls ||
      assistantMsg.tool_calls.length === 0
    ) {
      return assistantMsg.content || "I apologize, but I was unable to generate a response.";
    }

    // Execute tool calls
    for (const tc of assistantMsg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs: Record<string, unknown> = {};
      try {
        fnArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        fnArgs = {};
      }

      logger.info(`AI tool call (OpenAI): ${fnName}`, {
        params: fnArgs,
        orgId,
      });

      const result = await executeTool(fnName, orgId, userId, fnArgs);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  return "I performed too many tool calls without reaching a conclusion. Please try a simpler question.";
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the AI agent to generate a response. Returns the final text.
 * Throws if the LLM call fails.
 */
export async function runAgent(
  orgId: number,
  userId: number,
  message: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  // Rate limit check
  if (!checkRateLimit(userId)) {
    return "You've sent too many messages in a short time. Please wait a moment and try again.";
  }

  const provider = detectProvider();

  if (provider === "anthropic") {
    return runAnthropicAgent(orgId, userId, message, conversationHistory);
  }

  if (provider === "openai") {
    return runOpenAIAgent(orgId, userId, message, conversationHistory);
  }

  // Should not reach here -- caller checks provider first
  throw new Error("No AI provider configured");
}
