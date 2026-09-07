import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "";
const SUPER_ADMIN = {
  email: "admin@empcloud.com",
  password: process.env.TEST_SUPER_ADMIN_PASSWORD || "",
};

test("super admin can see tenant login and overdue-payment controls", async ({ page }) => {
  test.skip(
    !BASE_URL || !SUPER_ADMIN.password,
    "PLAYWRIGHT_BASE_URL and TEST_SUPER_ADMIN_PASSWORD are required for real-login UI verification",
  );
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="email"]').fill(SUPER_ADMIN.email);
  await page.locator('input[type="password"]').fill(SUPER_ADMIN.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?:\/|$)/);

  await page.goto(`${BASE_URL}/admin/organizations`);
  await expect(page.getByRole("heading", { name: /organizations/i })).toBeVisible();
  await expect(
    page.getByText("Some organization analytics could not be loaded. Existing data may be incomplete."),
  ).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /^Login:/ }).first()).toBeVisible();
  await expect(page.getByRole("switch", { name: /^Overdue gate:/ }).first()).toBeVisible();
});
