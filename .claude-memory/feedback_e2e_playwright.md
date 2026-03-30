---
name: E2E tests must use Playwright
description: When user asks for end-to-end testing, always use Playwright (not curl). Write .spec.ts files and run with npx playwright test.
type: feedback
---

When user asks for "end to end test" or "E2E test", ALWAYS use Playwright to write and run tests — never curl commands.

**Why:** User explicitly requires Playwright for all E2E/functional testing. Curl-based API testing is not acceptable as the E2E approach.

**How to apply:**
- Write Playwright .spec.ts test files in the e2e/ directory
- Use `playwright request` API context for API-level tests
- Use `playwright browser` for UI-level tests
- Run tests with `npx playwright test`
- Report results from actual Playwright test runner output
- Each module should have its own spec file
