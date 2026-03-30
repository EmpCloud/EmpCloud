---
name: No rate limits anywhere in dev/test mode
description: RULE — in dev mode, disable ALL rate limiting across ALL modules. Rate limits block testing.
type: feedback
---

In development/test mode, there should be ZERO rate limits on ANY API endpoint in ANY module.

**Why:** Rate limits repeatedly block testing — SSO calls, Playwright tests, rapid API calls all hit limits and return 429.

**How to apply:**
- Every module must check `RATE_LIMIT_DISABLED=true` or `NODE_ENV !== 'production'` before applying rate limits
- Set `RATE_LIMIT_DISABLED=true` in ALL module .env files on the test server
- When building new modules, add the check in the rate limiter middleware:
  ```typescript
  if (process.env.RATE_LIMIT_DISABLED === "true") return next();
  ```
