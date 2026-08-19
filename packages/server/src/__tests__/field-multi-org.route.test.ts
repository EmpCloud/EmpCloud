import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../config/index.js", () => ({
  config: { fieldTracking: { secretKey: "field-secret" } },
}));

vi.mock("../services/field-legacy/field-legacy.service.js", () => ({
  listFieldEmployeesMultiOrg: mocks.list,
}));

vi.mock("../utils/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import fieldLegacyRoutes from "../api/routes/field-legacy.routes.js";

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api/v3", fieldLegacyRoutes);
  return instance;
}

describe("POST /api/v3/user/fieldAllEmployeeListMultiOrg", () => {
  beforeEach(() => mocks.list.mockReset());

  it("authenticates with FIELD_TRACKING_SECRET_KEY and returns the legacy paginated envelope", async () => {
    mocks.list.mockResolvedValue({ users: [{ id: 7 }], count: 42 });
    const response = await request(app()).post("/api/v3/user/fieldAllEmployeeListMultiOrg").send({
      secretKey: "field-secret",
      organization_ids: [1, 2],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: 200,
      message: "Employees found successfully",
      error: null,
      data: { users: [{ id: 7 }], count: 42 },
    });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, limit: 100 }));
  });

  it("rejects an invalid secret before querying employees", async () => {
    const response = await request(app()).post("/api/v3/user/fieldAllEmployeeListMultiOrg").send({
      secretKey: "wrong",
      organization_ids: [1],
    });
    expect(response.body.code).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns the legacy validation error envelope", async () => {
    const response = await request(app()).post("/api/v3/user/fieldAllEmployeeListMultiOrg").send({
      secretKey: "field-secret",
      organization_ids: [],
    });
    expect(response.body).toEqual({
      code: 400,
      message: "organization_ids must contain at least one organization id",
      error: "VALIDATION_ERROR",
      data: null,
    });
  });
});
