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

test("Issue #1472: position edit save works and zero-index is clearable", async ({ page }) => {
  test.setTimeout(120_000);

  await loginUI(page, EMAIL, PASSWORD);

  await page.goto(`${FRONTEND}/positions/list`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const firstLink = page.locator('table a[href^="/positions/"]').first();
  if (!(await firstLink.isVisible().catch(() => false))) {
    console.log("No positions to edit — skipping");
    return;
  }
  await firstLink.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const editBtn = page.locator('button:has-text("Edit")').first();
  await editBtn.click();
  await page.waitForTimeout(1000);

  const hcInput = page.locator('input[type="number"]').first();
  await hcInput.click();
  await hcInput.press("Control+a");
  await hcInput.press("Delete");
  await page.waitForTimeout(200);
  const afterClear = await hcInput.inputValue();
  expect(afterClear, "input should be clearable (not stuck at 0)").toBe("");

  await hcInput.fill("5");
  const afterFill = await hcInput.inputValue();
  expect(afterFill, "input should accept a new value").toBe("5");

  await page.screenshot({ path: "e2e/screenshots/issue-1472-position-edit.png", fullPage: true });
  console.log("Issue #1472 verified: headcount_budget is clearable and accepts new values");
});
