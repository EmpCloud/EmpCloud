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

test("Issue #1465: headcount plan fiscal year dropdown + clearable counts", async ({ page }) => {
  test.setTimeout(120_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/positions/headcount-plans`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  await page.locator('button:has-text("New Plan")').first().click();
  await page.waitForTimeout(500);

  const fiscalSelect = page.locator('select').first();
  await expect(fiscalSelect).toBeVisible();
  const optionCount = await fiscalSelect.locator("option").count();
  expect(optionCount).toBeGreaterThan(5);

  const numberInputs = page.locator('input[type="number"]');
  const plannedInput = numberInputs.first();
  await plannedInput.click();
  await plannedInput.press("Control+a");
  await plannedInput.press("Delete");
  const cleared = await plannedInput.inputValue();
  expect(cleared, "planned_headcount should clear to empty, not 0").toBe("");

  await plannedInput.fill("10");
  expect(await plannedInput.inputValue()).toBe("10");

  await page.screenshot({ path: "e2e/screenshots/issue-1465-headcount-plan.png", fullPage: true });
  console.log("Issue #1465 verified: fiscal year dropdown present, headcount inputs clearable");
});
