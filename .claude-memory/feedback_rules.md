---
name: All feedback rules consolidated
description: Master list of all user preferences, workflow rules, and coding guidelines
type: feedback
---

## Critical Rules

1. **Always get approval before coding.** Present plans first, wait for explicit "yes" before writing any code.
2. **Main context is ORCHESTRATOR.** Use agents for all code work. Never fix code directly in main context.
3. **Never close a bug without proof.** Run actual tests (Playwright or curl) and show evidence before closing.
4. **Always deploy + test + verify with Playwright** after every code change. No exceptions.
5. **E2E tests = Playwright .spec.ts files.** Never curl for E2E testing. Write Playwright specs.
6. **Browser tests must login via real login page.** Never use localStorage hacks. Login through the form, navigate from dashboard.

## Server & Deploy Rules

7. **Always use paramiko + password for SSH.** No SSH keys exist. Never use `ssh -i`. Server: 163.227.174.141, user: empcloud-development.
8. **Every deploy must purge tsx cache.** `pm2 delete <name> && rm -rf ~/.cache/tsx && pm2 start ecosystem.config.js --only <name> && pm2 save`
9. **Never edit on server.** Edit local → push GitHub → pull on server.
10. **Always test via public HTTPS URLs** (test-*.empcloud.com), never localhost.
11. **Remove all rate limits during active development.** Testing gets blocked by rate limits.
12. **Module SSO needs EmpCloud public key in ROOT .env** (not packages/server/.env). Use absolute paths for .pem files.

## GitHub Rules

13. **When fixing issues:** Comment fix details + commit ID on issue before closing.
14. **One agent per module at a time.** Bugs first, then enhancements. Never parallel on same module.
15. **Agents sign comments:** "bug fix agent", "implementation agent", or "coding agent".
16. **Always check IMPLEMENTATIONS.md before coding.** Never duplicate existing features.

## Coding Rules

17. **5-step debugging checklist:** PM2 status → logs → port check → nginx → local curl before fixing.
18. **Shared package must be rebuilt** after adding new exports (`pnpm build` in packages/shared).
19. **Module slugs matter** — check exact DB values (`emp-projects` not `projects`).
