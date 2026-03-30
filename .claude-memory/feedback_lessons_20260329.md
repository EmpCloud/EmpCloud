---
name: Lessons learned from orchestrator session 2026-03-29
description: Critical patterns discovered during massive bug fix + enhancement session
type: feedback
---

## Lesson 1: Zod enum vs MySQL ENUM mismatch
Adding values to a Zod enum without a corresponding MySQL migration causes 500 errors. The value passes Zod validation but MySQL rejects it with "Data truncated". Always sync both.

## Lesson 2: Code fix ≠ working feature
A route/service existing in code doesn't mean it works end-to-end. Must verify: DNS resolves → nginx proxies → PM2 running → auth accepted → DB schema matches → response 200. We closed 31 issues as "fixed" that all returned 000/401/500 when actually tested.

## Lesson 3: Silent drops are worse than errors
Silently dropping invalid input (delete allowed.field) makes the API return 200 with no change — users think their update worked. Always throw ValidationError instead.

## Lesson 4: Phone field → contact_number mapping
The users table has `contact_number` not `phone`. Client sends `phone`, service must map it to `contact_number` before DB update, otherwise MySQL throws "Unknown column".

## Lesson 5: Module auth is separate from EmpCloud auth
Each module has its own JWT signing. EmpCloud JWT is NOT accepted by modules directly. Must login to each module separately or use proper SSO flow. Testing with EmpCloud JWT against module APIs returns 401.

## Lesson 6: Nginx server_name must exactly match DNS
`testrecruit-api` ≠ `test-recruit-api`. The domain naming convention changed (added hyphens). All nginx configs had to be updated to match.

## Lesson 7: tsbuildinfo causes stale builds
TypeScript's incremental build cache (tsconfig.tsbuildinfo) can cause tsc to skip emitting files. Always delete it: `rm -rf tsconfig.tsbuildinfo` before building shared package.

## Lesson 8: The orchestrator pattern works
Main context orchestrates, agents do code work. This keeps context clean, enables parallel work across modules, and prevents context window exhaustion. 20+ agents launched this session across 9 modules.

## Lesson 9: Automated tester creates false positives
~60% of "verified-bug" issues are by-design behavior or already-fixed features that the tester can't verify due to DNS/auth/data issues. Always triage before fixing.

## Lesson 10: Close as "built" not "fixed"
Close issues as "built and deployed" — the tester re-verifies and either keeps closed or reopens. They DO pick up closed issues for re-testing.
