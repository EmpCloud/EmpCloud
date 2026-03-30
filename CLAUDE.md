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
- **9 sellable modules** in the marketplace: Payroll, Monitor, Recruit, Field, Biometrics, Projects, Rewards, Performance, Exit
- EMP Cloud owns the `empcloud` database — all identity AND HRMS tables live here
- Sub-modules (payroll, monitor, etc.) have their own databases on the same MySQL instance
- Authentication is centralized — only EMP Cloud issues tokens
- JWT signing uses RS256 (asymmetric) — modules verify with the public key only
- Every database query MUST filter by `organization_id` for tenant isolation
- All monetary values stored as BIGINT (smallest currency unit)
- Adding a new module = DB rows only, zero code changes in EMP Cloud

## Key File Paths

### Server Services (packages/server/src/services/)
- `auth/` — Login, register, password reset
- `oauth/` — OAuth2 flows, token management, OIDC
- `org/` — Organization CRUD
- `user/` — User management, invitations
- `module/` — Module registry
- `subscription/` — Subscription & seat management
- `billing/` — Internal billing integration (NOT a sellable module)
- `employee/` — Employee profiles, directory, extended data (addresses, education, experience, dependents)
- `employee/probation.service.ts` — Probation tracking, confirmation, extension
- `attendance/` — Shifts, check-in/out, geo-fencing, regularization requests
- `leave/` — Leave types, policies, balances, applications, approvals, comp-off
- `document/` — Document categories, uploads, verification, expiry tracking
- `announcement/` — Company announcements, read tracking
- `policy/` — Company policies, versioning, acknowledgments
- `admin/health-check.service.ts` — Cross-module health monitoring
- `admin/data-sanity.service.ts` — Cross-module data consistency checks
- `admin/system-notification.service.ts` — Super Admin system notifications

### Server Routes (packages/server/src/api/routes/)
- `employee.routes.ts` — /api/v1/employees
- `attendance.routes.ts` — /api/v1/attendance
- `leave.routes.ts` — /api/v1/leave
- `document.routes.ts` — /api/v1/documents
- `announcement.routes.ts` — /api/v1/announcements
- `policy.routes.ts` — /api/v1/policies

### Client Pages (packages/client/src/pages/)
- `employees/` — Employee Directory, Employee Profile (tabbed: personal, addresses, education, experience, dependents)
- `employees/ProbationPage.tsx` — Probation tracking dashboard and management
- `attendance/` — Dashboard, Records, Shifts, Regularizations
- `leave/` — Dashboard, Applications, Calendar, Types/Policies
- `documents/` — Documents Overview, Document Categories
- `announcements/` — Announcements list & detail
- `policies/` — Policies list & acknowledgment
- `admin/HealthDashboardPage.tsx` — Service health monitoring dashboard
- `admin/DataSanityPage.tsx` — Cross-module data sanity checker
- `admin/SystemNotificationsPage.tsx` — Super Admin system notifications
- `admin/PlatformSettingsPage.tsx` — Platform settings and info

### Database Migrations (packages/server/src/db/migrations/)
- `001_identity_schema.ts` — organizations, users, roles, departments, locations
- `002_modules_subscriptions.ts` — modules, subscriptions, seats, features
- `003_oauth2.ts` — OAuth clients, tokens, codes, scopes, signing keys
- `004_audit_invitations.ts` — audit_logs, invitations
- `005_employee_profiles.ts` — employee_profiles, addresses, education, work_experience, dependents
- `006_attendance.ts` — shifts, shift_assignments, geo_fence_locations, attendance_records, regularizations
- `007_leave.ts` — leave_types, leave_policies, leave_balances, leave_applications, leave_approvals, comp_off_requests
- `008_documents.ts` — document_categories, employee_documents
- `009_announcements.ts` — announcements, announcement_reads
- `010_policies.ts` — company_policies, policy_acknowledgments
- `030_probation.ts` — probation fields on employee_profiles (start/end dates, status, notes)

