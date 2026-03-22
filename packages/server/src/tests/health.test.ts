import { describe, it, expect } from "vitest";
import { api } from "./helpers.js";

describe("Health Check", () => {
  it("GET /health returns healthy status", async () => {
    const { status, body } = await api.get("/health");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.version).toBe("1.0.0");
    expect(body.data.timestamp).toBeDefined();
  });
});
