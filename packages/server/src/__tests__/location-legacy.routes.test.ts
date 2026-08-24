import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../config/index.js", () => ({
  config: {
    fieldTracking: {
      get secretKey() {
        return process.env.__LOCATION_LEGACY_TEST_SECRET ?? "";
      },
    },
  },
}));

vi.mock("../services/location-legacy/location-legacy.service.js", () => ({
  getLocationsDepartmentsByOrg: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import locationLegacyRoutes from "../api/routes/location-legacy.routes.js";
import { getLocationsDepartmentsByOrg } from "../services/location-legacy/location-legacy.service.js";

const mockedGetLocations = vi.mocked(getLocationsDepartmentsByOrg);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v3/location", locationLegacyRoutes);
  return app;
}

describe("POST /api/v3/location/get-locations-dept-by-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.__LOCATION_LEGACY_TEST_SECRET = "test-secret";
    mockedGetLocations.mockResolvedValue({
      locations: [
        {
          location_id: 10,
          location: "Head Office",
          timezone: "Asia/Kolkata",
          department: [{ department_id: 20, name: "Engineering" }],
        },
      ],
      orgtimezone: "Asia/Kolkata",
    });
  });

  it("returns locations with their assigned departments for the requested organization", async () => {
    const response = await request(createApp())
      .post("/api/v3/location/get-locations-dept-by-org")
      .send({ secretKey: "test-secret", organization_id: 5 });

    expect(response.status).toBe(200);
    expect(mockedGetLocations).toHaveBeenCalledWith(5);
    expect(response.body).toEqual({
      code: 200,
      data: [
        {
          location_id: 10,
          location: "Head Office",
          timezone: "Asia/Kolkata",
          department: [{ department_id: 20, name: "Engineering" }],
        },
      ],
      orgtimezone: "Asia/Kolkata",
      message: "Locations fetched successfully",
      error: null,
    });
  });

  it("rejects an invalid shared secret without querying another tenant", async () => {
    const response = await request(createApp())
      .post("/api/v3/location/get-locations-dept-by-org")
      .send({ secretKey: "wrong-secret", organization_id: 99 });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(401);
    expect(mockedGetLocations).not.toHaveBeenCalled();
  });

  it("validates secretKey before authentication", async () => {
    const response = await request(createApp())
      .post("/api/v3/location/get-locations-dept-by-org")
      .send({ organization_id: 5 });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(mockedGetLocations).not.toHaveBeenCalled();
  });

  it.each([0, -1, "invalid", null])("rejects invalid organization_id %j", async (organizationId) => {
    const response = await request(createApp())
      .post("/api/v3/location/get-locations-dept-by-org")
      .send({ secretKey: "test-secret", organization_id: organizationId });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(mockedGetLocations).not.toHaveBeenCalled();
  });

  it("returns an empty location list without leaking data from another organization", async () => {
    mockedGetLocations.mockResolvedValueOnce({ locations: [], orgtimezone: null });

    const response = await request(createApp())
      .post("/api/v3/location/get-locations-dept-by-org")
      .send({ secretKey: "test-secret", organization_id: 77 });

    expect(mockedGetLocations).toHaveBeenCalledWith(77);
    expect(response.body.data).toEqual([]);
    expect(response.body.orgtimezone).toBeNull();
  });
});