## Coding Conventions
- Use `async/await` everywhere, no raw promises
- Validate all request input with Zod schemas
- Services contain business logic, controllers are thin (validate -> service -> respond)
- All API responses use consistent `ApiResponse<T>` envelope
- Use Winston for logging, never `console.log`
- Password hashing: bcrypt with 12 rounds
- Error classes: `AppError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`

## File Naming
- kebab-case for files: `auth.service.ts`, `org.controller.ts`
- PascalCase for React components: `DashboardPage.tsx`
- Shared types in `packages/shared/src/types/`
- Validators in `packages/shared/src/validators/`

## Testing
- Vitest for unit and integration tests
- Test files alongside source: `*.test.ts`
- Playwright for E2E

## Working Rules
- NEVER start building from a plan without explicit user confirmation
- Present plans/feature lists first, ask for approval, WAIT for "yes" before coding
- Always show READMEs, code plans, and architecture decisions before executing
- Always deploy to ngrok before asking user to test — user only tests via ngrok URLs
- Never commit .pem, .key, .env files or secrets to git — always verify .gitignore before staging
- Never use `git add .` or `git add -A` — always add specific files by name

## PM2 Ecosystem & Port Mapping (Test Server: 163.227.174.141)

Ecosystem config: `/home/empcloud-development/ecosystem.config.js`

| Service | PM2 Name | Port | Start Command |
|---------|----------|------|---------------|
| EMP Cloud Core | empcloud-server | 3000 | npx tsx src/index.ts |
| EMP Payroll | emp-payroll | 4000 | npx tsx src/index.ts |
| EMP Billing | emp-billing | 4001 | npx tsx src/index.ts |
| EMP Performance | emp-performance | 4300 | npx tsx src/index.ts |
| EMP Exit | emp-exit | 4400 | npx tsx src/index.ts |
| EMP Recruit | emp-recruit | 4500 | npx tsx src/index.ts |
| EMP Rewards | emp-rewards | 4600 | npx tsx src/index.ts |
| EMP LMS | emp-lms | 4700 | npx tsx src/index.ts |
| EMP Monitor | emp-monitor | 5000 | node src/adminApi.js |
| Project API | emp-project-api | 9000 | node project.server.js |
| Project Task API | emp-project-task-api | 9001 | node task.server.js |
| Project Client | emp-project-client | 3100 | npx next dev -p 3100 |

**Deploy procedure**: `pm2 delete <name> && rm -rf ~/.cache/tsx && pm2 start ecosystem.config.js --only <name> && pm2 save`

## Cross-Module Integration Patterns

### Billing Integration
- EMP Billing is an internal engine — NOT a sellable module, NOT in the marketplace
- EMP Cloud calls Billing APIs to create invoices, process payments, manage subscription lifecycle
- Billing has its own database (`emp_billing`) but is tightly coupled to EMP Cloud's subscription service
- Flow: User subscribes to module in Cloud -> Cloud calls Billing API -> Billing creates invoice -> Billing processes payment -> Cloud activates subscription

### Cross-Module Webhooks
- Modules send event webhooks to EMP Cloud for unified activity tracking
- Pattern: Module event occurs -> Module POSTs to `EMP_CLOUD_URL/api/v1/webhooks/inbound` with `{ module, event, payload }`
- Webhook sources: Recruit (hire events), Exit (offboarding events), Performance (review completions), Rewards (recognition events)
- EMP Cloud processes webhooks to update unified dashboard, trigger notifications, and maintain audit trail
- All webhook payloads include `organization_id` for tenant isolation

### Payroll HRMS Proxy
- EMP Payroll fetches attendance and leave data from EMP Cloud (not its own DB)
- Controlled by `USE_CLOUD_HRMS=true` environment flag in Payroll
- When enabled, Payroll calls `EMP_CLOUD_URL/api/v1/attendance` and `/api/v1/leave` instead of local tables
- This ensures a single source of truth for attendance/leave across the ecosystem
- Payroll authenticates to Cloud using service-to-service JWT

## Security (SOC 2)
- Never log secrets, tokens, or passwords
- PKCE required for all public OAuth clients
- Refresh tokens must be rotated on each use
- Token revocation must be instant (check DB, not just JWT expiry)
- All auth events must be audit-logged
- Rate limit auth endpoints aggressively
