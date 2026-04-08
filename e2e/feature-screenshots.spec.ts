import { test, Page } from "@playwright/test";
import path from "path";

const BASE = "https://test-empcloud.empcloud.com";
const SCREENSHOTS = path.join(__dirname, "screenshots");

async function login(page: Page) {
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', "ananya@technova.in");
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || "Welcome@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

async function screenshotPage(page: Page, url: string, filename: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(SCREENSHOTS, filename),
    fullPage: true,
  });
}

test("Capture all EMP Cloud feature screenshots", async ({ page }) => {
  test.setTimeout(180000);

  await login(page);

  // 1. Dashboard (root route is the dashboard)
  await screenshotPage(page, BASE + "/", "cloud-01-dashboard.png");

  // 2. Employee Directory
  await screenshotPage(page, BASE + "/employees", "cloud-02-employees.png");

  // 3. Attendance Dashboard
  await screenshotPage(page, BASE + "/attendance", "cloud-03-attendance.png");

  // 4. Leave Dashboard
  await screenshotPage(page, BASE + "/leave", "cloud-04-leave.png");

  // 5. Documents
  await screenshotPage(page, BASE + "/documents", "cloud-05-documents.png");

  // 6. Announcements
  await screenshotPage(page, BASE + "/announcements", "cloud-06-announcements.png");

  // 7. Policies
  await screenshotPage(page, BASE + "/policies", "cloud-07-policies.png");

  // 8. Modules Marketplace
  await screenshotPage(page, BASE + "/modules", "cloud-08-modules.png");

  // 9. Subscriptions
  await screenshotPage(page, BASE + "/subscriptions", "cloud-09-subscriptions.png");

  // 10. Settings
  await screenshotPage(page, BASE + "/settings", "cloud-10-settings.png");

  // 11. Audit Log
  await screenshotPage(page, BASE + "/audit", "cloud-11-audit.png");
});
