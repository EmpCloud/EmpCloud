import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getAIConfig,
  updateAIConfig,
  getActiveProvider,
  getDecryptedKey,
  getDecryptedConfig,
} from "../services/admin/ai-config.service.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.insert = vi.fn(() => [1]);
  chain.update = vi.fn(() => 1);
  chain.orderBy = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  return { db, chain };
}

describe("ai-config.service", () => {
  let db: any;
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockDB();
    db = mock.db;
    chain = mock.chain;
    mockedGetDB.mockReturnValue(db);
  });

  // -----------------------------------------------------------------------
  // getAIConfig
  // -----------------------------------------------------------------------
  describe("getAIConfig", () => {
    it("returns masked values for sensitive keys", async () => {
      chain._result = [
        { id: 1, config_key: "anthropic_api_key", config_value: "sk-ant-test1234abcd", is_active: 1, updated_at: new Date(), created_at: new Date() },
        { id: 2, config_key: "active_provider", config_value: "anthropic", is_active: 1, updated_at: new Date(), created_at: new Date() },
      ];

      const result = await getAIConfig();
      // Sensitive key should be masked (show only last 4)
      expect(result[0].config_value).toMatch(/^\*\*\*\*/);
      expect(result[0].config_value).not.toBe("sk-ant-test1234abcd");
      // Non-sensitive key should be returned as-is
      expect(result[1].config_value).toBe("anthropic");
    });

    it("returns null for null config values", async () => {
      chain._result = [
        { id: 1, config_key: "anthropic_api_key", config_value: null, is_active: 0, updated_at: new Date(), created_at: new Date() },
      ];

      const result = await getAIConfig();
      expect(result[0].config_value).toBeNull();
    });

    it("masks short keys with just ****", async () => {
      chain._result = [
        { id: 1, config_key: "anthropic_api_key", config_value: "ab", is_active: 1, updated_at: new Date(), created_at: new Date() },
      ];

      const result = await getAIConfig();
      expect(result[0].config_value).toBe("****");
    });
  });

  // -----------------------------------------------------------------------
  // updateAIConfig
  // -----------------------------------------------------------------------
  describe("updateAIConfig", () => {
    it("updates existing config row", async () => {
      chain._firstResult = { id: 1, config_key: "active_provider" };

      const result = await updateAIConfig("active_provider", "openai", 10);
      expect(result.success).toBe(true);
      expect(chain.update).toHaveBeenCalled();
    });

    it("inserts new config row when not existing", async () => {
      chain._firstResult = undefined;

      const result = await updateAIConfig("active_provider", "anthropic", 10);
      expect(result.success).toBe(true);
      expect(chain.insert).toHaveBeenCalled();
    });

    it("encrypts sensitive keys before storing", async () => {
      chain._firstResult = undefined;

      await updateAIConfig("anthropic_api_key", "sk-ant-secret123", 10);
      const insertArgs = chain.insert.mock.calls[0][0];
      // Encrypted value should NOT be the plaintext
      expect(insertArgs.config_value).not.toBe("sk-ant-secret123");
      // Should be in the encrypted format iv:authTag:ciphertext
      expect(insertArgs.config_value).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    });

    it("does not encrypt non-sensitive keys", async () => {
      chain._firstResult = undefined;

      await updateAIConfig("active_provider", "anthropic", 10);
      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.config_value).toBe("anthropic");
    });

    it("sets is_active to false when value is null", async () => {
      chain._firstResult = { id: 1 };

      await updateAIConfig("anthropic_api_key", null, 10);
      const updateArgs = chain.update.mock.calls[0][0];
      expect(updateArgs.is_active).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getActiveProvider
  // -----------------------------------------------------------------------
  describe("getActiveProvider", () => {
    it("returns inactive when provider is none", async () => {
      chain._firstResult = { config_value: "none" };

      const result = await getActiveProvider();
      expect(result.status).toBe("inactive");
    });

    it("returns active for ollama (no API key needed)", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { config_value: "ollama" };
        return { config_value: "llama3" };
      });

      const result = await getActiveProvider();
      expect(result.provider).toBe("ollama");
      expect(result.status).toBe("active");
    });

    it("returns not_configured when API key is missing for provider", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { config_value: "anthropic" };
        if (callCount === 2) return { config_value: "claude-sonnet-4-20250514" };
        return undefined; // no API key
      });

      const result = await getActiveProvider();
      expect(result.status).toBe("not_configured");
    });

    it("returns active when API key exists for provider", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { config_value: "anthropic" };
        if (callCount === 2) return { config_value: "claude-sonnet-4-20250514" };
        return { config_value: "encrypted-key-value" }; // has key
      });

      const result = await getActiveProvider();
      expect(result.status).toBe("active");
    });

    it("defaults to none/claude-sonnet-4-20250514 when no config rows", async () => {
      chain._firstResult = undefined;

      const result = await getActiveProvider();
      expect(result.provider).toBe("none");
      expect(result.model).toBe("claude-sonnet-4-20250514");
    });
  });

  // -----------------------------------------------------------------------
  // getDecryptedKey
  // -----------------------------------------------------------------------
  describe("getDecryptedKey", () => {
    it("returns null when key not found", async () => {
      chain._firstResult = undefined;
      const result = await getDecryptedKey("anthropic_api_key");
      expect(result).toBeNull();
    });

    it("returns null when value is null", async () => {
      chain._firstResult = { config_value: null };
      const result = await getDecryptedKey("anthropic_api_key");
      expect(result).toBeNull();
    });

    it("returns value as-is for non-sensitive keys", async () => {
      chain._firstResult = { config_value: "anthropic" };
      const result = await getDecryptedKey("active_provider");
      expect(result).toBe("anthropic");
    });
  });

  // -----------------------------------------------------------------------
  // getDecryptedConfig
  // -----------------------------------------------------------------------
  describe("getDecryptedConfig", () => {
    it("returns all config with sensitive keys decrypted", async () => {
      chain._result = [
        { config_key: "active_provider", config_value: "anthropic" },
        { config_key: "ai_model", config_value: "claude-sonnet-4-20250514" },
      ];

      const result = await getDecryptedConfig();
      expect(result.active_provider).toBe("anthropic");
      expect(result.ai_model).toBe("claude-sonnet-4-20250514");
    });
  });
});
