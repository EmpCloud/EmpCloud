---
name: All learnings consolidated (2026-03-29 + 2026-03-30)
description: 25 key lessons from two major sessions — deployment, debugging, integration patterns
type: feedback
---

## Key Lessons

### Deployment
1. **PM2 ecosystem config is mandatory.** Without it, every restart uses wrong ports. File: `/home/empcloud-development/ecosystem.config.js`
2. **tsx cache must be purged** on every deploy — old code runs despite git pull.
3. **Shared package must be rebuilt** after adding new Zod schemas/types.
4. **empmonitor directory is `empmonitor`** (no hyphen), unlike other `emp-<name>` modules.
5. **Client frontend must be built** (`npm run build`) — Vite SPA serves from `dist/`.
6. **dotenv loads from `../../.env`** relative to CWD — put env vars in ROOT .env, not packages/server/.env.

### Database & Schema
7. **Zod schemas must match MySQL columns.** Mismatch = silent 500 errors.
8. **BIGINT UNSIGNED overflow** when subtracting — use `CAST(column AS SIGNED)`.
9. **MySQL JSON columns** need `JSON.stringify()` before insert.
10. **MySQL DATETIME columns** need `new Date()` wrapper for ISO strings.
11. **Module slugs** — always check exact DB values before writing SQL queries.
12. **MongoDB plan documents** must exist for every plan name used in code.

### Auth & SSO
13. **SSO token expiry** — add grace period (1 hour) since SSO is about identity, not session.
14. **RS256 public key** must be configured in modules that verify EmpCloud tokens.
15. **React Router v6** — call `{AppRoutes()}` not `<AppRoutes />` inside `<Routes>`.

### Testing
16. **Playwright API tests** — 307 tests run in 29 seconds. Use `request` fixture.
17. **Test assertions must match actual API field names** — check Zod schemas first.
18. **Generic try/catch errors hide real bugs** — always log the actual error.
19. **code ≠ working** — always test the deployed code, never assume it works.

### Integration
20. **BILLING_API_KEY** must be shared between EmpCloud and Billing module.
21. **Webhook endpoints** must exist for cross-module communication.
22. **Dependabot PRs** — merge newest first, close conflicting older ones.
23. **GitHub Actions secrets** must be configured for auto-deploy workflows.
24. **NestJS on Node 24** — removed `util.isObject` etc. need polyfills.
25. **connect-redis v7** — uses `{ RedisStore }` import, not factory function.
