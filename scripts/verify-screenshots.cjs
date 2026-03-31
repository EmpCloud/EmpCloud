const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://test-empcloud.empcloud.com";
const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots", "verification");

async function run() {
  const browser = await chromium.launch();

  // ── Admin screenshots ──
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(BASE + "/login");
  await adminPage.fill('input[type="email"]', "ananya@technova.in");
  await adminPage.fill('input[type="password"]', "Welcome@123");
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForTimeout(4000);

  const adminPages = [
    ["/employees", "admin_employee_directory"],
    ["/attendance", "admin_attendance"],
    ["/leave", "admin_leave_dashboard"],
    ["/leave/applications", "admin_leave_applications"],
    ["/documents", "admin_documents"],
    ["/settings", "admin_settings"],
    ["/modules", "admin_modules"],
    ["/chatbot", "admin_chatbot"],
    ["/wellness", "admin_wellness"],
    ["/events", "admin_events"],
    ["/positions/list", "admin_positions"],
    ["/assets", "admin_assets"],
  ];

  for (const [p, name] of adminPages) {
    await adminPage.goto(BASE + p);
    await adminPage.waitForTimeout(2000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, name + ".png") });
    console.log("✓ " + name);
  }
  await adminCtx.close();

  // ── Employee screenshots ──
  const empCtx = await browser.newContext();
  const empPage = await empCtx.newPage();
  await empPage.goto(BASE + "/login");
  await empPage.fill('input[type="email"]', "priya@technova.in");
  await empPage.fill('input[type="password"]', "Welcome@123");
  await empPage.click('button[type="submit"]');
  await empPage.waitForTimeout(4000);

  const empPages = [
    ["/", "employee_dashboard"],
    ["/attendance/my", "employee_attendance"],
    ["/leave", "employee_leave"],
    ["/documents/my", "employee_my_documents"],
    ["/assets/my", "employee_my_assets"],
    ["/wellness/check-in", "employee_wellness_checkin"],
    ["/feedback/submit", "employee_feedback"],
  ];

  for (const [p, name] of empPages) {
    await empPage.goto(BASE + p);
    await empPage.waitForTimeout(2000);
    await empPage.screenshot({ path: path.join(SCREENSHOT_DIR, name + ".png") });
    console.log("✓ " + name);
  }
  await empCtx.close();

  // ── Super Admin screenshots ──
  const saCtx = await browser.newContext();
  const saPage = await saCtx.newPage();
  await saPage.goto(BASE + "/login");
  await saPage.fill('input[type="email"]', "admin@empcloud.com");
  await saPage.fill('input[type="password"]', "SuperAdmin@2026");
  await saPage.click('button[type="submit"]');
  await saPage.waitForTimeout(4000);

  const saPages = [
    ["/admin", "super_admin_dashboard"],
    ["/admin/organizations", "super_admin_orgs"],
    ["/admin/ai-config", "super_admin_ai_config"],
    ["/admin/logs", "super_admin_logs"],
  ];

  for (const [p, name] of saPages) {
    await saPage.goto(BASE + p);
    await saPage.waitForTimeout(3000);
    await saPage.screenshot({ path: path.join(SCREENSHOT_DIR, name + ".png") });
    console.log("✓ " + name);
  }
  await saCtx.close();

  await browser.close();
  console.log("\nDone! Screenshots saved to screenshots/verification/");
}

run().catch(console.error);
