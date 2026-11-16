import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getMyTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
  listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
}));

vi.mock("../api/middleware/auth.middleware.js", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      sub: 100,
      role: "hr_admin",
      org_id: 5,
    };
    next();
  },
}));

vi.mock("../api/middleware/rbac.middleware.js", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../services/audit/audit.service.js", () => ({
  logAudit: vi.fn(),
}));

vi.mock("../services/helpdesk/helpdesk.service.js", () => ({
  getMyTickets: mocks.getMyTickets,
  listTickets: mocks.listTickets,
}));

import helpdeskRouter from "../api/routes/helpdesk.routes.js";
import { errorHandler } from "../api/middleware/error.middleware.js";

const app = express();
app.use(express.json());
app.use("/api/v1/helpdesk", helpdeskRouter);
app.use(errorHandler);

describe("helpdesk query routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMyTickets.mockResolvedValue({ tickets: [], total: 0 });
    mocks.listTickets.mockResolvedValue({ tickets: [], total: 0 });
  });

  it.each([
    "created_date=2026-02-30",
    "created_date=16-10-2026",
    "resolved_date=tomorrow",
    "resolved_date=2026-13-01",
  ])("returns 400 for invalid date query %s", async (query) => {
    const response = await request(app).get(
      `/api/v1/helpdesk/tickets?${query}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(mocks.listTickets).not.toHaveBeenCalled();
  });

  it("forwards both sort aliases to the service", async () => {
    const response = await request(app).get(
      "/api/v1/helpdesk/tickets?sort_by=subject&sort_order=asc&sort_direction=desc",
    );

    expect(response.status).toBe(200);
    expect(mocks.listTickets).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        sort_by: "subject",
        sort_order: "asc",
        sort_direction: "desc",
      }),
    );
  });

  it("validates and forwards my-ticket filters", async () => {
    const response = await request(app).get(
      "/api/v1/helpdesk/tickets/my?status=reopened&category=it&priority=high&search=%20VPN%20&date_range=30&sort=priority",
    );

    expect(response.status).toBe(200);
    expect(mocks.getMyTickets).toHaveBeenCalledWith(5, 100, {
      page: 1,
      perPage: 20,
      status: "reopened",
      category: "it",
      priority: "high",
      search: "VPN",
      date_range: "30",
      sort: "priority",
    });
  });

  it("returns 400 for invalid my-ticket enums", async () => {
    const response = await request(app).get(
      "/api/v1/helpdesk/tickets/my?status=unknown&category=invalid",
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(mocks.getMyTickets).not.toHaveBeenCalled();
  });
});
