# EMP Cloud

**The core HRMS platform, identity server, and module gateway for the EMP ecosystem.**

EMP Cloud is both the central identity/subscription platform AND the core HRMS application. It provides centralized authentication (OAuth2/OIDC), organization management, module subscriptions with seat-based licensing, and built-in HRMS features including employee profiles, attendance, leave, documents, announcements, and company policies. Sellable modules (Payroll, Monitor, Recruit, etc.) connect via OAuth2 and subdomain routing.

## Architecture

```
empcloud.com                    <- EMP Cloud (core HRMS + identity + gateway)
|   Built-in: Employee Profiles, Attendance, Leave, Documents,
|             Announcements, Policies, Org Management, Auth
|
|- payroll.empcloud.com         <- EMP Payroll (sellable module)
|- monitor.empcloud.com         <- EMP Monitor (sellable module)
|- recruit.empcloud.com         <- EMP Recruit (sellable module)
|- field.empcloud.com           <- EMP Field (sellable module)
|- biometrics.empcloud.com      <- EMP Biometrics (sellable module)
|- projects.empcloud.com        <- EMP Projects (sellable module)
|- rewards.empcloud.com         <- EMP Rewards (sellable module)
|- performance.empcloud.com     <- EMP Performance (sellable module)
|- exit.empcloud.com            <- EMP Exit (sellable module)
```

### Design Principles

- **EMP Cloud IS the core HRMS** — Attendance, Leave, Employee Profiles, Documents, Announcements, and Policies are built directly into EMP Cloud, not separate modules
- **EMP Billing is internal** — It powers subscription invoicing behind the scenes; it is NOT a sellable module in the marketplace
- **9 sellable modules** in the marketplace — Payroll, Monitor, Recruit, Field, Biometrics, Projects, Rewards, Performance, Exit
- **OAuth2/OIDC Authorization Server** — SOC 2 compliant, RS256 asymmetric signing, PKCE for SPAs
- **Single MySQL instance, separate databases** — `empcloud` (identity + HRMS + subscriptions), `emp_payroll`, `emp_monitor`, etc.
- **Subdomain-based module routing** — Each sellable module is an independent app with its own URL
- **Seat-based subscriptions** — Orgs subscribe to modules with allocated seats per module
- **Payroll fetches from Cloud** — EMP Payroll retrieves attendance and leave data from EMP Cloud via service APIs, not its own tables

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 6, TypeScript, Tailwind CSS, Radix UI, React Query v5 |
| **Backend** | Node.js 20 LTS, Express 5, TypeScript |
| **Database** | MySQL 8 (Knex.js query builder) |
| **Cache** | Redis 7 |
| **Auth** | OAuth2/OIDC, RS256 JWT, PKCE, bcryptjs |
| **Queue** | BullMQ (async jobs) |
| **Monorepo** | pnpm workspaces |
| **Infra** | Docker, Docker Compose |

## Project Structure

