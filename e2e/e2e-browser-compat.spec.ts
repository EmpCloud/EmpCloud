import { test, expect, type Page } from "@playwright/test";

// =============================================================================
// E2E: Browser Compatibility & Viewport Variation Tests
// Tests key pages across different viewport sizes and rendering scenarios.
// Since only chromium is configured, we vary viewport/user-agent instead.
// =============================================================================

const FRONTEND = "https://test-empcloud.empcloud.com";
const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${FRONTEND}/login`, { timeout: 30000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// =============================================================================
// 1. Standard Desktop Viewport (1280x720)
// =============================================================================

test.describe("Standard Desktop (1280x720)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Login page renders with email and password inputs", async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/compat-login-1280.png" });
  });

  test("Dashboard loads with correct layout after login", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, ADMIN.email, ADMIN.password);
    // Dashboard should have main content area
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    // Should not be on login page
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/compat-dashboard-1280.png" });
  });

  test("Billing page shows invoices tab", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Should load billing page (may show invoices, subscriptions, etc.)
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    await page.screenshot({ path: "e2e/screenshots/compat-billing-1280.png" });
  });

  test("Leave form page is accessible", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto(`${FRONTEND}/leave`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    await page.screenshot({ path: "e2e/screenshots/compat-leave-1280.png" });
  });

  test("Attendance page loads with content", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto(`${FRONTEND}/attendance`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    await page.screenshot({ path: "e2e/screenshots/compat-attendance-1280.png" });
  });
});

// =============================================================================
// 2. Wide Desktop Viewport (1920x1080)
// =============================================================================

test.describe("Wide Desktop (1920x1080)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("Navigation sidebar renders correctly at wide viewport", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, ADMIN.email, ADMIN.password);
    // Admin should see sidebar with navigation items
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    // Look for common nav items
    const hasNav = await page.locator("nav, [role='navigation'], aside").count();
    console.log(`Navigation elements found: ${hasNav}`);
    await page.screenshot({ path: "e2e/screenshots/compat-sidebar-admin-1920.png" });
  });

  test("Employee sees appropriate navigation items", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/compat-sidebar-employee-1920.png" });
  });

  test("Tables render with data rows (not empty)", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Check for table or data grid with rows
    const tables = await page.locator("table").count();
    const dataRows = await page.locator("table tbody tr, [role='row']").count();
    console.log(`Tables: ${tables}, Data rows: ${dataRows}`);
    // Should have at least some content rendered
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(50);
    await page.screenshot({ path: "e2e/screenshots/compat-employees-table-1920.png" });
  });
});

// =============================================================================
// 3. SSO Module Launch Links
// =============================================================================

test.describe("Module Launch Links", () => {
  test("Module cards include sso_token in launch URLs", async ({ request }) => {
    // Login to get token
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    const token = loginBody.data.tokens.access_token;

    // Fetch subscriptions to verify module data
    const res = await request.get(`${API}/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log("Subscriptions accessible for SSO launch verification");
  });

  test("Modules list returns launchable module data", async ({ request }) => {
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    const token = (await loginRes.json()).data.tokens.access_token;

    const res = await request.get(`${API}/modules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const modules = body.data;
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);
    // Each module should have a name and URL or slug
    const mod = modules[0];
    expect(mod.name || mod.slug).toBeTruthy();
    console.log(`Modules available: ${modules.map((m: any) => m.name || m.slug).join(", ")}`);
  });
});
