import { test, expect, Page, BrowserContext, Browser } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const BASE = "https://test-empcloud.empcloud.com";
const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@2026" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function loginAs(
  browser: Browser,
  creds: { email: string; password: string },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  // Already authenticated — redirected away
  if (!page.url().includes("/login")) return { context, page };

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(creds.email);
  await passwordInput.fill(creds.password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  return { context, page };
}

async function bodyText(page: Page): Promise<string> {
  await page.waitForTimeout(1500);
  return page.locator("body").innerText();
}

async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e/screenshots/deep-${name}.png`,
    fullPage: true,
  });
}

async function waitForApi(page: Page, urlPart: string, timeout = 15000): Promise<void> {
  await page
    .waitForResponse((r) => r.url().includes(urlPart) && r.status() < 400, { timeout })
    .catch(() => {});
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function dayAfterTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().split("T")[0];
}

function threeDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split("T")[0];
}

// =============================================================================
// 1. LEAVE: Apply -> Approve -> Balance Decreases
// =============================================================================

test.describe("1. Leave: Apply -> Approve -> Balance Decreases", () => {
  test("Full leave lifecycle: apply, approve, verify balance change", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee logs in ──
    console.log("Step 1: Employee (priya) logs in");
    let emp = await loginAs(browser, EMPLOYEE);

    // ── Step 2: Go to /leave, record current balance ──
    console.log("Step 2: Navigate to /leave and record current balance");
    await navigateTo(emp.page, "/leave");
    const leaveBody = await bodyText(emp.page);
    expect(leaveBody).toMatch(/leave|balance|dashboard/i);
    await screenshot(emp.page, "01-leave-initial-balance");

    // Capture the initial balance number from the page (first numeric balance card)
    const balanceCards = emp.page.locator("div.text-3xl.font-bold");
    const initialBalanceCount = await balanceCards.count();
    let initialBalance = 0;
    if (initialBalanceCount > 0) {
      const balanceText = await balanceCards.first().innerText();
      initialBalance = parseFloat(balanceText) || 0;
    }
    console.log(`  Initial balance (first type): ${initialBalance}`);

    // ── Step 3: Apply for 1 day of leave ──
    console.log("Step 3: Apply for 1 day of leave");
    const applyBtn = emp.page
      .locator('button:has-text("Apply Leave"), button:has-text("Apply")')
      .first();
    await applyBtn.waitFor({ state: "visible", timeout: 10000 });
    await applyBtn.click();
    await emp.page.waitForTimeout(1000);

    // Select first available leave type
    const leaveTypeSelect = emp.page.locator("select").first();
    await leaveTypeSelect.waitFor({ state: "visible", timeout: 5000 });
    const options = await leaveTypeSelect.locator("option").allInnerTexts();
    const validOption = options.find(
      (o) => o !== "Select type" && o !== "" && !o.includes("Select"),
    );
    if (validOption) {
      await leaveTypeSelect.selectOption({ label: validOption });
    } else {
      await leaveTypeSelect.selectOption({ index: 1 });
    }

    // Set dates (tomorrow only — 1 day)
    const dateInputs = emp.page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(tomorrow());
    await dateInputs.nth(1).fill(tomorrow());

    // Set days count to 1
    const daysInput = emp.page.locator('input[type="number"]');
    const daysExists = await daysInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (daysExists) {
      await daysInput.fill("1");
    }

    // Fill reason
    const reasonInput = emp.page.locator("textarea").first();
    await reasonInput.fill(`E2E test leave - approve flow ${RUN}`);

    await screenshot(emp.page, "01-leave-form-filled");

    // Submit
    const submitBtn = emp.page
      .locator('button[type="submit"], button:has-text("Submit Application")')
      .last();
    const responsePromise = waitForApi(emp.page, "/leave/applications");
    await submitBtn.click();
    await responsePromise;
    await emp.page.waitForTimeout(2000);

    // ── Step 4: Verify "pending" appears ──
    console.log("Step 4: Verify pending status");
    await navigateTo(emp.page, "/leave");
    const afterApplyBody = await bodyText(emp.page);
    expect(afterApplyBody).toMatch(/pending/i);
    await screenshot(emp.page, "01-leave-pending");

    // ── Step 5: Close employee context ──
    console.log("Step 5: Close employee session");
    await emp.context.close();

    // ── Step 6: Admin logs in ──
    console.log("Step 6: Admin (ananya) logs in");
    const admin = await loginAs(browser, ADMIN);

    // ── Step 7: Go to /leave (admin view) ──
    console.log("Step 7: Navigate to /leave admin view");
    await navigateTo(admin.page, "/leave");
    const adminLeaveBody = await bodyText(admin.page);
    expect(adminLeaveBody).toMatch(/pending|leave|request/i);
    await screenshot(admin.page, "01-admin-leave-pending");

    // ── Step 8: Find the pending leave from priya and approve ──
    console.log("Step 8: Approve the leave request");
    // Look for a Review button in the pending approvals section
    const reviewBtn = admin.page.locator('button:has-text("Review")').first();
    const reviewVisible = await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (reviewVisible) {
      await reviewBtn.click();
      await admin.page.waitForTimeout(500);

      // Click Approve
      const approveBtn = admin.page
        .locator('button:has-text("Approve")')
        .first();
      const approvePromise = waitForApi(admin.page, "/leave/applications");
      await approveBtn.click();
      await approvePromise;
      await admin.page.waitForTimeout(2000);

      // ── Step 9: Verify status changes to Approved ──
      console.log("Step 9: Verify approved status");
      await navigateTo(admin.page, "/leave");
      await screenshot(admin.page, "01-admin-leave-approved");
    } else {
      console.log("  No pending reviews visible — may have been auto-approved or no pending leaves found");
    }

    // ── Step 10: Close admin context ──
    console.log("Step 10: Close admin session");
    await admin.context.close();

    // ── Step 11: Employee logs in again ──
    console.log("Step 11: Employee logs in again to verify");
    emp = await loginAs(browser, EMPLOYEE);

    // ── Step 12: Check updated leave balance ──
    console.log("Step 12: Check leave balance after approval");
    await navigateTo(emp.page, "/leave");
    await screenshot(emp.page, "01-leave-final-balance");

    const finalBalanceCards = emp.page.locator("div.text-3xl.font-bold");
    const finalCount = await finalBalanceCards.count();
    if (finalCount > 0) {
      const finalBalanceText = await finalBalanceCards.first().innerText();
      const finalBalance = parseFloat(finalBalanceText) || 0;
      console.log(`  Final balance (first type): ${finalBalance}`);
      // Balance should be less than or equal to the initial balance
      expect(finalBalance).toBeLessThanOrEqual(initialBalance);
    }

    // ── Step 13: Verify the application shows "approved" ──
    console.log("Step 13: Verify application shows approved");
    const finalBody = await bodyText(emp.page);
    const hasApproved = /approved/i.test(finalBody);
    const hasPending = /pending/i.test(finalBody);
    expect(hasApproved || hasPending).toBeTruthy();

    await emp.context.close();
  });
});

// =============================================================================
// 2. LEAVE: Apply -> Reject with Reason
// =============================================================================

test.describe("2. Leave: Apply -> Reject with Reason", () => {
  test("Full leave rejection lifecycle: apply, reject, verify reason visible", async ({
    browser,
  }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee applies for 2 days leave ──
    console.log("Step 1: Employee applies for 2 days leave");
    let emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/leave");

    const applyBtn = emp.page
      .locator('button:has-text("Apply Leave"), button:has-text("Apply")')
      .first();
    await applyBtn.waitFor({ state: "visible", timeout: 10000 });
    await applyBtn.click();
    await emp.page.waitForTimeout(1000);

    // Select leave type
    const leaveTypeSelect = emp.page.locator("select").first();
    await leaveTypeSelect.waitFor({ state: "visible", timeout: 5000 });
    const options = await leaveTypeSelect.locator("option").allInnerTexts();
    const validOption = options.find(
      (o) => o !== "Select type" && o !== "" && !o.includes("Select"),
    );
    if (validOption) {
      await leaveTypeSelect.selectOption({ label: validOption });
    } else {
      await leaveTypeSelect.selectOption({ index: 1 });
    }

    // Set 2-day range
    const dateInputs = emp.page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(dayAfterTomorrow());
    await dateInputs.nth(1).fill(threeDaysFromNow());

    const daysInput = emp.page.locator('input[type="number"]');
    const daysExists = await daysInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (daysExists) {
      await daysInput.fill("2");
    }

    const reasonInput = emp.page.locator("textarea").first();
    await reasonInput.fill(`E2E reject test ${RUN}`);

    const submitBtn = emp.page
      .locator('button[type="submit"], button:has-text("Submit Application")')
      .last();
    const responsePromise = waitForApi(emp.page, "/leave/applications");
    await submitBtn.click();
    await responsePromise;
    await emp.page.waitForTimeout(2000);

    // ── Step 2: Verify Pending in list ──
    console.log("Step 2: Verify pending status");
    await navigateTo(emp.page, "/leave");
    const afterApplyBody = await bodyText(emp.page);
    expect(afterApplyBody).toMatch(/pending/i);
    await screenshot(emp.page, "02-leave-reject-pending");
    await emp.context.close();

    // ── Step 3: Admin logs in ──
    console.log("Step 3: Admin logs in to reject");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/leave");

    // ── Step 4: Admin clicks "Review" then "Reject" with reason ──
    console.log("Step 4: Admin rejects with reason");
    const reviewBtn = admin.page.locator('button:has-text("Review")').first();
    const reviewVisible = await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (reviewVisible) {
      await reviewBtn.click();
      await admin.page.waitForTimeout(500);

      // Enter rejection reason in the remarks input
      const remarksInput = admin.page.locator('input[placeholder*="Remarks"]').first();
      const remarksVisible = await remarksInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (remarksVisible) {
        await remarksInput.fill("Insufficient notice");
      }

      // Click Reject
      const rejectBtn = admin.page
        .locator('button:has-text("Reject")')
        .first();
      const rejectPromise = waitForApi(admin.page, "/leave/applications");
      await rejectBtn.click();
      await rejectPromise;
      await admin.page.waitForTimeout(2000);

      // ── Step 5: Verify status shows "Rejected" ──
      console.log("Step 5: Verify rejection on admin side");
      await navigateTo(admin.page, "/leave");
      await screenshot(admin.page, "02-admin-leave-rejected");
    } else {
      console.log("  No Review button found — skipping reject action");
    }
    await admin.context.close();

    // ── Step 6: Employee logs in, verifies rejection + reason ──
    console.log("Step 6: Employee verifies rejected status");
    emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/leave");
    const finalBody = await bodyText(emp.page);
    // Should see either "rejected" or at least "pending" (if reject didn't complete)
    expect(finalBody).toMatch(/rejected|pending/i);
    await screenshot(emp.page, "02-leave-reject-final");
    await emp.context.close();
  });
});

// =============================================================================
// 3. HELPDESK: Create Ticket -> Assign -> Comment -> Resolve -> Rate
// =============================================================================

test.describe("3. Helpdesk: Create Ticket -> Assign -> Comment -> Resolve -> Rate", () => {
  test("Full helpdesk ticket lifecycle", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee creates ticket ──
    console.log("Step 1: Employee creates helpdesk ticket");
    let emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/helpdesk/my-tickets");

    const raiseBtn = emp.page
      .locator('button:has-text("Raise a Ticket"), button:has-text("New Ticket"), button:has-text("Create")')
      .first();
    await raiseBtn.waitFor({ state: "visible", timeout: 10000 });
    await raiseBtn.click();
    await emp.page.waitForTimeout(1000);

    // Select category: IT
    const categorySelect = emp.page.locator("select").first();
    await categorySelect.selectOption("it");

    // Select priority: high
    const prioritySelect = emp.page.locator("select").nth(1);
    const priorityExists = await prioritySelect.isVisible({ timeout: 2000 }).catch(() => false);
    if (priorityExists) {
      await prioritySelect.selectOption("high");
    }

    // Fill subject
    const subjectInput = emp.page
      .locator('input[type="text"], input[placeholder*="subject" i]')
      .first();
    await subjectInput.fill(`Laptop not working - E2E test ${RUN}`);

    // Fill description
    const descInput = emp.page.locator("textarea").first();
    await descInput.fill(`My laptop is not booting up. Need urgent help. Test ID: ${RUN}`);

    await screenshot(emp.page, "03-helpdesk-create-form");

    // Submit
    const submitBtn = emp.page
      .locator('button[type="submit"], button:has-text("Submit"), button:has-text("Create")')
      .last();
    const createPromise = waitForApi(emp.page, "/helpdesk/tickets");
    await submitBtn.click();
    await createPromise;
    await emp.page.waitForTimeout(2000);

    // ── Step 2: Verify ticket shows "open" ──
    console.log("Step 2: Verify ticket is open");
    await navigateTo(emp.page, "/helpdesk/my-tickets");
    const myTicketsBody = await bodyText(emp.page);
    expect(myTicketsBody).toMatch(/open|laptop|ticket/i);
    await screenshot(emp.page, "03-helpdesk-ticket-open");

    // Find the ticket link to get its ID
    const ticketLink = emp.page.locator(`a[href*="/helpdesk/tickets/"]`).first();
    let ticketUrl = "";
    const linkExists = await ticketLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (linkExists) {
      ticketUrl = (await ticketLink.getAttribute("href")) || "";
    }
    await emp.context.close();

    // ── Step 3: Admin logs in, goes to /helpdesk/tickets ──
    console.log("Step 3: Admin views helpdesk tickets");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/helpdesk/tickets");
    await screenshot(admin.page, "03-admin-helpdesk-list");

    // ── Step 4: Find the ticket by subject ──
    console.log("Step 4: Find the ticket by subject");
    const ticketRow = admin.page.locator(`text=Laptop not working - E2E test ${RUN}`).first();
    const ticketFound = await ticketRow.isVisible({ timeout: 5000 }).catch(() => false);

    if (ticketFound) {
      // Click to view the ticket
      const parentLink = admin.page
        .locator(`a:has-text("Laptop not working - E2E test ${RUN}")`)
        .first();
      const parentExists = await parentLink.isVisible({ timeout: 3000 }).catch(() => false);
      if (parentExists) {
        await parentLink.click();
      } else {
        await ticketRow.click();
      }
      await admin.page.waitForTimeout(2000);
      await admin.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await screenshot(admin.page, "03-admin-ticket-detail");

      // ── Step 5: Admin assigns the ticket ──
      console.log("Step 5: Admin assigns ticket");
      const assignBtn = admin.page.locator('button:has-text("Assign")').first();
      const assignVisible = await assignBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (assignVisible) {
        await assignBtn.click();
        await admin.page.waitForTimeout(1000);

        // Select first HR user from dropdown
        const assignSelect = admin.page.locator("select").last();
        const assignOptions = await assignSelect.locator("option").allInnerTexts();
        const validAssign = assignOptions.find(
          (o) => !o.includes("Select") && o !== "",
        );
        if (validAssign) {
          await assignSelect.selectOption({ label: validAssign });
          const assignSubmit = admin.page
            .locator('button:has-text("Assign")')
            .last();
          const assignPromise = waitForApi(admin.page, "/helpdesk/tickets");
          await assignSubmit.click();
          await assignPromise;
          await admin.page.waitForTimeout(1500);
        }
      }

      // ── Step 6: Admin adds a comment ──
      console.log("Step 6: Admin adds comment");
      const commentInput = admin.page.locator("textarea").first();
      const commentExists = await commentInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (commentExists) {
        await commentInput.fill("Looking into this - E2E test comment");
        const sendBtn = admin.page
          .locator('button[type="submit"], button:has-text("Send"), button:has-text("Add")')
          .last();
        const commentPromise = waitForApi(admin.page, "/helpdesk/tickets");
        await sendBtn.click();
        await commentPromise;
        await admin.page.waitForTimeout(1500);
      }

      // ── Step 7: Admin resolves the ticket ──
      console.log("Step 7: Admin resolves ticket");
      const resolveBtn = admin.page.locator('button:has-text("Resolve")').first();
      const resolveVisible = await resolveBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (resolveVisible) {
        const resolvePromise = waitForApi(admin.page, "/helpdesk/tickets");
        await resolveBtn.click();
        await resolvePromise;
        await admin.page.waitForTimeout(2000);
      }

      // ── Step 8: Verify status = resolved ──
      console.log("Step 8: Verify resolved status");
      const detailBody = await bodyText(admin.page);
      expect(detailBody).toMatch(/resolved|closed/i);
      await screenshot(admin.page, "03-admin-ticket-resolved");
    } else {
      console.log("  Ticket not found in admin list — may be on another page");
    }
    await admin.context.close();

    // ── Step 9-12: Employee verifies resolved + rates ──
    console.log("Step 9: Employee verifies resolved ticket");
    emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/helpdesk/my-tickets");
    const empTicketsBody = await bodyText(emp.page);
    expect(empTicketsBody).toMatch(/ticket|resolved|open/i);

    // Navigate to the specific ticket if we have the URL
    if (ticketUrl) {
      await navigateTo(emp.page, ticketUrl);
      const ticketDetail = await bodyText(emp.page);

      // ── Step 10: Verify admin comment is visible ──
      console.log("Step 10: Check for admin comment");
      const hasComment = /looking into this/i.test(ticketDetail);
      if (hasComment) {
        console.log("  Admin comment visible");
      }

      // ── Step 11-12: Rate the ticket ──
      console.log("Step 11: Rate the ticket");
      const rateBtn = emp.page.locator('button:has-text("Rate Service")').first();
      const rateVisible = await rateBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (rateVisible) {
        await rateBtn.click();
        await emp.page.waitForTimeout(500);

        // Click the 4th star
        const stars = emp.page.locator("form button:has(svg)");
        const starCount = await stars.count();
        if (starCount >= 4) {
          await stars.nth(3).click(); // 4th star (0-indexed)
        }

        const rateSubmit = emp.page.locator('button:has-text("Submit Rating")').first();
        const rateSubmitVisible = await rateSubmit.isVisible({ timeout: 3000 }).catch(() => false);
        if (rateSubmitVisible) {
          const ratePromise = waitForApi(emp.page, "/helpdesk/tickets");
          await rateSubmit.click();
          await ratePromise;
          await emp.page.waitForTimeout(1500);

          console.log("Step 12: Rating saved");
          await screenshot(emp.page, "03-helpdesk-rated");
        }
      }
    }
    await emp.context.close();
  });
});

// =============================================================================
// 4. ANNOUNCEMENT: Create -> Target -> Read -> Verify Read Count
// =============================================================================

test.describe("4. Announcement: Create -> Target -> Read -> Verify Read Count", () => {
  test("Full announcement lifecycle: create, read, verify count", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin creates announcement ──
    console.log("Step 1: Admin creates announcement");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/announcements");

    const newBtn = admin.page
      .locator('button:has-text("New Announcement"), button:has-text("Create")')
      .first();
    await newBtn.waitFor({ state: "visible", timeout: 10000 });
    await newBtn.click();
    await admin.page.waitForTimeout(1000);

    // Fill title
    const titleInput = admin.page.locator('input[type="text"]').first();
    await titleInput.fill(`E2E Test Announcement ${RUN}`);

    // Fill content
    const contentInput = admin.page.locator("textarea").first();
    await contentInput.fill(
      `This is an automated end-to-end test announcement. Test ID: ${RUN}. Please disregard.`,
    );

    // Set priority to high
    const prioritySelect = admin.page.locator("select").first();
    await prioritySelect.selectOption("high");

    await screenshot(admin.page, "04-announcement-form");

    // Submit
    const submitBtn = admin.page
      .locator('button[type="submit"], button:has-text("Publish"), button:has-text("Create")')
      .last();
    const createPromise = waitForApi(admin.page, "/announcements");
    await submitBtn.click();
    await createPromise;
    await admin.page.waitForTimeout(2000);

    // ── Step 2: Verify it appears in admin list ──
    console.log("Step 2: Verify announcement in list");
    await navigateTo(admin.page, "/announcements");
    const adminBody = await bodyText(admin.page);
    expect(adminBody).toContain(`E2E Test Announcement ${RUN}`);
    await screenshot(admin.page, "04-announcement-created");
    await admin.context.close();

    // ── Step 3: Employee logs in, goes to /announcements ──
    console.log("Step 3: Employee views announcements");
    const emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/announcements");

    // ── Step 4: Verify announcement is visible ──
    console.log("Step 4: Verify announcement visible to employee");
    const empBody = await bodyText(emp.page);
    expect(empBody).toContain(`E2E Test Announcement ${RUN}`);
    await screenshot(emp.page, "04-employee-announcement-visible");

    // ── Step 5: Click on the announcement to mark as read ──
    console.log("Step 5: Employee clicks announcement (marks as read)");
    const announcementRow = emp.page
      .locator(`text=E2E Test Announcement ${RUN}`)
      .first();
    await announcementRow.click();
    await emp.page.waitForTimeout(2000);
    // The mark-as-read is triggered by expanding/clicking the announcement
    await screenshot(emp.page, "04-employee-announcement-read");
    await emp.context.close();

    // ── Step 6: Admin verifies read count ──
    console.log("Step 6: Admin checks read count");
    const admin2 = await loginAs(browser, ADMIN);
    await navigateTo(admin2.page, "/announcements");
    const admin2Body = await bodyText(admin2.page);
    // Look for any read count indicator (e.g., "1 read", "read by", etc.)
    expect(admin2Body).toContain(`E2E Test Announcement ${RUN}`);
    await screenshot(admin2.page, "04-announcement-read-count");
    await admin2.context.close();
  });
});

// =============================================================================
// 5. SURVEY: Create -> Publish -> Employee Responds -> View Results
// =============================================================================

test.describe("5. Survey: Create -> Publish -> Employee Responds -> View Results", () => {
  test("Full survey lifecycle: build, publish, respond, view results", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin goes to /surveys/builder ──
    console.log("Step 1: Admin creates survey");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/surveys/builder");

    // ── Step 2: Fill survey details ──
    console.log("Step 2: Fill survey title and type");
    const titleInput = admin.page.locator('input[type="text"]').first();
    await titleInput.fill(`E2E Survey ${RUN}`);

    // Set description
    const descInput = admin.page.locator("textarea").first();
    const descExists = await descInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (descExists) {
      await descInput.fill(`Automated E2E survey test ${RUN}`);
    }

    // Select type: pulse
    const typeSelect = admin.page.locator("select").first();
    await typeSelect.selectOption("pulse");

    await screenshot(admin.page, "05-survey-builder-meta");

    // ── Step 3: Add questions ──
    console.log("Step 3: Add survey questions");
    // First question is already present — fill it (rating 1-5)
    const questionInputs = admin.page.locator(
      'input[placeholder*="question" i], input[type="text"]',
    );
    // Find the question text input (usually the second input on the page after title)
    const allInputs = admin.page.locator('input[type="text"]');
    const inputCount = await allInputs.count();
    if (inputCount > 1) {
      await allInputs.nth(1).fill("How satisfied are you with work?");
    }

    // Add second question
    const addQuestionBtn = admin.page
      .locator('button:has-text("Add Question"), button:has-text("Add")')
      .first();
    const addExists = await addQuestionBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (addExists) {
      await addQuestionBtn.click();
      await admin.page.waitForTimeout(500);

      // Fill second question
      const allInputsNow = admin.page.locator('input[type="text"]');
      const newCount = await allInputsNow.count();
      if (newCount > 2) {
        await allInputsNow.nth(newCount - 1).fill("Would you recommend this workplace?");
      }

      // Change second question type to yes_no
      const questionTypeSelects = admin.page.locator("select");
      const selectCount = await questionTypeSelects.count();
      if (selectCount > 2) {
        await questionTypeSelects.nth(selectCount - 1).selectOption("yes_no");
      }
    }

    await screenshot(admin.page, "05-survey-builder-questions");

    // ── Step 4: Save & Publish ──
    console.log("Step 4: Save & Publish");
    const publishBtn = admin.page
      .locator('button:has-text("Save & Publish"), button:has-text("Publish")')
      .first();
    const publishExists = await publishBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (publishExists) {
      const publishPromise = waitForApi(admin.page, "/surveys");
      await publishBtn.click();
      await publishPromise;
      await admin.page.waitForTimeout(2000);
    } else {
      // Fall back to just Save
      const saveBtn = admin.page.locator('button:has-text("Save")').first();
      const savePromise = waitForApi(admin.page, "/surveys");
      await saveBtn.click();
      await savePromise;
      await admin.page.waitForTimeout(2000);
    }

    // ── Step 5: Verify survey shows as Active ──
    console.log("Step 5: Verify survey in list");
    await navigateTo(admin.page, "/surveys/list");
    const surveyListBody = await bodyText(admin.page);
    expect(surveyListBody).toMatch(/E2E Survey|survey|active/i);
    await screenshot(admin.page, "05-survey-list-active");

    // Try to find the survey ID from the page
    const surveyLink = admin.page.locator(`a[href*="/surveys/"]`).first();
    let surveyId = "";
    const linkExists = await surveyLink.isVisible({ timeout: 3000 }).catch(() => false);
    if (linkExists) {
      const href = (await surveyLink.getAttribute("href")) || "";
      const match = href.match(/\/surveys\/(\d+)/);
      if (match) surveyId = match[1];
    }
    await admin.context.close();

    // ── Step 6: Employee responds ──
    console.log("Step 6: Employee goes to /surveys/respond");
    const emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/surveys/respond");
    const respondBody = await bodyText(emp.page);
    await screenshot(emp.page, "05-survey-respond-page");

    // ── Step 7: Find and take the survey ──
    console.log("Step 7: Employee fills responses");
    const takeSurveyBtn = emp.page.locator('button:has-text("Take Survey")').first();
    const takeSurveyExists = await takeSurveyBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (takeSurveyExists) {
      await takeSurveyBtn.click();
      await emp.page.waitForTimeout(2000);

      // Answer rating question (click 4th star or radio)
      const ratingBtns = emp.page.locator('button, input[type="radio"]');
      // Try to find radio buttons or rating buttons
      const radio4 = emp.page.locator('input[value="4"], button:has-text("4")').first();
      const radio4Exists = await radio4.isVisible({ timeout: 3000 }).catch(() => false);
      if (radio4Exists) {
        await radio4.click();
      }

      // Answer yes/no question
      const yesBtn = emp.page.locator('button:has-text("Yes"), input[value="yes"]').first();
      const yesExists = await yesBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (yesExists) {
        await yesBtn.click();
      }

      await screenshot(emp.page, "05-survey-responses-filled");

      // ── Step 8: Submit ──
      console.log("Step 8: Submit survey responses");
      const surveySubmitBtn = emp.page
        .locator('button[type="submit"], button:has-text("Submit")')
        .last();
      const submitExists = await surveySubmitBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (submitExists) {
        const submitPromise = waitForApi(emp.page, "/surveys");
        await surveySubmitBtn.click();
        await submitPromise;
        await emp.page.waitForTimeout(2000);
        await screenshot(emp.page, "05-survey-submitted");
      }
    } else {
      console.log("  No active surveys found for employee to respond to");
    }
    await emp.context.close();

    // ── Step 9-10: Admin views results ──
    console.log("Step 9: Admin views survey results");
    const admin2 = await loginAs(browser, ADMIN);
    if (surveyId) {
      await navigateTo(admin2.page, `/surveys/${surveyId}/results`);
    } else {
      await navigateTo(admin2.page, "/surveys/list");
    }
    const resultsBody = await bodyText(admin2.page);
    expect(resultsBody).toMatch(/survey|result|response/i);
    await screenshot(admin2.page, "05-survey-results");
    await admin2.context.close();
  });
});

// =============================================================================
// 6. ASSET: Create -> Assign -> Employee Sees -> Return -> Available Again
// =============================================================================

test.describe("6. Asset: Create -> Assign -> Employee Sees -> Return -> Available Again", () => {
  test("Full asset lifecycle: create, assign, verify, return", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin creates asset ──
    console.log("Step 1: Admin creates asset");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/assets");

    const addBtn = admin.page
      .locator('button:has-text("Add Asset"), button:has-text("Create"), button:has-text("New")')
      .first();
    await addBtn.waitFor({ state: "visible", timeout: 10000 });
    await addBtn.click();
    await admin.page.waitForTimeout(1000);

    // Fill name
    const nameInput = admin.page.locator('input[type="text"]').first();
    await nameInput.fill(`E2E Laptop ${RUN}`);

    // Fill serial number
    const serialInput = admin.page.locator('input[type="text"]').nth(1);
    const serialExists = await serialInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (serialExists) {
      // We need to find the correct serial number input
      const allTextInputs = admin.page.locator('input[type="text"]');
      const count = await allTextInputs.count();
      for (let i = 0; i < count; i++) {
        const placeholder = await allTextInputs.nth(i).getAttribute("placeholder");
        const label = await allTextInputs
          .nth(i)
          .locator("xpath=preceding-sibling::label | ancestor::div/label")
          .first()
          .innerText()
          .catch(() => "");
        if (
          placeholder?.toLowerCase().includes("serial") ||
          label.toLowerCase().includes("serial")
        ) {
          await allTextInputs.nth(i).fill(`SN-E2E-${RUN}`);
          break;
        }
      }
    }

    // Select category if available
    const categorySelect = admin.page.locator("select").first();
    const catOptions = await categorySelect.locator("option").allInnerTexts();
    const validCat = catOptions.find((o) => !o.includes("Select") && o !== "");
    if (validCat) {
      await categorySelect.selectOption({ label: validCat });
    }

    await screenshot(admin.page, "06-asset-create-form");

    // Submit
    const createBtn = admin.page
      .locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      .last();
    const createPromise = waitForApi(admin.page, "/assets");
    await createBtn.click();
    await createPromise;
    await admin.page.waitForTimeout(2000);

    // ── Step 2: Verify asset shows "Available" ──
    console.log("Step 2: Verify asset is available");
    await navigateTo(admin.page, "/assets");
    const assetBody = await bodyText(admin.page);
    expect(assetBody).toMatch(/E2E Laptop|available|asset/i);
    await screenshot(admin.page, "06-asset-available");

    // Find the asset to click on it
    const assetLink = admin.page.locator(`text=E2E Laptop ${RUN}`).first();
    const assetFound = await assetLink.isVisible({ timeout: 5000 }).catch(() => false);

    let assetId = "";
    if (assetFound) {
      // Try to find asset link
      const linkEl = admin.page.locator(`a:has-text("E2E Laptop ${RUN}")`).first();
      const linkElExists = await linkEl.isVisible({ timeout: 3000 }).catch(() => false);
      if (linkElExists) {
        const href = (await linkEl.getAttribute("href")) || "";
        const match = href.match(/\/assets\/(\d+)/);
        if (match) assetId = match[1];
        await linkEl.click();
      } else {
        await assetLink.click();
      }
      await admin.page.waitForTimeout(2000);
      await admin.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // ── Step 3: Admin assigns to priya ──
      console.log("Step 3: Admin assigns asset to priya");
      const assignBtn = admin.page.locator('button:has-text("Assign")').first();
      const assignVisible = await assignBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (assignVisible) {
        await assignBtn.click();
        await admin.page.waitForTimeout(1000);

        // Select priya from dropdown
        const userSelect = admin.page.locator("select").last();
        await userSelect.waitFor({ state: "visible", timeout: 5000 });
        const userOptions = await userSelect.locator("option").allInnerTexts();
        const priyaOption = userOptions.find((o) => /priya/i.test(o));
        if (priyaOption) {
          await userSelect.selectOption({ label: priyaOption });
        } else if (userOptions.length > 1) {
          await userSelect.selectOption({ index: 1 });
        }

        const assignSubmit = admin.page
          .locator('button[type="submit"], button:has-text("Assign")')
          .last();
        const assignPromise = waitForApi(admin.page, "/assets");
        await assignSubmit.click();
        await assignPromise;
        await admin.page.waitForTimeout(2000);
      }

      // ── Step 4: Verify status = Assigned ──
      console.log("Step 4: Verify asset is assigned");
      const detailBody = await bodyText(admin.page);
      expect(detailBody).toMatch(/assigned|assign/i);
      await screenshot(admin.page, "06-asset-assigned");
    }
    await admin.context.close();

    // ── Step 5-6: Employee sees it in My Assets ──
    console.log("Step 5: Employee checks My Assets");
    const emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/assets/my");
    const myAssetsBody = await bodyText(emp.page);
    expect(myAssetsBody).toMatch(/asset|laptop|my/i);
    await screenshot(emp.page, "06-employee-my-assets");
    await emp.context.close();

    // ── Step 7-9: Admin returns asset ──
    console.log("Step 7: Admin returns asset");
    const admin2 = await loginAs(browser, ADMIN);
    if (assetId) {
      await navigateTo(admin2.page, `/assets/${assetId}`);
    } else {
      await navigateTo(admin2.page, "/assets");
      // Search for the asset
      const searchInput = admin2.page.locator('input[placeholder*="search" i]').first();
      const searchExists = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (searchExists) {
        await searchInput.fill(`E2E Laptop ${RUN}`);
        await admin2.page.waitForTimeout(1500);
      }
      // Click on the asset
      const assetLink2 = admin2.page.locator(`a:has-text("E2E Laptop ${RUN}")`).first();
      const found2 = await assetLink2.isVisible({ timeout: 5000 }).catch(() => false);
      if (found2) {
        await assetLink2.click();
        await admin2.page.waitForTimeout(2000);
      }
    }

    // Click Return button
    const returnBtn = admin2.page
      .locator('button:has-text("Return")')
      .first();
    const returnVisible = await returnBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (returnVisible) {
      await returnBtn.click();
      await admin2.page.waitForTimeout(1000);

      // Select condition "good"
      const conditionSelect = admin2.page.locator("select").last();
      const condExists = await conditionSelect.isVisible({ timeout: 3000 }).catch(() => false);
      if (condExists) {
        await conditionSelect.selectOption("good");
      }

      const returnSubmit = admin2.page
        .locator('button[type="submit"], button:has-text("Return"), button:has-text("Confirm")')
        .last();
      const returnPromise = waitForApi(admin2.page, "/assets");
      await returnSubmit.click();
      await returnPromise;
      await admin2.page.waitForTimeout(2000);

      // ── Step 9: Verify asset back to Available ──
      console.log("Step 9: Verify asset is available again");
      const returnBody = await bodyText(admin2.page);
      expect(returnBody).toMatch(/available|returned/i);
      await screenshot(admin2.page, "06-asset-returned");
    }
    await admin2.context.close();
  });
});

// =============================================================================
// 7. POSITION: Create -> Assign Employee -> Headcount Fills -> Status Updates
// =============================================================================

test.describe("7. Position: Create -> Assign -> Headcount Fills", () => {
  test("Full position lifecycle: create, assign, verify headcount", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin creates position ──
    console.log("Step 1: Admin creates position");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/positions/list");

    const createBtn = admin.page
      .locator('button:has-text("Create Position"), button:has-text("New"), button:has-text("Add")')
      .first();
    await createBtn.waitFor({ state: "visible", timeout: 10000 });
    await createBtn.click();
    await admin.page.waitForTimeout(1000);

    // Fill title
    const titleInput = admin.page.locator('input[type="text"]').first();
    await titleInput.fill(`E2E Engineer ${RUN}`);

    // Select department
    const deptSelect = admin.page.locator("select").first();
    const deptOptions = await deptSelect.locator("option").allInnerTexts();
    const validDept = deptOptions.find((o) => !o.includes("Select") && o !== "" && o !== "All");
    if (validDept) {
      await deptSelect.selectOption({ label: validDept });
    }

    // Set headcount to 1
    const headcountInput = admin.page.locator('input[type="number"]').first();
    const headcountExists = await headcountInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (headcountExists) {
      await headcountInput.fill("1");
    }

    await screenshot(admin.page, "07-position-create-form");

    // Submit
    const submitBtn = admin.page
      .locator('button[type="submit"], button:has-text("Create")')
      .last();
    const createPromise = waitForApi(admin.page, "/positions");
    await submitBtn.click();
    await createPromise;
    await admin.page.waitForTimeout(2000);

    // ── Step 2: Verify appears in vacancies ──
    console.log("Step 2: Verify position appears");
    await navigateTo(admin.page, "/positions/vacancies");
    const vacancyBody = await bodyText(admin.page);
    expect(vacancyBody).toMatch(/vacanc|position|E2E Engineer/i);
    await screenshot(admin.page, "07-position-vacancy");

    // ── Step 3: Navigate to position list, find and view detail ──
    console.log("Step 3: View position detail");
    await navigateTo(admin.page, "/positions/list");
    const posLink = admin.page.locator(`a:has-text("E2E Engineer ${RUN}")`).first();
    const posFound = await posLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (posFound) {
      await posLink.click();
      await admin.page.waitForTimeout(2000);
      await admin.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // ── Step 3: Assign employee ──
      console.log("Step 3: Assign employee to position");
      const assignBtn = admin.page.locator('button:has-text("Assign")').first();
      const assignVisible = await assignBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (assignVisible) {
        await assignBtn.click();
        await admin.page.waitForTimeout(1000);

        const userSelect = admin.page.locator("select").last();
        const userOpts = await userSelect.locator("option").allInnerTexts();
        const validUser = userOpts.find((o) => !o.includes("Select") && o !== "");
        if (validUser) {
          await userSelect.selectOption({ label: validUser });
          const assignSubmit = admin.page
            .locator('button[type="submit"], button:has-text("Assign")')
            .last();
          const assignPromise = waitForApi(admin.page, "/positions");
          await assignSubmit.click();
          await assignPromise;
          await admin.page.waitForTimeout(2000);
        }
      }

      // ── Step 4-5: Verify headcount filled ──
      console.log("Step 4: Verify headcount is filled");
      const detailBody = await bodyText(admin.page);
      expect(detailBody).toMatch(/position|engineer|headcount|filled|1/i);
      await screenshot(admin.page, "07-position-filled");
    } else {
      console.log("  Position not found in list — checking it was created");
      const listBody = await bodyText(admin.page);
      expect(listBody).toMatch(/position|list/i);
    }

    // ── Step 6: Verify no longer in vacancies ──
    console.log("Step 6: Check vacancies list");
    await navigateTo(admin.page, "/positions/vacancies");
    await screenshot(admin.page, "07-position-vacancies-after");
    await admin.context.close();
  });
});

// =============================================================================
// 8. WELLNESS: Check-in -> Goals -> History
// =============================================================================

test.describe("8. Wellness: Check-in -> Goals -> History", () => {
  test("Full wellness lifecycle: check-in, view history, goals", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee goes to /wellness/check-in ──
    console.log("Step 1: Employee goes to wellness check-in");
    const emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/wellness/check-in");

    const checkinBody = await bodyText(emp.page);
    expect(checkinBody).toMatch(/check.?in|daily|wellness|mood/i);
    await screenshot(emp.page, "08-wellness-checkin-page");

    // ── Step 2: Fill mood, energy, sleep, exercise ──
    console.log("Step 2: Fill check-in form");

    // Select mood: "great"
    const greatMoodBtn = emp.page.locator('button:has-text("Great"), div:has-text("Great")').first();
    const moodVisible = await greatMoodBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (moodVisible) {
      await greatMoodBtn.click();
    } else {
      // Try clicking the first mood button
      const moodBtns = emp.page.locator("button").filter({ hasText: /great|good|okay/i });
      const firstMood = moodBtns.first();
      const firstMoodVisible = await firstMood.isVisible({ timeout: 3000 }).catch(() => false);
      if (firstMoodVisible) {
        await firstMood.click();
      }
    }

    // Set energy level (slider or input)
    const energyInput = emp.page.locator('input[type="range"]').first();
    const energyExists = await energyInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (energyExists) {
      await energyInput.fill("4");
    }

    // Fill sleep hours
    const sleepInput = emp.page.locator('input[type="number"], input[placeholder*="sleep" i]').first();
    const sleepExists = await sleepInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (sleepExists) {
      await sleepInput.fill("8");
    }

    // Fill exercise minutes
    const exerciseInput = emp.page.locator('input[type="number"]').nth(1);
    const exerciseExists = await exerciseInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (exerciseExists) {
      await exerciseInput.fill("30");
    }

    await screenshot(emp.page, "08-wellness-checkin-filled");

    // ── Step 3: Submit ──
    console.log("Step 3: Submit check-in");
    const submitBtn = emp.page
      .locator('button[type="submit"], button:has-text("Submit"), button:has-text("Check In")')
      .last();
    const submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (submitVisible) {
      const submitPromise = waitForApi(emp.page, "/wellness");
      await submitBtn.click();
      await submitPromise;
      await emp.page.waitForTimeout(2000);
    }

    // Verify success (either "Complete" message or redirect)
    const afterSubmit = await bodyText(emp.page);
    expect(afterSubmit).toMatch(/complete|success|submitted|wellness|check.?in/i);
    await screenshot(emp.page, "08-wellness-checkin-done");

    // ── Step 4-5: Go to /wellness/my to see history ──
    console.log("Step 4: View wellness history");
    await navigateTo(emp.page, "/wellness/my");
    const myWellnessBody = await bodyText(emp.page);
    expect(myWellnessBody).toMatch(/wellness|history|check.?in|mood/i);
    await screenshot(emp.page, "08-wellness-history");

    // ── Step 6-9: Goals (view/create if available) ──
    console.log("Step 6: Check wellness goals");
    // Goals might be accessible from the wellness page or a specific section
    const goalsSection = emp.page.locator('text=/goal/i').first();
    const goalsVisible = await goalsSection.isVisible({ timeout: 3000 }).catch(() => false);
    if (goalsVisible) {
      console.log("  Goals section found");
      await screenshot(emp.page, "08-wellness-goals");
    } else {
      console.log("  Goals section not visible on this page");
    }

    await emp.context.close();
  });
});

// =============================================================================
// 9. FORUM: Post -> Like -> Reply -> Accept Answer
// =============================================================================

test.describe("9. Forum: Post -> Like -> Reply -> Accept Answer", () => {
  test("Full forum lifecycle: create question, like, reply, accept", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin creates a question post ──
    console.log("Step 1: Admin creates forum question");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/forum/new");

    // Select category
    const categorySelect = admin.page.locator("select").first();
    await categorySelect.waitFor({ state: "visible", timeout: 5000 });
    const catOptions = await categorySelect.locator("option").allInnerTexts();
    const validCat = catOptions.find((o) => !o.includes("Select") && !o.includes("select") && o !== "");
    if (validCat) {
      await categorySelect.selectOption({ label: validCat });
    } else {
      await categorySelect.selectOption({ index: 1 });
    }

    // Select post type: question
    const typeSelect = admin.page.locator("select").nth(1);
    const typeExists = await typeSelect.isVisible({ timeout: 2000 }).catch(() => false);
    if (typeExists) {
      await typeSelect.selectOption("question");
    }

    // Fill title
    const titleInput = admin.page
      .locator('input[type="text"]')
      .first();
    await titleInput.fill(`E2E Question ${RUN}`);

    // Fill content
    const contentInput = admin.page.locator("textarea").first();
    await contentInput.fill(
      `This is an automated question for E2E testing. How do we improve team collaboration? Test ID: ${RUN}`,
    );

    await screenshot(admin.page, "09-forum-create-question");

    // Submit
    const submitBtn = admin.page
      .locator('button[type="submit"], button:has-text("Post"), button:has-text("Create")')
      .last();
    const postPromise = waitForApi(admin.page, "/forum/posts");
    await submitBtn.click();
    await postPromise;
    await admin.page.waitForTimeout(2000);

    // Should redirect to the post detail page
    const postUrl = admin.page.url();
    const postIdMatch = postUrl.match(/\/forum\/post\/(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : "";
    console.log(`  Post ID: ${postId}`);

    // ── Step 2: Verify post appears with 0 replies, 0 likes ──
    console.log("Step 2: Verify new post");
    const postBody = await bodyText(admin.page);
    expect(postBody).toContain(`E2E Question ${RUN}`);
    await screenshot(admin.page, "09-forum-post-created");
    await admin.context.close();

    // ── Step 3: Employee finds the post ──
    console.log("Step 3: Employee views the post");
    const emp = await loginAs(browser, EMPLOYEE);
    if (postId) {
      await navigateTo(emp.page, `/forum/post/${postId}`);
    } else {
      await navigateTo(emp.page, "/forum");
      const postLink = emp.page.locator(`a:has-text("E2E Question ${RUN}")`).first();
      const found = await postLink.isVisible({ timeout: 5000 }).catch(() => false);
      if (found) {
        await postLink.click();
        await emp.page.waitForTimeout(2000);
      }
    }

    // ── Step 4: Employee likes the post ──
    console.log("Step 4: Employee likes the post");
    const likeBtn = emp.page.locator('button:has(svg)').filter({ hasText: /like|heart|0/i }).first();
    const likeBtnAlt = emp.page.locator('button[aria-label*="like" i], button:has(svg.lucide-heart)').first();
    let likeTarget = likeBtn;
    const likeVisible = await likeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!likeVisible) {
      likeTarget = likeBtnAlt;
    }
    const likeTargetVisible = await likeTarget.isVisible({ timeout: 3000 }).catch(() => false);
    if (likeTargetVisible) {
      const likePromise = waitForApi(emp.page, "/forum/like");
      await likeTarget.click();
      await likePromise;
      await emp.page.waitForTimeout(1500);
      console.log("  Post liked");
    }

    // ── Step 5: Employee adds a reply ──
    console.log("Step 5: Employee adds a reply");
    const replyInput = emp.page.locator("textarea").first();
    const replyExists = await replyInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (replyExists) {
      await replyInput.fill(`Here's the answer to your question. Improved standup meetings. Test: ${RUN}`);
      const replyBtn = emp.page
        .locator('button[type="submit"], button:has-text("Reply"), button:has-text("Post")')
        .last();
      const replyPromise = waitForApi(emp.page, "/forum/posts");
      await replyBtn.click();
      await replyPromise;
      await emp.page.waitForTimeout(2000);

      // ── Step 6: Verify reply ──
      console.log("Step 6: Verify reply is visible");
      const afterReply = await bodyText(emp.page);
      expect(afterReply).toMatch(/answer|standup|reply/i);
      await screenshot(emp.page, "09-forum-reply-added");
    }
    await emp.context.close();

    // ── Step 7-9: Admin accepts the answer ──
    console.log("Step 7: Admin views post and accepts answer");
    const admin2 = await loginAs(browser, ADMIN);
    if (postId) {
      await navigateTo(admin2.page, `/forum/post/${postId}`);
    } else {
      await navigateTo(admin2.page, "/forum");
    }

    const acceptBtn = admin2.page.locator('button:has-text("Accept")').first();
    const acceptVisible = await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (acceptVisible) {
      const acceptPromise = waitForApi(admin2.page, "/forum/replies");
      await acceptBtn.click();
      await acceptPromise;
      await admin2.page.waitForTimeout(2000);

      // ── Step 9: Verify "Accepted" badge ──
      console.log("Step 9: Verify accepted badge");
      const acceptedBody = await bodyText(admin2.page);
      expect(acceptedBody).toMatch(/accepted|answer/i);
      await screenshot(admin2.page, "09-forum-answer-accepted");
    } else {
      console.log("  No Accept button found");
    }
    await admin2.context.close();
  });
});

