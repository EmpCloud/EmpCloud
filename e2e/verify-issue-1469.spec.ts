import { test, expect, Page } from "@playwright/test";

const FRONTEND = "https://test-empcloud.empcloud.com";
const EMAIL = "ananya@technova.in";
const PASSWORD = process.env.TEST_USER_PASSWORD || "Welcome@123";

async function loginUI(page: Page, email: string, password: string) {
  await page.goto(`${FRONTEND}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
}

test("Issue #1469: position list defaults to All Statuses", async ({ page }) => {
  test.setTimeout(90_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/positions/list`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const statusSelect = page.locator('select').filter({ hasText: "All Statuses" }).first();
  await expect(statusSelect).toBeVisible();
  const val = await statusSelect.inputValue();
  expect(val, "default status filter should be empty (All Statuses)").toBe("");

  await page.screenshot({ path: "e2e/screenshots/issue-1469-positions-default-status.png", fullPage: true });
  console.log("Issue #1469 verified: default status is All Statuses");
});
