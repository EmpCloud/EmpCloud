# EMP Cloud — Complete Architecture Trace

> Generated 2026-03-29 | 78K+ LOC | 250+ API endpoints | 60+ database tables | 10 modules

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Request Lifecycle](#2-request-lifecycle)
3. [Authentication & OAuth2](#3-authentication--oauth2)
4. [Database Schema](#4-database-schema)
5. [API Surface](#5-api-surface)
6. [Client Architecture](#6-client-architecture)
7. [Cross-Module Integration](#7-cross-module-integration)
8. [Security Architecture](#8-security-architecture)

---

## 1. System Overview

### 1.1 What EMP Cloud Is

EMP Cloud is the **core HRMS platform, identity server, and module gateway** for the EMP ecosystem. It serves as:

- **OAuth2/OIDC Authorization Server** — issues RS256 JWTs, manages token lifecycle
- **Module Registry & Marketplace** — subscription/seat management for 9 sellable modules
- **Built-in HRMS Application** — employees, attendance, leave, documents, announcements, policies, wellness, surveys, helpdesk, assets, events, forum, whistleblowing, biometrics, chatbot, custom fields

### 1.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces (`packages/server`, `packages/client`, `packages/shared`) |
| Backend | Node.js 20, Express 5, TypeScript |
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS, Radix UI |
| Database | MySQL 8 via Knex.js (query builder) |
| Cache | Redis 7 |
| Auth | OAuth2/OIDC with RS256 JWT (asymmetric signing) |
| Queue | BullMQ (configured, limited active use) |
| Validation | Zod schemas |
| Logging | Winston with daily rotation |

### 1.3 Module Ecosystem

```
                            ┌─────────────────────────────────────────┐
                            │          EMP Cloud (port 3000)          │
                            │  Identity + HRMS + Module Gateway       │
                            │  DB: empcloud | Cache: Redis            │
                            └────────┬──────────────┬─────────────────┘
                                     │              │
              ┌──────────────────────┼──────────────┼──────────────────────┐
              │                      │              │                      │
    ┌─────────▼────────┐  ┌─────────▼────────┐  ┌──▼───────────────┐  ┌──▼───────────────┐
    │ EMP Payroll :4000 │  │ EMP Recruit :4500│  │EMP Perform :4300 │  │EMP Rewards :4600 │
    │ DB: emp_payroll   │  │ DB: emp_recruit  │  │DB: emp_performance│ │DB: emp_rewards   │
    └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │ EMP Exit    :4400│  │ EMP Billing :4001│  │ EMP LMS     :4700│  │EMP Projects :9000│
    │ DB: emp_exit     │  │ DB: emp_billing  │  │ DB: emp_lms      │  │ DB: emp_projects │
    └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
    ┌──────────────────┐
    │ EMP Monitor :5000│
    │ DB: empmonitor   │
    └──────────────────┘
```

**9 Sellable Modules:** Payroll, Monitor, Recruit, Field, Biometrics, Projects, Rewards, Performance, Exit
**1 Internal Module:** Billing (powers subscription invoicing, not in marketplace)

---

## 2. Request Lifecycle

### 2.1 Server Startup Sequence

```
index.ts
  │
  ├─ 1. initDB()              → Knex MySQL connection (pool: min 2, max 20)
  ├─ 2. Auto-migrate          → Run pending migrations if DB_AUTO_MIGRATE=true
  ├─ 3. loadKeys()            → Load RSA private/public keys for JWT signing
  ├─ 4. Create Express app    → Express 5 instance
  ├─ 5. Register middleware   → Global middleware stack (see below)
  ├─ 6. Mount routes          → All API route handlers
  ├─ 7. Start HTTP server     → Listen on config.port (default 3000)
  └─ 8. Graceful shutdown     → SIGTERM/SIGINT handlers
```

### 2.2 Global Middleware Stack (every request)

| Order | Middleware | Purpose | Source |
|-------|-----------|---------|--------|
| 1 | `requestIdMiddleware` | Generate/extract `X-Request-ID` for correlation | Custom |
| 2 | `helmet()` | Security headers (CSP, HSTS, X-Frame-Options) | npm: helmet |
| 3 | `cors()` | Validate origin against whitelist | npm: cors |
| 4 | `express.json()` | Parse JSON body (10MB limit) | Express built-in |
| 5 | `express.urlencoded()` | Parse form-encoded body | Express built-in |

### 2.3 Per-Route Middleware Stack

| Order | Middleware | Purpose | Applied To |
|-------|-----------|---------|------------|
| 1 | Rate Limiter | Quota enforcement per IP | Auth endpoints (20/15min), API endpoints (100/60s) |
| 2 | `authenticate` | Verify RS256 JWT, check revocation in DB | All protected routes |
| 3 | RBAC middleware | Check `req.user.role` against required role level | Role-restricted routes |
| 4 | `upload` | Multer file upload (10MB, PDF/JPEG/PNG/DOCX) | Document upload routes |

### 2.4 Complete Request Flow

```
HTTP REQUEST
    │
    ▼
┌─── GLOBAL MIDDLEWARE ────────────────────────────────────────────────┐
│ [1] requestIdMiddleware → attach X-Request-ID                       │
│ [2] helmet()            → security headers                          │
│ [3] cors()              → validate origin                           │
│ [4] express.json()      → parse body                                │
│ [5] express.urlencoded() → parse form data                          │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─── ROUTE MATCHING ──────────────────────────────────────────────────┐
│ Express router finds matching handler                               │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─── PER-ROUTE MIDDLEWARE ────────────────────────────────────────────┐
│ [1] Rate Limiter   → check quota (429 if exceeded)                  │
│ [2] authenticate   → verify JWT → check revocation → req.user      │
│ [3] RBAC           → check role level (403 if insufficient)         │
│ [4] upload         → process file if multipart                      │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─── ROUTE HANDLER ───────────────────────────────────────────────────┐
│ try {                                                                │
│   const data = schema.parse(req.body)     // Zod validation         │
│   const result = await service.doWork(    // Business logic          │
│     req.user!.org_id,                     // TENANT ISOLATION        │
│     data                                                             │
│   )                                                                  │
│   await logAudit({ ... })                 // Audit trail             │
│   sendSuccess(res, result, 200)           // Standard response       │
│ } catch (err) {                                                      │
│   next(err)                               // → Error handler         │
│ }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─── ERROR HANDLER (if exception) ────────────────────────────────────┐
│ OAuthError    → RFC 6749 format { error, error_description }        │
│ MulterError   → 400 VALIDATION_ERROR                                │
│ ZodError      → 400 VALIDATION_ERROR (details in dev only)          │
│ AppError      → Use error's statusCode/code/message                 │
│ DB Error      → 400 BAD_REQUEST                                     │
│ Unknown       → 500 INTERNAL_ERROR (stack logged server-side)       │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
HTTP RESPONSE
  Status: 200/201/400/401/403/404/429/500
  Headers: X-Request-ID, CORS, Helmet security headers
  Body: { success: true/false, data?, error?, meta? }
```

### 2.5 Standard Response Format

```json
// Success
{
  "success": true,
  "data": { /* response payload */ },
  "meta": { "page": 1, "per_page": 20, "total": 100, "total_pages": 5 }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": null
  }
}
```

### 2.6 Error Class Hierarchy

```
AppError (base) — statusCode, code, message, details
  ├── ValidationError    (400, "VALIDATION_ERROR")
  ├── UnauthorizedError  (401, "UNAUTHORIZED")
  ├── ForbiddenError     (403, "FORBIDDEN")
  ├── NotFoundError      (404, "NOT_FOUND")
  ├── ConflictError      (409, "CONFLICT")
  ├── RateLimitError     (429, "RATE_LIMITED")
  └── OAuthError         → RFC 6749 format
```

---

## 3. Authentication & OAuth2

### 3.1 JWT Architecture

```
┌─── Key Management ──────────────────────────────────────────────────┐
│ Algorithm: RS256 (RSA-SHA256, asymmetric)                           │
│ Private Key: signs tokens (server-side only)                        │
│ Public Key: verifies tokens (shared with sub-modules via JWKS)      │
│ Key ID (kid): SHA-256 hash of public key (first 16 chars base64url) │
│ Key Files: ./keys/private.pem, ./keys/public.pem                    │
└─────────────────────────────────────────────────────────────────────┘

Token Types:
  Access Token  — RS256 JWT, 15-minute expiry, contains user claims
  Refresh Token — 48-byte opaque random, 7-day expiry, stored in DB
  ID Token      — RS256 JWT, 1-hour expiry, OIDC-compliant

Access Token Payload:
  {
    sub: number,        // user ID
    email: string,
    first_name: string,
    last_name: string,
    role: UserRole,     // "super_admin" | "org_admin" | "hr_admin" | ...
    org_id: number,
    org_name: string,
    scope: string,      // "openid profile email"
    client_id: string,  // "empcloud-dashboard" or OAuth client
    jti: string,        // unique token ID (for revocation)
    iat: number,        // issued at
    exp: number,        // expiry
    iss: string         // issuer URL
  }
```

### 3.2 Authentication Flows

#### Direct Login (EMP Cloud Dashboard)

```
1. POST /api/v1/auth/login { email, password }
   ├─ Find user by email
   ├─ Verify bcrypt hash (12 rounds)
   ├─ Check: account active (status=1), org active, date_of_exit not passed
   ├─ Check: password expiry policy (org.password_expiry_days)
   ├─ Issue tokens: access (15m) + refresh (7d) + id_token (1h)
   ├─ Store tokens in DB (oauth_access_tokens, oauth_refresh_tokens)
   └─ Log audit event (LOGIN or LOGIN_FAILED)

2. Response:
   { access_token: "eyJ...", refresh_token: "abc...", id_token: "eyJ...", expires_in: 900 }

3. Client stores tokens, uses access_token in Authorization header
```

#### OAuth2 Authorization Code Flow (Module SSO)

```
1. Module redirects to Cloud:
   GET /oauth/authorize?
     client_id=module_client
     &redirect_uri=https://module.com/callback
     &response_type=code
     &scope=openid profile email
     &state=random
     &code_challenge=xxx          ← PKCE required for public clients
     &code_challenge_method=S256

2. Cloud validates client + redirect_uri, creates auth code (10min expiry)

3. Redirects back: https://module.com/callback?code=xyz&state=random

4. Module exchanges code for tokens:
   POST /oauth/token
   { grant_type: "authorization_code", code: "xyz", code_verifier: "xxx", ... }

5. Cloud validates code, PKCE, returns tokens
```

#### Token Refresh & Rotation

```
When access_token expires (15 minutes):

1. POST /oauth/token
   { grant_type: "refresh_token", refresh_token: "old_rt", client_id: "..." }

2. Server:
   ├─ Hash refresh token, lookup in DB
   ├─ Check if revoked_at is set:
   │   └─ YES → COMPROMISE DETECTED → revoke entire family → force re-auth
   ├─ Check expiry (7 days)
   ├─ Mark old token as revoked
   ├─ Issue new token pair (same family_id for rotation detection)
   └─ Return new access_token + refresh_token

3. Rotation Detection:
   - Each refresh token has a family_id
   - If a revoked token is reused → all tokens in family revoked
   - This detects stolen token replay attacks
```

#### SSO Token Generation (Cross-Module)

```
1. User in Cloud clicks "Payroll Module"
2. POST /api/v1/auth/sso/token (with valid access_token)
3. Cloud signs short-lived JWT with user claims
4. Module validates via JWKS endpoint (/oauth/jwks)
5. User automatically authenticated in module
```

### 3.3 RBAC Role Hierarchy

```
Role              Level   Access Scope
────────────────  ─────   ─────────────────────────────────
super_admin       100     Full platform access (all orgs)
org_admin          80     Organization-level access
hr_admin           60     HR module full access
hr_manager         40     HR module read-write
manager            20     Team management
employee            0     Self-service only
```

**Middleware Presets:**
- `requireSuperAdmin` — level 100 only
- `requireOrgAdmin` — level 60+ (org_admin, super_admin, hr_admin)
- `requireHR` — level 40+ (hr_admin, hr_manager)
- `requireSelfOrHR(paramName)` — own resource OR HR role

### 3.4 OAuth2 Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/.well-known/openid-configuration` | GET | None | OIDC discovery |
| `/oauth/jwks` | GET | None | Public key (JWKS) |
| `/oauth/authorize` | GET | JWT | Authorization code grant |
| `/oauth/token` | POST | None | Token exchange/refresh |
| `/oauth/revoke` | POST | None | Token revocation (RFC 7009) |
| `/oauth/introspect` | POST | None | Token introspection (RFC 7662) |
| `/oauth/userinfo` | GET | JWT | User profile (OIDC) |

---

## 4. Database Schema

### 4.1 Overview

- **Engine:** MySQL 8.0
- **ORM:** Knex.js (query builder, not full ORM)
- **Migrations:** 34 migration files, 60+ tables
- **Multi-tenancy:** Row-level isolation via `organization_id` on every table
- **Monetary values:** BIGINT (smallest currency unit — paise for INR)

### 4.2 Schema Domains

#### Domain 1: Identity & Organization

```
organizations (root entity)
  ├─ id (bigInt PK)
  ├─ name, legal_name, email, contact_number, timezone
  ├─ country, state, city, address
  ├─ is_active, current_user_count, total_allowed_user_count
  ├─ password_expiry_days (default: 0)
  └─ grace_period_days (billing, default: 0)

users
  ├─ id (bigInt PK)
  ├─ organization_id (FK → organizations, CASCADE)
  ├─ first_name, last_name, email (UNIQUE), password (bcrypt)
  ├─ emp_code, designation, date_of_birth, gender
  ├─ department_id (FK → organization_departments)
  ├─ location_id (FK → organization_locations)
  ├─ reporting_manager_id (FK → users, self-reference)
  ├─ role (varchar 20: super_admin|org_admin|hr_admin|hr_manager|manager|employee)
  ├─ status (1=active, 2=inactive, 3=suspended)
  ├─ date_of_joining, date_of_exit
  ├─ probation_end_date, probation_status
  └─ password_changed_at

organization_departments
  ├─ id, name, organization_id (FK)

organization_locations
  ├─ id, name, organization_id (FK), address, timezone
```

#### Domain 2: OAuth2 & Token Management

```
oauth_clients
  ├─ client_id (UNIQUE), client_secret_hash (null for public)
  ├─ module_id (FK → modules), redirect_uris (JSON), allowed_scopes (JSON)
  ├─ is_confidential, is_active

oauth_authorization_codes
  ├─ code_hash (UNIQUE), client_id, user_id, organization_id
  ├─ redirect_uri, scope, code_challenge, code_challenge_method, nonce
  ├─ expires_at (10min), used_at (one-time use)

oauth_access_tokens
  ├─ jti (UNIQUE JWT ID), client_id, user_id, organization_id
  ├─ scope, expires_at, revoked_at

oauth_refresh_tokens
  ├─ token_hash (UNIQUE), access_token_id (FK)
  ├─ family_id (rotation detection), expires_at, revoked_at

signing_keys
  ├─ kid (UNIQUE), algorithm (RS256), public_key, private_key, is_current
```

#### Domain 3: Subscriptions & Modules

```
modules
  ├─ id, name, slug (UNIQUE), description, base_url, is_active, has_free_tier

module_features
  ├─ module_id (FK), feature_key, name, min_plan_tier (free|basic|professional|enterprise)

org_subscriptions
  ├─ organization_id (FK), module_id (FK) → UNIQUE(org, module)
  ├─ plan_tier, status (active|trial|past_due|suspended|deactivated|cancelled)
  ├─ total_seats, used_seats, billing_cycle, price_per_seat (paise)
  ├─ trial_ends_at, current_period_start, current_period_end
  ├─ dunning_stage (current|reminder|warning|suspended|deactivated)

org_module_seats
  ├─ subscription_id (FK), module_id (FK), user_id (FK) → UNIQUE(module, user)
  ├─ assigned_by (FK), assigned_at

billing_client_mappings
  ├─ organization_id (FK, UNIQUE), billing_client_id

billing_subscription_mappings
  ├─ cloud_subscription_id (FK, UNIQUE), billing_subscription_id
```

#### Domain 4: Employee Profiles & Extended Data

```
employee_profiles (1:1 with users)
  ├─ user_id (FK, UNIQUE), personal_email, emergency contacts
  ├─ blood_group, marital_status, nationality
  ├─ aadhar_number, pan_number, passport_number
  ├─ probation dates, notice_period_days
  ├─ salary_ctc, salary_basic, salary_hra, ... (all BIGINT paise)

employee_addresses         → user_id (FK), type (permanent|residential|work)
employee_education         → user_id (FK), degree, institution, year
employee_work_experience   → user_id (FK), company_name, designation, dates
employee_dependents        → user_id (FK), name, relationship, is_nominee
```

#### Domain 5: Attendance Management

```
shifts                     → name, start_time, end_time, break/grace minutes
shift_assignments          → user_id (FK), shift_id (FK), effective dates
shift_swap_requests        → requester_id, target_employee_id, status
geo_fence_locations        → lat, lng, radius_meters

attendance_records
  ├─ user_id (FK), date → UNIQUE(org, user, date)
  ├─ check_in, check_out (timestamps)
  ├─ check_in_source (mobile|web|biometric|manual)
  ├─ check_in_lat/lng, check_out_lat/lng
  ├─ status (present|absent|half_day|on_leave)
  ├─ worked_minutes, overtime_minutes, late_minutes

attendance_regularizations → original/requested check-in/out, approval status
```

#### Domain 6: Leave Management

```
leave_types                → name, code, is_paid, is_carry_forward, is_encashable
leave_policies             → leave_type_id, annual_quota, accrual_type
leave_balances             → user_id, leave_type_id, year → UNIQUE(org, user, type, year)
leave_applications         → user_id, leave_type_id, start/end dates, days_count, status
leave_approvals            → leave_application_id, approver_id, level (multi-level)
comp_off_requests          → worked_date, expires_on, status
```

#### Domain 7: Documents, Announcements, Policies

```
document_categories        → name, is_mandatory
employee_documents         → user_id, category_id, file_path, verification_status

announcements              → title, content, priority, target_type (all|department|role)
announcement_reads         → announcement_id, user_id → UNIQUE

company_policies           → title, content, version, category, effective_date
policy_acknowledgments     → policy_id, user_id → UNIQUE

notifications              → user_id, type, title, reference_type/id, is_read
```

#### Domain 8: Helpdesk & Knowledge Base

```
helpdesk_tickets
  ├─ raised_by (FK), category (leave|payroll|it|...), priority, subject
  ├─ status (open|in_progress|awaiting_response|resolved|closed|reopened)
  ├─ assigned_to (FK), SLA deadlines, satisfaction_rating

ticket_comments            → ticket_id, user_id, is_internal
knowledge_base_articles    → title, slug, content, category, is_published
kb_article_ratings         → article_id, user_id, helpful (boolean)
```

#### Domain 9: Surveys & Feedback

```
surveys                    → title, type (pulse|enps|engagement), is_anonymous, recurrence
survey_questions           → question_type (rating|likert|text|matrix), options (JSON)
survey_responses           → user_id or anonymous_id
survey_answers             → rating_value, text_value

anonymous_feedback         → category, subject, message, sentiment, anonymous_hash
```

#### Domain 10: Assets, Positions, Events, Forum, Wellness

```
assets                     → asset_tag, name, category, serial_number, status, assigned_to
asset_history              → action (assigned|returned|retired|lost), from/to user

positions                  → title, department, headcount_budget/filled, salary range
position_assignments       → position_id, user_id, is_primary
headcount_plans            → fiscal_year, planned/approved/current headcount

company_events             → title, event_type, start/end dates, target_type, max_attendees
event_rsvps                → status (attending|maybe|declined)

forum_categories           → name, post_count
forum_posts                → category_id, author_id, post_type, is_pinned, view/like/reply counts
forum_replies              → post_id, parent_reply_id (nested), is_accepted
forum_likes                → target_type (post|reply), target_id

wellness_programs          → program_type, max_participants, points_reward
wellness_enrollments       → progress_percentage, status
wellness_check_ins         → mood (great|good|okay|low|stressed), energy_level, sleep, exercise
wellness_goals             → goal_type, target/current value, frequency

whistleblower_reports      → case_number, category, severity, is_anonymous, reporter_hash
whistleblower_updates      → update_type, is_visible_to_reporter

face_enrollments           → face_encoding (LONGBLOB), quality_score
biometric_devices          → type, serial_number, ip_address, status, api_key_hash
qr_codes                   → code (UNIQUE), type (static|rotating)
biometric_attendance_logs  → method, confidence_score, liveness_passed, result

chatbot_conversations      → user_id, status, message_count
chatbot_messages           → role (user|assistant|system), content, metadata

custom_field_definitions   → entity_type, field_type (text|number|date|dropdown|...), options
custom_field_values        → field_id, entity_id, value_text/number/date/boolean/json

system_notifications       → title, message, target_type, notification_type
audit_logs                 → action, resource_type/id, ip_address, user_agent, details (JSON)
```

### 4.3 Tenant Isolation Strategy

```
EVERY table has organization_id (FK → organizations)
EVERY query filters by WHERE organization_id = ?
EVERY service function takes orgId as first parameter
  └─ orgId comes from JWT payload (req.user.org_id)
     └─ Cannot be forged (RS256 signed)

File isolation: /uploads/documents/{orgId}/{userId}/
Audit isolation: All logs include organization_id
Index pattern: Most tables index (organization_id, status) or (organization_id, created_at)
```

---

## 5. API Surface

### 5.1 Route Summary

- **42 route files** with **250+ API endpoints**
- All mounted under `/api/v1/` prefix
- Standard handler pattern: validate → service → audit → respond

### 5.2 Complete Route Map

#### Auth & OAuth (Public/Semi-public)

| Method | Endpoint | Auth | Rate Limit | Purpose |
|--------|----------|------|------------|---------|
| POST | `/auth/register` | None | 5/hr | Create org + admin user |
| POST | `/auth/login` | None | 10/15min | Authenticate |
| POST | `/auth/change-password` | JWT | API | Change password |
| POST | `/auth/forgot-password` | None | — | Send reset token |
| POST | `/auth/reset-password` | None | — | Consume reset token |
| POST | `/auth/sso/validate` | None | — | Validate SSO token |
| POST | `/auth/sso/token` | JWT | — | Generate SSO token |
| GET | `/.well-known/openid-configuration` | None | — | OIDC discovery |
| GET | `/oauth/jwks` | None | — | JWKS public key |
| GET | `/oauth/authorize` | JWT | — | Authorization code |
| POST | `/oauth/token` | None | — | Token exchange/refresh |
| POST | `/oauth/revoke` | None | — | Token revocation |
| POST | `/oauth/introspect` | None | — | Token introspection |
| GET | `/oauth/userinfo` | JWT | — | OIDC user profile |
| GET | `/health` | None | — | Server health |

#### Organization Management

| Method | Endpoint | Auth | RBAC | Purpose |
|--------|----------|------|------|---------|
| GET | `/organizations/me` | JWT | Any | Get org details |
| PUT | `/organizations/me` | JWT | OrgAdmin | Update org |
| GET | `/organizations/me/stats` | JWT | Any | Org statistics |
| GET/POST/DELETE | `/organizations/me/departments` | JWT | OrgAdmin (write) | Department CRUD |
| GET/POST/DELETE | `/organizations/me/locations` | JWT | OrgAdmin (write) | Location CRUD |

#### User Management

| Method | Endpoint | Auth | RBAC | Purpose |
|--------|----------|------|------|---------|
| GET | `/users` | JWT | Any (filtered) | List users (employees see limited fields) |
| GET | `/users/:id` | JWT | Any | Get user |
| POST | `/users` | JWT | OrgAdmin | Create user |
| PUT | `/users/:id` | JWT | OrgAdmin | Update user |
| DELETE | `/users/:id` | JWT | OrgAdmin | Deactivate user |
| POST | `/users/invite` | JWT | OrgAdmin | Send invitation |
| POST | `/users/accept-invitation` | None | — | Accept invite |
| POST | `/users/import` | JWT | OrgAdmin | CSV import (parse) |
| POST | `/users/import/execute` | JWT | OrgAdmin | Execute import |
| GET | `/users/org-chart` | JWT | Any | Org chart data |

#### Employee Profiles (35+ endpoints)

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| GET | `/employees` | JWT | Any | Directory listing |
| GET | `/employees/:id` | JWT | Any | Employee detail |
| POST | `/employees` | JWT | HR | Create employee |
| GET | `/employees/birthdays` | JWT | Any | Birthday list |
| GET | `/employees/anniversaries` | JWT | Any | Anniversary list |
| GET | `/employees/headcount` | JWT | HR | Headcount stats |
| GET/PUT | `/employees/:id/profile` | JWT | SelfOrHR | Profile CRUD |
| POST | `/employees/:id/photo` | JWT | SelfOrHR | Upload photo |
| GET/PUT | `/employees/:id/salary` | JWT | SelfOrHR/HR | Salary structure |
| CRUD | `/employees/:id/addresses` | JWT | SelfOrHR | Address management |
| CRUD | `/employees/:id/education` | JWT | SelfOrHR | Education records |
| CRUD | `/employees/:id/experience` | JWT | SelfOrHR | Work experience |
| CRUD | `/employees/:id/dependents` | JWT | SelfOrHR | Dependent records |
| GET/PUT | `/employees/probation/*` | JWT | HR | Probation tracking |

#### Attendance (30+ endpoints)

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| CRUD | `/attendance/shifts` | JWT | HR (write) | Shift management |
| POST | `/attendance/shifts/assign` | JWT | HR | Assign shifts |
| POST | `/attendance/shifts/bulk-assign` | JWT | HR | Bulk assign |
| POST | `/attendance/shifts/swap-request` | JWT | Any | Request swap |
| POST | `/attendance/check-in` | JWT | Any | Clock in |
| POST | `/attendance/check-out` | JWT | Any | Clock out |
| GET | `/attendance/me/today` | JWT | Any | Today's record |
| GET | `/attendance/me/history` | JWT | Any | Personal history |
| GET | `/attendance/records` | JWT | HR (all) / Employee (own) | Records |
| GET | `/attendance/dashboard` | JWT | HR | Dashboard stats |
| GET | `/attendance/monthly-report` | JWT | HR | Monthly report |
| CRUD | `/attendance/geo-fences` | JWT | HR | Geo-fence CRUD |
| CRUD | `/attendance/regularizations` | JWT | Any (submit) / HR (approve) | Regularization |

#### Leave (30+ endpoints)

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| CRUD | `/leave/types` | JWT | HR (write) | Leave type CRUD |
| CRUD | `/leave/policies` | JWT | HR (write) | Policy CRUD |
| GET | `/leave/balances` | JWT | Any | View balances |
| POST | `/leave/balances/initialize` | JWT | HR | Initialize year |
| GET/POST | `/leave/applications` | JWT | Any | Apply/view leave |
| PUT | `/leave/applications/:id/approve` | JWT | Any | Approve leave |
| PUT | `/leave/applications/:id/reject` | JWT | Any | Reject leave |
| GET | `/leave/calendar` | JWT | Any | Leave calendar |
| CRUD | `/leave/comp-off` | JWT | Any (submit) / HR (approve) | Comp-off |

#### Documents, Announcements, Policies

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| GET | `/documents` | JWT | HR (all) / Employee (own) | List documents |
| POST | `/documents/upload` | JWT | Any | Upload document |
| PUT | `/documents/:id/verify` | JWT | HR | Verify document |
| GET | `/documents/expiring` | JWT | HR | Expiry alerts |
| CRUD | `/announcements` | JWT | HR (write) | Announcement CRUD |
| POST | `/announcements/:id/read` | JWT | Any | Mark read |
| CRUD | `/policies` | JWT | HR (write) | Policy CRUD |
| POST | `/policies/:id/acknowledge` | JWT | Any | Acknowledge |

#### Helpdesk (20+ endpoints)

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| POST | `/helpdesk/tickets` | JWT | Any | Create ticket |
| GET | `/helpdesk/tickets/my` | JWT | Any | My tickets |
| GET | `/helpdesk/tickets` | JWT | HR (all) / Employee (own) | List tickets |
| POST | `/helpdesk/tickets/:id/assign` | JWT | HR | Assign ticket |
| POST | `/helpdesk/tickets/:id/comment` | JWT | Any | Add comment |
| CRUD | `/helpdesk/kb` | JWT | HR (write) | Knowledge base |
| POST | `/helpdesk/kb/:id/helpful` | JWT | Any | Rate article |

#### Surveys, Feedback, Events, Forum, Wellness, Whistleblowing

Each feature follows the same pattern:
- **Employee endpoints:** Submit, view own, respond
- **HR endpoints:** Create, manage, dashboard analytics
- **Common pattern:** `GET /feature/my` (personal) vs `GET /feature` (all, HR only)

#### Biometrics

| Method | Pattern | Auth | RBAC | Purpose |
|--------|---------|------|------|---------|
| POST | `/biometrics/face/enroll` | JWT | HR | Enroll face |
| POST | `/biometrics/face/verify` | JWT | Any | Verify face |
| POST | `/biometrics/qr/generate` | JWT | HR | Generate QR |
| POST | `/biometrics/qr/scan` | JWT | Any | Scan QR |
| POST | `/biometrics/check-in` | JWT | Any | Biometric check-in |
| CRUD | `/biometrics/devices` | JWT | HR | Device management |
| POST | `/biometrics/devices/:id/heartbeat` | API Key | — | Device heartbeat |

#### Subscriptions & Billing

| Method | Endpoint | Auth | RBAC | Purpose |
|--------|----------|------|------|---------|
| GET | `/subscriptions` | JWT | HR | List subscriptions |
| POST | `/subscriptions` | JWT | OrgAdmin | Subscribe to module |
| DELETE | `/subscriptions/:id` | JWT | OrgAdmin | Cancel subscription |
| POST | `/subscriptions/assign-seat` | JWT | OrgAdmin | Assign seat |
| POST | `/subscriptions/revoke-seat` | JWT | OrgAdmin | Revoke seat |
| POST | `/subscriptions/check-access` | None | — | Check module access |
| GET | `/billing/invoices` | JWT | HR | Invoice list |
| POST | `/billing/pay` | JWT | HR | Create payment |
| GET | `/billing/gateways` | JWT | HR | Payment gateways |
| GET | `/modules` | JWT | Any | Module marketplace |

#### Super Admin (Platform-wide)

All require `authenticate + requireSuperAdmin`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/overview` | Platform stats |
| GET | `/admin/organizations` | All orgs |
| GET | `/admin/modules` | Module analytics |
| GET | `/admin/revenue` | Revenue analytics |
| GET | `/admin/growth` | User growth |
| GET | `/admin/service-health` | Module health checks |
| POST | `/admin/service-health/check` | Force health check |
| GET | `/admin/data-sanity` | Cross-module consistency |
| POST | `/admin/data-sanity/fix` | Auto-fix issues |
| CRUD | `/admin/notifications` | System notifications |
| GET/PUT | `/admin/ai-config` | AI provider config |
| GET | `/admin/logs/*` | Log analysis dashboard |

#### Webhooks (Unauthenticated, Internal)

| Method | Endpoint | Source | Purpose |
|--------|----------|--------|---------|
| POST | `/webhooks/modules` | Sub-modules | Lifecycle events |
| POST | `/webhooks/billing` | EMP Billing | Payment/invoice events |

#### Other

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/dashboard/widgets` | JWT | Dashboard data |
| POST | `/chatbot/conversations/:id/send` | JWT | AI chat |
| GET | `/manager/team` | JWT | Manager dashboard |
| CRUD | `/custom-fields/definitions` | JWT | Custom field config |
| CRUD | `/custom-fields/values/:entityType/:entityId` | JWT | Custom field values |
| GET/POST | `/onboarding/*` | JWT | Onboarding wizard |

---

## 6. Client Architecture

### 6.1 Technology Stack

| Aspect | Technology |
|--------|-----------|
| Framework | React 19 + TypeScript, Strict Mode |
| Routing | React Router 7, lazy-loaded routes |
| State | Zustand (auth store with localStorage persistence) |
| Data Fetching | React Query 5 (TanStack), Axios interceptors |
| UI | Radix UI primitives + Tailwind CSS |
| Icons | Lucide React (460+ icons) |
| Charts | Recharts |
| Forms | React Hook Form + Zod validation |
| i18n | i18next (9 languages, RTL support) |

### 6.2 Application Shell

```
┌─ Sidebar (desktop: fixed, mobile: overlay) ────┬─ Top Header ────────────┐
│                                                  │ Menu Toggle              │
│  Logo + Org Name                                │ Language Switcher (9)    │
│  Role-based Navigation                          │ Notification Bell (30s)  │
│  ├─ Employee: Dashboard, Profile, Attendance... │                          │
│  ├─ HR: + Employees, Leave, Modules, Settings   └──────────────────────────┘
│  └─ Super Admin: Platform overview, Orgs...     │
│                                                  │  Main Content Area       │
│  User Profile Card (bottom)                     │  (Outlet for routes)     │
│  Logout Button                                  │                          │
└──────────────────────────────────────────────────┘
                                           Floating AI Chat Widget (bottom-right)
```

### 6.3 Route Tree

```
PUBLIC:
  /login         → LoginPage
  /register      → RegisterPage

PROTECTED (ProtectedRoute + DashboardLayout):
  /              → RootRedirect (role-based: super_admin→/admin, HR→Dashboard, employee→SelfService)
  /my-profile    → Redirect to /employees/:userId
  /onboarding    → OnboardingWizard (no layout)

  HRMS:
    /employees, /employees/:id, /employees/probation, /employees/import
    /org-chart
    /attendance, /attendance/my, /attendance/shifts, /attendance/regularizations
    /leave, /leave/applications, /leave/calendar, /leave/comp-off, /leave/settings
    /documents, /documents/my, /documents/categories
    /announcements, /policies

  FEATURES:
    /helpdesk/*, /surveys/*, /assets/*, /positions/*
    /events/*, /wellness/*, /forum/*, /feedback/*
    /whistleblowing/*, /biometrics/* (subscription-conditional)
    /chatbot, /manager

  ADMIN (HR roles):
    /users, /settings, /audit, /custom-fields
    /modules, /billing

  SUPER ADMIN:
    /admin, /admin/organizations, /admin/modules, /admin/revenue
    /admin/health, /admin/data-sanity, /admin/ai-config
    /admin/logs, /admin/notifications, /admin/settings
```

### 6.4 Auth & Token Flow (Client-Side)

```
Zustand Auth Store (persisted in localStorage as 'empcloud-auth'):
  { accessToken, refreshToken, user: { id, email, role, org_id, ... }, isAuthenticated }

Axios Request Interceptor:
  → Attaches Authorization: Bearer ${accessToken}

Axios Response Interceptor (401 handling):
  → 401 received → POST /oauth/token { grant_type: refresh_token }
  → Success → Update tokens in store, replay original request
  → Failure → Logout, redirect to /login
  → Mutex pattern prevents cascade 401s during refresh
```

### 6.5 Real-Time Updates

```
Polling (via React Query refetchInterval):
  Notification unread count  → 30s
  Dashboard widgets          → 5min
  No WebSocket implementation (HTTP polling only)
```

---

## 7. Cross-Module Integration

### 7.1 Integration Topology

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    EMP Cloud (Hub)                          │
                    │                                                             │
                    │  ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐  │
                    │  │ Module      │  │ Subscription  │  │ Health Check     │  │
                    │  │ Registry    │  │ & Seats       │  │ (60s interval)   │  │
                    │  └──────┬──────┘  └───────┬───────┘  └────────┬─────────┘  │
                    │         │                  │                    │            │
                    │  ┌──────▼──────┐  ┌───────▼───────┐  ┌────────▼─────────┐  │
                    │  │ Webhook     │  │ Billing       │  │ Data Sanity      │  │
                    │  │ Inbound     │  │ Integration   │  │ Checker          │  │
                    │  └──────┬──────┘  └───────┬───────┘  └──────────────────┘  │
                    └─────────┼─────────────────┼─────────────────────────────────┘
                              │                  │
        ┌─────────────────────┼──────────────────┼────────────────────────────┐
        │                     │                  │                            │
   Webhooks IN           Billing API        Dashboard Widgets          HRMS Proxy
   (fire-and-forget)     (non-blocking)     (internal secret)         (Bearer token)
        │                     │                  │                            │
   ┌────▼─────┐          ┌───▼────┐        ┌────▼─────┐              ┌──────▼──────┐
   │ Recruit  │          │Billing │        │ Recruit  │              │  Payroll    │
   │ Exit     │          │ :4001  │        │ Perform  │              │  :4000      │
   │ Perform  │          │        │        │ Rewards  │              │             │
   │ Rewards  │          │        │        │ Exit     │              │ Fetches     │
   │          │          │        │        │ LMS      │              │ attendance  │
   │ Events:  │          │ Events:│        │          │              │ + leave     │
   │ hired    │          │ paid   │        │ GET      │              │ from Cloud  │
   │ exited   │          │ failed │        │ /analytics│             │             │
   │ reviewed │          │ cancel │        │ /overview │             │ Falls back  │
   │ awarded  │          │ overdue│        │          │              │ to local DB │
   └──────────┘          └────────┘        └──────────┘              └─────────────┘
```

### 7.2 Communication Protocols

| Flow | Source → Target | Protocol | Auth | Async | Fallback |
|------|----------------|----------|------|-------|----------|
| User login | Browser → Cloud | HTTPS/REST | — | Sync | — |
| Module subscription | Browser → Cloud | HTTPS/REST | RS256 JWT | Sync | — |
| Dashboard widgets | Cloud → Modules | HTTP/REST | Internal secret | Sync | Empty data + warning |
| Candidate hired | Recruit → Cloud | HTTP/POST | None | Fire-and-forget | Logged |
| Exit completed | Exit → Cloud | HTTP/POST | None | Fire-and-forget | Logged |
| Attendance proxy | Payroll → Cloud | HTTP/REST | Bearer token | Sync | Local DB |
| Invoice creation | Cloud → Billing | HTTP/REST | API key | Non-blocking | Warning logged |
| Payment event | Billing → Cloud | HTTP/POST | Signed webhook | Async | Logged |
| Health check | Cloud → All modules | HTTP/GET | None | Sync (5s timeout) | Mark as "down" |
| Module access check | Module → Cloud | HTTP/POST | None (body params) | Sync | — |

### 7.3 Module Webhook Events

**Inbound to Cloud** (`POST /api/v1/webhooks/modules`):

| Event | Source | Cloud Action |
|-------|--------|-------------|
| `recruit.candidate_hired` | Recruit | Set user status=1, designation, date_of_joining |
| `exit.initiated` | Exit | Log audit event |
| `exit.completed` | Exit | Set user status=2, date_of_exit |
| `performance.cycle_completed` | Performance | Log audit event |
| `rewards.milestone_achieved` | Rewards | Log audit event |

**Billing Webhook Events** (`POST /api/v1/webhooks/billing`):

| Event | Cloud Action |
|-------|-------------|
| `invoice.paid` | Mark subscription active |
| `payment.received` | Log audit |
| `subscription.cancelled` | Update subscription status |
| `subscription.payment_failed` | Mark subscription past_due |
| `invoice.overdue` | Mark subscription past_due |

### 7.4 Subscription Lifecycle

```
CREATE (org_admin)
  ├─ Select plan_tier (free/basic/professional/enterprise)
  ├─ Set total_seats, billing_cycle
  ├─ Status = "trial" or "active"
  └─ If paid: Cloud → Billing API (create invoice)
      │
ASSIGN SEATS
  ├─ Check used_seats < total_seats
  ├─ Insert org_module_seats row
  └─ Increment used_seats
      │
MODULE ACCESS CHECK (from sub-module)
  ├─ Verify subscription active/trial
  ├─ Verify user has seat
  └─ Return features for plan_tier
      │
BILLING PERIOD ENDS
  ├─ Grace period (configurable per org)
  ├─ Day 1: Reminder email
  ├─ Day 7: Warning email
  ├─ Day 15: Suspend (read-only)
  └─ Day 30: Deactivate (no access)
      │
PAYMENT RECEIVED (via webhook)
  └─ Mark subscription active
      │
CANCEL (org_admin)
  ├─ Status = "cancelled"
  └─ All seats revoked
```

### 7.5 Sub-Module Authentication Pattern

Sub-modules (Payroll, Rewards, Recruit, etc.) use a dual-auth approach:

```
1. USER AUTH (HS256 symmetric):
   ├─ JWT signed with shared secret (config.jwt.secret)
   ├─ Payload: { empcloudUserId, empcloudOrgId, moduleProfileId, role, email }
   └─ No revocation checking (trust network boundary)

2. INTERNAL SERVICE AUTH (header-based):
   ├─ X-Internal-Service: empcloud-dashboard
   ├─ X-Internal-Secret: <shared_secret>
   └─ Bypasses user auth (for server-to-server calls)

3. CLOUD DB DIRECT ACCESS:
   ├─ Separate Knex connection to empcloud database
   ├─ Read-only user/org lookups
   └─ Same MySQL instance, role-based access
```

### 7.6 Health Monitoring

```
Cloud monitors all 10 modules every 60 seconds:
  ├─ EMP Cloud      localhost:3000/health
  ├─ EMP Recruit    localhost:4500/health
  ├─ EMP Performance localhost:4300/health
  ├─ EMP Rewards    localhost:4600/health
  ├─ EMP Exit       localhost:4400/health
  ├─ EMP Billing    localhost:4001/health
  ├─ EMP LMS        localhost:4700/health
  ├─ EMP Payroll    localhost:4000/health
  ├─ EMP Projects   localhost:9000/health
  └─ EMP Monitor    localhost:5000/health

Infrastructure checks: MySQL (SELECT 1), Redis (PING)
Status: operational / degraded / major_outage
Cache: 60s TTL
```

---

## 8. Security Architecture

### 8.1 Authentication Security

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt, 12 rounds |
| JWT signing | RS256 (asymmetric) |
| Token revocation | Instant (DB check on every request via JTI) |
| Refresh token rotation | family_id tracks rotation chain, detects reuse |
| PKCE | Required for public OAuth clients (S256 + plain) |
| Authorization codes | One-time use, 10-minute expiry, hash stored |
| Password reset tokens | 32-byte random, SHA-256 hashed, 1-hour expiry, one-time |
| Rate limiting | Auth: 20/15min, API: 100/60s |
| Account lockout | Status check (active/inactive/suspended) + date_of_exit |
| Password expiry | Per-org configurable policy |

### 8.2 Multi-Tenancy Isolation

| Layer | Mechanism |
|-------|-----------|
| Database | `organization_id` column on every table, filtered in every query |
| JWT | org_id embedded in token payload (cryptographically signed) |
| RBAC | Role hierarchy enforced by middleware |
| File storage | Path includes `/{orgId}/{userId}/` |
| Audit | All logs include organization_id |
| Indexes | `(organization_id, ...)` composite indexes |

### 8.3 Security Headers (Helmet)

- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection

### 8.4 CORS Configuration

- Whitelist-based origin validation
- Configurable via `ALLOWED_ORIGINS` env var
- Default: localhost:5173, 5174, 5175 (Vite dev servers)

### 8.5 Input Validation

- All request bodies validated with Zod schemas
- File uploads: MIME type whitelist (PDF, JPEG, PNG, DOCX), 10MB limit
- Password policy: 8+ chars, uppercase, lowercase, digit, special char

### 8.6 Audit Logging

All significant actions logged to `audit_logs` table:
- Authentication events (login, logout, failed attempts, password changes)
- CRUD operations (user created, updated, deactivated)
- OAuth events (authorize, token issued, revoked)
- Module events (subscription, seat assignment)
- Webhook events (inbound module events)

Each log includes: organization_id, user_id, action, resource_type/id, IP address, user agent, details (JSON).

---

## Appendix: Key File Paths

### Server (`packages/server/src/`)

| Path | Purpose |
|------|---------|
| `index.ts` | Entry point, middleware registration, route mounting |
| `config/index.ts` | Environment configuration |
| `db/connection.ts` | Knex MySQL setup (pool: 2-20) |
| `db/migrations/*.ts` | 34 migration files |
| `api/middleware/auth.middleware.ts` | JWT validation |
| `api/middleware/rbac.middleware.ts` | Role-based access control |
| `api/middleware/error.middleware.ts` | Global error handler |
| `api/middleware/upload.middleware.ts` | File upload handling |
| `api/routes/*.ts` | 42 route files |
| `services/auth/auth.service.ts` | Login, register, password management |
| `services/oauth/oauth.service.ts` | OAuth2 flows, token lifecycle |
| `services/oauth/jwt.service.ts` | RS256 key management, signing |
| `services/subscription/subscription.service.ts` | Module subscription management |
| `services/billing/billing-integration.service.ts` | Billing API integration |
| `services/admin/health-check.service.ts` | Cross-module health monitoring |
| `services/admin/data-sanity.service.ts` | Data consistency checks |
| `services/webhook/module-webhook.service.ts` | Inbound webhook processing |
| `utils/response.ts` | sendSuccess/sendError/sendPaginated |
| `utils/errors.ts` | AppError class hierarchy |
| `utils/logger.ts` | Winston logging setup |

### Client (`packages/client/src/`)

| Path | Purpose |
|------|---------|
| `main.tsx` | React entry, QueryClient, Router |
| `App.tsx` | Master route configuration |
| `api/client.ts` | Axios instance with interceptors |
| `api/hooks.ts` | React Query hooks by feature |
| `lib/auth-store.ts` | Zustand auth store |
| `lib/i18n.ts` | i18next config (9 languages) |
| `components/layout/DashboardLayout.tsx` | App shell (sidebar + header) |
| `components/layout/navigation.config.ts` | Role-based nav items |
| `components/ChatWidget.tsx` | Floating AI assistant |
| `pages/` | 40+ page components organized by feature |
| `routes/` | 16 route config files |

### Shared (`packages/shared/src/`)

| Path | Purpose |
|------|---------|
| `types/index.ts` | Shared TypeScript types and enums |
| `validators/` | Shared Zod validation schemas |
