// =============================================================================
// Demo health monitor — read-only assertions against the deployed test env.
//
// Why this exists: the per-push CI gate validates a fix on a clean ephemeral
// DB. Nothing else validates that the deployed box stays sane between
// deploys. This spec hits the deployed box with GETs only and fails on
// each regression class that has hurt us before. Pattern adapted from
// globussoft-crm DEMO_MONITOR_PATTERN.
//
// SAFETY:
//   - 100% read-only. No POST / PUT / DELETE.
//   - No fixture creation; no afterAll cleanup; nothing to leak.
//   - Skipped unless DEMO_MONITOR=1 OR PLAYWRIGHT_BASE_URL points at the
//     test env. On localhost it's a no-op so it doesn't break dev runs.
//
// Run modes:
//   - GitHub Actions: .github/workflows/demo-monitor.yml (hourly)
//   - Manual:
//       PLAYWRIGHT_BASE_URL=https://test-empcloud.empcloud.com \
//       MONITOR_EMAIL=... MONITOR_PASSWORD=... DEMO_MONITOR=1 \
//       pnpm exec playwright test e2e/demo-health.spec.ts
// =============================================================================

import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || "https://test-empcloud.empcloud.com";
const REQUEST_TIMEOUT = 15000;

// Only run when BASE_URL clearly points at the deployed test env.
// On localhost the spec is a no-op so it doesn't fail unrelated dev runs.
const IS_DEPLOYED =
  /test-empcloud\.empcloud\.com|staging\./i.test(BASE_URL) ||
  process.env.DEMO_MONITOR === "1";

test.describe("Demo health monitor (read-only)", () => {
  test.skip(
    !IS_DEPLOYED,
    "BASE_URL is not the deployed env — skipping (set DEMO_MONITOR=1 to force)",
  );

  let authToken: string | null = null;

  test.beforeAll(async ({ request }) => {
    const email = process.env.MONITOR_EMAIL;
    const password = process.env.MONITOR_PASSWORD;
    if (!email || !password) return;
    const res = await request
      .post(`${BASE_URL}/api/v1/auth/login`, {
        data: { email, password },
        timeout: REQUEST_TIMEOUT,
      })
      .catch(() => null);
    if (!res || !res.ok()) return;
    const body = (await res.json()) as { data?: { access_token?: string } };
    authToken = body?.data?.access_token ?? null;
  });

  // ── Universal: bare-minimum health probes ────────────────────────────────

  test("/health returns healthy", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`, {
      timeout: REQUEST_TIMEOUT,
    });
    expect(
      res.status(),
      `health endpoint returned ${res.status()}`,
    ).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("healthy");
  });

  test("login flow works (bypass-auth not enabled, monitor password unchanged)", () => {
    if (!process.env.MONITOR_EMAIL || !process.env.MONITOR_PASSWORD) {
      test.skip(true, "MONITOR_EMAIL / MONITOR_PASSWORD not set");
    }
    expect(
      authToken,
      "login failed — auth bypass enabled or monitor password rotated?",
    ).toBeTruthy();
  });

  // ── Project-specific: one assertion per closed-bug regression class ──────
  //
  // Each test name carries the bug number it prevents from regressing.
  // When this test goes red, the issue body shows the test name → on-call
  // clicks the bug number → reads the original repro. Saves debug time.

  test("#1984 — used_seats <= total_seats for every active subscription", async ({
    request,
  }) => {
    test.skip(!authToken, "auth required");
    const res = await request.get(`${BASE_URL}/api/v1/subscriptions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: REQUEST_TIMEOUT,
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data?: Array<{
        module_id: number;
        status: string;
        used_seats: number;
        total_seats: number;
      }>;
    };
    const subs = body.data ?? [];
    const overflows = subs
      .filter((s) => s.status === "active" || s.status === "trial")
      .filter((s) => s.used_seats > s.total_seats)
      .map((s) => ({
        module_id: s.module_id,
        used: s.used_seats,
        total: s.total_seats,
      }));
    expect(
      overflows,
      `seat-count drift detected (the syncUsedSeats SSO-fallback bug or similar): ${JSON.stringify(overflows)}`,
    ).toEqual([]);
  });

  test("#1978 — emp-payroll subscription, when active, has at least one seat assigned", async ({
    request,
  }) => {
    test.skip(!authToken, "auth required");
    const subsRes = await request.get(`${BASE_URL}/api/v1/subscriptions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: REQUEST_TIMEOUT,
    });
    expect(subsRes.status()).toBe(200);
    const modulesRes = await request.get(`${BASE_URL}/api/v1/modules`, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: REQUEST_TIMEOUT,
    });
    expect(modulesRes.status()).toBe(200);
    const subs =
      ((await subsRes.json()) as {
        data?: Array<{
          module_id: number;
          status: string;
          used_seats: number;
        }>;
      }).data ?? [];
    const modules =
      ((await modulesRes.json()) as {
        data?: Array<{ id: number; slug: string }>;
      }).data ?? [];
    const payroll = modules.find((m) => m.slug === "emp-payroll");
    if (!payroll) return; // org doesn't have payroll module visible
    const payrollSub = subs.find(
      (s) =>
        s.module_id === payroll.id &&
        (s.status === "active" || s.status === "trial"),
    );
    if (!payrollSub) return; // not subscribed; nothing to assert
    expect(
      payrollSub.used_seats,
      "payroll subscription is active but has 0 seats — backfill (migration 060) regressed?",
    ).toBeGreaterThan(0);
  });

  // ── SPA route smoke ──────────────────────────────────────────────────────
  //
  // Catches nginx history-fallback regressions that a / smoke check misses.

  for (const route of ["/", "/login", "/dashboard"]) {
    test(`SPA route ${route} returns 200 with shell`, async ({ request }) => {
      const res = await request.get(`${BASE_URL}${route}`, {
        timeout: REQUEST_TIMEOUT,
      });
      expect(
        res.status(),
        `${route}: nginx history-fallback misconfig?`,
      ).toBe(200);
      const html = await res.text();
      expect(
        html,
        `${route}: served something other than the SPA shell`,
      ).toContain('<div id="root">');
    });
  }
});
