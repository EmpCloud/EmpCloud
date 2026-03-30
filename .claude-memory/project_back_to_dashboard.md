---
name: Back to EMP Cloud Dashboard feature
description: "← EMP Cloud" header button implemented in all 10 modules for SSO return navigation
type: project
---

## Back to EMP Cloud Dashboard — Implemented 2026-03-30

### How it works
1. EMP Cloud launcher appends `&return_url=<origin>/dashboard` to SSO URLs
2. Each module's SSO handler stores `empcloud_return_url` in localStorage
3. A `BackToDashboard` / `BackToCloud` component in the header bar renders `← EMP Cloud` link
4. Only visible when user arrived via SSO (`sso_source` in localStorage)
5. Click navigates back to EMP Cloud dashboard

### Files changed per module

**EMP Cloud (launcher):**
- `packages/client/src/components/dashboard/WidgetCard.tsx` — adds `&return_url=` to SSO URL
- `packages/client/src/pages/dashboard/DashboardPage.tsx` — same

**Standard Vite modules (Payroll, Performance, Rewards, Recruit, Exit, LMS):**
- `packages/client/src/lib/auth-store.ts` — store return URL on SSO
- `packages/client/src/components/BackToDashboard.tsx` — new component
- `packages/client/src/components/layout/DashboardLayout.tsx` — render in header

**Billing:**
- `packages/client/src/App.tsx` — SSO detection + localStorage
- `packages/client/src/components/common/BackToCloud.tsx` — new component
- `packages/client/src/components/layout/DashboardLayout.tsx` — render in header

**Monitor:**
- `Frontend/src/components/SSOGate.jsx` — store return URL
- `Frontend/src/components/BackToCloud.jsx` — new component
- `Frontend/src/page/protected/admin/layout/TopBar.jsx` — render in header
- `Frontend/src/page/protected/non-admin/layout/TopBar.jsx` — render in header
- `Frontend/src/page/protected/employee/layout/TopBar.jsx` — render in header

**Projects (Next.js):**
- `packages/client/src/helper/sso.ts` — store return URL
- `packages/client/src/components/BackToCloud.tsx` — new component (SSR-safe with useEffect)
- `packages/client/src/section/topbar.tsx` — render in header

### Playwright test
- `e2e/e2e-back-to-dashboard.spec.ts` — 14 tests covering SSO flow, frontend serving, bundle verification, health checks

**Why:** User needed one-click navigation back to EMP Cloud from any module dashboard.
**How to apply:** When adding new modules, follow the same pattern — store return URL in SSO handler, add BackToCloud component to header.