```
empcloud/
├── packages/
│   ├── server/                     # Express API + OAuth2 server + HRMS
│   │   └── src/
│   │       ├── api/
│   │       │   ├── routes/
│   │       │   │   ├── auth.routes.ts
│   │       │   │   ├── oauth.routes.ts
│   │       │   │   ├── org.routes.ts
│   │       │   │   ├── user.routes.ts
│   │       │   │   ├── module.routes.ts
│   │       │   │   ├── subscription.routes.ts
│   │       │   │   ├── audit.routes.ts
│   │       │   │   ├── employee.routes.ts       # Employee directory & profiles
│   │       │   │   ├── attendance.routes.ts     # Attendance management
│   │       │   │   ├── leave.routes.ts          # Leave management
│   │       │   │   ├── document.routes.ts       # Document management
│   │       │   │   ├── announcement.routes.ts   # Announcements
│   │       │   │   └── policy.routes.ts         # Company policies
│   │       │   ├── middleware/     # auth, rbac, rate-limit, cors
│   │       │   └── validators/    # Zod request schemas
│   │       ├── services/
│   │       │   ├── auth/          # Login, register, password reset
│   │       │   ├── oauth/         # OAuth2 flows, token management, OIDC
│   │       │   ├── org/           # Organization CRUD
│   │       │   ├── user/          # User management, invitations
│   │       │   ├── module/        # Module registry
│   │       │   ├── subscription/  # Subscription & seat management
│   │       │   ├── billing/       # Internal billing integration
│   │       │   ├── employee/      # Employee profiles, directory, extended data
│   │       │   ├── attendance/    # Shifts, check-in/out, geo-fencing, regularization
│   │       │   ├── leave/         # Leave types, policies, balances, approvals
│   │       │   ├── document/      # Document categories, uploads, verification
│   │       │   ├── announcement/  # Company announcements, read tracking
│   │       │   └── policy/        # Company policies, versioning, acknowledgments
│   │       ├── db/
│   │       │   ├── migrations/
│   │       │   │   ├── 001_identity_schema.ts
│   │       │   │   ├── 002_modules_subscriptions.ts
│   │       │   │   ├── 003_oauth2.ts
│   │       │   │   ├── 004_audit_invitations.ts
│   │       │   │   ├── 005_employee_profiles.ts
│   │       │   │   ├── 006_attendance.ts
│   │       │   │   ├── 007_leave.ts
│   │       │   │   ├── 008_documents.ts
│   │       │   │   ├── 009_announcements.ts
│   │       │   │   └── 010_policies.ts
│   │       │   └── seed.ts        # Demo data
│   │       ├── config/            # Environment config
│   │       └── utils/             # Logger, crypto, helpers
│   ├── client/                     # React SPA
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── auth/              # Login, Register
│   │       │   ├── dashboard/         # Central dashboard
│   │       │   ├── employees/         # Employee Directory, Employee Profile (tabbed)
│   │       │   ├── attendance/        # Dashboard, Records, Shifts, Regularizations
│   │       │   ├── leave/             # Dashboard, Applications, Calendar, Types/Policies
│   │       │   ├── documents/         # Documents Overview, Document Categories
│   │       │   ├── announcements/     # Announcements list & detail
│   │       │   ├── policies/          # Policies list & acknowledgment
│   │       │   ├── modules/           # Module marketplace
│   │       │   ├── subscriptions/     # Subscription management
│   │       │   ├── users/             # User management
│   │       │   ├── settings/          # Organization settings
│   │       │   └── audit/             # Audit log
│   │       ├── components/        # Shared UI components
│   │       └── api/               # API client hooks
│   └── shared/                     # Shared types & validators
│       └── src/
│           ├── types/
│           ├── validators/
│           └── constants/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Core Features

### Authentication & SSO (OAuth2/OIDC)

- Full OAuth2 Authorization Server with OIDC discovery
- Authorization Code Flow with PKCE (for SPA modules)
- Client Credentials Flow (for service-to-service)
- RS256 asymmetric JWT signing (public key verification by modules)
- Token introspection & revocation
- Refresh token rotation (detect theft)
- OIDC endpoints: `/.well-known/openid-configuration`, `/oauth/jwks`

### Organization Management

- Org registration (company signup)
- Department & location management
- User invitation via email
- Role-based access control (Super Admin, Org Admin, HR Admin, Employee)
- Fine-grained permissions via custom roles

### Employee Extended Profiles

- Extended personal details (date of birth, blood group, marital status, etc.)
- Emergency contacts
- Education history
- Work experience
- Dependents
- Multiple addresses per employee
- Employee directory with search and filters

### Attendance Management

- Configurable shifts (start/end times, grace periods, overtime rules)
- Shift assignments per employee with date ranges
- Geo-fencing (define allowed check-in locations with radius)
- Daily check-in / check-out with location validation
- Attendance regularization requests with approval workflow
- Monthly attendance reports
- Attendance dashboard with real-time stats

### Leave Management

- Custom leave types per organization (earned, sick, casual, etc.)
- Flexible accrual policies (monthly, quarterly, yearly, manual)
- Leave balances with carry-forward support
- Multi-level approval workflows
- Visual leave calendar (team-wide view)
- Compensatory off requests and approvals
- Leave balance tracking and reports

### Document Management

- Document categories per organization
- Employee document upload and download
- Mandatory document tracking (flag required docs)
- Document expiry alerts
- Verification workflow (pending, verified, rejected)

### Announcements

- Company-wide announcements
- Target by department or role
- Priority levels (low, normal, high, urgent)
- Read tracking per employee
- Unread count API

### Company Policies

- Policy documents with versioning
- Employee acknowledgment tracking
- Mandatory vs optional policy classification
- Pending acknowledgment reports

### Module Subscriptions

- Module marketplace (browse available EMP modules)
- Subscribe/unsubscribe with seat allocation
- Per-module seat assignment (e.g., 100 Payroll seats, 25 Monitor seats)
- Plan tiers with feature flags (Basic, Professional, Enterprise)
- Usage tracking & seat utilization reports

### Internal Billing Engine

- Auto-generate invoices from subscription data
- Seat-based pricing (per user/month per module)
- Subscription lifecycle events trigger billing
- Usage metering for consumption-based modules
- Note: EMP Billing is the internal billing engine, not a sellable module

### Central Dashboard

- Module launcher (cards for each subscribed module)
- Organization settings & branding
- User management (invite, roles, deactivate)
- Subscription management (add modules, adjust seats)
- Audit log (centralized activity trail)

## OAuth2 Flow

```
1. User visits payroll.empcloud.com
2. No valid session -> redirect to empcloud.com/oauth/authorize
   ?client_id=emp-payroll
   &redirect_uri=https://payroll.empcloud.com/callback
   &response_type=code
   &scope=openid profile payroll:access
   &code_challenge=<PKCE challenge>
