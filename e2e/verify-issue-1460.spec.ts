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

test("Issue #1460: forum post cards do not render stray 0", async ({ page }) => {
  test.setTimeout(90_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/forum`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const headers = page.locator('h3.text-sm.font-semibold');
  const count = await headers.count();
  console.log(`Found ${count} forum post cards`);

  if (count === 0) {
    console.log("No posts to check — writing baseline screenshot");
    await page.screenshot({ path: "e2e/screenshots/issue-1460-forum-empty.png", fullPage: true });
    return;
  }

  for (let i = 0; i < count; i++) {
    const header = headers.nth(i);
    const wrapper = header.locator("xpath=../div[1]");
    if (!(await wrapper.isVisible().catch(() => false))) continue;
    const text = ((await wrapper.innerText().catch(() => "")) || "").trim();
    expect(text, `Post ${i} header block should not contain stray '0': ${JSON.stringify(text)}`).not.toMatch(/(^|\s)0($|\s)/);
  }

  await page.screenshot({ path: "e2e/screenshots/issue-1460-forum-after-fix.png", fullPage: true });
  console.log(`Issue #1460 verified on ${count} posts`);
});
