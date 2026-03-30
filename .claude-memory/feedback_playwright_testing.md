---
name: Use Playwright for E2E and functional testing
description: Whenever user asks for end-to-end or functional testing, always use Playwright browser tests
type: feedback
---

Whenever the user asks to do end-to-end testing or functional testing, always use Playwright (real browser automation). Never substitute with curl simulations.

**Why:** curl can only test API responses, not actual browser behavior (JS execution, redirects, cookie handling, CORS, rendering). The user wants real browser verification.

**How to apply:**
- Write Playwright specs in `e2e/` directory of empcloud repo
- Use `npx playwright test e2e/<spec>.spec.ts` to run
- Playwright config is at `playwright.config.ts` (headless Chromium, 1440x900)
- Take screenshots as evidence
- Login pattern: fill email/password inputs, click submit, waitForURL
- Existing SSO test: `e2e/sso-launch.spec.ts` — covers all 8 modules
