// =============================================================================
// EMP CLOUD — AI Configuration Service
// Manage AI provider settings from the database. API keys are encrypted at rest.
// =============================================================================

import crypto from "crypto";
import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM)
// ---------------------------------------------------------------------------

const ENCRYPTION_SECRET =
  process.env.AI_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  "empcloud-ai-config-default-key-change-me";

function deriveKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_SECRET, "empcloud-ai-salt", 32);
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext: string): string {
  try {
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return ciphertext; // not encrypted
    const key = deriveKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // If decryption fails, return as-is (might be a non-encrypted value)
    return ciphertext;
  }
}

// Keys that contain secrets and must be encrypted
const SENSITIVE_KEYS = [
  "anthropic_api_key",
  "openai_api_key",
  "gemini_api_key",
];

function maskValue(key: string, value: string | null): string | null {
  if (!value) return null;
  if (!SENSITIVE_KEYS.includes(key)) return value;
  // Decrypt first, then mask
  const plain = decrypt(value);
  if (plain.length <= 4) return "****";
  return "****" + plain.slice(-4);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getAIConfig() {
  const db = getDB();
  const rows = await db("ai_config").select("*").orderBy("id", "asc");

  return rows.map((row: any) => ({
    id: row.id,
    config_key: row.config_key,
    config_value: maskValue(row.config_key, row.config_value),
    is_active: !!row.is_active,
    updated_at: row.updated_at,
    created_at: row.created_at,
  }));
}

export async function updateAIConfig(
  key: string,
  value: string | null,
  userId: number
) {
  const db = getDB();

  // Encrypt sensitive values
  const storedValue =
    value && SENSITIVE_KEYS.includes(key) ? encrypt(value) : value;

  const existing = await db("ai_config").where({ config_key: key }).first();

  if (existing) {
    await db("ai_config")
      .where({ config_key: key })
      .update({
        config_value: storedValue,
        is_active: value ? true : false,
        updated_by: userId,
        updated_at: new Date(),
      });
  } else {
    await db("ai_config").insert({
      config_key: key,
      config_value: storedValue,
      is_active: value ? true : false,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  return { success: true, key };
}

export async function getActiveProvider(): Promise<{
  provider: string;
  model: string;
  status: string;
}> {
  const db = getDB();

  const providerRow = await db("ai_config")
    .where({ config_key: "active_provider" })
    .first();
  const modelRow = await db("ai_config")
    .where({ config_key: "ai_model" })
    .first();

  const provider = providerRow?.config_value || "none";
  const model = modelRow?.config_value || "claude-sonnet-4-20250514";

  // Check if the active provider has a key configured
  let status = "not_configured";
  if (provider === "none") {
    status = "inactive";
  } else if (provider === "ollama") {
    // Ollama doesn't need an API key, just a base URL
    status = "active";
  } else {
    const keyMap: Record<string, string> = {
      anthropic: "anthropic_api_key",
      openai: "openai_api_key",
      gemini: "gemini_api_key",
      deepseek: "openai_api_key",
      groq: "openai_api_key",
    };
    const configKey = keyMap[provider];
    if (configKey) {
      const keyRow = await db("ai_config")
        .where({ config_key: configKey })
        .first();
      status = keyRow?.config_value ? "active" : "not_configured";
    }
  }

  return { provider, model, status };
}

export async function getDecryptedKey(key: string): Promise<string | null> {
  const db = getDB();
  const row = await db("ai_config").where({ config_key: key }).first();
  if (!row?.config_value) return null;
  if (SENSITIVE_KEYS.includes(key)) {
    return decrypt(row.config_value);
  }
  return row.config_value;
}

export async function getDecryptedConfig(): Promise<Record<string, string | null>> {
  const db = getDB();
  const rows = await db("ai_config").select("config_key", "config_value");
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    if (SENSITIVE_KEYS.includes(row.config_key) && row.config_value) {
      result[row.config_key] = decrypt(row.config_value);
    } else {
      result[row.config_key] = row.config_value;
    }
  }
  return result;
}

export async function testProvider(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): Promise<{ success: boolean; message: string; latency_ms: number }> {
  const start = Date.now();

  try {
    if (provider === "anthropic") {
      return await testAnthropic(apiKey, model, start);
    } else if (provider === "gemini") {
      return await testGemini(apiKey, model, start);
    } else if (provider === "ollama") {
      return await testOllama(baseUrl || "http://localhost:11434", model, start);
    } else {
      // OpenAI-compatible: openai, deepseek, groq, custom
      return await testOpenAICompatible(
        apiKey,
        model,
        baseUrl || "https://api.openai.com",
        start
      );
    }
  } catch (err: any) {
    const latency = Date.now() - start;
    logger.error("AI provider test failed:", err);

    let message = "Connection failed";
    if (err.message?.includes("401") || err.message?.includes("Unauthorized")) {
      message = "Invalid API key";
    } else if (err.message?.includes("404") || err.message?.includes("not found")) {
      message = "Model not found";
    } else if (err.message?.includes("ECONNREFUSED")) {
      message = "Connection refused — is the server running?";
    } else if (err.message?.includes("fetch")) {
      message = "Network error — could not reach the provider";
    } else {
      message = err.message || "Unknown error";
    }

    return { success: false, message, latency_ms: latency };
  }
}

// ---------------------------------------------------------------------------
// Provider-specific test functions
// ---------------------------------------------------------------------------

async function testAnthropic(
  apiKey: string,
  model: string,
  start: number
): Promise<{ success: boolean; message: string; latency_ms: number }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in 5 words" }],
    }),
  });

  const latency = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 401) {
      return { success: false, message: "Invalid API key", latency_ms: latency };
    }
    if (resp.status === 404) {
      return { success: false, message: `Model "${model}" not found`, latency_ms: latency };
    }
    return { success: false, message: `API error ${resp.status}: ${body.substring(0, 200)}`, latency_ms: latency };
  }

  const data = await resp.json() as any;
  const text = data.content?.[0]?.text || "OK";
  return {
    success: true,
    message: `Connected successfully. Response: "${text.substring(0, 100)}"`,
    latency_ms: latency,
  };
}