3. User authenticates on empcloud.com
4. EMP Cloud checks: does user's org have payroll subscription + available seat?
5. Redirect back: payroll.empcloud.com/callback?code=<auth_code>
6. Payroll server exchanges code for tokens:
   POST empcloud.com/oauth/token
   -> { access_token, refresh_token, id_token }
7. Payroll verifies access_token using EMP Cloud's public key (RS256)
8. On token expiry, payroll uses refresh_token to get new tokens
```

## Database Schema (empcloud DB)

### Identity & Platform Tables (migrations 001-004)
- `organizations` — Registered companies / tenants
- `users` — Employees belonging to organizations
- `roles` — Custom role definitions per org
- `user_roles` — User <-> Role assignments
- `organization_departments` — Departments per org
- `organization_locations` — Locations per org
- `modules` — Registry of EMP modules (payroll, monitor, recruit...)
- `org_subscriptions` — Which modules an org subscribes to
- `org_module_seats` — Per-user seat assignments per module
- `module_features` — Feature flags per module per plan tier
- `oauth_clients` — OAuth2 client registrations (one per module)
- `oauth_authorization_codes` — Short-lived auth codes
- `oauth_access_tokens` — Issued tokens (for revocation)
- `oauth_refresh_tokens` — Refresh tokens with rotation
- `oauth_scopes` — Available scopes per module
- `signing_keys` — RS256 key pairs (supports rotation)
- `audit_logs` — Central audit trail
- `invitations` — Pending user invitations

### Employee Profile Tables (migration 005)
- `employee_profiles` — Extended personal details
- `employee_addresses` — Multiple addresses per employee
- `employee_education` — Education history
- `employee_work_experience` — Past employment records
- `employee_dependents` — Family dependents

### Attendance Tables (migration 006)
- `shifts` — Shift definitions (times, grace periods, overtime)
- `shift_assignments` — Employee-to-shift mappings with date ranges
- `geo_fence_locations` — Allowed check-in locations with radius
- `attendance_records` — Daily check-in/check-out log
- `attendance_regularizations` — Regularization requests & approvals

### Leave Tables (migration 007)
- `leave_types` — Leave type definitions per org
- `leave_policies` — Accrual and carry-forward rules
- `leave_balances` — Current leave balances per employee
- `leave_applications` — Leave requests
- `leave_approvals` — Approval chain records
- `comp_off_requests` — Compensatory off requests

### Document Tables (migration 008)
- `document_categories` — Document category definitions
- `employee_documents` — Uploaded documents with verification status

### Announcement Tables (migration 009)
- `announcements` — Company announcements with targeting
- `announcement_reads` — Read tracking per user

### Policy Tables (migration 010)
- `company_policies` — Policy documents with versions
- `policy_acknowledgments` — Employee acknowledgment records

## API Overview

| Group | Base Path | Description |
|-------|-----------|-------------|
| Auth | `/api/v1/auth` | Login, register, password reset |
| OAuth | `/oauth` | OAuth2/OIDC endpoints |
| Organizations | `/api/v1/organizations` | Org CRUD |
| Users | `/api/v1/users` | User management & invitations |
| Modules | `/api/v1/modules` | Module registry |
| Subscriptions | `/api/v1/subscriptions` | Module subscriptions & seats |
| Employees | `/api/v1/employees` | Employee directory, profiles, addresses, education, experience, dependents |
| Attendance | `/api/v1/attendance` | Check-in/out, shifts, geo-fences, regularizations, dashboard, reports |
| Leave | `/api/v1/leave` | Leave types, policies, balances, applications, approvals, calendar, comp-off |
| Documents | `/api/v1/documents` | Categories, upload, download, verify, mandatory tracking, expiry alerts |
| Announcements | `/api/v1/announcements` | CRUD, read tracking, unread count |
| Policies | `/api/v1/policies` | CRUD, versioning, acknowledge, pending acknowledgments |
| Audit | `/api/v1/audit` | Audit log |
| Health | `/health` | Health check |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- MySQL 8

### Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (MySQL + Redis)
docker compose up -d

# Run migrations
pnpm --filter server migrate

# Seed demo data
pnpm --filter server seed

# Start dev servers
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server
PORT=3000
NODE_ENV=development

# Database (EmpCloud)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_NAME=empcloud

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OAuth2 / JWT
RSA_PRIVATE_KEY_PATH=./keys/private.pem
RSA_PUBLIC_KEY_PATH=./keys/public.pem
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
AUTH_CODE_EXPIRY=10m

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175

# Email (for invitations & password reset)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
```

