import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
}

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    token: body.data.tokens.access_token,
    userId: body.data.user.id,
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Face Enrollment
// =============================================================================

test.describe("Biometrics — Face Enrollment", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let enrollmentId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;

    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("HR can enroll a face", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/face/enroll`, {
      headers: auth(adminToken),
      data: {
        user_id: empUserId,
        face_encoding: "e2e-test-encoding-" + RUN,
        thumbnail_path: "/uploads/faces/e2e-test.jpg",
        enrollment_method: "photo",
        quality_score: 0.95,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    enrollmentId = body.data.id;
  });

  test("HR can list face enrollments", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/face/enrollments`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("HR can list face enrollments filtered by user_id", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/face/enrollments?user_id=${empUserId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Employee can verify face", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/face/verify`, {
      headers: auth(empToken),
      data: {
        user_id: empUserId,
        face_encoding: "e2e-test-encoding-" + RUN,
      },
    });
    // May return 200 with match result (true or false)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("verified");
  });

  test("HR can remove a face enrollment", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.delete(`${API}/biometrics/face/enrollments/${enrollmentId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. QR Code
// =============================================================================

test.describe("Biometrics — QR Code", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let qrCode: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;

    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("HR can generate a QR code for employee", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/qr/generate`, {
      headers: auth(adminToken),
      data: {
        user_id: empUserId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("code");
    qrCode = body.data.code;
  });

  test("Employee can get their own QR code", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/qr/my-code`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("code");
  });

  test("Employee can scan/validate a QR code", async ({ request }) => {
    test.setTimeout(30_000);
    // Use the QR code we generated
    const res = await request.post(`${API}/biometrics/qr/scan`, {
      headers: auth(empToken),
      data: {
        code: qrCode,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. Biometric Check-in / Check-out
// =============================================================================

test.describe("Biometrics — Check-in / Check-out", () => {
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
  });

  test("Employee can biometric check-in (qr method)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/check-in`, {
      headers: auth(empToken),
      data: {
        method: "qr",
        qr_code: "e2e-qr-checkin-" + RUN,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    // 201 on success, or might return error if already checked in
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can biometric check-out (qr method)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/check-out`, {
      headers: auth(empToken),
      data: {
        method: "qr",
        qr_code: "e2e-qr-checkout-" + RUN,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 4. Devices CRUD
// =============================================================================

test.describe("Biometrics — Devices", () => {
  let adminToken: string;
  let deviceId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("HR can register a device", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/biometrics/devices`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Device ${RUN}`,
        type: "facial_recognition",
        serial_number: `SN-E2E-${RUN}`,
        location: "Main Entrance",
        ip_address: "192.168.1.100",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    deviceId = body.data.id;
  });

  test("HR can list devices", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/devices`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("HR can update a device", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/biometrics/devices/${deviceId}`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Device Updated ${RUN}`,
        location: "Side Entrance",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can decommission (delete) a device", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.delete(`${API}/biometrics/devices/${deviceId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 5. Settings
// =============================================================================

test.describe("Biometrics — Settings", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("HR can get biometric settings", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/settings`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can update biometric settings", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/biometrics/settings`, {
      headers: auth(adminToken),
      data: {
        face_recognition_enabled: true,
        qr_code_enabled: true,
        min_confidence_score: 0.85,
        liveness_required: false,
        geo_fence_enabled: false,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 6. Logs & Dashboard
// =============================================================================

test.describe("Biometrics — Logs & Dashboard", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("HR can view biometric logs", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/logs`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("HR can view biometric dashboard", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/biometrics/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
