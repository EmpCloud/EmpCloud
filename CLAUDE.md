# EMP Cloud — AI Coding Guidelines

## Project Overview
EMP Cloud is the core HRMS platform, identity server, and module gateway for the EMP ecosystem.
It serves as the OAuth2/OIDC authorization server, module registry, AND the built-in HRMS application
(employee profiles, attendance, leave, documents, announcements, company policies).
Sellable modules (Payroll, Monitor, etc.) are separate apps that connect via OAuth2.

## Tech Stack
- **Monorepo**: pnpm workspaces (packages/server, packages/client, packages/shared)
- **Backend**: Node.js 20, Express 5, TypeScript
- **Frontend**: React 19, Vite 6, TypeScript, Tailwind CSS, Radix UI
- **Database**: MySQL 8 via Knex.js
- **Cache**: Redis 7
- **Auth**: OAuth2/OIDC with RS256 JWT
- **Queue**: BullMQ

## Architecture Rules
- **EMP Cloud = Core HRMS** — Attendance, Leave, Employee Profiles, Documents, Announcements, and Policies are built into EMP Cloud, NOT separate modules
- **EMP Billing is internal** — It powers subscription invoicing; it is NOT a sellable module
- **Attendance and Leave live in EMP Cloud** — NOT in EMP Payroll. Payroll fetches attendance/leave data from EMP Cloud via service APIs
- **10 sellable modules** in the marketplace: Payroll, Monitor, Recruit, Field, Biometrics, Projects, Rewards, Performance, Exit, LMS
- EMP Cloud owns the `empcloud` database — all identity AND HRMS tables live here
- Sub-modules (payroll, monitor, etc.) have their own databases on the same MySQL instance
- Authentication is centralized — only EMP Cloud issues tokens
- JWT signing uses RS256 (asymmetric) — modules verify with the public key only
- Every database query MUST filter by `organization_id` for tenant isolation
- All monetary values stored as BIGINT (smallest currency unit)
- Adding a new module = DB rows only, zero code changes in EMP Cloud

## Module Ecosystem (12 modules)

| Module | Repo | Port | Database | Tech | Status |
|--------|------|------|----------|------|--------|
| **EMP Cloud** (Core) | EmpCloud/EmpCloud | 3000 | empcloud | Express 5 + TypeScript | Live |
| **EMP Payroll** | EmpCloud/emp-payroll | 4000 | emp_payroll | Express 5 + TypeScript | Live |
| **EMP Billing** | EmpCloud/emp-billing | 4001 | emp_billing | Express 5 + TypeScript | Live |
| **EMP Performance** | EmpCloud/emp-performance | 4300 | emp_performance | Express 5 + TypeScript | Live |
| **EMP Exit** | EmpCloud/emp-exit | 4400 | emp_exit | Express 5 + TypeScript | Live |
| **EMP Recruit** | EmpCloud/emp-recruit | 4500 | emp_recruit | Express 5 + TypeScript | Live |
| **EMP Rewards** | EmpCloud/emp-rewards | 4600 | emp_rewards | Express 5 + TypeScript | Live |
| **EMP LMS** | EmpCloud/emp-lms | 4700 | emp_lms | Express 5 + TypeScript | Live |
| **EMP Field** | EmpCloud/emp-field | 4800 | emp_field | Express 5 + TypeScript | Live (new) |
| **EMP Monitor** | EmpCloud/emp-monitor | 5000 | emp_monitor | Express 4 + JavaScript + MongoDB | Live (8 microservices) |
| **EMP Projects** | EmpCloud/emp-project | 9000/9001/3100 | MongoDB | Express 4 + Next.js | Live |
| **EMP Biometrics** | — | — | — | — | Planned |

## PM2 Ecosystem & Port Mapping

**Test Server**: 163.227.174.141 (SSH: empcloud-development, sudo available)
**Ecosystem config**: `/home/empcloud-development/ecosystem.config.js`

### Core Services

