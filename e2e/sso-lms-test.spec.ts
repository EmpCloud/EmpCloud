import { test, expect } from "@playwright/test";

const CLOUD_URL = "https://test-empcloud.empcloud.com";
const LMS_URL = "https://testlms.empcloud.com";
const LMS_API = "https://testlms-api.empcloud.com";
const EMAIL = "ananya@technova.in";
const PASSWORD = process.env.TEST_USER_PASSWORD || "Welcome@123";

test("SSO: Cloud -> LMS end-to-end", async ({ page }) => {
  test.setTimeout(60000);

  // Login to Cloud
  await page.goto(`${CLOUD_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"], input[type="email"]', EMAIL);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // Get the token from Zustand persist store
  const authData = await page.evaluate(() => {
    const raw = localStorage.getItem("empcloud-auth");
    return raw ? JSON.parse(raw) : null;
  });
  console.log("Cloud auth keys:", Object.keys(authData?.state || {}));
  console.log("Cloud accessToken:", authData?.state?.accessToken ? authData.state.accessToken.substring(0, 50) + "..." : "NULL");

  const cloudToken = authData?.state?.accessToken;
  if (!cloudToken) {
    console.log("FAIL: No access token in Cloud localStorage");
    await page.screenshot({ path: "e2e/screenshots/sso-lms/fail-no-token.png", fullPage: true });
    return;
  }

  // Navigate to LMS with SSO token
  const ssoUrl = `${LMS_URL}?sso_token=${encodeURIComponent(cloudToken)}`;
  console.log("SSO URL:", ssoUrl.substring(0, 80) + "...");

  // Track ALL network requests
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("api") || req.url().includes("auth")) {
      requests.push(`>> ${req.method()} ${req.url()}`);
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("api") || resp.url().includes("auth")) {
      requests.push(`<< ${resp.status()} ${resp.url()}`);
    }
  });
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
  });

  await page.goto(ssoUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

  // Wait for SSO to process
  await page.waitForTimeout(5000);

  console.log("\n--- Network requests ---");
  for (const r of requests) console.log(r);

  const finalUrl = page.url();
  console.log("\nFinal URL:", finalUrl);

  // Check LMS localStorage
  const lmsAuth = await page.evaluate(() => {
    return {
      access_token: localStorage.getItem("access_token"),
      user: localStorage.getItem("user"),
      all_keys: Object.keys(localStorage),
    };
  });
  console.log("LMS localStorage keys:", lmsAuth.all_keys);
  console.log("LMS access_token:", lmsAuth.access_token ? "SET" : "EMPTY");
  console.log("LMS user:", lmsAuth.user ? "SET" : "EMPTY");

  await page.screenshot({ path: "e2e/screenshots/sso-lms/result.png", fullPage: true });
});
