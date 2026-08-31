import { expect, test } from "@playwright/test";

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL || "https://test-empcloud.empcloud.com";
const API = process.env.EMPCLOUD_API_URL || "https://test-empcloud-api.empcloud.com/api/v1";
const EMAIL = process.env.E2E_ADMIN_EMAIL || "ananya@technova.in";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.TEST_USER_PASSWORD || "Welcome@123";

test.describe("Attendance Grid leave cancellation", () => {
  test("uses real login and renders cancellation audit", async ({ page }) => {
    // When verifying a local PR frontend, forward its API traffic to the
    // deployed test API. Authentication still goes through the real login
    // form/backend; no token or localStorage shortcut is used.
    if (FRONTEND.startsWith("http://localhost")) {
      await page.route("**/api/v1/**", async (route) => {
        const incoming = new URL(route.request().url());
        const target = `${API}${incoming.pathname.replace(/^\/api\/v1/, "")}${incoming.search}`;
        const response = await route.fetch({ url: target });
        await route.fulfill({ response });
      });
    }
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);

    const authenticatedRequest = page.waitForRequest((browserRequest) =>
      browserRequest.url().includes("/api/v1/") &&
      Boolean(browserRequest.headers()["authorization"]),
    );
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));
    const authorization = (await authenticatedRequest).headers()["authorization"];
    expect(authorization).toMatch(/^Bearer /);

    await page.route("**/api/v1/attendance/grid?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          daysInMonth: 31,
          totalEmployees: 1,
          days: [{ date: "2026-08-09", day: 9, dow: 0, defaultCode: "" }],
          employees: [{
            user_id: 10,
            first_name: "Aditya",
            last_name: "Joshi",
            emp_code: "TN-010",
            department: null,
            location: null,
            days: { "2026-08-09": "A" },
            weekoffDays: {},
            nightShiftDays: {},
            extraDayDays: {},
            nightAllowanceCount: 0,
            extraDayCount: 0,
            leaves: {},
          }],
        },
      }),
    }));
    await page.route("**/api/v1/attendance/grid/leave-context?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          leaveTypes: [],
          existingApplications: [{
            id: 91,
            leave_type_id: 1,
            leave_type_name: "Casual Leave",
            status: "cancelled",
            start_date: "2026-08-09",
            end_date: "2026-08-09",
            days_count: 1,
            is_half_day: false,
            half_day_type: null,
            cancelled_by_name: "Ananya Gupta",
          }],
        },
      }),
    }));

    await page.goto(`${FRONTEND}/attendance/grid`);
    const cell = page.locator('tbody [title^="2026-08-09"]').first();
    await expect(cell).toBeVisible();
    const contextResponse = page.waitForResponse((response) =>
      response.url().includes("/attendance/grid/leave-context"),
    );
    await cell.dblclick();
    expect((await contextResponse).status()).toBe(200);
    await expect(page.getByText("Leave cancellation history")).toBeVisible();
    await expect(page.getByText(/Leave cancelled by Ananya Gupta: Casual Leave/)).toBeVisible();
  });
});
