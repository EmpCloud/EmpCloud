import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listRegularizations, getMyRegularizations } = vi.hoisted(() => ({
  listRegularizations: vi.fn(),
  getMyRegularizations: vi.fn(),
}));

vi.mock("../api/middleware/auth.middleware.js", () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = { org_id: 12, sub: 42, role: "org_admin", permissions: [] };
    next();
  },
}));
vi.mock("../api/middleware/rbac.middleware.js", () => ({
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../services/attendance/regularization.service.js", () => ({
  listRegularizations,
  getMyRegularizations,
}));

import attendanceRouter from "../api/routes/attendance.routes.js";
import { errorHandler } from "../api/middleware/error.middleware.js";

const app = express();
app.use("/attendance", attendanceRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  listRegularizations.mockResolvedValue({ records: [], total: 0 });
  getMyRegularizations.mockResolvedValue({ records: [], total: 0 });
});

describe("regularization list query validation", () => {
  it.each([
    { department_id: "0" },
    { department_id: "-1" },
    { department_id: "1.5" },
    { department_id: "Infinity" },
    { department_id: "9007199254740992" },
    { date_from: "2026-02-29" },
    { date_to: "2026-04-31" },
    { date_from: "0000-01-01" },
    { date_from: "2026-09-30", date_to: "2026-09-01" },
    { sort_order: "oldest" },
  ])("rejects invalid filters before querying: %j", async (query) => {
    const response = await request(app).get("/attendance/regularizations").query(query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(listRegularizations).not.toHaveBeenCalled();
  });

  it("passes validated department, calendar dates, and sort to the scoped list", async () => {
    const response = await request(app).get("/attendance/regularizations").query({
      department_id: "7", date_from: "2024-02-29", date_to: "2024-03-01",
      sort_order: "asc", page: "2", per_page: "10",
    });
    expect(response.status).toBe(200);
    expect(listRegularizations).toHaveBeenCalledWith(12, expect.objectContaining({
      departmentId: 7, dateFrom: "2024-02-29", dateTo: "2024-03-01",
      sortOrder: "asc", page: 2, perPage: 10,
    }));
  });

  it.each(["/regularizations", "/regularizations/me"])("defaults %s to descending order", async (path) => {
    const response = await request(app).get(`/attendance${path}`);
    expect(response.status).toBe(200);
    const args = path.endsWith("/me") ? getMyRegularizations.mock.calls[0] : listRegularizations.mock.calls[0];
    expect(args.at(-1)).toEqual(expect.objectContaining({ sortOrder: "desc" }));
  });

  it("sorts my requests without changing their organization/user scope", async () => {
    const response = await request(app).get("/attendance/regularizations/me").query({ sort_order: "asc", page: 2 });
    expect(response.status).toBe(200);
    expect(getMyRegularizations).toHaveBeenCalledWith(12, 42, { page: 2, perPage: 20, sortOrder: "asc" });
  });

  it("rejects unsupported sort on my requests", async () => {
    const response = await request(app).get("/attendance/regularizations/me").query({ sort_order: "sideways" });
    expect(response.status).toBe(400);
    expect(getMyRegularizations).not.toHaveBeenCalled();
  });
});