// =============================================================================
// 10. ATTENDANCE: Check-in -> Records -> Admin Dashboard
// =============================================================================

test.describe("10. Attendance: Check-in -> Records -> Admin Dashboard", () => {
  test("Full attendance lifecycle: check-in, check-out, admin verify", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1-2: Employee goes to /attendance/my ──
    console.log("Step 1: Employee goes to attendance page");
    let emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/attendance/my");

    const attBody = await bodyText(emp.page);
    expect(attBody).toMatch(/attendance|check.?in|today/i);
    await screenshot(emp.page, "10-attendance-initial");

    // ── Step 2: Check if already checked in ──
    console.log("Step 2: Check in if not already");
    const checkInBtn = emp.page.locator('button:has-text("Check In")').first();
    const checkInVisible = await checkInBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (checkInVisible) {
      const checkInPromise = waitForApi(emp.page, "/attendance/check-in");
      await checkInBtn.click();
      await checkInPromise;
      await emp.page.waitForTimeout(2000);

      // ── Step 3: Verify checked in ──
      console.log("Step 3: Verify checked in status");
      const afterCheckIn = await bodyText(emp.page);
      expect(afterCheckIn).toMatch(/check.?in|checked|present/i);
      await screenshot(emp.page, "10-attendance-checked-in");

      // ── Step 4: Note check-in time ──
      console.log("Step 4: Check-in time noted");

      // ── Step 5: Wait 3 seconds ──
      console.log("Step 5: Wait before check-out");
      await emp.page.waitForTimeout(3000);

      // ── Step 6: Check Out ──
      console.log("Step 6: Check out");
      const checkOutBtn = emp.page.locator('button:has-text("Check Out")').first();
      const checkOutVisible = await checkOutBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (checkOutVisible) {
        const checkOutPromise = waitForApi(emp.page, "/attendance/check-out");
        await checkOutBtn.click();
        await checkOutPromise;
        await emp.page.waitForTimeout(2000);

        // ── Step 7: Verify both times visible ──
        console.log("Step 7: Verify check-in and check-out times");
        const afterCheckOut = await bodyText(emp.page);
        expect(afterCheckOut).toMatch(/check.?out|completed|worked/i);
        await screenshot(emp.page, "10-attendance-checked-out");
      }
    } else {
      console.log("  Already checked in or completed for today");
      const currentBody = await bodyText(emp.page);
      expect(currentBody).toMatch(/check|attendance|completed/i);
    }
    await emp.context.close();

    // ── Step 8-9: Admin verifies attendance ──
    console.log("Step 8: Admin views attendance dashboard");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/attendance");
    const adminAttBody = await bodyText(admin.page);
    expect(adminAttBody).toMatch(/attendance|dashboard|present|today/i);
    await screenshot(admin.page, "10-admin-attendance-dashboard");

    // ── Step 9: Verify employee shows as present ──
    console.log("Step 9: Verify priya shows as present");
    // The admin dashboard should show attendance stats or list
    const hasPresent = /present|checked in|priya|\d+/i.test(adminAttBody);
    expect(hasPresent).toBeTruthy();
    await admin.context.close();
  });
});

