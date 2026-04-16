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

test("Issue #1450: feedback list page shows status count cards", async ({ page }) => {
  test.setTimeout(90_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/feedback`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const labels = ["New", "Acknowledged", "Under Review", "Resolved"];
  for (const label of labels) {
    const card = page.locator(`button:has-text("${label}")`).first();
    await expect(card, `Count card for "${label}" should be visible`).toBeVisible({ timeout: 10_000 });
  }

  await page.screenshot({ path: "e2e/screenshots/issue-1450-feedback-count-cards.png", fullPage: true });
  console.log("Issue #1450 verified: all 4 status count cards visible");
});
