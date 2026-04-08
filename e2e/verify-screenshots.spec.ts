import { test } from "@playwright/test";

const BASE = "https://test-empcloud.empcloud.com";
const DIR = "screenshots/verification";

async function login(page: any, email: string, password: string) {
  await page.goto(BASE + "/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

test("Admin screenshots", async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "ananya@technova.in", process.env.TEST_USER_PASSWORD || "Welcome@123");

  const pages = [
    ["/employees", "admin_employee_directory"],
    ["/attendance", "admin_attendance"],
    ["/leave", "admin_leave_dashboard"],
    ["/leave/applications", "admin_leave_applications"],
    ["/documents", "admin_documents"],
    ["/settings", "admin_settings"],
    ["/modules", "admin_modules"],
    ["/wellness", "admin_wellness"],
    ["/events", "admin_events"],
    ["/positions/list", "admin_positions"],
    ["/assets", "admin_assets"],
    ["/feedback", "admin_feedback"],
  ];

  for (const [p, name] of pages) {
    await page.goto(BASE + p);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/${name}.png` });
  }
  await ctx.close();
});

test("Employee screenshots", async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "priya@technova.in", process.env.TEST_USER_PASSWORD || "Welcome@123");

  const pages = [
    ["/", "employee_dashboard"],
    ["/attendance/my", "employee_attendance"],
    ["/leave", "employee_leave"],
    ["/documents/my", "employee_my_documents"],
    ["/assets/my", "employee_my_assets"],
    ["/wellness/check-in", "employee_wellness_checkin"],
    ["/feedback/submit", "employee_feedback_submit"],
    ["/events", "employee_events"],
  ];

  for (const [p, name] of pages) {
    await page.goto(BASE + p);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/${name}.png` });
  }
  await ctx.close();
});

test("Super Admin screenshots", async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "admin@empcloud.com", process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123");

  const pages = [
    ["/admin", "super_admin_dashboard"],
    ["/admin/organizations", "super_admin_orgs"],
    ["/admin/ai-config", "super_admin_ai_config"],
    ["/admin/logs", "super_admin_logs"],
  ];

  for (const [p, name] of pages) {
    await page.goto(BASE + p);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/${name}.png` });
  }
  await ctx.close();
});
