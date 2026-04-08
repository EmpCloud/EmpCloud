import { test, expect } from '@playwright/test';

const BASE = 'https://test-empcloud.empcloud.com';

async function loginAndGoToPolicies(page: any) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('/login')) {
    await page.goto(`${BASE}/policies`);
    await page.waitForLoadState('networkidle');
    return;
  }
  await page.fill('input[type="email"], input[name="email"]', 'ananya@technova.in');
  await page.fill('input[type="password"], input[name="password"]', process.env.TEST_USER_PASSWORD || 'Welcome@123');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Welcome back', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.goto(`${BASE}/policies`);
  await page.waitForLoadState('networkidle');
}

test.describe('Policies Page — UI Verification', () => {

  test('policies page loads with table', async ({ page }) => {
    await loginAndGoToPolicies(page);
    await expect(page.locator('h1')).toContainText('Policies', { timeout: 15000 });
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    const rowCount = await page.locator('tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
    await page.screenshot({ path: 'e2e/screenshots/policies-table.png' });
  });

  test('View button exists and is clickable', async ({ page }) => {
    await loginAndGoToPolicies(page);
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
    const viewBtn = page.locator('button:has-text("View")').first();
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    // After clicking, new content should appear on the page
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/policies-after-view-click.png' });
  });

  test('Acks button exists and shows acknowledgments', async ({ page }) => {
    await loginAndGoToPolicies(page);
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
    const acksBtn = page.locator('button:has-text("Acks")').first();
    await expect(acksBtn).toBeVisible();
    await acksBtn.click();
    await page.waitForTimeout(1000);
    // Should see "Acknowledgments" text somewhere on page
    await expect(page.locator('text=Acknowledgments')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/policies-after-acks-click.png' });
  });

  test('close button (✕) exists in opened panel', async ({ page }) => {
    await loginAndGoToPolicies(page);
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
    await page.locator('button:has-text("View")').first().click();
    await page.waitForTimeout(1000);
    const closeBtn = page.locator('button:has-text("✕")');
    await expect(closeBtn.first()).toBeVisible({ timeout: 5000 });
    await closeBtn.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/policies-after-close.png' });
  });
});
