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

test("Issue #1440: asset add form shows INR currency indicator", async ({ page }) => {
  test.setTimeout(90_000);

  await loginUI(page, EMAIL, PASSWORD);

  await page.goto(`${FRONTEND}/assets/dashboard`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const sidebarAssetsLink = page.locator('a[href="/assets"]').first();
  if (await sidebarAssetsLink.isVisible().catch(() => false)) {
    await sidebarAssetsLink.click();
    await page.waitForTimeout(1500);
  }

  const addBtn = page.locator('button:has-text("Add Asset"), button:has-text("New Asset")').first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(1000);
  }

  const currencyLabel = page.locator("text=₹ INR").first();
  await expect(currencyLabel).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: "e2e/screenshots/issue-1440-assets-currency.png", fullPage: true });
  console.log("Issue #1440 verified: ₹ INR currency indicator visible on purchase cost input");
});
