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

test("Issue #1436: KB feedback can be updated after voting", async ({ page }) => {
  test.setTimeout(120_000);

  await loginUI(page, EMAIL, PASSWORD);
  await page.goto(`${FRONTEND}/helpdesk/kb`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  // #1509 changed KB cards from <button> to <div role="button"> so edit/delete
  // icons could nest inside without invalid HTML. Match either shape.
  const firstCard = page.locator('[role="button"]:has(h3), button:has(h3)').first();
  await firstCard.click();
  await page.waitForTimeout(1500);

  // The Yes / No buttons include a count like "Yes (3)" — match by role+name
  // so the locator stays stable as the count changes after each vote.
  const yesBtn = page.getByRole("button", { name: /^\s*Yes\s*\(/ });
  const noBtn = page.getByRole("button", { name: /^\s*No\s*\(/ });
  await expect(yesBtn).toBeVisible();
  await expect(noBtn).toBeVisible();

  await yesBtn.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  await expect(yesBtn, "Yes button should still be visible after voting").toBeVisible();
  await expect(noBtn, "No button should still be visible after voting").toBeVisible();

  await noBtn.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await expect(noBtn, "No button should still be visible after re-voting").toBeVisible();
  await expect(yesBtn, "Yes button should still be visible after re-voting").toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/issue-1436-kb-revote.png", fullPage: true });
  console.log("Issue #1436 verified: both Yes/No buttons remain after voting and can be clicked again");
});