| Service | PM2 Name | Port | URL |
|---------|----------|------|-----|
| EMP Cloud Core | empcloud-server | 3000 | test-empcloud.empcloud.com / test-empcloud-api.empcloud.com |
| EMP Payroll | emp-payroll | 4000 | testpayroll.empcloud.com / testpayroll-api.empcloud.com |
| EMP Billing | emp-billing | 4001 | test-billing.empcloud.com / test-billing-api.empcloud.com |
| EMP Performance | emp-performance | 4300 | test-performance.empcloud.com / test-performance-api.empcloud.com |
| EMP Exit | emp-exit | 4400 | test-exit.empcloud.com / test-exit-api.empcloud.com |
| EMP Recruit | emp-recruit | 4500 | test-recruit.empcloud.com / test-recruit-api.empcloud.com |
| EMP Rewards | emp-rewards | 4600 | test-rewards.empcloud.com / test-rewards-api.empcloud.com |
| EMP LMS | emp-lms | 4700 | testlms.empcloud.com / testlms-api.empcloud.com |
| EMP Field | emp-field | 4800 | test-field.empcloud.com / test-field-api.empcloud.com |

### Monitor Microservices

| Service | PM2 Name | Port |
|---------|----------|------|
| Admin API | emp-monitor | 5000 |
| Desktop API | emp-monitor-desktop | 5002 |
| Realtime WS | emp-monitor-realtime | 5001 |
| Store Logs | emp-monitor-store-logs | 5003 |
| Productivity Report | emp-monitor-productivity | 5004 |
| WebSocket Server | emp-monitor-websocket | 5005 |
| Cron Jobs | emp-monitor-cronjobs | 5006 |
| Remote Socket | emp-monitor-remote | 5007 |

### Project Services

| Service | PM2 Name | Port |
|---------|----------|------|
| Project API | emp-project-api | 9000 |
| Task API | emp-project-task-api | 9001 |
| Project Client | emp-project-client | 3100 |

## Deploy Procedure

```bash
# Standard deploy (EMP Cloud or any TypeScript module)
pm2 delete <name>
rm -rf ~/.cache/tsx
pm2 start /home/empcloud-development/ecosystem.config.js --only <name>
pm2 save

# If shared package changed
cd packages/shared && pnpm build

# If frontend changed
cd packages/client && npm run build

# Full deploy (with shared + client rebuild)
git pull origin main
cd packages/shared && pnpm build
cd ../client && npm run build
pm2 delete empcloud-server && rm -rf ~/.cache/tsx
pm2 start ecosystem.config.js --only empcloud-server && pm2 save
```

**GitHub Actions auto-deploy**: Push to `main` → auto-deploys to test server (secrets: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PASSWORD)

## Key File Paths

### Server Services (packages/server/src/services/)
- `auth/` — Login, register, password reset
- `oauth/` — OAuth2 flows, token management, OIDC
- `org/` — Organization CRUD
- `user/` — User management, invitations
- `module/` — Module registry
- `subscription/` — Subscription & seat management
- `billing/` — Internal billing integration (API key: BILLING_API_KEY)
- `employee/` — Employee profiles, directory, extended data
- `employee/probation.service.ts` — Probation tracking, confirmation, extension
- `attendance/` — Shifts, check-in/out, geo-fencing, regularization
- `leave/` — Leave types, policies, balances, applications, approvals
- `document/` — Document categories, uploads, verification
- `announcement/` — Company announcements, read tracking, XSS sanitization
- `policy/` — Company policies, versioning, acknowledgments
- `admin/` — Health checks, data sanity, system notifications, audit, AI config, log dashboard

### Client Pages (packages/client/src/pages/)
- `self-service/` — Employee self-service dashboard (leave balances, attendance, documents, announcements, policies)
- `employees/` — Employee Directory, Profiles, Probation
- `attendance/` — Dashboard, Records, Shifts, Regularizations
- `leave/` — Dashboard, Applications, Calendar, Types/Policies
- `documents/` — Documents Overview, Categories
- `announcements/` — Announcements list & detail
- `policies/` — Policies with inline View/Acks floating panels
- `billing/` — Invoices, payments, gateways (proxied to EMP Billing)
- `admin/` — Health, Data Sanity, System Notifications, Platform Settings, AI Config

