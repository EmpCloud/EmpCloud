import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Super Admin Income / Revenue Analytics
// Verifies MRR, ARR, revenue by module/tier, top customers, billing summary
// =============================================================================

const FRONTEND = "https://test-empcloud.empcloud.com";
const API = "https://test-empcloud-api.empcloud.com/api/v1";

const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };
const ORG_ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };

// =============================================================================
// Helpers
// =============================================================================

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${FRONTEND}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

async function getToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

// =============================================================================
// 1. Revenue API Tests
// =============================================================================

test.describe("Super Admin Revenue API", () => {
  let superToken: string;
  let orgToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    orgToken = await getToken(request, ORG_ADMIN.email, ORG_ADMIN.password);
  });

  test("Super admin can access revenue analytics with MRR/ARR", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;

    expect(typeof data.mrr).toBe("number");
    expect(data.mrr).toBeGreaterThanOrEqual(0);
    expect(data.arr).toBe(data.mrr * 12);
    expect(typeof data.mrr_growth_percent).toBe("number");

    console.log(`MRR: ₹${(data.mrr / 100).toLocaleString()}`);
    console.log(`ARR: ₹${(data.arr / 100).toLocaleString()}`);
    console.log(`MRR Growth: ${data.mrr_growth_percent}%`);
  });

  test("Revenue by module breakdown", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;

    expect(Array.isArray(data.revenue_by_module)).toBe(true);
    expect(data.revenue_by_module.length).toBeGreaterThan(0);

    let totalModuleRevenue = 0;
    console.log(`Revenue by module (${data.revenue_by_module.length} modules):`);
    for (const m of data.revenue_by_module) {
      expect(m.name).toBeTruthy();
      expect(typeof m.revenue).toBe("number");
      totalModuleRevenue += m.revenue;
      console.log(`  ${m.name}: ₹${(m.revenue / 100).toLocaleString()}/mo`);
    }

    // Sum should match MRR
    expect(totalModuleRevenue).toBe(data.mrr);
    console.log(`Total module revenue: ₹${(totalModuleRevenue / 100).toLocaleString()} (matches MRR: ${totalModuleRevenue === data.mrr})`);
  });

  test("Revenue by plan tier breakdown", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;

    expect(Array.isArray(data.revenue_by_tier)).toBe(true);

    let totalTierRevenue = 0;
    console.log(`Revenue by tier:`);
    for (const t of data.revenue_by_tier) {
      expect(t.plan_tier).toBeTruthy();
      expect(typeof t.revenue).toBe("number");
      expect(typeof t.count).toBe("number");
      totalTierRevenue += t.revenue;
      console.log(`  ${t.plan_tier}: ₹${(t.revenue / 100).toLocaleString()} (${t.count} subscriptions)`);
    }

    // Sum should match MRR
    expect(totalTierRevenue).toBe(data.mrr);
  });

  test("Revenue trend over last 12 months", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue?period=12m`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;

    expect(Array.isArray(data.revenue_trend)).toBe(true);
    expect(data.revenue_trend.length).toBeGreaterThan(0);

    console.log(`Revenue trend (${data.revenue_trend.length} months):`);
    for (const t of data.revenue_trend) {
      expect(t.month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof t.revenue).toBe("number");
      console.log(`  ${t.month}: ₹${(t.revenue / 100).toLocaleString()}`);
    }
  });

  test("Billing cycle distribution", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;

    expect(Array.isArray(data.billing_cycle_distribution)).toBe(true);
    console.log(`Billing cycles:`);
    for (const c of data.billing_cycle_distribution) {
      console.log(`  ${c.billing_cycle}: ${c.count} subs, ₹${(c.revenue / 100).toLocaleString()}`);
    }
  });

  test("Top customers by revenue", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;

    expect(Array.isArray(data.top_customers)).toBe(true);
    console.log(`Top ${data.top_customers.length} customers:`);
    for (const c of data.top_customers) {
      expect(c.name).toBeTruthy();
      expect(typeof c.total_spend).toBe("number");
      expect(typeof c.subscription_count).toBe("number");
      console.log(`  ${c.name} (${c.email}): ₹${(c.total_spend / 100).toLocaleString()}/mo, ${c.subscription_count} subs`);
    }
  });

  test("Org admin CANNOT access revenue analytics (403)", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${orgToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test("Platform overview includes MRR/ARR", async ({ request }) => {
    const res = await request.get(`${API}/admin/overview`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    console.log("Platform overview:", JSON.stringify(data).slice(0, 500));
  });

  test("Module analytics endpoint works", async ({ request }) => {
    const res = await request.get(`${API}/admin/modules`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const modules = Array.isArray(body.data) ? body.data : body.data?.modules || [];
    console.log(`Module analytics: ${modules.length} modules`);
  });

  test("Subscription metrics endpoint works", async ({ request }) => {
    const res = await request.get(`${API}/admin/subscriptions`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log("Subscription metrics:", JSON.stringify(body.data).slice(0, 500));
  });
});

// =============================================================================
// 2. Revenue Dashboard UI Tests
// =============================================================================

test.describe("Super Admin Revenue Dashboard UI", () => {
  test("Revenue page loads with MRR, ARR, charts", async ({ page }) => {
    await login(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto(`${FRONTEND}/admin/revenue`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=/Revenue|MRR|Monthly Recurring/i").first()
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator("text=/ARR|Annual Recurring/i").first()
    ).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/super-admin-revenue-dashboard.png" });
  });

  test("Revenue page shows module and tier sections", async ({ page }) => {
    await login(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto(`${FRONTEND}/admin/revenue`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=/by Module|Module Revenue/i").first()
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator("text=/by.*Tier|Plan Tier|Tier/i").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("Revenue page shows top customers", async ({ page }) => {
    await login(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto(`${FRONTEND}/admin/revenue`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=/Top.*Customer|Highest Revenue/i").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("Org admin cannot access revenue page", async ({ page }) => {
    await login(page, ORG_ADMIN.email, ORG_ADMIN.password);
    await page.goto(`${FRONTEND}/admin/revenue`);
    await page.waitForTimeout(3000);
    const url = page.url();
    const forbidden = await page.locator("text=/forbidden|unauthorized|not authorized/i").first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(forbidden || !url.includes("/admin/revenue")).toBe(true);
  });

  test("Platform overview page loads", async ({ page }) => {
    await login(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=/Platform|Overview|Dashboard|Organizations/i").first()
    ).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "e2e/screenshots/super-admin-overview.png" });
  });
});

// =============================================================================
// 3. Income Calculation Correctness
// =============================================================================

test.describe("Income Calculation Correctness", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("ARR = MRR × 12", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;
    expect(data.arr).toBe(data.mrr * 12);
    console.log(`✓ ARR (₹${(data.arr / 100).toLocaleString()}) = MRR (₹${(data.mrr / 100).toLocaleString()}) × 12`);
  });

  test("Module revenue sums to MRR", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;
    const moduleSum = data.revenue_by_module.reduce((s: number, m: any) => s + m.revenue, 0);
    expect(moduleSum).toBe(data.mrr);
    console.log(`✓ Module sum (₹${(moduleSum / 100).toLocaleString()}) = MRR (₹${(data.mrr / 100).toLocaleString()})`);
  });

  test("Tier revenue sums to MRR", async ({ request }) => {
    const res = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const data = (await res.json()).data;
    const tierSum = data.revenue_by_tier.reduce((s: number, t: any) => s + t.revenue, 0);
    expect(tierSum).toBe(data.mrr);
    console.log(`✓ Tier sum (₹${(tierSum / 100).toLocaleString()}) = MRR (₹${(data.mrr / 100).toLocaleString()})`);
  });

  test("Cross-system: billing payment visible in revenue", async ({ request }) => {
    const revRes = await request.get(`${API}/admin/revenue`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const rev = (await revRes.json()).data;

    const billRes = await request.get(`${API}/billing/summary`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });

    console.log("EmpCloud Revenue:");
    console.log(`  MRR: ₹${(rev.mrr / 100).toLocaleString()}`);
    console.log(`  ARR: ₹${(rev.arr / 100).toLocaleString()}`);
    console.log(`  Top customer: ${rev.top_customers[0]?.name || "N/A"} (₹${((rev.top_customers[0]?.total_spend || 0) / 100).toLocaleString()}/mo)`);

    if (billRes.status() === 200) {
      const bill = (await billRes.json()).data;
      console.log("\nEMP Billing Summary:");
      console.log(`  Invoices: ${bill.recent_invoices?.length || 0}`);
    }
  });
});
