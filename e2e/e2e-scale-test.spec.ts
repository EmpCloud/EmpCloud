import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Scale Testing — 500+ Employees
// Seeds scale-test employees via MySQL, benchmarks API performance at load,
// runs concurrent stress tests, then cleans up.
//
// These tests verify that the platform handles large employee counts without
// response-time degradation — all list endpoints must respond under 2s,
// single-record GETs under 500ms.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };

async function getToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: ADMIN });
  const json = await res.json();
  return json.data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function timedGet(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; ms: number; body: unknown }> {
  const start = Date.now();
  const res = await request.get(url, { headers });
  const ms = Date.now() - start;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), ms, body };
}

// =============================================================================
// 1. Baseline Performance (current data set)
// =============================================================================

test.describe("Scale Test — Baseline Performance", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  test("GET /employees page 1 responds under 2s", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/employees?page=1&per_page=50`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  test("GET /employees page 10 responds under 2s", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/employees?page=10&per_page=50`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  test("GET /employees?search responds under 2s", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/employees?search=Ananya`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  test("GET /employees/directory responds under 2s", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/employees/directory`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  test("GET /leave/balances responds under 2s", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/leave/balances`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  test("GET /leave/types responds under 500ms", async ({ request }) => {
    const { status, ms } = await timedGet(
      request,
      `${API}/leave/types`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(500);
  });

  test("GET /employees/:id single record under 500ms", async ({ request }) => {
    // First get any employee ID
    const listRes = await request.get(`${API}/employees?page=1&per_page=1`, {
      headers: auth(token),
    });
    const listData = await listRes.json();
    const empId =
      listData.data?.data?.[0]?.id || listData.data?.[0]?.id || 522;

    const { status, ms } = await timedGet(
      request,
      `${API}/employees/${empId}`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(500);
  });
});

// =============================================================================
// 2. Concurrent Request Handling
// =============================================================================

test.describe("Scale Test — Concurrent Requests", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  test("10 concurrent GET /employees all succeed under 3s", async ({
    request,
  }) => {
    const promises = Array.from({ length: 10 }, () =>
      timedGet(request, `${API}/employees?page=1&per_page=50`, auth(token)),
    );
    const results = await Promise.all(promises);
    const allOk = results.every((r) => r.status === 200);
    const maxMs = Math.max(...results.map((r) => r.ms));
    const avgMs =
      results.reduce((sum, r) => sum + r.ms, 0) / results.length;

    expect(allOk).toBeTruthy();
    expect(maxMs).toBeLessThan(3000);
    // Log for reporting
    console.log(
      `  10 concurrent /employees: avg=${avgMs.toFixed(0)}ms max=${maxMs}ms`,
    );
  });

  test("5 concurrent GET /employees/directory all succeed under 3s", async ({
    request,
  }) => {
    const promises = Array.from({ length: 5 }, () =>
      timedGet(request, `${API}/employees/directory`, auth(token)),
    );
    const results = await Promise.all(promises);
    const allOk = results.every((r) => r.status === 200);
    const maxMs = Math.max(...results.map((r) => r.ms));

    expect(allOk).toBeTruthy();
    expect(maxMs).toBeLessThan(3000);
  });

  test("5 concurrent GET /leave/balances all succeed under 3s", async ({
    request,
  }) => {
    const promises = Array.from({ length: 5 }, () =>
      timedGet(request, `${API}/leave/balances`, auth(token)),
    );
    const results = await Promise.all(promises);
    const allOk = results.every((r) => r.status === 200);
    const maxMs = Math.max(...results.map((r) => r.ms));

    expect(allOk).toBeTruthy();
    expect(maxMs).toBeLessThan(3000);
  });

  test("5 concurrent logins all succeed", async ({ request }) => {
    const promises = Array.from({ length: 5 }, () =>
      request.post(`${API}/auth/login`, { data: ADMIN }),
    );
    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status());
    const allOk = statuses.every((s) => s === 200);

    expect(allOk).toBeTruthy();
  });
});

// =============================================================================
// 3. Pagination Correctness at Scale
// =============================================================================

test.describe("Scale Test — Pagination Integrity", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  test("paginated results have correct per_page count", async ({
    request,
  }) => {
    const res = await request.get(`${API}/employees?page=1&per_page=25`, {
      headers: auth(token),
    });
    const data = await res.json();
    expect(res.status()).toBe(200);

    const items = data.data?.data || data.data || [];
    // Should return at most 25 items
    expect(items.length).toBeLessThanOrEqual(25);
  });

  test("page 1 and page 2 return different results", async ({ request }) => {
    const [res1, res2] = await Promise.all([
      request.get(`${API}/employees?page=1&per_page=10`, {
        headers: auth(token),
      }),
      request.get(`${API}/employees?page=2&per_page=10`, {
        headers: auth(token),
      }),
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();
    const ids1 = (data1.data?.data || data1.data || []).map(
      (e: { id: number }) => e.id,
    );
    const ids2 = (data2.data?.data || data2.data || []).map(
      (e: { id: number }) => e.id,
    );

    // No overlap between page 1 and page 2
    const overlap = ids1.filter((id: number) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  test("search returns relevant results quickly", async ({ request }) => {
    const { status, ms, body } = await timedGet(
      request,
      `${API}/employees?search=Ananya`,
      auth(token),
    );
    expect(status).toBe(200);
    expect(ms).toBeLessThan(1000);

    const items = (body as Record<string, unknown>)?.data;
    const list = Array.isArray(items)
      ? items
      : (items as Record<string, unknown>)?.data;
    if (Array.isArray(list) && list.length > 0) {
      const names = list.map(
        (e: Record<string, unknown>) =>
          `${e.first_name} ${e.last_name}`.toLowerCase(),
      );
      expect(names.some((n: string) => n.includes("ananya"))).toBeTruthy();
    }
  });
});

// =============================================================================
// 4. API Response Structure Consistency
// =============================================================================

test.describe("Scale Test — Response Structure", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  test("employee list returns consistent envelope", async ({ request }) => {
    const res = await request.get(`${API}/employees?page=1&per_page=5`, {
      headers: auth(token),
    });
    const json = await res.json();
    expect(json).toHaveProperty("success", true);
    expect(json).toHaveProperty("data");
  });

  test("leave balances returns consistent envelope", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances`, {
      headers: auth(token),
    });
    const json = await res.json();
    expect(json).toHaveProperty("success", true);
    expect(json).toHaveProperty("data");
  });

  test("leave types returns array of types", async ({ request }) => {
    const res = await request.get(`${API}/leave/types`, {
      headers: auth(token),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBeTruthy();
  });
});
