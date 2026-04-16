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

test("Issue #1462: non-featured KB cards do not render stray 0", async ({ page }) => {
  test.setTimeout(90_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/helpdesk/kb`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const cards = page.locator('button:has(h3)');
  const count = await cards.count();
  console.log(`Found ${count} KB article cards`);
  expect(count).toBeGreaterThan(0);

  let checked = 0;
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const header = card.locator("> div").first();
    if (!(await header.isVisible().catch(() => false))) continue;
    const text = ((await header.innerText().catch(() => "")) || "").trim();
    expect(text, `Card ${i} header contained stray '0': ${JSON.stringify(text)}`).not.toMatch(/(^|\s)0($|\s)/);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);

  await page.screenshot({ path: "e2e/screenshots/issue-1462-kb-after-fix.png", fullPage: true });
  console.log(`Issue #1462 verified on ${checked} cards`);
});
