import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Asset Management E2E Tests
// Tests: categories CRUD, asset CRUD, assign, return, retire, report lost,
//        dashboard, expiring warranties, access control
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ token: string; userId: number }> {
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
// 1. Asset Categories CRUD
// =============================================================================

test.describe("Asset Categories CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let categoryId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("HR can list asset categories", async ({ request }) => {
    const res = await request.get(`${API}/assets/categories`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can create an asset category", async ({ request }) => {
    const res = await request.post(`${API}/assets/categories`, {
      headers: auth(adminToken),
      data: {
        name: `Laptops ${RUN}`,
        description: "E2E test category for laptops",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    categoryId = body.data.id;
  });

  test("HR can update an asset category", async ({ request }) => {
    const res = await request.put(`${API}/assets/categories/${categoryId}`, {
      headers: auth(adminToken),
      data: { name: `Updated Laptops ${RUN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create an asset category (403)", async ({ request }) => {
    const res = await request.post(`${API}/assets/categories`, {
      headers: auth(employeeToken),
      data: { name: "Blocked", description: "Should fail" },
    });
    expect(res.status()).toBe(403);
  });

  test("HR can delete an asset category", async ({ request }) => {
    const res = await request.delete(`${API}/assets/categories/${categoryId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. Asset CRUD + Lifecycle (assign, return, retire, report lost)
// =============================================================================

test.describe("Asset CRUD + Lifecycle", () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUserId: number;
  let categoryId: number;
  let assetId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
    employeeUserId = emp.userId;

    // Create a category for assets
    const catRes = await request.post(`${API}/assets/categories`, {
      headers: auth(adminToken),
      data: { name: `E2E Assets ${RUN}`, description: "Category for asset tests" },
    });
    categoryId = (await catRes.json()).data.id;
  });

  test("HR can create an asset", async ({ request }) => {
    const res = await request.post(`${API}/assets`, {
      headers: auth(adminToken),
      data: {
        name: `MacBook Pro ${RUN}`,
        asset_tag: `ASSET-${RUN}`,
        category_id: categoryId,
        serial_number: `SN-${RUN}`,
        purchase_date: "2025-01-15",
        purchase_cost: 150000,
        warranty_expiry: "2028-01-15",
        condition_status: "new",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    assetId = body.data.id;
  });

  test("HR can list all assets", async ({ request }) => {
    const res = await request.get(`${API}/assets`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can get asset detail", async ({ request }) => {
    const res = await request.get(`${API}/assets/${assetId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(assetId);
  });

  test("HR can update an asset", async ({ request }) => {
    const res = await request.put(`${API}/assets/${assetId}`, {
      headers: auth(adminToken),
      data: { name: `Updated MacBook ${RUN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create an asset (403)", async ({ request }) => {
    const res = await request.post(`${API}/assets`, {
      headers: auth(employeeToken),
      data: {
        name: "Blocked Asset",
        asset_tag: "BLOCKED-001",
        category_id: categoryId,
      },
    });
    expect(res.status()).toBe(403);
  });

  test("HR can assign asset to employee", async ({ request }) => {
    const res = await request.post(`${API}/assets/${assetId}/assign`, {
      headers: auth(adminToken),
      data: {
        assigned_to: employeeUserId,
        notes: "Assigned via E2E test",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can see assigned assets via /my", async ({ request }) => {
    const res = await request.get(`${API}/assets/my`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const assets = body.data;
    if (Array.isArray(assets)) {
      const found = assets.some((a: any) => a.id === assetId);
      expect(found).toBe(true);
    }
  });

  test("Employee can return an assigned asset", async ({ request }) => {
    const res = await request.post(`${API}/assets/${assetId}/return`, {
      headers: auth(employeeToken),
      data: { condition: "good", notes: "Returned via E2E test" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can retire an asset", async ({ request }) => {
    const res = await request.post(`${API}/assets/${assetId}/retire`, {
      headers: auth(adminToken),
      data: { notes: "Retired via E2E test" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (categoryId) {
      await request.delete(`${API}/assets/categories/${categoryId}`, {
        headers: auth(adminToken),
      });
    }
  });
});

// =============================================================================
// 3. Report Lost Asset
// =============================================================================

test.describe("Report Lost Asset", () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUserId: number;
  let categoryId: number;
  let assetId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
    employeeUserId = emp.userId;

    // Create category + asset + assign
    const catRes = await request.post(`${API}/assets/categories`, {
      headers: auth(adminToken),
      data: { name: `Lost Test ${RUN}`, description: "Category for lost test" },
    });
    categoryId = (await catRes.json()).data.id;

    const assetRes = await request.post(`${API}/assets`, {
      headers: auth(adminToken),
      data: {
        name: `Lost Asset ${RUN}`,
        asset_tag: `LOST-${RUN}`,
        category_id: categoryId,
      },
    });
    assetId = (await assetRes.json()).data.id;

    await request.post(`${API}/assets/${assetId}/assign`, {
      headers: auth(adminToken),
      data: { assigned_to: employeeUserId },
    });
  });

  test("Employee can report an assigned asset as lost", async ({ request }) => {
    const res = await request.post(`${API}/assets/${assetId}/report-lost`, {
      headers: auth(employeeToken),
      data: { notes: "Left in taxi" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (assetId) {
      await request.delete(`${API}/assets/${assetId}`, {
        headers: auth(adminToken),
      });
    }
    if (categoryId) {
      await request.delete(`${API}/assets/categories/${categoryId}`, {
        headers: auth(adminToken),
      });
    }
  });
});

// =============================================================================
// 4. Asset Dashboard + Expiring Warranties
// =============================================================================

test.describe("Asset Dashboard & Expiring Warranties", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("HR can view asset dashboard", async ({ request }) => {
    const res = await request.get(`${API}/assets/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot view asset dashboard (403)", async ({ request }) => {
    const res = await request.get(`${API}/assets/dashboard`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("HR can view expiring warranties", async ({ request }) => {
    const res = await request.get(`${API}/assets/expiring-warranties?days=90`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot view expiring warranties (403)", async ({ request }) => {
    const res = await request.get(`${API}/assets/expiring-warranties`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 5. Asset Delete (blocks if assigned)
// =============================================================================

test.describe("Asset Delete", () => {
  let adminToken: string;
  let categoryId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;

    const catRes = await request.post(`${API}/assets/categories`, {
      headers: auth(adminToken),
      data: { name: `Delete Test ${RUN}`, description: "For delete test" },
    });
    categoryId = (await catRes.json()).data.id;
  });

  test("HR can delete an unassigned asset", async ({ request }) => {
    // Create a fresh asset
    const createRes = await request.post(`${API}/assets`, {
      headers: auth(adminToken),
      data: {
        name: `Deletable Asset ${RUN}`,
        asset_tag: `DEL-${RUN}`,
        category_id: categoryId,
      },
    });
    expect(createRes.status()).toBe(201);
    const delAssetId = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/assets/${delAssetId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (categoryId) {
      await request.delete(`${API}/assets/categories/${categoryId}`, {
        headers: auth(adminToken),
      });
    }
  });
});

// =============================================================================
// 6. Unauthenticated Access Denied
// =============================================================================

test.describe("Unauthenticated Access Denied", () => {
  test("Assets endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/assets`);
    expect(res.status()).toBe(401);
  });

  test("Asset categories endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/assets/categories`);
    expect(res.status()).toBe(401);
  });
});
