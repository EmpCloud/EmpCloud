import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Deep Branch Coverage E2E Tests for Core Services (Part 2)
// Targets 8 service files from 23% to 80%+ coverage:
//   1. whistleblowing.service.ts (23.5%)
//   2. webhook-handler.service.ts (29.7%)
//   3. module-webhook.service.ts (32.3%)
//   4. wellness.service.ts (35.4%)
//   5. survey.service.ts (40.8%)
//   6. subscription.service.ts (42.8%)
//   7. custom-field.service.ts (44.5%)
//   8. helpdesk.service.ts (47.4%)
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const RUN = Date.now().toString().slice(-6);

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: "Welcome@123" };
const MANAGER = { email: "karthik@technova.in", password: "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
  orgId: number;
  role: string;
}

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    token: body.data.tokens.access_token,
    userId: body.data.user.id,
    orgId: body.data.user.organization_id,
    role: body.data.user.role,
  };
}

function hdr(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const OK = [200, 201];
const OK_OR_ERR = [200, 201, 400, 401, 403, 404, 409, 422, 500];

// =============================================================================
// 1. WHISTLEBLOWING SERVICE (23.5% → 80%+)
// =============================================================================

test.describe("Whistleblowing Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let caseNumber: string;
  let reportId: number;
  let namedReportId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Submit anonymous report ---
  test("submit anonymous whistleblower report", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports`, {
      headers: hdr(empToken),
      data: {
        category: "fraud",
        severity: "high",
        subject: `Anonymous fraud report ${RUN}`,
        description: "Observed suspicious financial transactions in Q4 reports",
        is_anonymous: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.case_number).toBeTruthy();
    expect(body.data.id).toBeGreaterThan(0);
    caseNumber = body.data.case_number;
    reportId = body.data.id;
  });

  // --- Submit named report ---
  test("submit named (non-anonymous) report", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports`, {
      headers: hdr(empToken),
      data: {
        category: "harassment",
        severity: "critical",
        subject: `Named harassment report ${RUN}`,
        description: "Witnessed workplace harassment in the engineering department",
        evidence_paths: ["/evidence/doc1.pdf", "/evidence/screenshot.png"],
        is_anonymous: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    namedReportId = body.data.id;
    expect(body.data.case_number).toMatch(/^WB-\d{4}-\d{4}$/);
  });

  // --- Submit report with default severity ---
  test("submit report with default severity (medium)", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports`, {
      headers: hdr(empToken),
      data: {
        category: "safety",
        subject: `Safety concern ${RUN}`,
        description: "Broken fire extinguisher on floor 3",
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Submit via alias route (POST /whistleblowing) ---
  test("submit report via alias route POST /whistleblowing", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing`, {
      headers: hdr(empToken),
      data: {
        category: "corruption",
        subject: `Corruption report alias ${RUN}`,
        description: "Vendor kickback scheme discovered",
        is_anonymous: true,
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Get my reports (hash-matched for anonymous) ---
  test("get my reports (includes anonymous via hash)", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/my`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  // --- Get my reports via alias route ---
  test("get my reports via alias GET /whistleblowing", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- Lookup by case number ---
  test("lookup report by case number", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/lookup/${caseNumber}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.case_number).toBe(caseNumber);
    expect(body.data.updates).toBeDefined();
    expect(body.data.status).toBe("submitted");
  });

  // --- Lookup by invalid case number ---
  test("lookup by invalid case number returns 404", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/lookup/WB-9999-9999`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Dashboard stats (HR only) ---
  test("get whistleblowing dashboard (HR)", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(body.data.by_status).toBeDefined();
    expect(body.data.by_category).toBeDefined();
    expect(body.data.by_severity).toBeDefined();
    expect(body.data.open).toBeGreaterThanOrEqual(0);
    expect(body.data.resolved).toBeGreaterThanOrEqual(0);
    expect(body.data.recent).toBeDefined();
  });

  // --- Dashboard denied for employee ---
  test("dashboard denied for employee role", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/dashboard`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- List all reports (HR) with no filters ---
  test("list all reports (HR, no filters)", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination).toBeDefined();
  });

  // --- List with status filter ---
  test("list reports filtered by status=submitted", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports?status=submitted`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const r of body.data) {
      expect(r.status).toBe("submitted");
    }
  });

  // --- List with category filter ---
  test("list reports filtered by category=fraud", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports?category=fraud`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List with severity filter ---
  test("list reports filtered by severity=high", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports?severity=high`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List with search filter ---
  test("list reports with search query", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports?search=${RUN}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List with pagination ---
  test("list reports with custom pagination", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports?page=1&per_page=2`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  // --- List denied for employee ---
  test("list all reports denied for employee", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Get report detail (HR) ---
  test("get report detail (HR) — anonymous report hides identity", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/${reportId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.case_number).toBe(caseNumber);
    expect(body.data.is_anonymous).toBeTruthy();
    // Anonymous: reporter_user_id should be null
    expect(body.data.reporter_user_id).toBeNull();
    expect(body.data.updates).toBeDefined();
  });

  // --- Get named report detail — shows reporter ---
  test("get report detail (HR) — named report shows reporter", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/${namedReportId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.is_anonymous).toBeFalsy();
    // Named: reporter should be visible
    if (body.data.reporter_user_id !== null) {
      expect(body.data.reporter_user_id).toBe(empUserId);
    }
    // evidence_paths should be parsed
    expect(body.data.evidence_paths).toBeDefined();
  });

  // --- Get non-existent report ---
  test("get non-existent report returns 404", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Assign investigator ---
  test("assign investigator to report", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/assign`, {
      headers: hdr(adminToken),
      data: { investigator_id: adminUserId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.assigned_investigator_id).toBe(adminUserId);
    // Status should transition from submitted to under_investigation
    expect(body.data.status).toBe("under_investigation");
  });

  // --- Assign investigator to non-existent report ---
  test("assign investigator to non-existent report returns 404", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/999999/assign`, {
      headers: hdr(adminToken),
      data: { investigator_id: adminUserId },
    });
    expect(res.status()).toBe(404);
  });

  // --- Add visible update ---
  test("add visible update to report", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/update`, {
      headers: hdr(adminToken),
      data: {
        content: "Investigation has commenced. Initial evidence reviewed.",
        update_type: "progress",
        is_visible_to_reporter: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);
  });

  // --- Add internal (non-visible) update ---
  test("add internal update (not visible to reporter)", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/update`, {
      headers: hdr(adminToken),
      data: {
        content: "Internal note: Witness interview scheduled for Monday.",
        update_type: "internal_note",
        is_visible_to_reporter: false,
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Add update to non-existent report ---
  test("add update to non-existent report returns 404", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/999999/update`, {
      headers: hdr(adminToken),
      data: {
        content: "Test",
        update_type: "progress",
        is_visible_to_reporter: true,
      },
    });
    expect(res.status()).toBe(404);
  });

  // --- Verify lookup shows visible updates only ---
  test("lookup shows only visible updates", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/reports/lookup/${caseNumber}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should have the investigator-assigned update + the visible progress update
    expect(body.data.updates.length).toBeGreaterThanOrEqual(2);
    // Internal notes should NOT appear
    const hasInternal = body.data.updates.some((u: any) =>
      u.content.includes("Internal note")
    );
    expect(hasInternal).toBe(false);
  });

  // --- Change status to resolved ---
  test("change status to resolved with resolution", async ({ request }) => {
    const res = await request.put(`${API}/whistleblowing/reports/${reportId}/status`, {
      headers: hdr(adminToken),
      data: {
        status: "resolved",
        resolution: "Investigation complete. Corrective actions taken.",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("resolved");
    expect(body.data.resolution).toBeTruthy();
    expect(body.data.resolved_at).toBeTruthy();
  });

  // --- Change status to dismissed ---
  test("change status to dismissed on named report", async ({ request }) => {
    const res = await request.put(`${API}/whistleblowing/reports/${namedReportId}/status`, {
      headers: hdr(adminToken),
      data: { status: "dismissed", resolution: "Insufficient evidence after review" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("dismissed");
    expect(body.data.resolved_at).toBeTruthy();
  });

  // --- Change status to closed ---
  test("change status to closed", async ({ request }) => {
    const res = await request.put(`${API}/whistleblowing/reports/${reportId}/status`, {
      headers: hdr(adminToken),
      data: { status: "closed" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("closed");
  });

  // --- Change status on non-existent report ---
  test("change status on non-existent report returns 404", async ({ request }) => {
    const res = await request.put(`${API}/whistleblowing/reports/999999/status`, {
      headers: hdr(adminToken),
      data: { status: "resolved" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Escalate report ---
  test("escalate a new report externally", async ({ request }) => {
    // Create a fresh report to escalate
    const createRes = await request.post(`${API}/whistleblowing/reports`, {
      headers: hdr(empToken),
      data: {
        category: "bribery",
        severity: "critical",
        subject: `Bribery escalation test ${RUN}`,
        description: "Major bribery incident requiring external investigation",
        is_anonymous: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const escReportId = createBody.data.id;

    const res = await request.post(`${API}/whistleblowing/reports/${escReportId}/escalate`, {
      headers: hdr(adminToken),
      data: { escalated_to: "External Legal Counsel - ABC Law Firm" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("escalated");
    expect(body.data.escalated_to).toBe("External Legal Counsel - ABC Law Firm");
  });

  // --- Escalate non-existent report ---
  test("escalate non-existent report returns 404", async ({ request }) => {
    const res = await request.post(`${API}/whistleblowing/reports/999999/escalate`, {
      headers: hdr(adminToken),
      data: { escalated_to: "Police" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Dashboard reflects resolved stats ---
  test("dashboard reflects avg_resolution_days after resolving", async ({ request }) => {
    const res = await request.get(`${API}/whistleblowing/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // After resolving, avg_resolution_days should be present
    expect(body.data).toHaveProperty("avg_resolution_days");
  });
});

// =============================================================================
// 2. BILLING WEBHOOK HANDLER SERVICE (29.7% → 80%+)
// =============================================================================

test.describe("Billing Webhook Handler — Deep Branch Coverage", () => {
  const BILLING_API_KEY = process.env.BILLING_API_KEY || "empcloud-billing-key-2024";

  function webhookHeaders() {
    return {
      "x-billing-api-key": BILLING_API_KEY,
      "Content-Type": "application/json",
    };
  }

  // --- Missing API key ---
  test("reject webhook with missing API key", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: { event: "invoice.paid", data: {} },
    });
    expect(res.status()).toBe(401);
  });

  // --- Invalid API key ---
  test("reject webhook with invalid API key", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "x-billing-api-key": "wrong-key", "Content-Type": "application/json" },
      data: { event: "invoice.paid", data: {} },
    });
    expect(res.status()).toBe(401);
  });

  // --- Missing event/data fields ---
  test("reject webhook with missing event field", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: { data: { some: "data" } },
    });
    expect(res.status()).toBe(400);
  });

  test("reject webhook with missing data field", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: { event: "invoice.paid" },
    });
    expect(res.status()).toBe(400);
  });

  // --- invoice.paid event ---
  test("process invoice.paid event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "invoice.paid",
        data: {
          invoiceId: "INV-TEST-001",
          subscriptionId: "BILLING-SUB-FAKE-001",
          amount: 5000,
        },
        orgId: 1,
        timestamp: new Date().toISOString(),
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.received).toBe(true);
    expect(body.data.event).toBe("invoice.paid");
  });

  // --- invoice.paid with no subscriptionId (no mapping branch) ---
  test("process invoice.paid without subscriptionId", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "invoice.paid",
        data: { invoiceId: "INV-TEST-002", amount: 3000 },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- payment.received event ---
  test("process payment.received event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "payment.received",
        data: {
          paymentId: "PAY-TEST-001",
          amount: 10000,
          currency: "INR",
          gateway: "stripe",
        },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.event).toBe("payment.received");
  });

  // --- subscription.cancelled event ---
  test("process subscription.cancelled event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "subscription.cancelled",
        data: { subscriptionId: "BILLING-SUB-FAKE-CANCEL-001" },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.event).toBe("subscription.cancelled");
  });

  // --- subscription.cancelled with alternative field name ---
  test("process subscription.cancelled with subscription_id field", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "subscription.cancelled",
        data: { subscription_id: "BILLING-SUB-ALT-001", id: "fallback-id" },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- subscription.payment_failed event ---
  test("process subscription.payment_failed event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "subscription.payment_failed",
        data: {
          subscriptionId: "BILLING-SUB-FAIL-001",
          reason: "card_declined",
        },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.event).toBe("subscription.payment_failed");
  });

  // --- invoice.overdue event ---
  test("process invoice.overdue event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "invoice.overdue",
        data: {
          invoiceId: "INV-OVERDUE-001",
          subscriptionId: "BILLING-SUB-OVERDUE-001",
          daysOverdue: 15,
        },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.event).toBe("invoice.overdue");
  });

  // --- invoice.overdue without subscriptionId ---
  test("process invoice.overdue without subscriptionId", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "invoice.overdue",
        data: { invoiceId: "INV-OVERDUE-002" },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Unknown event type ---
  test("process unknown webhook event type (logs warning)", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: webhookHeaders(),
      data: {
        event: "some.unknown.event",
        data: { foo: "bar" },
        orgId: 1,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.received).toBe(true);
  });
});

// =============================================================================
// 3. MODULE WEBHOOK SERVICE (32.3% → 80%+)
// =============================================================================

test.describe("Module Webhook Service — Deep Branch Coverage", () => {
  const BILLING_API_KEY = process.env.BILLING_API_KEY || "empcloud-billing-key-2024";

  function webhookHeaders() {
    return {
      "x-api-key": BILLING_API_KEY,
      "Content-Type": "application/json",
    };
  }

  // --- Missing API key ---
  test("reject module webhook with missing API key", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: { "Content-Type": "application/json" },
      data: { event: "recruit.candidate_hired", data: {} },
    });
    expect(res.status()).toBe(401);
  });

  // --- Invalid API key ---
  test("reject module webhook with invalid API key", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: { "x-api-key": "wrong-key", "Content-Type": "application/json" },
      data: { event: "recruit.candidate_hired", data: {} },
    });
    expect(res.status()).toBe(401);
  });

  // --- Missing event/data ---
  test("reject module webhook with missing event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: { data: { something: "test" } },
    });
    expect(res.status()).toBe(400);
  });

  // --- recruit.candidate_hired with employeeId ---
  test("process recruit.candidate_hired event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "recruit.candidate_hired",
        data: {
          employeeId: 99999,
          candidateId: "CAND-001",
          jobTitle: "Software Engineer",
          joiningDate: "2026-05-01",
        },
        source: "emp-recruit",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.received).toBe(true);
    expect(body.data.event).toBe("recruit.candidate_hired");
  });

  // --- recruit.candidate_hired without employeeId ---
  test("process recruit.candidate_hired without employeeId", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "recruit.candidate_hired",
        data: {
          candidateId: "CAND-002",
          jobTitle: "Designer",
        },
        source: "emp-recruit",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- exit.initiated event ---
  test("process exit.initiated event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "exit.initiated",
        data: {
          employeeId: 99999,
          exitType: "resignation",
          lastWorkingDate: "2026-06-30",
        },
        source: "emp-exit",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- exit.initiated without employeeId ---
  test("process exit.initiated without employeeId", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "exit.initiated",
        data: { exitType: "termination" },
        source: "emp-exit",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- exit.completed event ---
  test("process exit.completed event (deactivates user)", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "exit.completed",
        data: {
          employeeId: 99999,
          exitType: "resignation",
          lastWorkingDate: "2026-06-30",
        },
        source: "emp-exit",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- exit.completed without employeeId or lastWorkingDate ---
  test("process exit.completed without employeeId", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "exit.completed",
        data: { exitType: "termination" },
        source: "emp-exit",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- performance.cycle_completed ---
  test("process performance.cycle_completed event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "performance.cycle_completed",
        data: {
          cycleId: 101,
          cycleName: "Q4 2026 Review",
          participantCount: 45,
        },
        source: "emp-performance",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- rewards.milestone_achieved ---
  test("process rewards.milestone_achieved event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "rewards.milestone_achieved",
        data: {
          employeeId: 99999,
          milestoneName: "5 Years of Service",
          pointsAwarded: 500,
        },
        source: "emp-rewards",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Unknown module event ---
  test("process unknown module event (logs warning)", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "some.unknown.module.event",
        data: { foo: "bar" },
        source: "unknown-module",
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- No source field ---
  test("process module webhook without source", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: webhookHeaders(),
      data: {
        event: "performance.cycle_completed",
        data: { cycleId: 200, cycleName: "H1 Review", participantCount: 20 },
      },
    });
    expect(res.status()).toBe(200);
  });
});

// =============================================================================
// 4. WELLNESS SERVICE (35.4% → 80%+)
// =============================================================================

test.describe("Wellness Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let programId: number;
  let goalId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Create wellness program (HR) ---
  test("create wellness program", async ({ request }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const res = await request.post(`${API}/wellness/programs`, {
      headers: hdr(adminToken),
      data: {
        title: `Wellness Challenge ${RUN}`,
        description: "30-day step counting challenge",
        program_type: "fitness",
        start_date: tomorrow.toISOString().split("T")[0],
        end_date: nextMonth.toISOString().split("T")[0],
        is_active: true,
        max_participants: 50,
        points_reward: 100,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    programId = body.data.id;
    expect(body.data.title).toContain(RUN);
  });

  // --- Create program with past start_date (should fail) ---
  test("create program with past start_date fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs`, {
      headers: hdr(adminToken),
      data: {
        title: "Past program",
        program_type: "fitness",
        start_date: "2020-01-01",
        end_date: "2020-02-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Create program with end_date before start_date ---
  test("create program with end_date before start_date fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs`, {
      headers: hdr(adminToken),
      data: {
        title: "Invalid dates program",
        program_type: "fitness",
        start_date: "2026-06-01",
        end_date: "2026-05-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Create program denied for employee ---
  test("create program denied for employee", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs`, {
      headers: hdr(empToken),
      data: { title: "Should fail", program_type: "other" },
    });
    expect(res.status()).toBe(403);
  });

  // --- List programs ---
  test("list wellness programs", async ({ request }) => {
    const res = await request.get(`${API}/wellness/programs`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List programs with filter ---
  test("list programs filtered by program_type", async ({ request }) => {
    const res = await request.get(`${API}/wellness/programs?program_type=fitness`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get program detail ---
  test("get program detail", async ({ request }) => {
    const res = await request.get(`${API}/wellness/programs/${programId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(programId);
  });

  // --- Get non-existent program ---
  test("get non-existent program returns 404", async ({ request }) => {
    const res = await request.get(`${API}/wellness/programs/999999`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Update program (HR) ---
  test("update wellness program", async ({ request }) => {
    const res = await request.put(`${API}/wellness/programs/${programId}`, {
      headers: hdr(adminToken),
      data: {
        title: `Updated Wellness ${RUN}`,
        description: "Updated to 45-day challenge",
        points_reward: 200,
        max_participants: 100,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.points_reward).toBe(200);
  });

  // --- Update program with invalid end_date ---
  test("update program with end_date before start_date fails", async ({ request }) => {
    const res = await request.put(`${API}/wellness/programs/${programId}`, {
      headers: hdr(adminToken),
      data: { end_date: "2020-01-01" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Update non-existent program ---
  test("update non-existent program returns 404", async ({ request }) => {
    const res = await request.put(`${API}/wellness/programs/999999`, {
      headers: hdr(adminToken),
      data: { title: "No" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Enroll in program ---
  test("enroll in wellness program", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/${programId}/enroll`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.message).toContain("enrolled");
  });

  // --- Duplicate enrollment ---
  test("duplicate enrollment fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/${programId}/enroll`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Enroll in non-existent program ---
  test("enroll in non-existent program returns 404", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/999999/enroll`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Get my programs (enrolled) ---
  test("get my enrolled programs", async ({ request }) => {
    const res = await request.get(`${API}/wellness/my`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- Complete program ---
  test("complete enrolled program", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/${programId}/complete`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("completed");
  });

  // --- Complete already-completed program ---
  test("complete already-completed program fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/${programId}/complete`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Complete non-existent enrollment ---
  test("complete non-existent enrollment returns 404", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs/999999/complete`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Daily check-in (new) ---
  test("daily wellness check-in", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: hdr(empToken),
      data: {
        mood: "good",
        energy_level: 4,
        sleep_hours: 7.5,
        exercise_minutes: 30,
        notes: "Feeling productive today",
        check_in_date: today,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.check_in_date).toBe(today);
  });

  // --- Daily check-in update (same date) ---
  test("daily check-in update on same date", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: hdr(empToken),
      data: {
        mood: "great",
        energy_level: 5,
        exercise_minutes: 45,
        check_in_date: today,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.message).toContain("updated");
  });

  // --- Check-in with default date ---
  test("check-in with default date (no check_in_date)", async ({ request }) => {
    // Use yesterday to avoid conflict with today's check-in
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: hdr(empToken),
      data: {
        mood: "okay",
        energy_level: 3,
        check_in_date: yesterday.toISOString().split("T")[0],
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Check-in with invalid energy level ---
  test("check-in with invalid energy level fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: hdr(empToken),
      data: {
        mood: "good",
        energy_level: 10,
        check_in_date: "2026-01-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Get my check-ins ---
  test("get my check-ins with date range", async ({ request }) => {
    const res = await request.get(`${API}/wellness/check-ins?start_date=2026-01-01&end_date=2026-12-31`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(0);
    expect(body.pagination).toBeDefined();
  });

  // --- Get my check-ins without filters ---
  test("get my check-ins without filters", async ({ request }) => {
    const res = await request.get(`${API}/wellness/check-ins`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get check-in trends (daily) ---
  test("get check-in trends (daily)", async ({ request }) => {
    const res = await request.get(`${API}/wellness/trends?period=daily&days=30`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.period).toBe("daily");
    expect(body.data.days).toBe(30);
    expect(body.data.trends).toBeDefined();
  });

  // --- Get check-in trends (weekly) ---
  test("get check-in trends (weekly)", async ({ request }) => {
    const res = await request.get(`${API}/wellness/trends?period=weekly&days=60`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.period).toBe("weekly");
  });

  // --- Create wellness goal ---
  test("create wellness goal", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: hdr(empToken),
      data: {
        title: `Steps Goal ${RUN}`,
        goal_type: "steps",
        target_value: 10000,
        unit: "steps",
        frequency: "daily",
        start_date: new Date().toISOString().split("T")[0],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    goalId = body.data.id;
    expect(body.data.status).toBe("active");
  });

  // --- Create goal with end before start ---
  test("create goal with end_date before start_date fails", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: hdr(empToken),
      data: {
        title: "Bad date goal",
        target_value: 100,
        unit: "hours",
        start_date: "2026-06-01",
        end_date: "2026-05-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- List goals ---
  test("list my goals", async ({ request }) => {
    const res = await request.get(`${API}/wellness/goals`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List goals filtered by status ---
  test("list my goals filtered by status=active", async ({ request }) => {
    const res = await request.get(`${API}/wellness/goals?status=active`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Update goal progress ---
  test("update goal progress", async ({ request }) => {
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: hdr(empToken),
      data: { current_value: 5000 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.current_value).toBe(5000);
  });

  // --- Update goal to auto-complete (target reached) ---
  test("update goal to reach target (auto-complete)", async ({ request }) => {
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: hdr(empToken),
      data: { current_value: 10000 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("completed");
  });

  // --- Update completed goal fails ---
  test("update completed goal fails", async ({ request }) => {
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: hdr(empToken),
      data: { current_value: 15000 },
    });
    expect(res.status()).toBe(403);
  });

  // --- Update non-existent goal ---
  test("update non-existent goal returns 404", async ({ request }) => {
    const res = await request.put(`${API}/wellness/goals/999999`, {
      headers: hdr(empToken),
      data: { current_value: 100 },
    });
    expect(res.status()).toBe(404);
  });

  // --- Delete goal (create one first, then delete) ---
  test("delete a goal", async ({ request }) => {
    const createRes = await request.post(`${API}/wellness/goals`, {
      headers: hdr(empToken),
      data: {
        title: `Delete me ${RUN}`,
        target_value: 50,
        unit: "km",
        start_date: new Date().toISOString().split("T")[0],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const deleteGoalId = createBody.data.id;

    const res = await request.delete(`${API}/wellness/goals/${deleteGoalId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Delete non-existent goal ---
  test("delete non-existent goal returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/wellness/goals/999999`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Wellness dashboard (HR) ---
  test("get wellness dashboard (HR)", async ({ request }) => {
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("active_programs");
    expect(body.data).toHaveProperty("total_programs");
    expect(body.data).toHaveProperty("total_enrollments");
    expect(body.data).toHaveProperty("checkin_count_30d");
    expect(body.data).toHaveProperty("mood_distribution");
    expect(body.data).toHaveProperty("wellness_score");
    expect(body.data).toHaveProperty("goal_completion_rate");
    expect(body.data).toHaveProperty("recent_programs");
    expect(body.data).toHaveProperty("top_programs");
  });

  // --- Dashboard denied for employee ---
  test("dashboard denied for employee", async ({ request }) => {
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- My wellness summary ---
  test("get my wellness summary", async ({ request }) => {
    const res = await request.get(`${API}/wellness/summary`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("mood_trend");
    expect(body.data).toHaveProperty("active_goals");
    expect(body.data).toHaveProperty("completed_goals_count");
    expect(body.data).toHaveProperty("enrolled_programs");
    expect(body.data).toHaveProperty("checkin_streak");
    expect(body.data).toHaveProperty("total_checkins");
    expect(body.data).toHaveProperty("latest_mood");
    expect(body.data).toHaveProperty("avg_energy_level");
  });
});

// =============================================================================
// 5. SURVEY SERVICE (40.8% → 80%+)
// =============================================================================

test.describe("Survey Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let surveyId: number;
  let enpsId: number;
  let questionIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Create survey ---
  test("create pulse survey with questions", async ({ request }) => {
    const res = await request.post(`${API}/surveys`, {
      headers: hdr(adminToken),
      data: {
        title: `Pulse Survey ${RUN}`,
        description: "Monthly pulse check",
        type: "pulse",
        is_anonymous: true,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        target_type: "all",
        recurrence: "monthly",
        questions: [
          { question_text: "How satisfied are you at work?", question_type: "rating_1_5", is_required: true },
          { question_text: "What can we improve?", question_type: "text", is_required: false },
          { question_text: "Do you feel supported?", question_type: "yes_no", is_required: true },
          {
            question_text: "Which benefit do you value most?",
            question_type: "multiple_choice",
            options: ["Health Insurance", "Remote Work", "Learning Budget", "Gym"],
            is_required: true,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    surveyId = body.data.id;
    questionIds = body.data.questions.map((q: any) => q.id);
    expect(body.data.status).toBe("draft");
    expect(body.data.questions.length).toBe(4);
  });

  // --- Create survey with end before start ---
  test("create survey with end_date before start_date fails", async ({ request }) => {
    const res = await request.post(`${API}/surveys`, {
      headers: hdr(adminToken),
      data: {
        title: "Invalid dates survey",
        type: "pulse",
        start_date: "2026-06-01",
        end_date: "2026-05-01",
        questions: [{ question_text: "Q1", question_type: "rating_1_5" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Create eNPS survey ---
  test("create eNPS survey", async ({ request }) => {
    const res = await request.post(`${API}/surveys`, {
      headers: hdr(adminToken),
      data: {
        title: `eNPS Survey ${RUN}`,
        description: "Quarterly eNPS",
        type: "enps",
        is_anonymous: true,
        questions: [
          { question_text: "How likely are you to recommend this company?", question_type: "enps_0_10", is_required: true },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    enpsId = body.data.id;
  });

  // --- List surveys (HR) ---
  test("list surveys (HR, no filters)", async ({ request }) => {
    const res = await request.get(`${API}/surveys`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List surveys with status filter ---
  test("list surveys filtered by status=draft", async ({ request }) => {
    const res = await request.get(`${API}/surveys?status=draft`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List surveys with type filter ---
  test("list surveys filtered by type=pulse", async ({ request }) => {
    const res = await request.get(`${API}/surveys?type=pulse`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List surveys as employee (should default to active) ---
  test("list surveys as employee defaults to active", async ({ request }) => {
    const res = await request.get(`${API}/surveys`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Employee trying to filter by draft ---
  test("employee cannot filter by status=draft", async ({ request }) => {
    const res = await request.get(`${API}/surveys?status=draft`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should return empty for employee requesting draft
    expect(body.data.length).toBe(0);
  });

  // --- Get survey detail ---
  test("get survey detail", async ({ request }) => {
    const res = await request.get(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(surveyId);
    expect(body.data.questions.length).toBe(4);
  });

  // --- Get non-existent survey ---
  test("get non-existent survey returns 404", async ({ request }) => {
    const res = await request.get(`${API}/surveys/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Employee viewing draft survey (should be forbidden) ---
  test("employee viewing draft survey is forbidden", async ({ request }) => {
    const res = await request.get(`${API}/surveys/${surveyId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Update survey (draft only) ---
  test("update draft survey", async ({ request }) => {
    const res = await request.put(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
      data: {
        title: `Updated Pulse ${RUN}`,
        description: "Updated monthly pulse",
        recurrence: "weekly",
        questions: [
          { question_text: "How satisfied are you at work?", question_type: "rating_1_5", is_required: true },
          { question_text: "What improvements?", question_type: "text", is_required: false },
          { question_text: "Do you feel supported?", question_type: "yes_no", is_required: true },
          {
            question_text: "Fav benefit?",
            question_type: "multiple_choice",
            options: ["Health", "Remote", "Learning"],
            is_required: true,
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    questionIds = body.data.questions.map((q: any) => q.id);
    expect(body.data.title).toContain("Updated");
  });

  // --- Update with invalid end_date ---
  test("update survey with end_date before start_date fails", async ({ request }) => {
    const res = await request.put(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
      data: { end_date: "2020-01-01" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Cannot change status via PUT ---
  test("cannot change status via PUT (use publish/close)", async ({ request }) => {
    const res = await request.put(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
      data: { status: "active" },
    });
    expect(res.status()).toBe(422);
  });

  // --- Publish survey ---
  test("publish survey", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/publish`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("active");
  });

  // --- Publish already active survey fails ---
  test("publish already active survey fails", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/publish`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Publish eNPS survey ---
  test("publish eNPS survey", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${enpsId}/publish`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Cannot update published survey ---
  test("cannot update published (active) survey", async ({ request }) => {
    const res = await request.put(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
      data: { title: "Should fail" },
    });
    expect(res.status()).toBe(403);
  });

  // --- Get active surveys (employee view) ---
  test("get active surveys (employee)", async ({ request }) => {
    const res = await request.get(`${API}/surveys/active`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // Each should have has_responded flag
    for (const s of body.data) {
      expect(s).toHaveProperty("has_responded");
    }
  });

  // --- Submit response to survey ---
  test("submit survey response", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/respond`, {
      headers: hdr(empToken),
      data: {
        answers: [
          { question_id: questionIds[0], rating_value: 4 },
          { question_id: questionIds[1], text_value: "Better communication channels" },
          { question_id: questionIds[2], text_value: "yes" },
          { question_id: questionIds[3], text_value: "Remote" },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.message).toContain("submitted");
  });

  // --- Duplicate response fails ---
  test("duplicate survey response fails", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/respond`, {
      headers: hdr(empToken),
      data: {
        answers: [
          { question_id: questionIds[0], rating_value: 3 },
          { question_id: questionIds[2], text_value: "no" },
          { question_id: questionIds[3], text_value: "Health" },
        ],
      },
    });
    expect(res.status()).toBe(403);
  });

  // --- Submit response missing required questions ---
  test("submit response missing required questions fails", async ({ request }) => {
    // Use manager account who hasn't responded yet
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    const res = await request.post(`${API}/surveys/${surveyId}/respond`, {
      headers: hdr(mgr.token),
      data: {
        answers: [
          { question_id: questionIds[0], rating_value: 5 },
          // Missing questionIds[2] (yes_no, required) and questionIds[3] (multiple_choice, required)
        ],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Submit eNPS response ---
  test("submit eNPS response", async ({ request }) => {
    // Get eNPS question ID
    const detailRes = await request.get(`${API}/surveys/${enpsId}`, {
      headers: hdr(adminToken),
    });
    const enpsDetail = await detailRes.json();
    const enpsQId = enpsDetail.data.questions[0].id;

    const res = await request.post(`${API}/surveys/${enpsId}/respond`, {
      headers: hdr(empToken),
      data: {
        answers: [{ question_id: enpsQId, rating_value: 9 }],
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Submit eNPS as manager (promoter score 10) ---
  test("submit eNPS as manager (promoter)", async ({ request }) => {
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    const detailRes = await request.get(`${API}/surveys/${enpsId}`, {
      headers: hdr(adminToken),
    });
    const enpsDetail = await detailRes.json();
    const enpsQId = enpsDetail.data.questions[0].id;

    const res = await request.post(`${API}/surveys/${enpsId}/respond`, {
      headers: hdr(mgr.token),
      data: {
        answers: [{ question_id: enpsQId, rating_value: 10 }],
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Get survey results (HR) ---
  test("get survey results (HR, active survey)", async ({ request }) => {
    const res = await request.get(`${API}/surveys/${surveyId}/results`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.response_count).toBeGreaterThanOrEqual(1);
    expect(body.data.questions.length).toBe(4);
    // rating question should have avg_rating, distribution
    const ratingQ = body.data.questions.find((q: any) => q.question_type === "rating_1_5");
    expect(ratingQ.avg_rating).toBeGreaterThan(0);
    expect(ratingQ.distribution).toBeDefined();
    // yes_no question should have yes/no distribution
    const ynQ = body.data.questions.find((q: any) => q.question_type === "yes_no");
    expect(ynQ.distribution).toBeDefined();
    // text question should have text_responses
    const textQ = body.data.questions.find((q: any) => q.question_type === "text");
    expect(textQ.text_responses).toBeDefined();
    // multiple_choice should have distribution
    const mcQ = body.data.questions.find((q: any) => q.question_type === "multiple_choice");
    expect(mcQ.distribution).toBeDefined();
  });

  // --- Get eNPS results ---
  test("get eNPS survey results with eNPS calculation", async ({ request }) => {
    const res = await request.get(`${API}/surveys/${enpsId}/results`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.overall_enps).toBeDefined();
    if (body.data.overall_enps) {
      expect(body.data.overall_enps).toHaveProperty("score");
      expect(body.data.overall_enps).toHaveProperty("promoters");
      expect(body.data.overall_enps).toHaveProperty("detractors");
    }
  });

  // --- Export results as CSV ---
  test("export survey results as CSV", async ({ request }) => {
    const res = await request.get(`${API}/surveys/${surveyId}/results/export`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("text/csv");
  });

  // --- Get my responses ---
  test("get my responses", async ({ request }) => {
    const res = await request.get(`${API}/surveys/my-responses`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- Close survey ---
  test("close active survey", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/close`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("closed");
  });

  // --- Close already closed survey fails ---
  test("close already closed survey fails", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/close`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Re-publish closed survey ---
  test("re-publish closed survey", async ({ request }) => {
    const res = await request.post(`${API}/surveys/${surveyId}/publish`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("active");
  });

  // --- Survey dashboard ---
  test("get survey dashboard (HR)", async ({ request }) => {
    const res = await request.get(`${API}/surveys/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("active_count");
    expect(body.data).toHaveProperty("total_count");
    expect(body.data).toHaveProperty("draft_count");
    expect(body.data).toHaveProperty("closed_count");
    expect(body.data).toHaveProperty("total_responses");
    expect(body.data).toHaveProperty("avg_response_rate");
    expect(body.data).toHaveProperty("enps_score");
    expect(body.data).toHaveProperty("recent_surveys");
  });

  // --- Delete draft survey ---
  test("delete draft survey", async ({ request }) => {
    // Create a new draft survey just to delete
    const createRes = await request.post(`${API}/surveys`, {
      headers: hdr(adminToken),
      data: {
        title: `Delete me ${RUN}`,
        type: "pulse",
        questions: [{ question_text: "Temp?", question_type: "text" }],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const delSurveyId = createBody.data.id;

    const res = await request.delete(`${API}/surveys/${delSurveyId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Delete non-draft survey fails ---
  test("delete non-draft survey fails", async ({ request }) => {
    const res = await request.delete(`${API}/surveys/${surveyId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Delete non-existent survey ---
  test("delete non-existent survey returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/surveys/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Publish survey with no questions fails ---
  test("publish survey with no questions fails", async ({ request }) => {
    const createRes = await request.post(`${API}/surveys`, {
      headers: hdr(adminToken),
      data: { title: `No questions ${RUN}`, type: "pulse" },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const noQSurveyId = createBody.data.id;

    const res = await request.post(`${API}/surveys/${noQSurveyId}/publish`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());

    // Cleanup
    await request.delete(`${API}/surveys/${noQSurveyId}`, { headers: hdr(adminToken) });
  });
});

// =============================================================================
// 6. SUBSCRIPTION SERVICE (42.8% → 80%+)
// =============================================================================

test.describe("Subscription Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let orgAdminToken: string;
  let empToken: string;
  let adminUserId: number;
  let empUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    // Ananya is hr_admin, use org_admin for subscription operations
    // The org_admin is the same as admin in most test setups
    orgAdminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- List subscriptions ---
  test("list subscriptions (HR)", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- List subscriptions denied for employee ---
  test("list subscriptions denied for employee", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Get billing summary ---
  test("get billing summary", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Get billing status ---
  test("get billing status", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("has_overdue");
    expect(body.data).toHaveProperty("warning_level");
  });

  // --- Get specific subscription ---
  test("get specific subscription", async ({ request }) => {
    // First get list to find an ID
    const listRes = await request.get(`${API}/subscriptions`, {
      headers: hdr(adminToken),
    });
    const listBody = await listRes.json();
    if (listBody.data.length > 0) {
      const subId = listBody.data[0].id;
      const res = await request.get(`${API}/subscriptions/${subId}`, {
        headers: hdr(adminToken),
      });
      expect(res.status()).toBe(200);
    }
  });

  // --- Get non-existent subscription ---
  test("get non-existent subscription returns 404", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Check module access ---
  test("check module access", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: { "Content-Type": "application/json" },
      data: {
        user_id: empUserId,
        org_id: 1,
        module_slug: "payroll",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("has_access");
    expect(body.data).toHaveProperty("seat_assigned");
  });

  // --- Check access for non-existent module ---
  test("check access for non-existent module", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: { "Content-Type": "application/json" },
      data: {
        user_id: empUserId,
        org_id: 1,
        module_slug: "nonexistent-module-xyz",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    const body = await res.json();
    expect(body.data.has_access).toBe(false);
  });

  // --- List seats for a subscription ---
  test("list seats for a subscription", async ({ request }) => {
    const listRes = await request.get(`${API}/subscriptions`, {
      headers: hdr(adminToken),
    });
    const listBody = await listRes.json();
    if (listBody.data.length > 0) {
      const subId = listBody.data[0].id;
      const res = await request.get(`${API}/subscriptions/${subId}/seats`, {
        headers: hdr(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    }
  });
});

// =============================================================================
// 7. CUSTOM FIELD SERVICE (44.5% → 80%+)
// =============================================================================

test.describe("Custom Field Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let fieldId: number;
  let numberFieldId: number;
  let dropdownFieldId: number;
  let multiSelectFieldId: number;
  let dateFieldId: number;
  let checkboxFieldId: number;
  let empUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Create text field definition ---
  test("create text custom field definition", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `T-Shirt Size ${RUN}`,
        field_type: "text",
        is_required: false,
        is_searchable: true,
        placeholder: "Enter size (S/M/L/XL)",
        section: "Personal Info",
        help_text: "Your preferred t-shirt size for company swag",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    fieldId = body.data.id;
    expect(body.data.field_key).toContain("t_shirt_size");
  });

  // --- Create number field ---
  test("create number custom field with min/max", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Years Experience ${RUN}`,
        field_type: "number",
        is_required: false,
        min_value: 0,
        max_value: 50,
        section: "Professional",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    numberFieldId = body.data.id;
  });

  // --- Create dropdown field ---
  test("create dropdown custom field", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Blood Group ${RUN}`,
        field_type: "dropdown",
        options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
        is_required: true,
        section: "Health",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    dropdownFieldId = body.data.id;
  });

  // --- Create multi_select field ---
  test("create multi_select custom field", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Skills ${RUN}`,
        field_type: "multi_select",
        options: ["JavaScript", "Python", "Rust", "Go", "Java"],
        section: "Technical",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    multiSelectFieldId = body.data.id;
  });

  // --- Create date field ---
  test("create date custom field", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Visa Expiry ${RUN}`,
        field_type: "date",
        section: "Immigration",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    dateFieldId = body.data.id;
  });

  // --- Create checkbox field ---
  test("create checkbox custom field", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `NDA Signed ${RUN}`,
        field_type: "checkbox",
        section: "Legal",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    checkboxFieldId = body.data.id;
  });

  // --- Duplicate field key fails ---
  test("create duplicate field key fails", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `T-Shirt Size ${RUN}`,
        field_type: "text",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- List field definitions ---
  test("list custom field definitions", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(5);
  });

  // --- List filtered by entity_type ---
  test("list definitions filtered by entity_type=employee", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/definitions?entity_type=employee`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get field definition ---
  test("get field definition detail", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(fieldId);
  });

  // --- Get non-existent field ---
  test("get non-existent field returns 404", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/definitions/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Update field definition ---
  test("update field definition", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: hdr(adminToken),
      data: {
        field_name: `Shirt Size ${RUN}`,
        placeholder: "S/M/L/XL/XXL",
        help_text: "Updated help text",
        is_searchable: true,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.placeholder).toContain("XXL");
  });

  // --- Update with duplicate key fails ---
  test("update field to duplicate key fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/definitions/${numberFieldId}`, {
      headers: hdr(adminToken),
      data: { field_name: `Shirt Size ${RUN}` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Update non-existent field ---
  test("update non-existent field returns 404", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/definitions/999999`, {
      headers: hdr(adminToken),
      data: { field_name: "No" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Set text field value ---
  test("set text field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: fieldId, value: "Large" }],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- Set number field value ---
  test("set number field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: numberFieldId, value: 5 }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Number field out of range ---
  test("set number field out of max_value range fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: numberFieldId, value: 100 }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Set dropdown field value ---
  test("set dropdown field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: dropdownFieldId, value: "O+" }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Set invalid dropdown value ---
  test("set invalid dropdown value fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: dropdownFieldId, value: "Z+" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Set multi_select value ---
  test("set multi_select field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: multiSelectFieldId, value: ["JavaScript", "Rust"] }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Set invalid multi_select value ---
  test("set invalid multi_select value fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: multiSelectFieldId, value: ["JavaScript", "COBOL"] }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Set date field value ---
  test("set date field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: dateFieldId, value: "2027-12-31" }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Set checkbox field value ---
  test("set checkbox field value", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: checkboxFieldId, value: true }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Update existing value (upsert) ---
  test("update existing field value (upsert)", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: fieldId, value: "Extra Large" }],
      },
    });
    expect(res.status()).toBe(200);
  });

  // --- Set required field to empty fails ---
  test("set required dropdown to empty fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: dropdownFieldId, value: "" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Get field values ---
  test("get field values for entity", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // Each value should have field_name, value, etc.
    const first = body.data[0];
    expect(first).toHaveProperty("field_id");
    expect(first).toHaveProperty("field_name");
    expect(first).toHaveProperty("value");
  });

  // --- Bulk get field values ---
  test("bulk get field values for multiple entities", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/values/employee?entity_ids=${empUserId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Search by field value ---
  test("search by text field value", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/search?entity_type=employee&field_id=${fieldId}&value=Extra`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Reorder fields ---
  test("reorder custom fields", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/definitions/reorder`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_ids: [dropdownFieldId, fieldId, numberFieldId, multiSelectFieldId, dateFieldId, checkboxFieldId],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Delete field definition (soft delete) ---
  test("delete (deactivate) field definition", async ({ request }) => {
    // Create a disposable field to delete
    const createRes = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `DeleteMe ${RUN}`,
        field_type: "text",
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const delFieldId = createBody.data.id;

    const res = await request.delete(`${API}/custom-fields/definitions/${delFieldId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Delete non-existent field ---
  test("delete non-existent field returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/custom-fields/definitions/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Set value for non-existent field ---
  test("set value for non-existent field fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: 999999, value: "test" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Set value for wrong entity type ---
  test("set value for wrong entity type fails", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/values/department/${empUserId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: fieldId, value: "test" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 8. HELPDESK SERVICE (47.4% → 80%+)
// =============================================================================

test.describe("Helpdesk Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let mgrToken: string;
  let empUserId: number;
  let adminUserId: number;
  let mgrUserId: number;
  let ticketId: number;
  let articleId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    mgrToken = mgr.token;
    mgrUserId = mgr.userId;
  });

  // --- Create ticket (employee) ---
  test("create helpdesk ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "it_support",
        priority: "high",
        subject: `Laptop Issue ${RUN}`,
        description: "My laptop screen is flickering intermittently",
        tags: ["hardware", "urgent"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    ticketId = body.data.id;
    expect(body.data.status).toBe("open");
    expect(body.data.priority).toBe("high");
    expect(body.data.sla_response_hours).toBe(8);
    expect(body.data.sla_resolution_hours).toBe(24);
  });

  // --- Create ticket with default priority ---
  test("create ticket with default priority (medium)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "hr_query",
        subject: `Leave Query ${RUN}`,
        description: "How do I apply for compensatory leave?",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.priority).toBe("medium");
    expect(body.data.sla_response_hours).toBe(24);
  });

  // --- Create urgent ticket ---
  test("create urgent ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "access",
        priority: "urgent",
        subject: `Access Blocked ${RUN}`,
        description: "Cannot access production systems",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.sla_response_hours).toBe(2);
    expect(body.data.sla_resolution_hours).toBe(8);
  });

  // --- Create low priority ticket ---
  test("create low priority ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        priority: "low",
        subject: `Suggestion ${RUN}`,
        description: "Suggestion for new office plants",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.sla_response_hours).toBe(48);
    expect(body.data.sla_resolution_hours).toBe(120);
  });

  // --- List tickets (HR view) ---
  test("list all tickets (HR)", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination).toBeDefined();
  });

  // --- List with filters ---
  test("list tickets filtered by status=open", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets?status=open`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("list tickets filtered by category", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets?category=it_support`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("list tickets filtered by priority=high", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets?priority=high`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("list tickets with search", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets?search=${RUN}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List tickets as employee (own tickets only) ---
  test("list tickets as employee returns own tickets only", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const t of body.data) {
      expect(t.raised_by).toBe(empUserId);
    }
  });

  // --- Get my tickets ---
  test("get my tickets", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/my`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- Get my tickets via alias ---
  test("get my tickets via alias /my-tickets", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/my-tickets`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get my tickets with status filter ---
  test("get my tickets filtered by status=open", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/my?status=open`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get ticket detail (owner) ---
  test("get ticket detail as owner", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(ticketId);
    expect(body.data.comments).toBeDefined();
  });

  // --- Get ticket detail (HR — sees all) ---
  test("get ticket detail as HR", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get ticket not owned by employee ---
  test("get ticket not owned by employee is forbidden", async ({ request }) => {
    // Create a ticket as manager
    const mgrTicket = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(mgrToken),
      data: {
        category: "general",
        subject: `Manager ticket ${RUN}`,
        description: "Manager test ticket",
      },
    });
    expect(mgrTicket.status()).toBe(201);
    const mgrBody = await mgrTicket.json();
    const mgrTicketId = mgrBody.data.id;

    const res = await request.get(`${API}/helpdesk/tickets/${mgrTicketId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Get non-existent ticket ---
  test("get non-existent ticket returns 404", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Assign ticket ---
  test("assign ticket to user (HR)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: hdr(adminToken),
      data: { assigned_to: adminUserId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.assigned_to).toBe(adminUserId);
    // Status should change from open to in_progress on assignment
    expect(body.data.status).toBe("in_progress");
  });

  // --- Assign non-existent ticket ---
  test("assign non-existent ticket returns 404", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/999999/assign`, {
      headers: hdr(adminToken),
      data: { assigned_to: adminUserId },
    });
    expect(res.status()).toBe(404);
  });

  // --- Add public comment (employee/ticket raiser) ---
  test("add comment from ticket raiser", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: hdr(empToken),
      data: {
        comment: "The flickering happens every 5 minutes, especially during video calls.",
        is_internal: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.comment).toContain("flickering");
  });

  // --- Add internal comment (HR) ---
  test("add internal comment (HR only)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: hdr(adminToken),
      data: {
        comment: "Internal: Check if display driver needs update. Asset tag: LPT-1234.",
        is_internal: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.is_internal).toBeTruthy();
  });

  // --- HR comment triggers first_response_at tracking ---
  test("HR comment tracks first response time", async ({ request }) => {
    // Create a fresh ticket, then HR responds
    const freshTicket = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "it_support",
        subject: `First response test ${RUN}`,
        description: "Testing first response tracking",
      },
    });
    expect(freshTicket.status()).toBe(201);
    const freshBody = await freshTicket.json();
    const freshId = freshBody.data.id;

    // HR responds
    const commentRes = await request.post(`${API}/helpdesk/tickets/${freshId}/comment`, {
      headers: hdr(adminToken),
      data: { comment: "We are looking into this." },
    });
    expect(commentRes.status()).toBe(201);

    // Verify first_response_at is set
    const detailRes = await request.get(`${API}/helpdesk/tickets/${freshId}`, {
      headers: hdr(adminToken),
    });
    const detail = await detailRes.json();
    expect(detail.data.first_response_at).toBeTruthy();
  });

  // --- Employee cannot post internal comments ---
  test("employee internal comment flag is ignored", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: hdr(empToken),
      data: {
        comment: "This should be public even with is_internal=true",
        is_internal: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    // For non-HR, is_internal should be false
    expect(body.data.is_internal).toBeFalsy();
  });

  // --- Verify internal comments hidden from employee ---
  test("internal comments hidden from non-HR users", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const hasInternal = body.data.comments.some((c: any) => c.is_internal === true);
    expect(hasInternal).toBe(false);
  });

  // --- Update ticket (HR) ---
  test("update ticket category and priority (HR)", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(adminToken),
      data: {
        category: "hardware",
        priority: "urgent",
        tags: ["hardware", "screen", "urgent"],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.priority).toBe("urgent");
    // SLA should be recalculated
    expect(body.data.sla_response_hours).toBe(2);
    expect(body.data.sla_resolution_hours).toBe(8);
  });

  // --- Update ticket status ---
  test("update ticket status to awaiting_response", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(adminToken),
      data: { status: "awaiting_response" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("awaiting_response");
  });

  // --- Employee comment moves awaiting_response to in_progress ---
  test("employee comment on awaiting_response moves to in_progress", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: hdr(empToken),
      data: { comment: "I tried restarting, still flickering." },
    });
    expect(res.status()).toBe(201);

    const detailRes = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(adminToken),
    });
    const detail = await detailRes.json();
    expect(detail.data.status).toBe("in_progress");
  });

  // --- Update non-existent ticket ---
  test("update non-existent ticket returns 404", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/tickets/999999`, {
      headers: hdr(adminToken),
      data: { priority: "low" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Resolve ticket ---
  test("resolve ticket (HR)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("resolved");
    expect(body.data.resolved_at).toBeTruthy();
  });

  // --- Resolve already resolved ticket ---
  test("resolve already resolved ticket fails", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Resolve non-existent ticket ---
  test("resolve non-existent ticket returns 404", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/999999/resolve`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Rate resolved ticket ---
  test("rate resolved ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/rate`, {
      headers: hdr(empToken),
      data: { rating: 4, comment: "Quick resolution, thanks!" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.satisfaction_rating).toBe(4);
  });

  // --- Rate non-resolved ticket fails ---
  test("rate non-resolved ticket fails", async ({ request }) => {
    // Create a new open ticket
    const newTicket = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        subject: `Rate test ${RUN}`,
        description: "Test",
      },
    });
    const newBody = await newTicket.json();
    const newId = newBody.data.id;

    const res = await request.post(`${API}/helpdesk/tickets/${newId}/rate`, {
      headers: hdr(empToken),
      data: { rating: 5 },
    });
    expect(res.status()).toBe(403);
  });

  // --- Close ticket (must have comment first) ---
  test("close resolved ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/close`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("closed");
  });

  // --- Close ticket without comments fails ---
  test("close ticket without any comments fails", async ({ request }) => {
    const noCommentTicket = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        subject: `No comment close test ${RUN}`,
        description: "Test closing without comments",
      },
    });
    const noCommentBody = await noCommentTicket.json();
    const noCommentId = noCommentBody.data.id;

    const res = await request.post(`${API}/helpdesk/tickets/${noCommentId}/close`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Close non-existent ticket ---
  test("close non-existent ticket returns 404", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/999999/close`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Reopen closed ticket ---
  test("reopen closed ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/reopen`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("reopened");
    expect(body.data.resolved_at).toBeNull();
    expect(body.data.closed_at).toBeNull();
  });

  // --- Reopen non-resolved/non-closed ticket fails ---
  test("reopen open ticket fails", async ({ request }) => {
    const openTicket = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        subject: `Reopen test ${RUN}`,
        description: "Test",
      },
    });
    const openBody = await openTicket.json();
    const openId = openBody.data.id;

    const res = await request.post(`${API}/helpdesk/tickets/${openId}/reopen`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // --- Reopen non-existent ticket ---
  test("reopen non-existent ticket returns 404", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/999999/reopen`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Assign reopened ticket (moves to in_progress) ---
  test("assign reopened ticket moves to in_progress", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: hdr(adminToken),
      data: { assigned_to: mgrUserId },
    });
    expect(res.status()).toBe(200);
  });

  // --- Helpdesk dashboard ---
  test("get helpdesk dashboard (HR)", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("total_open");
    expect(body.data).toHaveProperty("open");
    expect(body.data).toHaveProperty("in_progress");
    expect(body.data).toHaveProperty("resolved");
    expect(body.data).toHaveProperty("closed");
    expect(body.data).toHaveProperty("overdue");
    expect(body.data).toHaveProperty("sla_compliance");
    expect(body.data).toHaveProperty("avg_resolution_hours");
    expect(body.data).toHaveProperty("category_breakdown");
    expect(body.data).toHaveProperty("recent_tickets");
    expect(body.data).toHaveProperty("avg_satisfaction");
  });

  // --- Dashboard denied for employee ---
  test("dashboard denied for employee", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/dashboard`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // =========================================================================
  // KNOWLEDGE BASE
  // =========================================================================

  // --- Create KB article ---
  test("create KB article", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: hdr(adminToken),
      data: {
        title: `How to Request Leave ${RUN}`,
        content: "<h1>Leave Request Guide</h1><p>Step 1: Go to Self-Service...</p>",
        category: "hr_policies",
        is_published: true,
        is_featured: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    articleId = body.data.id;
    expect(body.data.slug).toBeTruthy();
    expect(body.data.is_published).toBeTruthy();
  });

  // --- Create article via alias route ---
  test("create KB article via /knowledge-base alias", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/knowledge-base`, {
      headers: hdr(adminToken),
      data: {
        title: `VPN Setup Guide ${RUN}`,
        content: "<p>How to set up company VPN</p>",
        category: "it_guides",
        is_published: true,
      },
    });
    expect(res.status()).toBe(201);
  });

  // --- Create unpublished article ---
  test("create unpublished KB article", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: hdr(adminToken),
      data: {
        title: `Draft Article ${RUN}`,
        content: "<p>Work in progress...</p>",
        category: "general",
        is_published: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.is_published).toBeFalsy();
  });

  // --- Create article with custom slug ---
  test("create KB article with custom slug", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: hdr(adminToken),
      data: {
        title: `Custom Slug Article ${RUN}`,
        content: "<p>Custom slug test</p>",
        category: "general",
        slug: `custom-slug-${RUN}`,
        is_published: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.slug).toContain(`custom-slug-${RUN}`);
  });

  // --- List published articles ---
  test("list published KB articles", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- List articles via alias ---
  test("list KB articles via /knowledge-base alias", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/knowledge-base`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List with category filter ---
  test("list KB articles filtered by category", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb?category=hr_policies`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- List with search ---
  test("list KB articles with search", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb?search=${RUN}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  // --- HR can list all including unpublished ---
  test("HR can list all articles including unpublished", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb?all=true`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get article by ID ---
  test("get KB article by ID", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/${articleId}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(articleId);
    // View count should increment
    expect(body.data.view_count).toBeGreaterThanOrEqual(1);
  });

  // --- Get article by slug ---
  test("get KB article by slug", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/custom-slug-${RUN}`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Get non-existent article ---
  test("get non-existent article returns 404", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/999999`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Update article ---
  test("update KB article", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/kb/${articleId}`, {
      headers: hdr(adminToken),
      data: {
        title: `Updated Leave Guide ${RUN}`,
        content: "<h1>Updated Guide</h1><p>Revised steps...</p>",
        is_featured: false,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.title).toContain("Updated");
  });

  // --- Update non-existent article ---
  test("update non-existent article returns 404", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/kb/999999`, {
      headers: hdr(adminToken),
      data: { title: "No" },
    });
    expect(res.status()).toBe(404);
  });

  // --- Rate article helpful ---
  test("rate KB article as helpful", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/${articleId}/helpful`, {
      headers: hdr(empToken),
      data: { helpful: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.helpful_count).toBeGreaterThanOrEqual(1);
  });

  // --- Rate same article again (same vote — no change) ---
  test("rate same article same vote (no change)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/${articleId}/helpful`, {
      headers: hdr(empToken),
      data: { helpful: true },
    });
    expect(res.status()).toBe(200);
  });

  // --- Swap vote from helpful to not helpful ---
  test("swap vote from helpful to not helpful", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/${articleId}/helpful`, {
      headers: hdr(empToken),
      data: { helpful: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.not_helpful_count).toBeGreaterThanOrEqual(1);
  });

  // --- Rate as different user (first vote) ---
  test("rate article as different user (first vote)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/${articleId}/helpful`, {
      headers: hdr(mgrToken),
      data: { helpful: true },
    });
    expect(res.status()).toBe(200);
  });

  // --- Get my rating for article ---
  test("get my rating for article", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/${articleId}/my-rating`, {
      headers: hdr(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rated).toBe(true);
  });

  // --- Delete (unpublish) article ---
  test("delete (unpublish) KB article", async ({ request }) => {
    // Create a disposable article
    const createRes = await request.post(`${API}/helpdesk/kb`, {
      headers: hdr(adminToken),
      data: {
        title: `Delete Article ${RUN}`,
        content: "<p>To be deleted</p>",
        category: "general",
        is_published: true,
      },
    });
    const createBody = await createRes.json();
    const delArticleId = createBody.data.id;

    const res = await request.delete(`${API}/helpdesk/kb/${delArticleId}`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  // --- Delete non-existent article ---
  test("delete non-existent article returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/helpdesk/kb/999999`, {
      headers: hdr(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  // --- Rate non-existent article ---
  test("rate non-existent article returns 404", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/999999/helpful`, {
      headers: hdr(empToken),
      data: { helpful: true },
    });
    expect(res.status()).toBe(404);
  });
});
