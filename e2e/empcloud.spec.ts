import { test, expect } from "@playwright/test";

const BASE = "https://test-empcloud.empcloud.com";
const DEMO_EMAIL = "ananya@technova.in";
const DEMO_PASSWORD = "Welcome@123";

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER FLOW
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Register Flow", () => {
  test("should load register page and create a new organization", async ({ page }) => {
    await page.goto(`${BASE}/register`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/01-register-page.png", fullPage: true });

    // Fill the registration form
    const orgName = `TestCorp_${Date.now()}`;
    const email = `admin_${Date.now()}@testcorp.com`;

    await page.fill('input[name="org_name"]', orgName);
    await page.fill('input[name="first_name"]', "Admin");
    await page.fill('input[name="last_name"]', "User");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', "Admin@12345");

    await page.screenshot({ path: "e2e/screenshots/02-register-filled.png", fullPage: true });

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard after successful registration
    await page.waitForURL("**/", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "e2e/screenshots/03-register-success-dashboard.png", fullPage: true });

    // Verify we're on the dashboard
    expect(page.url()).toBe(`${BASE}/`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN FLOW
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Login Flow", () => {
  test("should show login page with correct branding", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");

    // Verify branding
    const heading = page.locator("h1");
    await expect(heading).toContainText("EMP Cloud");

    await page.screenshot({ path: "e2e/screenshots/04-login-page.png", fullPage: true });
  });

  test("should reject wrong credentials", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");

    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', "WrongPassword@123");
    await page.click('button[type="submit"]');

    // Wait for error message
    await page.waitForSelector(".bg-red-50", { timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/05-login-error.png", fullPage: true });

    // Should still be on login page
    expect(page.url()).toContain("/login");
  });

  test("should login with valid credentials and redirect to dashboard", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");

    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);

    await page.screenshot({ path: "e2e/screenshots/06-login-filled.png", fullPage: true });

    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "e2e/screenshots/07-login-success-dashboard.png", fullPage: true });

    expect(page.url()).toBe(`${BASE}/`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
  });

  test("should display dashboard with organization stats", async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/08-dashboard-full.png", fullPage: true });

    // Verify sidebar is visible
    const sidebar = page.locator("nav, [class*='sidebar'], aside").first();
    await expect(sidebar).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MODULES PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Modules Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("should display module marketplace with all 12 modules", async ({ page }) => {
    await page.goto(`${BASE}/modules`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/09-modules-page.png", fullPage: true });

    // Verify page loaded with module content
    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("Payroll");
    expect(pageContent).toContain("Billing");
    expect(pageContent).toContain("Monitor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUBSCRIPTIONS PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Subscriptions Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("should display active subscriptions and billing", async ({ page }) => {
    await page.goto(`${BASE}/subscriptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/10-subscriptions-page.png", fullPage: true });

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("Payroll");
    expect(pageContent).toContain("Billing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. USERS PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Users Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("should display team members list", async ({ page }) => {
    await page.goto(`${BASE}/users`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/11-users-page.png", fullPage: true });

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("Ananya");
    expect(pageContent).toContain("Rahul");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("should display organization settings with departments", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/12-settings-page.png", fullPage: true });

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("TechNova");
    expect(pageContent).toContain("Engineering");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. AUDIT LOG PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Audit Log Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', DEMO_EMAIL);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("should display audit log entries", async ({ page }) => {
    await page.goto(`${BASE}/audit`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/13-audit-page.png", fullPage: true });

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("login");
  });
});