### Database Migrations (35 total)
- `001` — Identity (organizations, users, roles, departments, locations)
- `002` — Modules & subscriptions
- `003` — OAuth2 (clients, tokens, codes, signing keys)
- `004` — Audit logs & invitations
- `005-010` — HRMS (employees, attendance, leave, documents, announcements, policies)
- `011-034` — Features (notifications, billing, onboarding, helpdesk, surveys, positions, feedback, events, wellness, chatbot, etc.)
- `035` — **Seed 12 company policy templates** (Indian corporate policies for every new org)

## Cross-Module Integration

### SSO Flow
1. User clicks "Launch" on module card → `https://test-<module>.empcloud.com?sso_token=<RS256_JWT>&return_url=<dashboard_url>`
2. Module frontend detects `?sso_token=`, calls `POST /api/v1/auth/sso`
3. Module backend verifies RS256 signature with EmpCloud public key
4. Issues local HS256 token, stores in localStorage
5. Redirects to module dashboard
6. "← EMP Cloud" back button in header links to `return_url`

### Billing Integration
- **API Key**: `BILLING_API_KEY` in EmpCloud `.env`, `EMPCLOUD_API_KEY` in Billing `.env`
- **Webhook**: `POST /api/v1/webhooks/empcloud` in Billing for subscription events
- **Gateways**: Stripe, Razorpay, PayPal (test keys configured)
- **Flow**: Cloud creates subscription → notifies Billing → Billing creates invoice → Gateway processes payment → Billing webhooks back to Cloud

### Payroll HRMS Proxy
- EMP Payroll fetches attendance/leave data from EMP Cloud (`USE_CLOUD_HRMS=true`)
- Payroll verifies SSO tokens with EmpCloud RS256 public key (`EMPCLOUD_PUBLIC_KEY` env var, must be in ROOT .env, absolute path)

## Coding Conventions
- Use `async/await` everywhere, no raw promises
- Validate all request input with Zod schemas
- Services contain business logic, controllers are thin (validate -> service -> respond)
- All API responses use consistent `ApiResponse<T>` envelope
- Use Winston for logging, never `console.log`
- Password hashing: bcrypt with 12 rounds
- Error classes: `AppError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`
- HTML sanitization on write (announcements, policies) via `packages/server/src/utils/sanitize-html.ts`

## File Naming
- kebab-case for files: `auth.service.ts`, `org.controller.ts`
- PascalCase for React components: `DashboardPage.tsx`
- Shared types in `packages/shared/src/types/`
- Validators in `packages/shared/src/validators/`

## Testing
- **Playwright for E2E** (10 spec files, 307+ tests) — `npx playwright test e2e/e2e-*.spec.ts`
- Vitest for unit tests — `*.test.ts` alongside source
- **RULE**: Every code change → deploy → test → verify with Playwright before reporting done
- **RULE**: Browser tests must login via real login page, never localStorage hacks
- **RULE**: "End to end test" = Playwright .spec.ts files, never curl

## Working Rules
- NEVER start building from a plan without explicit user confirmation
- Present plans first, ask for approval, WAIT for "yes" before coding
- Always deploy, test, and verify with Playwright after every code change
- Use paramiko + password for SSH (no SSH keys exist)
- Every deploy must purge tsx cache (`rm -rf ~/.cache/tsx`)
- Never edit on server — edit local → push GitHub → pull on server
- Always test via public HTTPS URLs (test-*.empcloud.com), never localhost
- Remove all rate limits during active development (`RATE_LIMIT_DISABLED=true`)
- Never commit .pem, .key, .env files or secrets to git
- Never use `git add .` or `git add -A` — always add specific files by name
- We have full devops access (sudo, nginx, MySQL, PM2) — do it ourselves

## Security (SOC 2)
- Never log secrets, tokens, or passwords
- PKCE required for all public OAuth clients
- Refresh tokens must be rotated on each use (reuse = revoke all)
- Token revocation must be instant (check DB, not just JWT expiry)
- All auth events must be audit-logged
- HTML/XSS sanitization on all user-generated content (announcements, policies, feedback)
- Document API strips server filesystem paths (returns download_url instead of file_path)
- Leave reject endpoint has same auth check as approve (fixed: was missing)