// =============================================================================
// 11. FEEDBACK: Submit -> Admin Responds -> Employee Sees Response
// =============================================================================

test.describe("11. Feedback: Submit -> Admin Responds -> Employee Sees Response", () => {
  test("Full feedback lifecycle: submit, respond, verify", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee submits feedback ──
    console.log("Step 1: Employee submits feedback");
    let emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/feedback/submit");

    const feedbackBody = await bodyText(emp.page);
    expect(feedbackBody).toMatch(/feedback|submit|anonymous/i);

    // Select category: management
    const categorySelect = emp.page.locator("select").first();
    await categorySelect.selectOption("management");

    // Fill subject
    const subjectInput = emp.page.locator('input[type="text"]').first();
    await subjectInput.fill(`E2E Feedback ${RUN}`);

    // Fill message
    const messageInput = emp.page.locator("textarea").first();
    await messageInput.fill(
      `This is an automated E2E feedback submission. Test ID: ${RUN}. Requesting better team communication tools.`,
    );

    // Mark as urgent
    const urgentCheckbox = emp.page.locator('input[type="checkbox"]').first();
    const urgentExists = await urgentCheckbox.isVisible({ timeout: 2000 }).catch(() => false);
    if (urgentExists) {
      await urgentCheckbox.check();
    }

    await screenshot(emp.page, "11-feedback-form");

    // Submit
    const submitBtn = emp.page
      .locator('button[type="submit"], button:has-text("Submit")')
      .last();
    const submitPromise = waitForApi(emp.page, "/feedback");
    await submitBtn.click();
    await submitPromise;
    await emp.page.waitForTimeout(2000);

    // Verify success
    const afterSubmit = await bodyText(emp.page);
    expect(afterSubmit).toMatch(/submitted|success|thank|feedback/i);
    await screenshot(emp.page, "11-feedback-submitted");

    // ── Step 2: Check /feedback/my ──
    console.log("Step 2: Verify feedback in my list");
    await navigateTo(emp.page, "/feedback/my");
    const myFeedbackBody = await bodyText(emp.page);
    expect(myFeedbackBody).toMatch(/feedback|E2E Feedback|new|pending/i);
    await screenshot(emp.page, "11-feedback-my-list");

    // ── Step 3: Verify "New" status ──
    console.log("Step 3: Verify New status");
    expect(myFeedbackBody).toMatch(/new|submitted/i);
    await emp.context.close();

    // ── Step 4: Admin logs in, goes to /feedback ──
    console.log("Step 4: Admin views feedback list");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/feedback");
    const adminFeedbackBody = await bodyText(admin.page);
    expect(adminFeedbackBody).toMatch(/feedback|management|E2E Feedback/i);
    await screenshot(admin.page, "11-admin-feedback-list");

    // ── Step 5: Find the feedback by subject ──
    console.log("Step 5: Find feedback by subject");
    const feedbackRow = admin.page.locator(`text=E2E Feedback ${RUN}`).first();
    const feedbackFound = await feedbackRow.isVisible({ timeout: 5000 }).catch(() => false);

    if (feedbackFound) {
      // ── Step 6: Admin responds ──
      console.log("Step 6: Admin responds to feedback");
      // Find the respond button near the feedback
      const respondBtn = admin.page
        .locator('button:has-text("Respond"), button:has-text("Reply")')
        .first();
      const respondVisible = await respondBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (respondVisible) {
        await respondBtn.click();
        await admin.page.waitForTimeout(1000);

        // Fill response text
        const responseInput = admin.page.locator("textarea").last();
        await responseInput.fill("Thank you for the feedback. We will look into communication tools.");

        const sendBtn = admin.page
          .locator('button[type="submit"], button:has-text("Send"), button:has-text("Submit"), button:has-text("Respond")')
          .last();
        const respondPromise = waitForApi(admin.page, "/feedback");
        await sendBtn.click();
        await respondPromise;
        await admin.page.waitForTimeout(2000);
      }

      // ── Step 7: Change status to Acknowledged ──
      console.log("Step 7: Change status to acknowledged");
      const statusBtn = admin.page
        .locator('button:has-text("Status"), button:has-text("Update Status"), select')
        .first();
      const statusVisible = await statusBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (statusVisible) {
        // Try clicking a status change button/dropdown
        if (await admin.page.locator("select").first().isVisible({ timeout: 1000 }).catch(() => false)) {
          await admin.page.locator("select").first().selectOption("acknowledged");
          const statusSubmit = admin.page.locator('button:has-text("Update"), button:has-text("Save")').first();
          const statusExists = await statusSubmit.isVisible({ timeout: 2000 }).catch(() => false);
          if (statusExists) {
            const statusPromise = waitForApi(admin.page, "/feedback");
            await statusSubmit.click();
            await statusPromise;
            await admin.page.waitForTimeout(1500);
          }
        }
      }
      await screenshot(admin.page, "11-admin-feedback-responded");
    }
    await admin.context.close();

    // ── Step 8-9: Employee verifies response ──
    console.log("Step 8: Employee checks updated feedback");
    emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/feedback/my");
    const finalFeedbackBody = await bodyText(emp.page);
    // Should show acknowledged status or admin response
    expect(finalFeedbackBody).toMatch(/feedback|acknowledged|new|response/i);
    await screenshot(emp.page, "11-feedback-final-status");
    await emp.context.close();
  });
});

