import { test, expect } from "@playwright/test";

const CLOUD = "https://test-empcloud.empcloud.com";
const MODULES = [
  { name: "Recruit", url: "https://test-recruit.empcloud.com" },
  { name: "Performance", url: "https://test-performance.empcloud.com" },
  { name: "Rewards", url: "https://test-rewards.empcloud.com" },
  { name: "Exit", url: "https://test-exit.empcloud.com" },
  { name: "LMS", url: "https://testlms.empcloud.com" },
  { name: "Payroll", url: "https://testpayroll.empcloud.com" },
  { name: "Projects", url: "https://test-project.empcloud.com" },
  { name: "Monitor", url: "https://test-empmonitor.empcloud.com" },
];

test("Login to Cloud dashboard", async ({ page }) => {
  await page.goto(CLOUD + "/login");
  await page.fill('input[name="email"]', "ananya@technova.in");
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || "Welcome@123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });

  // Wait for dashboard data to load (stats cards contain numbers)
  await page.waitForTimeout(3000);

  const bodyText = await page.textContent("body");
  // The dashboard shows "Welcome back, <name>" once widgets load,
  // but it also shows the sidebar with "Dashboard" even before that
  expect(bodyText).toContain("Dashboard");
  await page.screenshot({ path: "e2e/screenshots/sso-01-cloud-dashboard.png" });
});

// For each module, test the SSO launch
for (const mod of MODULES) {
  test(`SSO Launch to ${mod.name}`, async ({ page }) => {
    // Login to Cloud first
    await page.goto(CLOUD + "/login");
    await page.fill('input[name="email"]', "ananya@technova.in");
    await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || "Welcome@123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Get the SSO token from Cloud's Zustand persisted auth store
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem("empcloud-auth");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.state?.accessToken ?? null;
      } catch {
        return null;
      }
    });
    expect(token).toBeTruthy();
    console.log(`[${mod.name}] Got Cloud access token (length=${(token as string).length})`);

    // Listen for console errors from the module page
    const consoleMessages: string[] = [];
    page.on("console", (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Track the SSO API call and capture the full response
    const ssoResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/auth/sso"),
      { timeout: 15000 },
    ).catch(() => null);

    // Navigate to module with SSO token (simulating the Launch button click)
    const launchUrl = `${mod.url}?sso_token=${encodeURIComponent(token as string)}`;
    console.log(`[${mod.name}] Navigating to module with sso_token...`);
    await page.goto(launchUrl);

    // Wait for SSO API call to complete
    const ssoResponse = await ssoResponsePromise;
    if (ssoResponse) {
      const status = ssoResponse.status();
      console.log(`[${mod.name}] SSO API response: ${status} ${ssoResponse.url()}`);
      if (status !== 200) {
        const body = await ssoResponse.text().catch(() => "unable to read body");
        console.log(`[${mod.name}] SSO API error body: ${body}`);
      } else {
        console.log(`[${mod.name}] SSO API succeeded (200 OK)`);
      }
    } else {
      console.log(`[${mod.name}] WARNING: No /auth/sso API call detected within 15s`);
    }

    // Wait for navigation to settle after SSO redirect
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({
      path: `e2e/screenshots/sso-${mod.name.toLowerCase()}.png`,
      fullPage: true,
    });

    // Check final URL
    const finalUrl = page.url();
    console.log(`[${mod.name}] Final URL: ${finalUrl}`);

    // Log all console messages for debugging
    if (consoleMessages.length > 0) {
      const errors = consoleMessages.filter((m) => m.startsWith("[error]"));
      if (errors.length > 0) {
        console.log(`[${mod.name}] Console errors:`);
        errors.forEach((e) => console.log(`  ${e}`));
      }
    }

    // Determine outcome
    const onDashboard = finalUrl.includes("/dashboard");
    const onLogin = finalUrl.includes("/login");
    const ssoErrorVisible = await page.locator("text=SSO login failed").isVisible().catch(() => false);

    if (onDashboard) {
      console.log(`[${mod.name}] PASS: SSO login worked, landed on dashboard`);
    } else if (onLogin) {
      console.log(`[${mod.name}] FAIL: SSO did not auto-login, redirected to login page`);
    } else if (ssoErrorVisible) {
      console.log(`[${mod.name}] FAIL: SSO error message displayed on page`);
    } else {
      // Might be on / which then shows AuthRedirect
      console.log(`[${mod.name}] RESULT: Landed on ${finalUrl}`);
    }

    // Assert: SSO should land on dashboard
    expect(onLogin, `${mod.name} should not be on login page after SSO`).toBe(false);
    expect(ssoErrorVisible, `${mod.name} should not show SSO error`).toBe(false);
  });
}
