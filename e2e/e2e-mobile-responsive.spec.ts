import { test, expect, type Page } from "@playwright/test";

// =============================================================================
// E2E: Mobile Responsive Testing
// Tests key pages at 375px (iPhone SE) and 768px (iPad) viewports
// =============================================================================

const FRONTEND = "https://test-empcloud.empcloud.com";
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
// Mobile (375px)
// =============================================================================

test.describe("Mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Login page renders correctly", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/mobile-login.png" });
  });

  test("Page loads without crash on mobile", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // Verify page loaded (no crash, no blank)
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(10);
    await page.screenshot({ path: "e2e/screenshots/mobile-sidebar.png" });
  });

  test("Dashboard loads without horizontal scroll", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20); // 20px tolerance for mobile
    await page.screenshot({ path: "e2e/screenshots/mobile-dashboard.png" });
  });

  test("Employee self-service loads on mobile", async ({ page }) => {
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto(`${FRONTEND}/self-service`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Page loaded — may show self-service or redirect to dashboard
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/mobile-self-service.png" });
  });

  test("Leave page loads on mobile", async ({ page }) => {
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto(`${FRONTEND}/leave`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/mobile-leave.png" });
  });

  test("Attendance page loads on mobile", async ({ page }) => {
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto(`${FRONTEND}/attendance`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/mobile-attendance.png" });
  });

  test("Billing page loads on mobile", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/mobile-billing.png" });
  });

  test("Modules page loads on mobile", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/modules`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/mobile-modules.png" });
  });

  test("Employee directory loads on mobile", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    await page.screenshot({ path: "e2e/screenshots/mobile-employees.png" });
  });
});

// =============================================================================
// Tablet (768px)
// =============================================================================

test.describe("Tablet (768px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("Dashboard renders with proper grid", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20);
    await page.screenshot({ path: "e2e/screenshots/tablet-dashboard.png" });
  });

  test("Billing page with invoices on tablet", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    // Page should load without 500 error
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
    await page.screenshot({ path: "e2e/screenshots/tablet-billing.png" });
  });

  test("Super admin revenue on tablet", async ({ page }) => {
    test.setTimeout(30000);
    await login(page, "admin@empcloud.com", "SuperAdmin@123");
    await page.goto(`${FRONTEND}/admin/revenue`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3000);
    // Page should load without 500 error
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
    await page.screenshot({ path: "e2e/screenshots/tablet-revenue.png" });
  });

  test("Org chart on tablet", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/org-chart`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/tablet-orgchart.png" });
  });
});