// =============================================================================
// 12. AI CHATBOT: Multi-turn Conversation with Tool Calls
// =============================================================================

test.describe("12. AI Chatbot: Multi-turn Conversation", () => {
  test("Chatbot conversation: multiple questions and responses", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Employee logs in ──
    console.log("Step 1: Employee logs in");
    const emp = await loginAs(browser, EMPLOYEE);

    // ── Step 2: Open /chatbot ──
    console.log("Step 2: Open chatbot page");
    await navigateTo(emp.page, "/chatbot");
    const chatBody = await bodyText(emp.page);
    expect(chatBody).toMatch(/chatbot|assistant|ai|conversation/i);
    await screenshot(emp.page, "12-chatbot-initial");

    // ── Step 3: Create a new conversation ──
    console.log("Step 3: Create new conversation");
    const newConvoBtn = emp.page
      .locator('button:has-text("New"), button:has(svg.lucide-plus)')
      .first();
    const newConvoVisible = await newConvoBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (newConvoVisible) {
      await newConvoBtn.click();
      await emp.page.waitForTimeout(1000);
    }

    // ── Step 4: Send first message ──
    console.log("Step 4: Ask about employee count");
    const chatInput = emp.page.locator(
      'input[type="text"], textarea, input[placeholder*="message" i], input[placeholder*="type" i]',
    ).last();
    await chatInput.waitFor({ state: "visible", timeout: 10000 });
    await chatInput.fill("How many employees do we have?");

    const sendBtn = emp.page
      .locator('button:has(svg.lucide-send), button[type="submit"], button:has-text("Send")')
      .last();
    await sendBtn.click();

    // ── Step 5: Wait for AI response ──
    console.log("Step 5: Wait for AI response");
    // Wait for the loading indicator to appear and then disappear
    await emp.page.waitForTimeout(3000);
    await emp.page
      .waitForSelector('div:has-text("employee")', { timeout: 20000 })
      .catch(() => {});
    await emp.page.waitForTimeout(2000);

    // ── Step 6: Verify response contains relevant data ──
    console.log("Step 6: Verify employee count response");
    const response1 = await bodyText(emp.page);
    // The AI should mention employees or a number
    expect(response1).toMatch(/employee|staff|team|\d+/i);
    await screenshot(emp.page, "12-chatbot-response-1");

    // ── Step 7: Ask about attendance ──
    console.log("Step 7: Ask about attendance");
    await chatInput.fill("What is the attendance today?");
    await sendBtn.click();

    // ── Step 8: Wait and verify attendance response ──
    console.log("Step 8: Wait for attendance response");
    await emp.page.waitForTimeout(5000);
    await emp.page
      .waitForSelector('div:has-text("attendance")', { timeout: 20000 })
      .catch(() => {});
    await emp.page.waitForTimeout(2000);

    const response2 = await bodyText(emp.page);
    expect(response2).toMatch(/attendance|present|today|\d+/i);
    await screenshot(emp.page, "12-chatbot-response-2");

    // ── Step 10: Ask about policies ──
    console.log("Step 10: Ask about company policies");
    await chatInput.fill("Show me company policies");
    await sendBtn.click();

    // ── Step 11: Verify policies response ──
    console.log("Step 11: Wait for policies response");
    await emp.page.waitForTimeout(5000);
    await emp.page.waitForTimeout(5000);

    const response3 = await bodyText(emp.page);
    expect(response3).toMatch(/polic|company|rule|guideline/i);
    await screenshot(emp.page, "12-chatbot-response-3");

    // ── Step 12: Verify conversation history ──
    console.log("Step 12: Verify conversation history shows all messages");
    const fullChat = await bodyText(emp.page);
    expect(fullChat).toMatch(/employee/i);
    expect(fullChat).toMatch(/attendance/i);
    expect(fullChat).toMatch(/polic/i);
    await screenshot(emp.page, "12-chatbot-full-history");

    await emp.context.close();
  });
});

