import { test, expect } from "@playwright/test";

test("Super Admin Overview Dashboard loading check", async ({ page }) => {
  const failedRequests: string[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      failedRequests.push(`${resp.status()} ${resp.url()}`);
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[console.error] ${msg.text()}`);
    }
  });

  // Login as super admin
  await page.goto("https://test-empcloud.empcloud.com/login");
  await page.fill('input[name="email"]', "admin@empcloud.com");
  await page.fill('input[name="password"]', process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("Logged in, URL:", page.url());

  // Navigate to /admin/super
  await page.goto("https://test-empcloud.empcloud.com/admin/super");
  console.log("Navigated to /admin/super");

  // Wait 10s for content to load
  await page.waitForTimeout(10000);

  await page.screenshot({
    path: "e2e/screenshots/super-admin-dashboard.png",
    fullPage: true,
  });

  const spinnerVisible = await page
    .locator(".animate-spin")
    .first()
    .isVisible()
    .catch(() => false);
  const loadingText = await page
    .locator("text=Loading")
    .first()
    .isVisible()
    .catch(() => false);
  const bodyText = await page.textContent("body");

  console.log("Spinner visible:", spinnerVisible);
  console.log("Loading text visible:", loadingText);
  console.log("URL after wait:", page.url());

  // Log failed requests
  if (failedRequests.length > 0) {
    console.log("Failed requests:");
    failedRequests.forEach((r) => console.log("  ", r));
  } else {
    console.log("No failed requests");
  }

  // Check for real content vs stuck loading
  const hasRealContent =
    bodyText?.includes("Overview") ||
    bodyText?.includes("System") ||
    bodyText?.includes("Health") ||
    bodyText?.includes("Notifications");
  console.log("Has real dashboard content:", hasRealContent);
  console.log(
    "Still showing Loading...:",
    bodyText?.includes("Loading") || spinnerVisible
  );
});
