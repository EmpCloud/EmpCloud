import { test, expect } from "@playwright/test";

test("SSO: EMP Cloud → EMP Project end-to-end", async ({ page }) => {
  test.setTimeout(60000);

  await page.goto("https://test-empcloud.empcloud.com/login");
  await page.fill('input[type="email"]', "ananya@technova.in");
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || "Welcome@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  const authData = await page.evaluate(() => {
    const raw = localStorage.getItem("empcloud-auth");
    return raw ? JSON.parse(raw) : null;
  });
  const token = authData?.state?.accessToken;
  console.log("Token:", token ? "OK" : "NONE");

  const ssoUrl = `https://test-project.empcloud.com?sso_token=${encodeURIComponent(token)}`;

  // Track ALL requests
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("sso") || url.includes("auth")) {
      let body = "";
      try { body = await resp.text(); } catch {}
      console.log(`<< ${resp.status()} ${url.substring(0, 80)} | ${body.substring(0, 200)}`);
    }
  });
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type()}] ${msg.text().substring(0, 200)}`);
  });

  await page.goto(ssoUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(10000);

  const finalUrl = page.url();
  console.log("Final URL:", finalUrl);
  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  console.log("localStorage:", lsKeys);
  const cookies = await page.evaluate(() => {
    try { return JSON.parse(document.cookie || "{}"); } catch { return document.cookie; }
  });
  console.log("Cookies:", JSON.stringify(cookies).substring(0, 200));

  // Check for Cookies.get('token') which is how emp-project stores auth
  const tokenCookie = await page.evaluate(() => {
    const all = document.cookie.split(';').map(c => c.trim());
    return all.find(c => c.startsWith('token='))?.substring(6) || null;
  });
  console.log("Token cookie:", tokenCookie ? "SET" : "EMPTY");

  await page.screenshot({ path: "e2e/screenshots/project-sso-result.png", fullPage: true });
});