async function testGemini(
  apiKey: string,
  model: string,
  start: number
): Promise<{ success: boolean; message: string; latency_ms: number }> {
  const m = model || "gemini-2.0-flash";
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say hello in 5 words" }] }],
        generationConfig: { maxOutputTokens: 50 },
      }),
    }
  );

  const latency = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 400 && body.includes("API_KEY")) {
      return { success: false, message: "Invalid API key", latency_ms: latency };
    }
    return { success: false, message: `API error ${resp.status}: ${body.substring(0, 200)}`, latency_ms: latency };
  }

  const data = await resp.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "OK";
  return {
    success: true,
    message: `Connected successfully. Response: "${text.substring(0, 100)}"`,
    latency_ms: latency,
  };
}

async function testOpenAICompatible(
  apiKey: string,
  model: string,
  baseUrl: string,
  start: number
): Promise<{ success: boolean; message: string; latency_ms: number }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in 5 words" }],
    }),
  });

  const latency = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 401) {
      return { success: false, message: "Invalid API key", latency_ms: latency };
    }
    if (resp.status === 404) {
      return { success: false, message: `Model "${model}" not found`, latency_ms: latency };
    }
    return { success: false, message: `API error ${resp.status}: ${body.substring(0, 200)}`, latency_ms: latency };
  }

  const data = await resp.json() as any;
  const text = data.choices?.[0]?.message?.content || "OK";
  return {
    success: true,
    message: `Connected successfully. Response: "${text.substring(0, 100)}"`,
    latency_ms: latency,
  };
}

async function testOllama(
  baseUrl: string,
  model: string,
  start: number
): Promise<{ success: boolean; message: string; latency_ms: number }> {
  // First test connectivity
  const url = `${baseUrl.replace(/\/+$/, "")}/api/generate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "llama3",
      prompt: "Say hello in 5 words",
      stream: false,
      options: { num_predict: 50 },
    }),
  });

  const latency = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 404) {
      return { success: false, message: `Model "${model}" not found. Run: ollama pull ${model}`, latency_ms: latency };
    }
    return { success: false, message: `Ollama error ${resp.status}: ${body.substring(0, 200)}`, latency_ms: latency };
  }

  const data = await resp.json() as any;
  const text = data.response || "OK";
  return {
    success: true,
    message: `Connected successfully. Response: "${text.substring(0, 100)}"`,
    latency_ms: latency,
  };
}
