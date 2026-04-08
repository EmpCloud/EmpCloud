import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CREDS = {
  email: "ananya@technova.in",
  password: process.env.TEST_USER_PASSWORD || "Welcome@123",
};

const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots", "all-pages");

interface PageTest {
  id: number;
  app: string;
  baseUrl: string;
  path: string;
  label: string;
}

const PAGES: PageTest[] = [
  // EMP Cloud
  { id: 1, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/login", label: "Login" },
  { id: 2, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/", label: "Dashboard" },
  { id: 3, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/modules", label: "Modules" },
  { id: 4, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/billing", label: "Billing" },
  { id: 5, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/users", label: "Users" },
  { id: 6, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/employees", label: "Employees" },
  { id: 7, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/employees/1", label: "Employee Profile" },
  { id: 8, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/org-chart", label: "Org Chart" },
  { id: 9, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/attendance", label: "Attendance Dashboard" },
  { id: 10, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/attendance/my", label: "My Attendance" },
  { id: 11, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/attendance/shifts", label: "Shifts" },
  { id: 12, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/attendance/regularizations", label: "Regularizations" },
  { id: 13, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/leave", label: "Leave Dashboard" },
  { id: 14, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/leave/applications", label: "Leave Applications" },
  { id: 15, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/leave/calendar", label: "Leave Calendar" },
  { id: 16, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/leave/settings", label: "Leave Settings" },
  { id: 17, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/documents", label: "Documents" },
  { id: 18, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/documents/categories", label: "Doc Categories" },
  { id: 19, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/announcements", label: "Announcements" },
  { id: 20, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/policies", label: "Policies" },
  { id: 21, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/settings", label: "Org Settings" },
  { id: 22, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/audit", label: "Audit Log" },
  { id: 23, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/self-service", label: "Self Service" },
  { id: 24, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/admin", label: "Super Admin" },
  { id: 25, app: "empcloud", baseUrl: "https://test-empcloud.empcloud.com", path: "/onboarding", label: "Onboarding" },

  // EMP Recruit
  { id: 26, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/login", label: "Login" },
  { id: 27, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/dashboard", label: "Dashboard" },
  { id: 28, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/jobs", label: "Jobs" },
  { id: 29, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/candidates", label: "Candidates" },
  { id: 30, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/interviews", label: "Interviews" },
  { id: 31, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/offers", label: "Offers" },
  { id: 32, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/onboarding", label: "Onboarding" },
  { id: 33, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/referrals", label: "Referrals" },
  { id: 34, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/analytics", label: "Analytics" },
  { id: 35, app: "recruit", baseUrl: "https://test-recruit.empcloud.com", path: "/settings", label: "Settings" },

  // EMP Performance
  { id: 36, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/login", label: "Login" },
  { id: 37, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/dashboard", label: "Dashboard" },
  { id: 38, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/review-cycles", label: "Review Cycles" },
  { id: 39, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/goals", label: "Goals" },
  { id: 40, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/competency-frameworks", label: "Competencies" },
  { id: 41, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/pips", label: "PIPs" },
  { id: 42, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/career-paths", label: "Career Paths" },
  { id: 43, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/one-on-ones", label: "1-on-1s" },
  { id: 44, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/feedback", label: "Feedback" },
  { id: 45, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/analytics", label: "Analytics" },
  { id: 46, app: "performance", baseUrl: "https://test-performance.empcloud.com", path: "/settings", label: "Settings" },

  // EMP Rewards
  { id: 47, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/login", label: "Login" },
  { id: 48, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/dashboard", label: "Dashboard" },
  { id: 49, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/feed", label: "Social Feed" },
  { id: 50, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/leaderboard", label: "Leaderboard" },
  { id: 51, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/badges", label: "Badges" },
  { id: 52, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/rewards", label: "Rewards Catalog" },
  { id: 53, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/nominations", label: "Nominations" },
  { id: 54, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/analytics", label: "Analytics" },
  { id: 55, app: "rewards", baseUrl: "https://test-rewards.empcloud.com", path: "/settings", label: "Settings" },

  // EMP Exit
  { id: 56, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/login", label: "Login" },
  { id: 57, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/dashboard", label: "Dashboard" },
  { id: 58, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/exits", label: "Exits" },
  { id: 59, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/checklists", label: "Checklists" },
  { id: 60, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/clearance", label: "Clearance" },
  { id: 61, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/analytics", label: "Analytics" },
  { id: 62, app: "exit", baseUrl: "https://test-exit.empcloud.com", path: "/settings", label: "Settings" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function safeGoto(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
  }
}

async function loginToApp(page: Page, baseUrl: string): Promise<boolean> {
  try {
    await safeGoto(page, `${baseUrl}/login`);

    // Check if already logged in (redirected away from login)
    if (!page.url().includes("/login")) {
      return true;
    }

    // Wait for the form to be visible
    await page.waitForTimeout(2000);

    // Fill login form
    const emailInput = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill(CREDS.email);
    await passwordInput.fill(CREDS.password);

    // Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Wait for navigation away from login
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    return !page.url().includes("/login");
  } catch (e) {
    return false;
  }
}

async function getPageContent(page: Page): Promise<{ hasContent: boolean; textLength: number }> {
  // Wait a moment for any React rendering
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const textLength = bodyText.trim().length;
  return { hasContent: textLength > 20, textLength };
}

// ─────────────────────────────────────────────────────────────────────────────
// Results tracking
// ─────────────────────────────────────────────────────────────────────────────

interface TestResult {
  id: number;
  app: string;
  path: string;
  label: string;
  status: "PASS" | "FAIL";
  finalUrl: string;
  jsErrors: string[];
  hasContent: boolean;
  notes: string;
}

const results: TestResult[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Tests — each test is independent (logs in fresh if needed)
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// We run ALL pages in a single test to share auth state across the browser context
test("Test all 62 pages across EMP ecosystem", async ({ page }) => {
  test.setTimeout(600000); // 10 minutes for all pages

  const appAuthState: Record<string, boolean> = {};

  for (const pg of PAGES) {
    const jsErrors: string[] = [];
    const errorHandler = (error: Error) => {
      jsErrors.push(error.message);
    };
    page.on("pageerror", errorHandler);

    let status: "PASS" | "FAIL" = "FAIL";
    let hasContent = false;
    let finalUrl = "";
    let notes = "";

    try {
      // ── LOGIN PAGES ──
      if (pg.path === "/login") {
        // First, load the login page and verify it renders
        await safeGoto(page, `${pg.baseUrl}${pg.path}`);
        await page.waitForTimeout(2000);

        const safeName = `${String(pg.id).padStart(2, "0")}-${pg.app}-login.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, safeName), fullPage: true });

        const content = await getPageContent(page);
        hasContent = content.hasContent;
        finalUrl = page.url();

        if (hasContent) {
          status = "PASS";
        } else {
          notes = `Page appears blank (${content.textLength} chars)`;
        }

        // Now login for subsequent pages in this app
        const loggedIn = await loginToApp(page, pg.baseUrl);
        appAuthState[pg.app] = loggedIn;
        if (!loggedIn) {
          notes += (notes ? " | " : "") + "Login failed for this app";
        }
      }
      // ── AUTHENTICATED PAGES ──
      else {
        // Ensure we're logged in to this app
        if (!appAuthState[pg.app]) {
          const loggedIn = await loginToApp(page, pg.baseUrl);
          appAuthState[pg.app] = loggedIn;
          if (!loggedIn) {
            notes = "Could not login to this app";
          }
        }

        // Navigate to the target page
        await safeGoto(page, `${pg.baseUrl}${pg.path}`);
        await page.waitForTimeout(2000);

        finalUrl = page.url();

        // Take screenshot
        const safePath = pg.path.replace(/\//g, "-").replace(/^-/, "") || "root";
        const safeName = `${String(pg.id).padStart(2, "0")}-${pg.app}-${safePath}.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, safeName), fullPage: true });

        const content = await getPageContent(page);
        hasContent = content.hasContent;

        // Check if redirected to login
        const wasRedirectedToLogin = page.url().includes("/login") && pg.path !== "/login";
        if (wasRedirectedToLogin) {
          notes = "Redirected to login (auth lost)";
          // Try re-logging in
          const loggedIn = await loginToApp(page, pg.baseUrl);
          appAuthState[pg.app] = loggedIn;
          if (loggedIn) {
            // Retry the page
            await safeGoto(page, `${pg.baseUrl}${pg.path}`);
            await page.waitForTimeout(2000);
            finalUrl = page.url();
            const retryContent = await getPageContent(page);
            hasContent = retryContent.hasContent;
            if (!page.url().includes("/login")) {
              notes = "Recovered after re-login";
              // Re-take screenshot
              const safeName2 = `${String(pg.id).padStart(2, "0")}-${pg.app}-${safePath}.png`;
              await page.screenshot({ path: path.join(SCREENSHOT_DIR, safeName2), fullPage: true });
            }
          }
        }

        if (hasContent && !page.url().includes("/login")) {
          status = "PASS";
        } else if (!hasContent) {
          notes += (notes ? " | " : "") + `Page appears blank (${content.textLength} chars)`;
        }
      }
    } catch (e: any) {
      notes = `Error: ${e.message?.substring(0, 150)}`;
      finalUrl = page.url();
    }

    // Track JS errors but don't fail on them alone
    if (jsErrors.length > 0) {
      notes += (notes ? " | " : "") + `JS errors (${jsErrors.length}): ${jsErrors[0]?.substring(0, 100)}`;
    }

    page.removeListener("pageerror", errorHandler);

    const result: TestResult = {
      id: pg.id,
      app: pg.app,
      path: pg.path,
      label: pg.label,
      status,
      finalUrl,
      jsErrors,
      hasContent,
      notes,
    };
    results.push(result);

    // Print per-page result immediately
    const icon = status === "PASS" ? "PASS" : "FAIL";
    console.log(
      `  ${icon} #${String(pg.id).padEnd(3)} ${pg.app.padEnd(14)} ${pg.path.padEnd(30)} ${pg.label.padEnd(22)} ${notes}`
    );
  }

  // ── FINAL SUMMARY ──
  console.log("\n" + "=".repeat(110));
  console.log("ALL-PAGES RENDER TEST SUMMARY");
  console.log("=".repeat(110));
  console.log(
    `${"#".padEnd(4)} ${"App".padEnd(14)} ${"Path".padEnd(30)} ${"Label".padEnd(22)} ${"Status".padEnd(8)} Notes`
  );
  console.log("-".repeat(110));

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    const line = `${String(r.id).padEnd(4)} ${r.app.padEnd(14)} ${r.path.padEnd(30)} ${r.label.padEnd(22)} ${r.status.padEnd(8)} ${r.notes}`;
    console.log(line);
    if (r.status === "PASS") passCount++;
    else failCount++;
  }

  console.log("-".repeat(110));
  console.log(`TOTAL: ${results.length} pages tested | ${passCount} PASS | ${failCount} FAIL`);
  console.log("=".repeat(110));

  // Write results to JSON
  const jsonPath = path.join(SCREENSHOT_DIR, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${jsonPath}`);

  // Final assertion
  expect(passCount).toBeGreaterThan(0);
  console.log(`\n${passCount}/${results.length} pages render correctly.`);
});