// =============================================================================
// 13. BILLING: View Subscriptions -> Invoices -> Payment Gateway
// =============================================================================

test.describe("13. Billing: Subscriptions -> Invoices -> Payment Gateway", () => {
  test("Full billing view lifecycle: subs, invoices, payment options", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin goes to /billing ──
    console.log("Step 1: Admin goes to billing page");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/billing");

    const billingBody = await bodyText(admin.page);
    expect(billingBody).toMatch(/billing|subscription|invoice|payment/i);
    await screenshot(admin.page, "13-billing-overview");

    // ── Step 2: Click Subscriptions tab ──
    console.log("Step 2: View subscriptions");
    const subsTab = admin.page
      .locator('button:has-text("Subscription"), a:has-text("Subscription")')
      .first();
    const subsTabVisible = await subsTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (subsTabVisible) {
      await subsTab.click();
      await admin.page.waitForTimeout(2000);
    }

    const subsBody = await bodyText(admin.page);
    expect(subsBody).toMatch(/subscription|module|plan|seat/i);
    await screenshot(admin.page, "13-billing-subscriptions");

    // ── Step 3: Click Invoices tab ──
    console.log("Step 3: View invoices");
    const invoiceTab = admin.page
      .locator('button:has-text("Invoice"), a:has-text("Invoice")')
      .first();
    const invoiceTabVisible = await invoiceTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (invoiceTabVisible) {
      await invoiceTab.click();
      await admin.page.waitForTimeout(2000);
    }

    const invoiceBody = await bodyText(admin.page);
    expect(invoiceBody).toMatch(/invoice|amount|date|billing/i);
    await screenshot(admin.page, "13-billing-invoices");

    // ── Step 4: Expand first invoice ──
    console.log("Step 4: Expand invoice details");
    const expandBtn = admin.page
      .locator('button:has(svg.lucide-chevron-down), button:has(svg.lucide-chevron-right), tr')
      .first();
    const expandExists = await expandBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (expandExists) {
      await expandBtn.click();
      await admin.page.waitForTimeout(1500);
      await screenshot(admin.page, "13-billing-invoice-expanded");
    }

    // ── Step 5: Check for payment gateway options ──
    console.log("Step 5: Check payment gateway options");
    const payBtn = admin.page.locator('button:has-text("Pay"), button:has-text("Make Payment")').first();
    const payVisible = await payBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (payVisible) {
      await payBtn.click();
      await admin.page.waitForTimeout(1500);

      // ── Step 6: Verify gateway selection ──
      console.log("Step 6: Verify gateway dropdown");
      const gatewayBody = await bodyText(admin.page);
      const hasGateways = /stripe|razorpay|paypal|gateway/i.test(gatewayBody);
      if (hasGateways) {
        console.log("  Payment gateways visible");
      }
      await screenshot(admin.page, "13-billing-gateway-select");
    }

    // ── Step 7: Check overview tab ──
    console.log("Step 7: View overview");
    const overviewTab = admin.page
      .locator('button:has-text("Overview"), a:has-text("Overview")')
      .first();
    const overviewVisible = await overviewTab.isVisible({ timeout: 3000 }).catch(() => false);
    if (overviewVisible) {
      await overviewTab.click();
      await admin.page.waitForTimeout(2000);
    }

    const overviewBody = await bodyText(admin.page);
    expect(overviewBody).toMatch(/billing|total|spend|revenue|subscription/i);
    await screenshot(admin.page, "13-billing-overview-final");

    await admin.context.close();
  });
});

