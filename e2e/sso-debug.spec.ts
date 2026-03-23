import { test, expect } from "@playwright/test";
import fs from "fs";

const LOG_FILE = "e2e/sso-debug.log";
function log(msg: string) {
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

test("Debug SSO request to Recruit", async ({ page }) => {
  fs.writeFileSync(LOG_FILE, "=== SSO Debug Log ===\n");

  // 1. Login to Cloud
  await page.goto("https://test-empcloud.empcloud.com/login");
  await page.fill('input[name="email"]', "ananya@technova.in");
  await page.fill('input[name="password"]', "Welcome@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForTimeout(2000);

  // 2. Get token
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem("empcloud-auth");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.accessToken ?? null;
  });
  expect(token).toBeTruthy();
  log(`Token length: ${(token as string).length}`);
  log(`Token prefix: ${(token as string).substring(0, 50)}...`);

  // 3. Intercept requests/responses
  page.on("request", (req) => {
    if (req.url().includes("/auth/sso")) {
      log("=== SSO REQUEST ===");
      log(`URL: ${req.url()}`);
      log(`Method: ${req.method()}`);
      log(`Content-Type: ${req.headers()["content-type"]}`);
      log(`PostData: ${req.postData()?.substring(0, 500)}`);
    }
  });
  page.on("response", async (resp) => {
    if (resp.url().includes("/auth/sso")) {
      log("=== SSO RESPONSE ===");
      log(`Status: ${resp.status()}`);
      const body = await resp.text().catch(() => "n/a");
      log(`Body: ${body.substring(0, 1000)}`);
    }
  });

  // Also capture all failed requests
  page.on("requestfailed", (req) => {
    log(`FAILED: ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  // 4. Navigate to Recruit with SSO token
  await page.goto(
    `https://test-recruit.empcloud.com?sso_token=${encodeURIComponent(token as string)}`
  );
  await page.waitForTimeout(5000);

  log(`Final URL: ${page.url()}`);
  const bodyText = await page.textContent("body");
  log(`Page text: ${bodyText?.substring(0, 300)}`);
  log("=== DONE ===");
});
