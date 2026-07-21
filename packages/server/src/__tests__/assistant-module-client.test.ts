import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config/index.js";
import { payrollGet } from "../services/assistant/module-client.js";

describe("assistant module client", () => {
  beforeEach(() => {
    config.assistant.internalServiceSecret = "test-secret";
    config.assistant.payrollUrl = "http://payroll.test";
    config.assistant.moduleMaxRetries = 2;
    config.assistant.moduleRetryBaseMs = 100;
    vi.unstubAllGlobals();
  });

  it("retries transport failures and returns a stable unavailable error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(payrollGet(7, "internal/assistant/payroll-runs/totals")).rejects.toMatchObject({
      statusCode: 503,
      code: "MODULE_UNAVAILABLE",
      message: expect.not.stringContaining("fetch failed"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient module authorization failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(payrollGet(7, "internal/assistant/payroll-runs/totals")).rejects.toMatchObject({
      statusCode: 401,
      code: "MODULE_REQUEST_FAILED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
