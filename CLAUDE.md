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
- `attendance/` — Shifts, check-in/out, geo-fencing, regularization requests
- `leave/` — Leave types, policies, balances, applications, approvals, comp-off
- `document/` — Document categories, uploads, verification, expiry tracking
- `announcement/` — Company announcements, read tracking
- `policy/` — Company policies, versioning, acknowledgments

### Server Routes (packages/server/src/api/routes/)
- `employee.routes.ts` — /api/v1/employees
- `attendance.routes.ts` — /api/v1/attendance
- `leave.routes.ts` — /api/v1/leave
- `document.routes.ts` — /api/v1/documents
- `announcement.routes.ts` — /api/v1/announcements
- `policy.routes.ts` — /api/v1/policies

### Client Pages (packages/client/src/pages/)
- `employees/` — Employee Directory, Employee Profile (tabbed: personal, addresses, education, experience, dependents)
- `attendance/` — Dashboard, Records, Shifts, Regularizations
- `leave/` — Dashboard, Applications, Calendar, Types/Policies
- `documents/` — Documents Overview, Document Categories
- `announcements/` — Announcements list & detail
- `policies/` — Policies list & acknowledgment

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

## Security (SOC 2)
- Never log secrets, tokens, or passwords
- PKCE required for all public OAuth clients
- Refresh tokens must be rotated on each use
- Token revocation must be instant (check DB, not just JWT expiry)
- All auth events must be audit-logged
- Rate limit auth endpoints aggressively