## Sellable Modules (Marketplace)

EMP Cloud is designed as an **open module registry** — adding a new module requires zero code changes in EMP Cloud. Just register the module and its OAuth client in the database.

### Module Roadmap

| Module | Slug | URL | Status |
|--------|------|-----|--------|
| **EMP HRMS** | — | empcloud.com | Built — part of EMP Cloud (employees, attendance, leave, documents, announcements, policies) |
| EMP Payroll | `emp-payroll` | payroll.empcloud.com | Built — open-source basic engine, premium advanced tax. Fetches attendance/leave from EMP Cloud |
| EMP Monitor | `emp-monitor` | monitor.empcloud.com | Refactor from monolith |
| EMP Recruit | `emp-recruit` | recruit.empcloud.com | Planned — open-source job posting & pipeline, premium AI screening |
| EMP Field | `emp-field` | field.empcloud.com | Planned — open-source GPS check-in, premium route optimization |
| EMP Biometrics | `emp-biometrics` | biometrics.empcloud.com | Planned — premium facial recognition, open-source basic biometric hooks |
| EMP Projects | `emp-projects` | projects.empcloud.com | Partially built |
| EMP Rewards | `emp-rewards` | rewards.empcloud.com | Planned — open-source badges & kudos, premium AI-powered rewards |
| EMP Performance | `emp-performance` | performance.empcloud.com | Planned — open-source reviews & OKRs, premium succession planning |
| EMP Exit | `emp-exit` | exit.empcloud.com | Planned — fully open-source (high community value) |

> **9 sellable modules** in the marketplace. EMP HRMS is built into EMP Cloud (not a separate module). EMP Billing is the internal billing engine (not sellable).

> **Open-source + premium model**: Each module has an open-source core and optional premium features gated by plan tier via `module_features` flags in EMP Cloud.

### Adding a New Module

No code changes required in EMP Cloud. Just:

1. Insert a row into the `modules` table (name, slug, base_url, icon, description)
2. Register an OAuth client (`oauth_clients` table) with redirect URIs and allowed scopes
3. Deploy the module at its subdomain
4. The module uses EMP Cloud's OAuth2 flow for auth and public key for JWT verification
5. Orgs can now subscribe to the module and assign seats from the EMP Cloud dashboard

## Security

- OAuth2/OIDC compliant (SOC 2 ready)
- RS256 asymmetric JWT signing
- PKCE for public clients (SPAs)
- Refresh token rotation
- Centralized token revocation
- bcrypt password hashing (12 rounds)
- Rate limiting on auth endpoints
- CORS allowlisting per module
- Audit logging for all sensitive operations
- Per-module client credentials (independently revocable)

## License

GPL-3.0
