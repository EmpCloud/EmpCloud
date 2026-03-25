import { test, expect } from "@playwright/test";

test("SSO: EMP Cloud → EMP Monitor end-to-end", async ({ page }) => {
  test.setTimeout(60000);

  // 1. Login to EMP Cloud
  await page.goto("https://test-empcloud.empcloud.com/login");
  await page.fill('input[type="email"]', "ananya@technova.in");
  await page.fill('input[type="password"]', "Welcome@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // 2. Get access token
  const authData = await page.evaluate(() => {
    const raw = localStorage.getItem("empcloud-auth");
    return raw ? JSON.parse(raw) : null;
  });
  const token = authData?.state?.accessToken;
  console.log("Cloud token:", token ? `${token.substring(0, 40)}...` : "NONE");
  expect(token).toBeTruthy();

  // 3. Build SSO URL for monitor
  const ssoUrl = `https://test-empmonitor.empcloud.com?sso_token=${encodeURIComponent(token)}`;
  console.log("SSO URL:", ssoUrl.substring(0, 80) + "...");

  // 4. Track all network requests
  const requests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("api") || url.includes("auth") || url.includes("sso")) {
      requests.push(`>> ${req.method()} ${url}`);
    }
  });
  page.on("response", (resp) => {
    const url = resp.url();
    if (url.includes("api") || url.includes("auth") || url.includes("sso")) {
      requests.push(`<< ${resp.status()} ${url}`);
    }
  });
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
  });

  // 5. Navigate to monitor with SSO token
  await page.goto(ssoUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(8000);

  // 6. Log results
  console.log("\n--- Network ---");
  for (const r of requests) console.log(r);

  const finalUrl = page.url();
  console.log("\nFinal URL:", finalUrl);

  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  console.log("localStorage keys:", lsKeys);

  const monitorAuth = await page.evaluate(() => localStorage.getItem("empmonitor_auth"));
  console.log("Monitor auth:", monitorAuth ? "SET" : "EMPTY");

  await page.screenshot({ path: "e2e/screenshots/monitor-sso-result.png", fullPage: true });

  // Check if we landed on dashboard or login
  if (finalUrl.includes("/login")) {
    console.log("FAIL: Redirected to login page");
    console.log("Body:", await page.locator("body").innerText().catch(() => ""));
  } else {
    console.log("SUCCESS: Landed on", finalUrl);
  }
});
