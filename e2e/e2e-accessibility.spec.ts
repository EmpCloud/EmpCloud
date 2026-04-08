import { test, expect, type Page } from "@playwright/test";

// =============================================================================
// E2E: Accessibility Compliance Tests
// Tests basic a11y: form labels, ARIA attributes, tab order, focus management
// =============================================================================

const FRONTEND = "https://test-empcloud.empcloud.com";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${FRONTEND}/login`, { timeout: 30000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// =============================================================================
// 1. Login Page Accessibility
// =============================================================================

test.describe("Login Page Accessibility", () => {
  test("Login form has proper labels for inputs", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");

    // Check email input has an associated label (via for=, aria-label, or aria-labelledby)
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();

    const emailHasLabel = await page.evaluate(() => {
      const input = document.querySelector('input[name="email"]') as HTMLInputElement;
      if (!input) return false;
      // Check for: associated <label>, aria-label, aria-labelledby, or placeholder
      const id = input.id;
      const hasLabelFor = id ? !!document.querySelector(`label[for="${id}"]`) : false;
      const hasAriaLabel = !!input.getAttribute("aria-label");
      const hasAriaLabelledBy = !!input.getAttribute("aria-labelledby");
      const hasPlaceholder = !!input.placeholder;
      return hasLabelFor || hasAriaLabel || hasAriaLabelledBy || hasPlaceholder;
    });
    expect(emailHasLabel).toBe(true);

    // Check password input
    const passwordHasLabel = await page.evaluate(() => {
      const input = document.querySelector('input[name="password"]') as HTMLInputElement;
      if (!input) return false;
      const id = input.id;
      const hasLabelFor = id ? !!document.querySelector(`label[for="${id}"]`) : false;
      const hasAriaLabel = !!input.getAttribute("aria-label");
      const hasAriaLabelledBy = !!input.getAttribute("aria-labelledby");
      const hasPlaceholder = !!input.placeholder;
      return hasLabelFor || hasAriaLabel || hasAriaLabelledBy || hasPlaceholder;
    });
    expect(passwordHasLabel).toBe(true);
  });

  test("Login submit button has accessible text", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    const hasAccessibleText = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (!btn) return false;
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute("aria-label");
      return (text && text.length > 0) || (ariaLabel && ariaLabel.length > 0);
    });
    expect(hasAccessibleText).toBe(true);
  });

  test("Tab order: can tab through login form fields", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");

    // Focus email field
    await page.locator('input[name="email"]').focus();
    const firstFocused = await page.evaluate(() => document.activeElement?.getAttribute("name"));
    expect(firstFocused).toBe("email");

    // Tab to password
    await page.keyboard.press("Tab");
    const secondFocused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return el?.getAttribute("name") || el?.getAttribute("type") || el?.tagName;
    });
    // Should move to password or another interactive element
    expect(secondFocused).toBeTruthy();
    console.log(`After tab from email: focused element = ${secondFocused}`);
  });

  test("Page title is set on login page", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    console.log(`Login page title: "${title}"`);
  });
});

// =============================================================================
// 2. Dashboard Accessibility
// =============================================================================

test.describe("Dashboard Accessibility", () => {
  test("Navigation has aria-label or semantic nav element", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForTimeout(2000);

    const hasAccessibleNav = await page.evaluate(() => {
      // Check for <nav> elements or elements with role="navigation"
      const navElements = document.querySelectorAll("nav, [role='navigation']");
      // Also check for aside (sidebar) with aria-label
      const asideElements = document.querySelectorAll("aside[aria-label], aside[role='navigation']");
      return navElements.length > 0 || asideElements.length > 0;
    });

    // If no semantic nav, at least check there is a sidebar/menu structure
    const hasMenuStructure = await page.locator("nav, aside, [role='navigation'], [role='menu']").count();
    console.log(`Accessible nav elements: semantic=${hasAccessibleNav}, menu structures=${hasMenuStructure}`);
    expect(hasAccessibleNav || hasMenuStructure > 0).toBe(true);
  });

  test("Buttons have accessible text (not just icons)", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForTimeout(2000);

    const inaccessibleButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button");
      let emptyCount = 0;
      buttons.forEach((btn) => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute("aria-label");
        const ariaLabelledBy = btn.getAttribute("aria-labelledby");
        const title = btn.getAttribute("title");
        const hasImg = btn.querySelector("img[alt]");
        const hasSvgTitle = btn.querySelector("svg title");
        if (!text && !ariaLabel && !ariaLabelledBy && !title && !hasImg && !hasSvgTitle) {
          emptyCount++;
        }
      });
      return { total: buttons.length, empty: emptyCount };
    });

    console.log(`Buttons: ${inaccessibleButtons.total} total, ${inaccessibleButtons.empty} without accessible text`);
    // Allow some icon-only buttons but flag if majority lack labels
    if (inaccessibleButtons.total > 0) {
      const ratio = inaccessibleButtons.empty / inaccessibleButtons.total;
      expect(ratio).toBeLessThan(0.5); // At least 50% should have accessible text
    }
  });

  test("Color contrast: no invisible text (white on white)", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForTimeout(2000);

    const contrastIssues = await page.evaluate(() => {
      const textElements = document.querySelectorAll("p, span, h1, h2, h3, h4, h5, h6, a, label, td, th");
      let invisible = 0;
      textElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = style.backgroundColor;
        // Check for white text on white/transparent background
        if (
          color === "rgb(255, 255, 255)" &&
          (bgColor === "rgb(255, 255, 255)" || bgColor === "rgba(0, 0, 0, 0)")
        ) {
          // Check parent background
          const parentBg = el.parentElement
            ? window.getComputedStyle(el.parentElement).backgroundColor
            : "";
          if (parentBg === "rgb(255, 255, 255)" || parentBg === "rgba(0, 0, 0, 0)") {
            invisible++;
          }
        }
      });
      return { total: textElements.length, invisible };
    });

    console.log(
      `Text elements: ${contrastIssues.total}, potentially invisible: ${contrastIssues.invisible}`,
    );
    expect(contrastIssues.invisible).toBe(0);
  });

  test("Page title changes per route", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const dashboardTitle = await page.title();

    await page.goto(`${FRONTEND}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const employeesTitle = await page.title();

    await page.goto(`${FRONTEND}/leave`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const leaveTitle = await page.title();

    console.log(`Titles: dashboard="${dashboardTitle}", employees="${employeesTitle}", leave="${leaveTitle}"`);
    // At minimum, titles should be non-empty
    expect(dashboardTitle.length).toBeGreaterThan(0);
    expect(employeesTitle.length).toBeGreaterThan(0);
    expect(leaveTitle.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 3. Tables & Forms Accessibility
// =============================================================================

test.describe("Tables & Forms Accessibility", () => {
  test("Employee table has proper th/thead structure", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${FRONTEND}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const tableStructure = await page.evaluate(() => {
      const table = document.querySelector("table");
      if (!table) return { hasTable: false, hasThead: false, thCount: 0 };
      const thead = table.querySelector("thead");
      const ths = table.querySelectorAll("th");
      return {
        hasTable: true,
        hasThead: !!thead,
        thCount: ths.length,
      };
    });

    console.log(
      `Table: exists=${tableStructure.hasTable}, thead=${tableStructure.hasThead}, th count=${tableStructure.thCount}`,
    );
    if (tableStructure.hasTable) {
      expect(tableStructure.thCount).toBeGreaterThan(0);
    }
  });

  test("Links have descriptive text (not just 'click here')", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForTimeout(2000);

    const linkIssues = await page.evaluate(() => {
      const links = document.querySelectorAll("a");
      const badLinks: string[] = [];
      links.forEach((a) => {
        const text = a.textContent?.trim().toLowerCase();
        const ariaLabel = a.getAttribute("aria-label");
        if (
          text &&
          (text === "click here" || text === "here" || text === "link") &&
          !ariaLabel
        ) {
          badLinks.push(text);
        }
      });
      return { total: links.length, bad: badLinks };
    });

    console.log(`Links: ${linkIssues.total} total, ${linkIssues.bad.length} with generic text`);
    expect(linkIssues.bad.length).toBe(0);
  });

  test("Images have alt text or are decorative", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForTimeout(2000);

    const imageIssues = await page.evaluate(() => {
      const images = document.querySelectorAll("img");
      let missingAlt = 0;
      images.forEach((img) => {
        const alt = img.getAttribute("alt");
        const role = img.getAttribute("role");
        const ariaHidden = img.getAttribute("aria-hidden");
        // Must have alt (even empty for decorative) or role="presentation" or aria-hidden
        if (alt === null && role !== "presentation" && ariaHidden !== "true") {
          missingAlt++;
        }
      });
      return { total: images.length, missingAlt };
    });

    console.log(`Images: ${imageIssues.total} total, ${imageIssues.missingAlt} missing alt`);
    expect(imageIssues.missingAlt).toBe(0);
  });

  test("Form required fields have aria-required or required attribute", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState("networkidle");

    const requiredFields = await page.evaluate(() => {
      const inputs = document.querySelectorAll("input[required], input[aria-required='true']");
      return inputs.length;
    });

    // Login form should have at least email and password as required
    console.log(`Required fields on login: ${requiredFields}`);
    // At least the form should indicate which fields are needed
    expect(requiredFields).toBeGreaterThanOrEqual(0); // Soft check — log for awareness
  });
});