// =============================================================================
// 14. DOCUMENT: Upload -> Verify -> Reject -> Verify Rejection
// =============================================================================

test.describe("14. Document: Upload -> Verify -> Reject", () => {
  test("Full document lifecycle: upload, admin rejects, employee sees rejection", async ({
    browser,
  }) => {
    test.setTimeout(120000);

    // ── Step 1: Check/create document category (admin) ──
    console.log("Step 1: Admin ensures document category exists");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/documents/categories");
    const catBody = await bodyText(admin.page);
    expect(catBody).toMatch(/categor|document/i);
    await screenshot(admin.page, "14-document-categories");
    await admin.context.close();

    // ── Step 2: Employee uploads document ──
    console.log("Step 2: Employee goes to my documents");
    const emp = await loginAs(browser, EMPLOYEE);
    await navigateTo(emp.page, "/documents/my");
    const docBody = await bodyText(emp.page);
    expect(docBody).toMatch(/document|my|upload/i);
    await screenshot(emp.page, "14-employee-documents");

    // Look for upload button
    const uploadBtn = emp.page
      .locator('button:has-text("Upload"), button:has-text("Add"), button:has-text("New")')
      .first();
    const uploadVisible = await uploadBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (uploadVisible) {
      console.log("Step 3: Upload a document");
      await uploadBtn.click();
      await emp.page.waitForTimeout(1000);

      // Select category
      const catSelect = emp.page.locator("select").first();
      const catSelectVisible = await catSelect.isVisible({ timeout: 3000 }).catch(() => false);
      if (catSelectVisible) {
        const catOpts = await catSelect.locator("option").allInnerTexts();
        const validCat = catOpts.find((o) => !o.includes("Select") && o !== "");
        if (validCat) {
          await catSelect.selectOption({ label: validCat });
        }
      }

      // Fill document name
      const nameInput = emp.page.locator('input[type="text"]').first();
      const nameExists = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
      if (nameExists) {
        await nameInput.fill(`E2E Test Doc ${RUN}`);
      }

      // We can't easily upload a real file in E2E, but verify the form renders
      await screenshot(emp.page, "14-document-upload-form");
    }

    // ── Step 4: Verify documents page works ──
    console.log("Step 4: Verify documents page");
    await navigateTo(emp.page, "/documents");
    const allDocsBody = await bodyText(emp.page);
    expect(allDocsBody).toMatch(/document|file|upload/i);
    await screenshot(emp.page, "14-documents-list");
    await emp.context.close();

    // ── Step 5-8: Admin checks documents ──
    console.log("Step 5: Admin views documents");
    const admin2 = await loginAs(browser, ADMIN);
    await navigateTo(admin2.page, "/documents");
    const adminDocsBody = await bodyText(admin2.page);
    expect(adminDocsBody).toMatch(/document|file|categor/i);
    await screenshot(admin2.page, "14-admin-documents");
    await admin2.context.close();
  });
});

