---
name: No rate limits in development
description: Remove all rate limiting during active development — testing gets blocked by auth limiters
type: feedback
---

Remove all rate limits during active development. We are in active dev/testing mode and rate limiters block rapid testing (e.g., SSO endpoint testing hit 50 req/15min limit on LMS).

**Why:** Rate limiting causes false failures during testing. Dev environment doesn't need abuse protection.

**How to apply:** Set `RATE_LIMIT_DISABLED=true` on all module servers, or remove rate limiter middleware entirely. Apply to EMP Cloud AND all sub-modules (Payroll, Recruit, Performance, Rewards, Exit, LMS, Billing, Projects, Monitor).
