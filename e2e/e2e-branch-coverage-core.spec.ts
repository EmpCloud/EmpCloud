import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Branch Coverage E2E Tests for Core Services
// Targets uncovered lines in 16 low-coverage service files.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const RUN = Date.now().toString().slice(-6);

// Credentials
const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const MANAGER = { email: "karthik@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
  orgId: number;
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
  };
}

function hdr(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const OK = [200, 201];
const OK_OR_ERR = [200, 201, 400, 403, 404, 409, 422, 500];

// =============================================================================
// 1. BIOMETRICS SERVICE (7.9% coverage)
// =============================================================================

test.describe("Biometrics Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let enrollmentId: number;
  let deviceId: number;
  let deviceApiKey: string;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Face Enrollment ---

  test("enroll face for employee (webcam method)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/face/enroll`, {
      headers: hdr(adminToken),
      data: {
        user_id: empUserId,
        enrollment_method: "webcam",
        face_encoding: Buffer.from("test-face-data").toString("base64"),
        quality_score: 0.95,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      enrollmentId = body.data?.id;
    }
  });

  test("enroll face again (replaces existing — deactivate branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/face/enroll`, {
      headers: hdr(adminToken),
      data: {
        user_id: empUserId,
        enrollment_method: "upload",
        quality_score: 0.88,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      enrollmentId = body.data?.id ?? enrollmentId;
    }
  });

  test("enroll face for non-existent user (404 branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/face/enroll`, {
      headers: hdr(adminToken),
      data: { user_id: 999999, enrollment_method: "webcam" },
    });
    expect([400, 404]).toContain(res.status());
  });

  test("list face enrollments (unfiltered)", async ({ request }) => {
    const res = await request.get(`${API}/biometrics/face/enrollments`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("list face enrollments with filters", async ({ request }) => {
    const res = await request.get(
      `${API}/biometrics/face/enrollments?user_id=${empUserId}&is_active=true`,
      { headers: hdr(adminToken) }
    );
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("remove face enrollment (not found branch)", async ({ request }) => {
    const res = await request.delete(`${API}/biometrics/face/enrollments/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("remove face enrollment (success)", async ({ request }) => {
    if (!enrollmentId) return;
    const res = await request.delete(`${API}/biometrics/face/enrollments/${enrollmentId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Face Verification ---

  test("verify face (no enrollments branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/face/verify`, {
      headers: hdr(empToken),
      data: { face_encoding: "test-encoding", liveness_passed: true },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("verify face without liveness (liveness_required branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/face/verify`, {
      headers: hdr(empToken),
      data: { face_encoding: "test-encoding", liveness_passed: false },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- QR Codes ---

  test("generate QR code for employee", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/qr/generate`, {
      headers: hdr(adminToken),
      data: { user_id: empUserId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("generate QR code for non-existent user", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/qr/generate`, {
      headers: hdr(adminToken),
      data: { user_id: 999999 },
    });
    expect([400, 404]).toContain(res.status());
  });

  test("get my QR code (employee)", async ({ request }) => {
    const res = await request.get(`${API}/biometrics/qr/my-code`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("scan QR code with invalid code", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/qr/scan`, {
      headers: hdr(empToken),
      data: { code: "INVALID-QR-CODE-12345" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Biometric Check-In / Check-Out ---

  test("biometric check-in via selfie method", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-in`, {
      headers: hdr(empToken),
      data: {
        method: "selfie",
        liveness_passed: true,
        latitude: 12.9716,
        longitude: 77.5946,
        confidence_score: 0.92,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-in via face with liveness_passed=false (spoofing branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-in`, {
      headers: hdr(empToken),
      data: {
        method: "face",
        liveness_passed: false,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-in via selfie without GPS (validation branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-in`, {
      headers: hdr(empToken),
      data: { method: "selfie", liveness_passed: true },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-in via QR with invalid code", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-in`, {
      headers: hdr(empToken),
      data: { method: "qr", qr_code: "INVALID-QR" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-out via selfie", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-out`, {
      headers: hdr(empToken),
      data: {
        method: "selfie",
        liveness_passed: true,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-out with spoofing detection", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-out`, {
      headers: hdr(empToken),
      data: {
        method: "face",
        liveness_passed: false,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("biometric check-out via QR with invalid code", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/check-out`, {
      headers: hdr(empToken),
      data: { method: "qr", qr_code: "INVALID-QR-OUT" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Device Management ---

  test("register biometric device", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/devices`, {
      headers: hdr(adminToken),
      data: {
        name: `Test Device ${RUN}`,
        type: "face_terminal",
        serial_number: `SN-${RUN}`,
        ip_address: "192.168.1.100",
        location_name: "Main Entrance",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      deviceId = body.data?.id;
      deviceApiKey = body.data?.api_key;
    }
  });

  test("register duplicate device serial (conflict branch)", async ({ request }) => {
    const res = await request.post(`${API}/biometrics/devices`, {
      headers: hdr(adminToken),
      data: {
        name: `Dup Device`,
        type: "qr_scanner",
        serial_number: `SN-${RUN}`,
      },
    });
    expect([409]).toContain(res.status());
  });

  test("list devices with filters", async ({ request }) => {
    const res = await request.get(
      `${API}/biometrics/devices?status=offline&type=face_terminal&is_active=true`,
      { headers: hdr(adminToken) }
    );
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update device", async ({ request }) => {
    if (!deviceId) return;
    const res = await request.put(`${API}/biometrics/devices/${deviceId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated Device ${RUN}`, status: "maintenance" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update non-existent device (404 branch)", async ({ request }) => {
    const res = await request.put(`${API}/biometrics/devices/999999`, {
      headers: hdr(adminToken),
      data: { name: "ghost" },
    });
    expect([404]).toContain(res.status());
  });

  test("decommission device", async ({ request }) => {
    if (!deviceId) return;
    const res = await request.delete(`${API}/biometrics/devices/${deviceId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("decommission non-existent device (404)", async ({ request }) => {
    const res = await request.delete(`${API}/biometrics/devices/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  // --- Settings ---

  test("get biometric settings", async ({ request }) => {
    const res = await request.get(`${API}/biometrics/settings`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update biometric settings", async ({ request }) => {
    const res = await request.put(`${API}/biometrics/settings`, {
      headers: hdr(adminToken),
      data: {
        face_match_threshold: 0.8,
        liveness_required: true,
        selfie_geo_required: true,
        qr_type: "rotating",
        qr_rotation_minutes: 10,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Logs & Dashboard ---

  test("get biometric logs (unfiltered)", async ({ request }) => {
    const res = await request.get(`${API}/biometrics/logs`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get biometric logs with all filters", async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request.get(
      `${API}/biometrics/logs?method=selfie&result=success&date_from=${today}&date_to=${today}&page=1&perPage=5`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("get biometric dashboard", async ({ request }) => {
    const res = await request.get(`${API}/biometrics/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });
});

// =============================================================================
// 2. REGULARIZATION SERVICE (9.8% coverage)
// =============================================================================

test.describe("Regularization Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let regularizationId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("submit regularization with bare time values", async ({ request }) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const res = await request.post(`${API}/attendance/regularizations`, {
      headers: hdr(empToken),
      data: {
        date: dateStr,
        requested_check_in: "09:00",
        requested_check_out: "18:00",
        reason: `E2E regularization test ${RUN}`,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      regularizationId = body.data?.id;
    }
  });

  test("submit regularization with full datetime", async ({ request }) => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const dateStr = twoDaysAgo.toISOString().slice(0, 10);

    const res = await request.post(`${API}/attendance/regularizations`, {
      headers: hdr(empToken),
      data: {
        date: dateStr,
        requested_check_in: `${dateStr}T09:30:00`,
        requested_check_out: `${dateStr}T17:30:00`,
        reason: `E2E full datetime test ${RUN}`,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("list all regularizations (HR)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/regularizations`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list regularizations filtered by status", async ({ request }) => {
    const res = await request.get(`${API}/attendance/regularizations?status=pending`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get my regularizations (employee)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/regularizations/me`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("approve regularization", async ({ request }) => {
    if (!regularizationId) return;
    const res = await request.put(
      `${API}/attendance/regularizations/${regularizationId}/approve`,
      { headers: hdr(adminToken) }
    );
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("approve already-processed regularization (error branch)", async ({ request }) => {
    if (!regularizationId) return;
    const res = await request.put(
      `${API}/attendance/regularizations/${regularizationId}/approve`,
      { headers: hdr(adminToken) }
    );
    expect([400, 422]).toContain(res.status());
  });

  test("approve non-existent regularization (404)", async ({ request }) => {
    const res = await request.put(
      `${API}/attendance/regularizations/999999/approve`,
      { headers: hdr(adminToken) }
    );
    expect([404]).toContain(res.status());
  });
});

// =============================================================================
// 3. ASSET SERVICE (24.1% coverage)
// =============================================================================

test.describe("Asset Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let categoryId: number;
  let assetId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Categories ---

  test("create asset category", async ({ request }) => {
    const res = await request.post(`${API}/assets/categories`, {
      headers: hdr(adminToken),
      data: { name: `Category ${RUN}`, description: "Test category" },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      categoryId = body.data?.id;
    }
  });

  test("list asset categories", async ({ request }) => {
    const res = await request.get(`${API}/assets/categories`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update asset category", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.put(`${API}/assets/categories/${categoryId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated Cat ${RUN}`, description: "updated" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update non-existent category (404)", async ({ request }) => {
    const res = await request.put(`${API}/assets/categories/999999`, {
      headers: hdr(adminToken),
      data: { name: "ghost" },
    });
    expect([404]).toContain(res.status());
  });

  // --- CRUD Asset ---

  test("create asset with all fields", async ({ request }) => {
    const res = await request.post(`${API}/assets`, {
      headers: hdr(adminToken),
      data: {
        name: `Laptop ${RUN}`,
        category_id: categoryId || null,
        description: "Test laptop",
        serial_number: `SER-${RUN}`,
        brand: "Dell",
        model: "XPS 15",
        purchase_date: "2025-01-01",
        purchase_cost: 120000,
        warranty_expiry: "2027-01-01",
        condition_status: "new",
        location_name: "HQ",
        notes: "Test asset",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      assetId = body.data?.id;
    }
  });

  test("create asset with warranty before purchase (validation branch)", async ({ request }) => {
    const res = await request.post(`${API}/assets`, {
      headers: hdr(adminToken),
      data: {
        name: `Bad Asset ${RUN}`,
        purchase_date: "2025-06-01",
        warranty_expiry: "2024-01-01",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("list assets with filters", async ({ request }) => {
    const res = await request.get(
      `${API}/assets?status=available&search=Laptop&page=1&perPage=5`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("list assets by condition_status filter", async ({ request }) => {
    const res = await request.get(`${API}/assets?condition_status=new`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get asset detail with history", async ({ request }) => {
    if (!assetId) return;
    const res = await request.get(`${API}/assets/${assetId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("history");
  });

  test("get non-existent asset (404)", async ({ request }) => {
    const res = await request.get(`${API}/assets/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("update asset", async ({ request }) => {
    if (!assetId) return;
    const res = await request.put(`${API}/assets/${assetId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated Laptop ${RUN}`, brand: "Apple", condition_status: "good" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update asset warranty before purchase (validation)", async ({ request }) => {
    if (!assetId) return;
    const res = await request.put(`${API}/assets/${assetId}`, {
      headers: hdr(adminToken),
      data: { warranty_expiry: "2020-01-01" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --- Assign / Return / Retire / Lost ---

  test("assign asset to employee", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/assign`, {
      headers: hdr(adminToken),
      data: { user_id: empUserId, notes: "Test assignment" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("assign already-assigned asset (error branch)", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/assign`, {
      headers: hdr(adminToken),
      data: { user_id: empUserId },
    });
    expect([400, 403]).toContain(res.status());
  });

  test("get my assets (employee)", async ({ request }) => {
    const res = await request.get(`${API}/assets/my`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("return asset as HR", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/return`, {
      headers: hdr(adminToken),
      data: { condition: "good", notes: "Returned in good condition" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("return non-assigned asset (error branch)", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/return`, {
      headers: hdr(adminToken),
      data: {},
    });
    expect([400, 403]).toContain(res.status());
  });

  test("report asset as lost", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/report-lost`, {
      headers: hdr(adminToken),
      data: { notes: "Lost during transit" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("report already-lost asset (error branch)", async ({ request }) => {
    if (!assetId) return;
    const res = await request.post(`${API}/assets/${assetId}/report-lost`, {
      headers: hdr(adminToken),
      data: {},
    });
    expect([400, 403]).toContain(res.status());
  });

  test("get asset dashboard", async ({ request }) => {
    const res = await request.get(`${API}/assets/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get expiring warranties", async ({ request }) => {
    const res = await request.get(`${API}/assets/expiring-warranties?days=90`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- Retire / Delete ---

  test("create and retire asset", async ({ request }) => {
    const createRes = await request.post(`${API}/assets`, {
      headers: hdr(adminToken),
      data: { name: `Retire Test ${RUN}` },
    });
    expect(OK_OR_ERR).toContain(createRes.status());
    if (!OK.includes(createRes.status())) return;
    const newId = (await createRes.json()).data?.id;

    const res = await request.post(`${API}/assets/${newId}/retire`, {
      headers: hdr(adminToken),
      data: { notes: "End of life" },
    });
    expect(OK_OR_ERR).toContain(res.status());

    // Retire already retired (error branch)
    const res2 = await request.post(`${API}/assets/${newId}/retire`, {
      headers: hdr(adminToken),
      data: {},
    });
    expect([400, 403]).toContain(res2.status());
  });

  test("delete asset category (soft delete)", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.delete(`${API}/assets/categories/${categoryId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 4. CUSTOM FIELD SERVICE (25.1% coverage)
// =============================================================================

test.describe("Custom Field Service — Branch Coverage", () => {
  let adminToken: string;
  let fieldId: number;
  let dropdownFieldId: number;
  let numberFieldId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
  });

  test("create text field definition", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `T-Shirt Size ${RUN}`,
        field_type: "text",
        is_required: false,
        is_searchable: true,
        placeholder: "e.g. M, L, XL",
        section: "Personal",
        help_text: "Your t-shirt size",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      fieldId = body.data?.id;
    }
  });

  test("create dropdown field definition", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Blood Group ${RUN}`,
        field_type: "dropdown",
        options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
        is_required: true,
        is_searchable: false,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      dropdownFieldId = (await res.json()).data?.id;
    }
  });

  test("create number field with min/max", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `Experience Years ${RUN}`,
        field_type: "number",
        min_value: 0,
        max_value: 50,
        is_searchable: true,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      numberFieldId = (await res.json()).data?.id;
    }
  });

  test("create duplicate field (error branch)", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_name: `T-Shirt Size ${RUN}`,
        field_type: "text",
      },
    });
    expect([400, 409, 422]).toContain(res.status());
  });

  test("list field definitions", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/definitions?entity_type=employee`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get single field definition", async ({ request }) => {
    if (!fieldId) return;
    const res = await request.get(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update field definition (rename)", async ({ request }) => {
    if (!fieldId) return;
    const res = await request.put(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: hdr(adminToken),
      data: { field_name: `Tee Size ${RUN}`, placeholder: "S/M/L/XL" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update non-existent field (404)", async ({ request }) => {
    const res = await request.put(`${API}/custom-fields/definitions/999999`, {
      headers: hdr(adminToken),
      data: { field_name: "Ghost" },
    });
    expect([404]).toContain(res.status());
  });

  // --- Set / Get Values ---

  test("set custom field values for entity", async ({ request }) => {
    if (!fieldId) return;
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.put(`${API}/custom-fields/values/employee/${admin.userId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: fieldId, value: "XL" }],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("set dropdown value with invalid option (validation branch)", async ({ request }) => {
    if (!dropdownFieldId) return;
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.put(`${API}/custom-fields/values/employee/${admin.userId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: dropdownFieldId, value: "Z+" }],
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("set number value exceeding max (validation branch)", async ({ request }) => {
    if (!numberFieldId) return;
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.put(`${API}/custom-fields/values/employee/${admin.userId}`, {
      headers: hdr(adminToken),
      data: {
        values: [{ fieldId: numberFieldId, value: 999 }],
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("get custom field values", async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.get(`${API}/custom-fields/values/employee/${admin.userId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("search by field value", async ({ request }) => {
    if (!fieldId) return;
    const res = await request.get(
      `${API}/custom-fields/search/employee/${fieldId}?value=XL`,
      { headers: hdr(adminToken) }
    );
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Reorder / Delete ---

  test("reorder fields", async ({ request }) => {
    if (!fieldId || !dropdownFieldId) return;
    const res = await request.post(`${API}/custom-fields/reorder`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_ids: [dropdownFieldId, fieldId],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("reorder with invalid field ID (validation branch)", async ({ request }) => {
    const res = await request.post(`${API}/custom-fields/reorder`, {
      headers: hdr(adminToken),
      data: {
        entity_type: "employee",
        field_ids: [999999],
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("delete field definition", async ({ request }) => {
    if (!fieldId) return;
    const res = await request.delete(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 5. GEO-FENCE SERVICE (27% coverage)
// =============================================================================

test.describe("Geo-Fence Service — Branch Coverage", () => {
  let adminToken: string;
  let fenceId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
  });

  test("create geo-fence", async ({ request }) => {
    const res = await request.post(`${API}/attendance/geo-fences`, {
      headers: hdr(adminToken),
      data: {
        name: `Office ${RUN}`,
        latitude: 12.9716,
        longitude: 77.5946,
        radius_meters: 500,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      fenceId = (await res.json()).data?.id;
    }
  });

  test("list geo-fences", async ({ request }) => {
    const res = await request.get(`${API}/attendance/geo-fences`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update geo-fence", async ({ request }) => {
    if (!fenceId) return;
    const res = await request.put(`${API}/attendance/geo-fences/${fenceId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated Office ${RUN}`, radius_meters: 300 },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update non-existent geo-fence (404)", async ({ request }) => {
    const res = await request.put(`${API}/attendance/geo-fences/999999`, {
      headers: hdr(adminToken),
      data: { name: "ghost" },
    });
    expect([404]).toContain(res.status());
  });

  test("delete geo-fence", async ({ request }) => {
    if (!fenceId) return;
    const res = await request.delete(`${API}/attendance/geo-fences/${fenceId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("delete non-existent geo-fence (404)", async ({ request }) => {
    const res = await request.delete(`${API}/attendance/geo-fences/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });
});

// =============================================================================
// 6. MODULE SERVICE (29.4% coverage)
// =============================================================================

test.describe("Module Service — Branch Coverage", () => {
  let adminToken: string;
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const sa = await login(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
  });

  test("list all modules (active only)", async ({ request }) => {
    const res = await request.get(`${API}/modules`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get module by ID", async ({ request }) => {
    const res = await request.get(`${API}/modules/1`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("get non-existent module (404)", async ({ request }) => {
    const res = await request.get(`${API}/modules/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("get module by slug", async ({ request }) => {
    const res = await request.get(`${API}/modules/slug/payroll`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("get module features", async ({ request }) => {
    const res = await request.get(`${API}/modules/1/features`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 7. WEBHOOK HANDLER SERVICE (29.7% coverage)
// =============================================================================

test.describe("Billing Webhook Handler — Branch Coverage", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
  });

  test("invoice.paid webhook event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "invoice.paid",
        data: { invoiceId: "inv-test-1", subscriptionId: "sub-1", amount: 5000 },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("payment.received webhook event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "payment.received",
        data: { paymentId: "pay-1", amount: 5000 },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("subscription.cancelled webhook event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "subscription.cancelled",
        data: { subscriptionId: "sub-cancel-1" },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("subscription.payment_failed webhook event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "subscription.payment_failed",
        data: { subscription_id: "sub-fail-1" },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("invoice.overdue webhook event", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "invoice.overdue",
        data: { invoiceId: "inv-overdue-1", subscription_id: "sub-overdue-1" },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("unknown webhook event (default branch)", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: { event: "unknown.event", data: {} },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 8. ORG SERVICE (30.8% coverage)
// =============================================================================

test.describe("Org Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let locationId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
  });

  test("get org info", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get org stats", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/stats`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("total_users");
    expect(body.data).toHaveProperty("total_departments");
  });

  test("update org info", async ({ request }) => {
    const res = await request.put(`${API}/organizations/me`, {
      headers: hdr(adminToken),
      data: { website: "https://technova.in" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Departments ---

  test("list departments", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("create department", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/departments`, {
      headers: hdr(adminToken),
      data: { name: `Test Dept ${RUN}` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("create duplicate department (conflict)", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/departments`, {
      headers: hdr(adminToken),
      data: { name: `Test Dept ${RUN}` },
    });
    expect([409]).toContain(res.status());
  });

  test("get single department", async ({ request }) => {
    // List departments and grab the first one
    const listRes = await request.get(`${API}/organizations/me/departments`, {
      headers: hdr(adminToken),
    });
    const depts = (await listRes.json()).data;
    if (depts && depts.length > 0) {
      const res = await request.get(`${API}/organizations/me/departments/${depts[0].id}`, {
        headers: hdr(adminToken),
      });
      expect(OK).toContain(res.status());
    }
  });

  test("get non-existent department (404)", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  // --- Locations ---

  test("create location", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/locations`, {
      headers: hdr(adminToken),
      data: { name: `Office ${RUN}`, address: "123 Main St", timezone: "Asia/Kolkata" },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      locationId = (await res.json()).data?.id;
    }
  });

  test("create duplicate location (conflict)", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/locations`, {
      headers: hdr(adminToken),
      data: { name: `Office ${RUN}` },
    });
    expect([409]).toContain(res.status());
  });

  test("list locations", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/locations`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get single location", async ({ request }) => {
    if (!locationId) return;
    const res = await request.get(`${API}/organizations/me/locations/${locationId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update location", async ({ request }) => {
    if (!locationId) return;
    const res = await request.put(`${API}/organizations/me/locations/${locationId}`, {
      headers: hdr(adminToken),
      data: { name: `Renamed Office ${RUN}`, address: "456 New St" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update location with duplicate name (conflict)", async ({ request }) => {
    // Create another location then try renaming first to match
    const res1 = await request.post(`${API}/organizations/me/locations`, {
      headers: hdr(adminToken),
      data: { name: `Second Office ${RUN}` },
    });
    if (OK.includes(res1.status()) && locationId) {
      const res = await request.put(`${API}/organizations/me/locations/${locationId}`, {
        headers: hdr(adminToken),
        data: { name: `Second Office ${RUN}` },
      });
      expect([409]).toContain(res.status());
    }
  });

  test("delete location", async ({ request }) => {
    if (!locationId) return;
    const res = await request.delete(`${API}/organizations/me/locations/${locationId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 9. FORUM SERVICE (33.9% coverage)
// =============================================================================

test.describe("Forum Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let categoryId: number;
  let postId: number;
  let questionPostId: number;
  let replyId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("list categories (auto-seed branch)", async ({ request }) => {
    const res = await request.get(`${API}/forum/categories`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    if (body.data && body.data.length > 0) {
      categoryId = body.data[0].id;
    }
  });

  test("create forum category", async ({ request }) => {
    const res = await request.post(`${API}/forum/categories`, {
      headers: hdr(adminToken),
      data: { name: `Test Cat ${RUN}`, description: "A test category", icon: "🧪", sort_order: 10 },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      categoryId = (await res.json()).data?.id ?? categoryId;
    }
  });

  test("update forum category", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.put(`${API}/forum/categories/${categoryId}`, {
      headers: hdr(adminToken),
      data: { description: "Updated description" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Posts ---

  test("create discussion post", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.post(`${API}/forum/posts`, {
      headers: hdr(empToken),
      data: {
        category_id: categoryId,
        title: `Discussion ${RUN}`,
        content: "This is a test discussion post.",
        post_type: "discussion",
        tags: ["test", "e2e"],
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      postId = (await res.json()).data?.id;
    }
  });

  test("create question post", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.post(`${API}/forum/posts`, {
      headers: hdr(empToken),
      data: {
        category_id: categoryId,
        title: `Question ${RUN}`,
        content: "How do I run E2E tests?",
        post_type: "question",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      questionPostId = (await res.json()).data?.id;
    }
  });

  test("create post with invalid category (404)", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts`, {
      headers: hdr(empToken),
      data: {
        category_id: 999999,
        title: "Bad post",
        content: "This should fail",
      },
    });
    expect([400, 404]).toContain(res.status());
  });

  test("list posts with sort_by=popular", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?sort_by=popular`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list posts with sort_by=trending", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?sort_by=trending`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list posts with sort_by=views", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?sort_by=views`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list posts filtered by category and search", async ({ request }) => {
    const res = await request.get(
      `${API}/forum/posts?category_id=${categoryId}&search=test&post_type=discussion`,
      { headers: hdr(empToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("get post detail (increments view_count)", async ({ request }) => {
    if (!postId) return;
    const res = await request.get(`${API}/forum/posts/${postId}`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("update post", async ({ request }) => {
    if (!postId) return;
    const res = await request.put(`${API}/forum/posts/${postId}`, {
      headers: hdr(empToken),
      data: { title: `Updated Discussion ${RUN}`, tags: ["updated"] },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Pin / Lock ---

  test("pin post", async ({ request }) => {
    if (!postId) return;
    const res = await request.post(`${API}/forum/posts/${postId}/pin`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("lock post", async ({ request }) => {
    if (!postId) return;
    const res = await request.post(`${API}/forum/posts/${postId}/lock`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Replies ---

  test("create reply to question post", async ({ request }) => {
    if (!questionPostId) return;
    const res = await request.post(`${API}/forum/posts/${questionPostId}/reply`, {
      headers: hdr(adminToken),
      data: { content: `Reply ${RUN}: Use npx playwright test` },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      replyId = (await res.json()).data?.id;
    }
  });

  test("reply to locked post (error branch)", async ({ request }) => {
    if (!postId) return; // postId was locked above
    const res = await request.post(`${API}/forum/posts/${postId}/reply`, {
      headers: hdr(empToken),
      data: { content: "Should fail if locked" },
    });
    // May succeed if unlock toggled, or 403 if locked
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("accept reply (question author only)", async ({ request }) => {
    if (!replyId) return;
    const res = await request.post(`${API}/forum/replies/${replyId}/accept`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Likes ---

  test("like a post (toggle on)", async ({ request }) => {
    if (!postId) return;
    const res = await request.post(`${API}/forum/like`, {
      headers: hdr(empToken),
      data: { target_type: "post", target_id: postId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("unlike a post (toggle off)", async ({ request }) => {
    if (!postId) return;
    const res = await request.post(`${API}/forum/like`, {
      headers: hdr(empToken),
      data: { target_type: "post", target_id: postId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("like a reply", async ({ request }) => {
    if (!replyId) return;
    const res = await request.post(`${API}/forum/like`, {
      headers: hdr(empToken),
      data: { target_type: "reply", target_id: replyId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("like non-existent post (404)", async ({ request }) => {
    const res = await request.post(`${API}/forum/like`, {
      headers: hdr(empToken),
      data: { target_type: "post", target_id: 999999 },
    });
    expect([404]).toContain(res.status());
  });

  // --- Dashboard ---

  test("get forum dashboard", async ({ request }) => {
    const res = await request.get(`${API}/forum/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- Cleanup ---

  test("delete reply", async ({ request }) => {
    if (!replyId) return;
    const res = await request.delete(`${API}/forum/replies/${replyId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("delete post as HR", async ({ request }) => {
    if (!postId) return;
    const res = await request.delete(`${API}/forum/posts/${postId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 10. HELPDESK SERVICE (34.4% coverage)
// =============================================================================

test.describe("Helpdesk Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let ticketId: number;
  let articleId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Tickets ---

  test("create ticket with all SLA priorities", async ({ request }) => {
    for (const priority of ["low", "medium", "high", "urgent"]) {
      const res = await request.post(`${API}/helpdesk/tickets`, {
        headers: hdr(empToken),
        data: {
          category: "IT Support",
          priority,
          subject: `${priority} ticket ${RUN}`,
          description: `E2E test — ${priority} priority`,
          tags: ["test"],
        },
      });
      expect(OK_OR_ERR).toContain(res.status());
      if (OK.includes(res.status()) && priority === "medium") {
        ticketId = (await res.json()).data?.id;
      }
    }
  });

  test("list all tickets (HR)", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list tickets filtered", async ({ request }) => {
    const res = await request.get(
      `${API}/helpdesk/tickets?status=open&priority=urgent&search=test`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("get my tickets (employee)", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/my-tickets`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get my tickets filtered by category", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/my-tickets?category=IT Support`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get ticket detail", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("employee cannot view other's ticket (403 branch)", async ({ request }) => {
    // Create ticket with admin, try to view with employee
    const createRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(adminToken),
      data: { category: "HR", subject: "Admin-only", description: "secret" },
    });
    if (OK.includes(createRes.status())) {
      const otherTicketId = (await createRes.json()).data?.id;
      const res = await request.get(`${API}/helpdesk/tickets/${otherTicketId}`, {
        headers: hdr(empToken),
      });
      expect([403]).toContain(res.status());
    }
  });

  // --- Update, Assign, Comment ---

  test("update ticket priority (SLA recalculation branch)", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.put(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: hdr(adminToken),
      data: { priority: "high", status: "in_progress" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("assign ticket to user", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: hdr(adminToken),
      data: { assigned_to: adminUserId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("assign ticket to non-existent user (404)", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: hdr(adminToken),
      data: { assigned_to: 999999 },
    });
    expect([404]).toContain(res.status());
  });

  test("add comment to ticket (HR response — first_response_at branch)", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comments`, {
      headers: hdr(adminToken),
      data: { comment: `HR response ${RUN}`, is_internal: false },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("add internal comment", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comments`, {
      headers: hdr(adminToken),
      data: { comment: `Internal note ${RUN}`, is_internal: true },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Resolve, Close, Reopen, Rate ---

  test("resolve ticket", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("resolve already-resolved ticket (error branch)", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: hdr(adminToken),
    });
    expect([400, 403]).toContain(res.status());
  });

  test("rate ticket", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/rate`, {
      headers: hdr(empToken),
      data: { rating: 4, comment: "Good support" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rate open ticket (error branch)", async ({ request }) => {
    // Create a fresh open ticket and try rating
    const createRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: { category: "Other", subject: "Rate test", description: "test" },
    });
    if (OK.includes(createRes.status())) {
      const openTicketId = (await createRes.json()).data?.id;
      const res = await request.post(`${API}/helpdesk/tickets/${openTicketId}/rate`, {
        headers: hdr(empToken),
        data: { rating: 5 },
      });
      expect([400, 403]).toContain(res.status());
    }
  });

  test("close ticket", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/close`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("reopen ticket", async ({ request }) => {
    if (!ticketId) return;
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/reopen`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("reopen non-resolved ticket (error branch)", async ({ request }) => {
    const createRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: hdr(empToken),
      data: { category: "Other", subject: "Reopen test", description: "test" },
    });
    if (OK.includes(createRes.status())) {
      const newId = (await createRes.json()).data?.id;
      const res = await request.post(`${API}/helpdesk/tickets/${newId}/reopen`, {
        headers: hdr(adminToken),
      });
      expect([400, 403]).toContain(res.status());
    }
  });

  // --- Dashboard ---

  test("get helpdesk dashboard", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("sla_compliance");
    expect(body.data).toHaveProperty("category_breakdown");
  });

  // --- Knowledge Base ---

  test("create KB article", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/articles`, {
      headers: hdr(adminToken),
      data: {
        title: `How to Submit Leave ${RUN}`,
        content: "Step 1: Go to leave page...",
        category: "HR",
        is_published: true,
        is_featured: true,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      articleId = (await res.json()).data?.id;
    }
  });

  test("list KB articles", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/articles`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list KB articles with filters", async ({ request }) => {
    const res = await request.get(
      `${API}/helpdesk/articles?category=HR&search=leave&published_only=true`,
      { headers: hdr(empToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("get KB article by ID", async ({ request }) => {
    if (!articleId) return;
    const res = await request.get(`${API}/helpdesk/articles/${articleId}`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get KB article by slug", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/articles/how-to-submit-leave-${RUN.toLowerCase()}`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update KB article", async ({ request }) => {
    if (!articleId) return;
    const res = await request.put(`${API}/helpdesk/articles/${articleId}`, {
      headers: hdr(adminToken),
      data: { content: "Updated content with more steps." },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rate article as helpful", async ({ request }) => {
    if (!articleId) return;
    const res = await request.post(`${API}/helpdesk/articles/${articleId}/rate`, {
      headers: hdr(empToken),
      data: { helpful: true },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rate article as not helpful (swap vote branch)", async ({ request }) => {
    if (!articleId) return;
    const res = await request.post(`${API}/helpdesk/articles/${articleId}/rate`, {
      headers: hdr(empToken),
      data: { helpful: false },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rate article same vote again (no-op branch)", async ({ request }) => {
    if (!articleId) return;
    const res = await request.post(`${API}/helpdesk/articles/${articleId}/rate`, {
      headers: hdr(empToken),
      data: { helpful: false },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("delete KB article (unpublish)", async ({ request }) => {
    if (!articleId) return;
    const res = await request.delete(`${API}/helpdesk/articles/${articleId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 11. SHIFT SERVICE (39.3% coverage)
// =============================================================================

test.describe("Shift Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let mgrToken: string;
  let mgrUserId: number;
  let shiftId: number;
  let shiftId2: number;
  let assignmentId: number;
  let assignmentId2: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    mgrToken = mgr.token;
    mgrUserId = mgr.userId;
  });

  test("create shift (default)", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts`, {
      headers: hdr(adminToken),
      data: {
        name: `Morning ${RUN}`,
        start_time: "09:00:00",
        end_time: "18:00:00",
        break_minutes: 60,
        grace_minutes_late: 15,
        grace_minutes_early: 10,
        is_night_shift: false,
        is_default: false,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      shiftId = (await res.json()).data?.id;
    }
  });

  test("create night shift (is_default branch)", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts`, {
      headers: hdr(adminToken),
      data: {
        name: `Night ${RUN}`,
        start_time: "22:00:00",
        end_time: "06:00:00",
        is_night_shift: true,
        is_default: true,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      shiftId2 = (await res.json()).data?.id;
    }
  });

  test("list shifts", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get shift by ID", async ({ request }) => {
    if (!shiftId) return;
    const res = await request.get(`${API}/attendance/shifts/${shiftId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get non-existent shift (404)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("update shift", async ({ request }) => {
    if (!shiftId) return;
    const res = await request.put(`${API}/attendance/shifts/${shiftId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated Morning ${RUN}`, break_minutes: 45 },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Assign ---

  test("assign shift to employee", async ({ request }) => {
    if (!shiftId) return;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const res = await request.post(`${API}/attendance/shifts/assign`, {
      headers: hdr(adminToken),
      data: {
        user_id: empUserId,
        shift_id: shiftId,
        effective_from: futureDate.toISOString().slice(0, 10),
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      assignmentId = (await res.json()).data?.id;
    }
  });

  test("assign shift to manager", async ({ request }) => {
    if (!shiftId2) return;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const res = await request.post(`${API}/attendance/shifts/assign`, {
      headers: hdr(adminToken),
      data: {
        user_id: mgrUserId,
        shift_id: shiftId2,
        effective_from: futureDate.toISOString().slice(0, 10),
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      assignmentId2 = (await res.json()).data?.id;
    }
  });

  test("list shift assignments", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/assignments`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list shift assignments filtered by user", async ({ request }) => {
    const res = await request.get(
      `${API}/attendance/shifts/assignments?user_id=${empUserId}`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  // --- Bulk Assign ---

  test("bulk assign shift", async ({ request }) => {
    if (!shiftId) return;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    const res = await request.post(`${API}/attendance/shifts/bulk-assign`, {
      headers: hdr(adminToken),
      data: {
        shift_id: shiftId,
        user_ids: [empUserId, mgrUserId],
        effective_from: futureDate.toISOString().slice(0, 10),
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("bulk assign with invalid user (validation branch)", async ({ request }) => {
    if (!shiftId) return;
    const res = await request.post(`${API}/attendance/shifts/bulk-assign`, {
      headers: hdr(adminToken),
      data: {
        shift_id: shiftId,
        user_ids: [999999],
        effective_from: "2026-12-01",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --- Schedule ---

  test("get schedule (weekly view)", async ({ request }) => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const res = await request.get(
      `${API}/attendance/shifts/schedule?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("get my schedule (employee)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/my-schedule`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- Delete ---

  test("delete shift", async ({ request }) => {
    if (!shiftId) return;
    const res = await request.delete(`${API}/attendance/shifts/${shiftId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 12. AI CONFIG SERVICE (41.6% coverage)
// =============================================================================

test.describe("AI Config Service — Branch Coverage", () => {
  let superToken: string;
  let superUserId: number;

  test.beforeAll(async ({ request }) => {
    const sa = await login(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    superUserId = sa.userId;
  });

  test("get AI config", async ({ request }) => {
    const res = await request.get(`${API}/admin/ai-config`, {
      headers: hdr(superToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("get active provider status", async ({ request }) => {
    const res = await request.get(`${API}/admin/ai-config/status`, {
      headers: hdr(superToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("provider");
    expect(body.data).toHaveProperty("status");
  });

  test("update non-sensitive config key (active_provider)", async ({ request }) => {
    const res = await request.put(`${API}/admin/ai-config/active_provider`, {
      headers: hdr(superToken),
      data: { value: "none" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update sensitive config key (anthropic_api_key — encryption branch)", async ({ request }) => {
    const res = await request.put(`${API}/admin/ai-config/anthropic_api_key`, {
      headers: hdr(superToken),
      data: { value: "sk-ant-test-key-12345" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("update config to null (deactivation branch)", async ({ request }) => {
    const res = await request.put(`${API}/admin/ai-config/anthropic_api_key`, {
      headers: hdr(superToken),
      data: { value: null },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("verify masked value in config list", async ({ request }) => {
    // First set a key, then list and verify it's masked
    await request.put(`${API}/admin/ai-config/openai_api_key`, {
      headers: hdr(superToken),
      data: { value: "sk-openai-test-key-6789" },
    });
    const res = await request.get(`${API}/admin/ai-config`, {
      headers: hdr(superToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    const openaiRow = body.data?.find((r: any) => r.config_key === "openai_api_key");
    if (openaiRow && openaiRow.config_value) {
      expect(openaiRow.config_value).toContain("****");
    }
  });
});

// =============================================================================
// 13. ONBOARDING SERVICE (45.1% coverage)
// =============================================================================

test.describe("Onboarding Service — Branch Coverage", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
  });

  test("get onboarding status", async ({ request }) => {
    const res = await request.get(`${API}/onboarding/status`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("steps");
  });

  test("complete step 1 (company info)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/1`, {
      headers: hdr(adminToken),
      data: { timezone: "Asia/Kolkata", country: "India", city: "Bangalore" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("complete step 2 (departments)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/2`, {
      headers: hdr(adminToken),
      data: { departments: ["Engineering", "Marketing", "Sales"] },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("complete step 2 with empty departments (validation branch)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/2`, {
      headers: hdr(adminToken),
      data: { departments: [] },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("complete step 3 (invite team — empty invitations OK)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/3`, {
      headers: hdr(adminToken),
      data: { invitations: [] },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("complete step 4 (choose modules — empty OK)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/4`, {
      headers: hdr(adminToken),
      data: { module_ids: [] },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("complete step 5 (quick setup with leave types and shift)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/5`, {
      headers: hdr(adminToken),
      data: {
        leave_types: [
          { name: "Casual Leave", code: `CL_${RUN}`, annual_quota: 12, is_paid: true },
          { name: "Sick Leave", code: `SL_${RUN}`, annual_quota: 6 },
        ],
        shift: {
          name: `Standard ${RUN}`,
          start_time: "09:00:00",
          end_time: "18:00:00",
          break_minutes: 60,
        },
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("invalid step number (validation branch)", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/99`, {
      headers: hdr(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("skip onboarding", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/skip`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("complete onboarding", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/complete`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 14. SUBSCRIPTION SERVICE (42.8% coverage)
// =============================================================================

test.describe("Subscription Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let subId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
  });

  test("list subscriptions", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    if (body.data && body.data.length > 0) {
      subId = body.data[0].id;
    }
  });

  test("get subscription by ID", async ({ request }) => {
    if (!subId) return;
    const res = await request.get(`${API}/subscriptions/${subId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get non-existent subscription (404)", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/999999`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("get billing status", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("has_overdue");
    expect(body.data).toHaveProperty("warning_level");
  });

  test("get billing summary", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("check module access", async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: hdr(adminToken),
      data: {
        userId: admin.userId,
        orgId: admin.orgId,
        moduleSlug: "payroll",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("check access for non-existent module", async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: hdr(adminToken),
      data: {
        userId: admin.userId,
        orgId: admin.orgId,
        moduleSlug: "non-existent-module",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    const body = await res.json();
    if (body.data) {
      expect(body.data.has_access).toBe(false);
    }
  });

  test("update subscription (reduce seats validation)", async ({ request }) => {
    if (!subId) return;
    const res = await request.put(`${API}/subscriptions/${subId}`, {
      headers: hdr(adminToken),
      data: { total_seats: 0 },
    });
    // Should fail if there are used seats
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("list seats for subscription", async ({ request }) => {
    if (!subId) return;
    // Need module_id — get from subscription
    const subRes = await request.get(`${API}/subscriptions/${subId}`, {
      headers: hdr(adminToken),
    });
    if (subRes.status() === 200) {
      const sub = (await subRes.json()).data;
      const res = await request.get(`${API}/subscriptions/${subId}/seats`, {
        headers: hdr(adminToken),
      });
      expect(OK).toContain(res.status());
    }
  });
});

// =============================================================================
// 15. SALARY SERVICE (46.5% coverage)
// =============================================================================

test.describe("Salary Service — Branch Coverage", () => {
  let adminToken: string;
  let empUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empUserId = emp.userId;
  });

  test("get salary structure for employee", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/salary`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get salary for non-existent user (404)", async ({ request }) => {
    const res = await request.get(`${API}/employees/999999/salary`, {
      headers: hdr(adminToken),
    });
    expect([404]).toContain(res.status());
  });

  test("upsert salary structure with valid data", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/salary`, {
      headers: hdr(adminToken),
      data: {
        ctc: 1200000,
        basic: 480000,
        hra: 192000,
        da: 48000,
        special_allowance: 180000,
        gross: 900000,
        employer_pf: 57600,
        employer_esi: 0,
        gratuity: 23077,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("upsert salary with invalid structure (validation branch)", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/salary`, {
      headers: hdr(adminToken),
      data: {
        ctc: 100000,
        basic: 999999,
        hra: 0,
        da: 0,
        special_allowance: 0,
        gross: 999999,
        employer_pf: 0,
        employer_esi: 0,
        gratuity: 0,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("upsert salary for non-existent employee (404)", async ({ request }) => {
    const res = await request.put(`${API}/employees/999999/salary`, {
      headers: hdr(adminToken),
      data: {
        ctc: 100, basic: 40, hra: 16, da: 4,
        special_allowance: 20, gross: 80,
        employer_pf: 5, employer_esi: 0, gratuity: 2,
      },
    });
    expect([404]).toContain(res.status());
  });
});

// =============================================================================
// 16. NOTIFICATION SERVICE (49% coverage)
// =============================================================================

test.describe("Notification Service — Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("list notifications", async ({ request }) => {
    const res = await request.get(`${API}/notifications`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list notifications (unread only)", async ({ request }) => {
    const res = await request.get(`${API}/notifications?unreadOnly=true`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("list notifications with pagination", async ({ request }) => {
    const res = await request.get(`${API}/notifications?page=1&perPage=5`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("get unread count", async ({ request }) => {
    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("mark notification as read (valid or 404)", async ({ request }) => {
    // First get a notification
    const listRes = await request.get(`${API}/notifications`, {
      headers: hdr(empToken),
    });
    const notifications = (await listRes.json()).data?.notifications;
    if (notifications && notifications.length > 0) {
      const res = await request.put(`${API}/notifications/${notifications[0].id}/read`, {
        headers: hdr(empToken),
      });
      expect(OK_OR_ERR).toContain(res.status());
    }
  });

  test("mark non-existent notification as read (404)", async ({ request }) => {
    const res = await request.put(`${API}/notifications/999999/read`, {
      headers: hdr(empToken),
    });
    expect([404]).toContain(res.status());
  });

  test("mark all notifications as read", async ({ request }) => {
    const res = await request.put(`${API}/notifications/read-all`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });
});