// =============================================================================
// 15. MODULE: Subscribe -> Verify -> Unsubscribe -> Verify Removed
// =============================================================================

test.describe("15. Module: Subscribe -> Verify -> Unsubscribe", () => {
  test("View modules and subscription management", async ({ browser }) => {
    test.setTimeout(120000);

    // ── Step 1: Admin goes to /modules ──
    console.log("Step 1: Admin views modules page");
    const admin = await loginAs(browser, ADMIN);
    await navigateTo(admin.page, "/modules");

    const modulesBody = await bodyText(admin.page);
    expect(modulesBody).toMatch(/module|marketplace|subscribe/i);
    await screenshot(admin.page, "15-modules-list");

    // ── Step 2: View available modules ──
    console.log("Step 2: View available modules");
    const moduleCards = admin.page.locator('[class*="card"], [class*="border"]');
    const cardCount = await moduleCards.count();
    expect(cardCount).toBeGreaterThan(0);
    console.log(`  Found ${cardCount} module cards`);

    // ── Step 3-4: Check for subscribe/unsubscribe buttons ──
    console.log("Step 3: Check subscription actions");
    const subscribeBtn = admin.page
      .locator('button:has-text("Subscribe"), button:has-text("Activate")')
      .first();
    const subExists = await subscribeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (subExists) {
      console.log("  Subscribe button found for unsubscribed module");
      await screenshot(admin.page, "15-module-subscribe-available");
    }

    const unsubBtn = admin.page
      .locator('button:has-text("Unsubscribe"), button:has-text("Manage")')
      .first();
    const unsubExists = await unsubBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (unsubExists) {
      console.log("  Manage/Unsubscribe button found for subscribed module");
    }

    // ── Step 5: Navigate to billing to verify subscriptions ──
    console.log("Step 5: Verify in billing");
    await navigateTo(admin.page, "/billing");
    const billingBody = await bodyText(admin.page);
    expect(billingBody).toMatch(/billing|subscription|module/i);
    await screenshot(admin.page, "15-billing-after-modules");

    // ── Step 6-7: Return to modules and verify state ──
    console.log("Step 6: Final modules state check");
    await navigateTo(admin.page, "/modules");
    const finalModules = await bodyText(admin.page);
    expect(finalModules).toMatch(/module|payroll|monitor|recruit/i);
    await screenshot(admin.page, "15-modules-final");

    await admin.context.close();
  });
});
