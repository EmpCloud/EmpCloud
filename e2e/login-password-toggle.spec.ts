import { test, expect } from "@playwright/test";

const CLOUD = "https://test-empcloud.empcloud.com";

test("Password visibility toggle works on login form", async ({ page }) => {
  await page.goto(CLOUD + "/login");

  const passwordInput = page.locator('input[name="password"]');
  const toggleButton = page.locator('input[name="password"] + button, input[name="password"] ~ button').first();

  // Initially password field should be type="password"
  await expect(passwordInput).toHaveAttribute("type", "password");
  console.log("Initial state: password is hidden (type=password)");

  // Click the toggle button
  await toggleButton.click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  console.log("After click: password is visible (type=text)");

  await page.screenshot({ path: "e2e/screenshots/login-password-visible.png" });

  // Click again to hide
  await toggleButton.click();
  await expect(passwordInput).toHaveAttribute("type", "password");
  console.log("After second click: password is hidden again (type=password)");

  await page.screenshot({ path: "e2e/screenshots/login-password-hidden.png" });

  console.log("PASS: Password visibility toggle works correctly");
});
