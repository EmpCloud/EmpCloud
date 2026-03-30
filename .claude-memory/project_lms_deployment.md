---
name: LMS Deployment & Integration Details
description: EMP LMS deployment to test server, SSO integration status, code fixes applied, module registration in EMP Cloud
type: project
---

## LMS Deployment (completed 2026-03-24)

### Live URLs
- **Frontend**: https://testlms.empcloud.com
- **API**: https://testlms-api.empcloud.com/health
- **SSL**: Let's Encrypt, expires 2026-06-21, auto-renew via Certbot

### What was deployed
- Cloned from github.com/EmpCloud/emp-lms
- pnpm install, DB migrations (27 tables), seeded demo data
- Client built with `VITE_API_URL=https://testlms-api.empcloud.com/api/v1`
- PM2 process: `emp-lms` on port 4700
- Nginx: `/etc/nginx/sites-enabled/emp-lms.conf`

### SSO Status: ALREADY IMPLEMENTED
- Server: `POST /api/v1/auth/sso` — accepts EmpCloud RS256 JWT, issues LMS HS256 JWT
- Client: `SSOGate` component in `App.tsx` — extracts `?sso_token=` from URL
- Connects to `empcloud` DB for user/org validation via separate Knex connection

### Code Fixes Applied (local + server)
1. `packages/server/src/db/migrate.ts` — Added KnexAdapter initialization (was calling getKnex() without connecting)
2. `packages/server/src/db/seed.ts` — Same fix + replaced `new Date().toISOString()` with `new Date()` (MySQL strict mode)
3. `packages/server/src/api/routes/video.routes.ts` — Changed `/:path(*)` to `/:videoPath` (Express 5 / path-to-regexp v8 compatibility)

### EMP Cloud Integration (local changes, not yet deployed to server)
1. `packages/shared/src/constants/index.ts` — Added `emp-lms` to DEFAULT_MODULES (now 10 sellable)
2. `packages/server/src/db/seed.ts` — Added 6 LMS feature tiers + OAuth client registration
3. `packages/server/src/services/dashboard/widget.service.ts` — Added LMS widget endpoint (port 4700)
4. `packages/client/src/pages/dashboard/DashboardPage.tsx` — Added LMS widget (GraduationCap icon, courses/enrollments/completion)
5. MySQL `empcloud.modules` table on server — row added (id: 10, slug: emp-lms, base_url: https://testlms.empcloud.com)

### Note
The EMP Cloud local code changes (items 1-4 above) need to be deployed to the test server to make the LMS appear in the dashboard and marketplace. The DB row (item 5) is already on the server.

**How to apply:** When resuming work, deploy the updated EMP Cloud code to the test server so the dashboard shows the LMS module with Launch/Subscribe buttons.
