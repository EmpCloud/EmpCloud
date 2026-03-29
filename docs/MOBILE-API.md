# EMP Cloud Platform -- Complete API Documentation

**Version:** 1.0.0
**Last Updated:** 2026-03-30
**Audience:** Mobile App Developers, Third-Party Integrators

---

## Table of Contents

1. [Getting Started](#1-getting-started)
   - [Base URLs](#base-urls)
   - [Authentication](#authentication)
   - [SSO Flow for Mobile](#sso-flow-for-mobile)
   - [Response Envelope](#response-envelope)
   - [Pagination](#pagination)
   - [File Uploads](#file-uploads)
   - [Roles & Permissions](#roles--permissions)
   - [Rate Limiting](#rate-limiting)
   - [Error Codes Reference](#error-codes-reference)
2. [EMP Cloud Core](#2-emp-cloud-core)
   - [Auth](#21-auth)
   - [OAuth2 / OIDC](#22-oauth2--oidc)
   - [Organizations](#23-organizations)
   - [Users](#24-users)
   - [Modules (Marketplace)](#25-modules-marketplace)
   - [Subscriptions & Seats](#26-subscriptions--seats)
   - [Employees](#27-employees)
   - [Attendance](#28-attendance)
   - [Leave](#29-leave)
   - [Documents](#210-documents)
   - [Announcements](#211-announcements)
   - [Policies](#212-policies)
   - [Notifications](#213-notifications)
   - [Dashboard](#214-dashboard)
   - [Biometrics](#215-biometrics)
   - [Helpdesk](#216-helpdesk)
   - [Surveys](#217-surveys)
   - [Assets](#218-assets)
   - [Positions](#219-positions)
   - [Anonymous Feedback](#220-anonymous-feedback)
   - [Events](#221-events)
   - [Wellness](#222-wellness)
   - [Forum / Social Intranet](#223-forum--social-intranet)
   - [Whistleblowing](#224-whistleblowing)
   - [Chatbot](#225-chatbot)
   - [Custom Fields](#226-custom-fields)
   - [Manager Self-Service](#227-manager-self-service)
   - [Billing (Cloud Proxy)](#228-billing-cloud-proxy)
   - [Onboarding Wizard](#229-onboarding-wizard)
   - [Audit Logs](#230-audit-logs)
   - [Webhooks (Inbound)](#231-webhooks-inbound)
   - [Super Admin](#232-super-admin)
   - [AI Configuration (Super Admin)](#233-ai-configuration-super-admin)
   - [Log Dashboard (Super Admin)](#234-log-dashboard-super-admin)
   - [Probation Tracking](#235-probation-tracking)
   - [Service Health Dashboard (Super Admin)](#236-service-health-dashboard-super-admin)
   - [Data Sanity Checker (Super Admin)](#237-data-sanity-checker-super-admin)
   - [System Notifications (Super Admin)](#238-system-notifications-super-admin)
   - [Module Management (Super Admin)](#239-module-management-super-admin)
   - [User Management (Super Admin)](#240-user-management-super-admin)
   - [Platform Info (Super Admin)](#241-platform-info-super-admin)
3. [EMP Recruit](#3-emp-recruit)
4. [EMP Performance](#4-emp-performance)
5. [EMP Rewards](#5-emp-rewards)
6. [EMP Exit](#6-emp-exit)
7. [EMP Payroll](#7-emp-payroll)
8. [EMP LMS](#8-emp-lms)
9. [EMP Billing](#9-emp-billing)
10. [Webhook Format](#10-webhook-format)

---

## 1. Getting Started

### Base URLs

| Module | Base URL |
|--------|----------|
| EMP Cloud (Core HRMS) | `https://test-empcloud-api.empcloud.com` |
| EMP Recruit | `https://test-recruit-api.empcloud.com` |
| EMP Performance | `https://test-performance-api.empcloud.com` |
| EMP Rewards | `https://test-rewards-api.empcloud.com` |
| EMP Exit | `https://test-exit-api.empcloud.com` |
| EMP LMS | `https://testlms-api.empcloud.com` |
| EMP Payroll | `https://testpayroll-api.empcloud.com` |
| EMP Billing | (Internal only -- not directly accessible by mobile) |

### Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Getting a token:**

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "ananya@technova.in",
  "password": "SecureP@ss123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 522,
      "email": "ananya@technova.in",
      "first_name": "Ananya",
      "last_name": "Gupta",
      "role": "org_admin",
      "organization_id": 5
    },
    "tokens": {
      "access_token": "eyJhbGciOiJSUzI1NiIs...",
      "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
    },
    "org": {
      "id": 5,
      "name": "TechNova Solutions",
      "country": "IN"
    }
  }
}
```

**Refreshing a token (OAuth2):**

```http
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "client_id": "your-client-id"
}
```

**Token characteristics:**
- Algorithm: RS256 (asymmetric JWT)
- Access token lifetime: ~15 minutes
- Refresh tokens are rotated on each use
- Revocation is instant (server-side check)

### SSO Flow for Mobile

To access a sub-module (Recruit, Payroll, etc.) from the mobile app:

1. User authenticates with EMP Cloud and receives an `access_token`
2. Mobile app calls the sub-module's SSO endpoint:

```http
POST https://test-recruit-api.empcloud.com/api/v1/auth/sso
Content-Type: application/json

{
  "token": "<empcloud_access_token>"
}
```

3. The sub-module validates the token with EMP Cloud, verifies the user has a seat for that module, and returns its own module-specific token
4. Use the module-specific token for all subsequent requests to that module

### Response Envelope

All API responses follow a consistent envelope format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Paginated Success:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 150,
    "page": 1,
    "per_page": 20,
    "total_pages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email address",
    "details": { ... }
  }
}
```

### Pagination

Most list endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number (1-indexed) |
| per_page | number | 20 | Items per page (max 100) |
| search | string | -- | Full-text search (where supported) |

### File Uploads

File upload endpoints use `multipart/form-data`. The file field name is `file` unless stated otherwise.

```
POST /api/v1/documents/upload
Content-Type: multipart/form-data

file: <binary>
category_id: 3
name: "Passport Scan"
```

Maximum file sizes:
- Documents: 10 MB
- CSV imports: 5 MB
- Profile photos: 2 MB
- Resumes (Recruit): 10 MB

### Roles & Permissions

| Role | Level | Description |
|------|-------|-------------|
| `super_admin` | 100 | Platform-level admin (EMP Cloud operator) |
| `org_admin` | 80 | Organization administrator |
| `hr_admin` | 60 | HR department head |
| `hr_manager` | 40 | HR team member |
| `manager` | 20 | Team/department manager |
| `employee` | 10 | Standard employee |

Endpoints annotated with **Auth: HR** require `hr_manager` or above.
Endpoints annotated with **Auth: Admin** require `org_admin` or above.
Endpoints annotated with **Auth: Super Admin** require `super_admin`.

### Rate Limiting

| Endpoint Category | Window | Max Requests |
|-------------------|--------|-------------|
| Auth (login, register, forgot-password) | 15 minutes | 20 |
| OAuth token | 15 minutes | 60 |
| General API | 1 minute | 120 |
| File upload | 1 minute | 10 |
| Chatbot send | 1 minute | 20 |

Rate-limited responses return `429 Too Many Requests` with a `Retry-After` header.

### Error Codes Reference

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Request body or query parameter validation failed |
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 401 | `TOKEN_EXPIRED` | Access token has expired -- refresh it |
| 403 | `FORBIDDEN` | Insufficient permissions for this action |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource or conflicting state |
| 422 | `UNPROCESSABLE_ENTITY` | Business logic validation failed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 502 | `BILLING_UNAVAILABLE` | Billing service is unreachable |

---

## 2. EMP Cloud Core

**Base URL:** `https://test-empcloud-api.empcloud.com`

---

### 2.1 Auth

#### POST /api/v1/auth/register

**Description:** Register a new organization and admin user

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| org_name | string | Yes | Organization display name |
| org_legal_name | string | No | Legal entity name |
| org_country | string | Yes | ISO country code (e.g., "IN") |
| org_state | string | No | State/province |
| org_timezone | string | No | IANA timezone (e.g., "Asia/Kolkata") |
| org_email | string | No | Organization contact email |
| first_name | string | Yes | Admin user first name |
| last_name | string | Yes | Admin user last name |
| email | string | Yes | Admin user email |
| password | string | Yes | Min 8 characters |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "org": { "id": 5, "name": "TechNova Solutions" },
    "user": { "id": 522, "email": "ananya@technova.in", "role": "org_admin" },
    "tokens": {
      "access_token": "eyJhbG...",
      "refresh_token": "eyJhbG..."
    }
  }
}
```

**Error Responses:**
- `409` -- Email already registered
- `400` -- Validation error

---

#### POST /api/v1/auth/login

**Description:** Authenticate user with email and password

**Auth Required:** No

**Rate Limited:** Yes (20 requests/15 min)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email address |
| password | string | Yes | User password |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 522,
      "email": "ananya@technova.in",
      "first_name": "Ananya",
      "last_name": "Gupta",
      "role": "org_admin",
      "organization_id": 5
    },
    "tokens": {
      "access_token": "eyJhbG...",
      "refresh_token": "eyJhbG..."
    },
    "org": { "id": 5, "name": "TechNova Solutions" }
  }
}
```

**Error Responses:**
- `401` -- Invalid email or password
- `429` -- Too many attempts, rate limited

---

#### POST /api/v1/auth/change-password

**Description:** Change current user's password

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| current_password | string | Yes | Current password |
| new_password | string | Yes | New password (min 8 chars) |

**Response (200):**
```json
{ "success": true, "data": { "message": "Password changed successfully" } }
```

**Error Responses:**
- `401` -- Current password incorrect

---

#### POST /api/v1/auth/forgot-password

**Description:** Request a password reset email. Always returns success to prevent email enumeration.

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Account email |

**Response (200):**
```json
{ "success": true, "data": { "message": "If the email exists, a reset link has been sent" } }
```

---

#### POST /api/v1/auth/reset-password

**Description:** Reset password using a token from the reset email

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Reset token from email |
| password | string | Yes | New password |

**Response (200):**
```json
{ "success": true, "data": { "message": "Password reset successfully" } }
```

**Error Responses:**
- `400` -- Invalid or expired token

---

### 2.2 OAuth2 / OIDC

#### GET /.well-known/openid-configuration

**Description:** OpenID Connect discovery document

**Auth Required:** No

**Response (200):** Standard OIDC discovery JSON

---

#### GET /oauth/jwks

**Description:** JSON Web Key Set for token verification

**Auth Required:** No

**Response (200):** JWKS JSON with RS256 public keys

---

#### GET /oauth/authorize

**Description:** OAuth2 authorization endpoint. Validates the client, creates an authorization code, and redirects back with the code.

**Auth Required:** Yes (Bearer token)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| client_id | string | Yes | OAuth client ID |
| redirect_uri | string | Yes | Registered redirect URI |
| response_type | string | Yes | Must be "code" |
| scope | string | No | Space-separated scopes |
| state | string | Yes | CSRF state parameter |
| code_challenge | string | Conditional | Required for public clients (PKCE) |
| code_challenge_method | string | No | "S256" (default) or "plain" |
| nonce | string | No | OIDC nonce |

**Response:** 302 redirect to `redirect_uri?code=<code>&state=<state>`

---

#### POST /oauth/token

**Description:** Exchange authorization code or refresh token for access tokens

**Auth Required:** No (client credentials in body)

**Request Body (authorization_code):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| grant_type | string | Yes | "authorization_code" |
| code | string | Yes | Authorization code |
| client_id | string | Yes | OAuth client ID |
| client_secret | string | Conditional | Required for confidential clients |
| redirect_uri | string | Yes | Must match authorize request |
| code_verifier | string | Conditional | PKCE verifier for public clients |

**Request Body (refresh_token):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| grant_type | string | Yes | "refresh_token" |
| refresh_token | string | Yes | Refresh token |
| client_id | string | Yes | OAuth client ID |

**Response (200):**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbG...",
  "id_token": "eyJhbG..."
}
```

---

#### POST /oauth/revoke

**Description:** Revoke an access or refresh token (RFC 7009)

**Auth Required:** No (client credentials in body)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Token to revoke |
| token_type_hint | string | No | "access_token" or "refresh_token" |
| client_id | string | Yes | OAuth client ID |
| client_secret | string | Conditional | Required for confidential clients |

**Response:** `200 OK` (always, per RFC 7009)

---

#### POST /oauth/introspect

**Description:** Token introspection (RFC 7662)

**Auth Required:** No (client credentials in body)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Token to inspect |
| token_type_hint | string | No | "access_token" or "refresh_token" |
| client_id | string | Yes | OAuth client ID |
| client_secret | string | Conditional | Required for confidential clients |

**Response (200):**
```json
{
  "active": true,
  "sub": "522",
  "client_id": "recruit-app",
  "scope": "openid profile",
  "exp": 1711500000
}
```

---

#### GET /oauth/userinfo

**Description:** OIDC UserInfo endpoint

**Auth Required:** Yes

**Response (200):**
```json
{
  "sub": "522",
  "email": "ananya@technova.in",
  "name": "Ananya Gupta",
  "given_name": "Ananya",
  "family_name": "Gupta",
  "org_id": 5,
  "org_name": "TechNova Solutions",
  "role": "org_admin"
}
```

---

### 2.3 Organizations

#### GET /api/v1/organizations/me

**Description:** Get current user's organization

**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "name": "TechNova Solutions",
    "legal_name": "TechNova Solutions Pvt Ltd",
    "country": "IN",
    "state": "Karnataka",
    "timezone": "Asia/Kolkata",
    "email": "admin@technova.in"
  }
}
```

---

#### PUT /api/v1/organizations/me

**Description:** Update organization settings

**Auth Required:** Yes (Admin)

**Request Body:** Partial organization fields (name, legal_name, country, state, timezone, email)

---

#### GET /api/v1/organizations/me/stats

**Description:** Organization statistics (user count, department count, etc.)

**Auth Required:** Yes

---

#### GET /api/v1/organizations/me/departments

**Description:** List all departments

**Auth Required:** Yes

---

#### POST /api/v1/organizations/me/departments

**Description:** Create a department

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Department name |

---

#### DELETE /api/v1/organizations/me/departments/:id

**Description:** Delete a department

**Auth Required:** Yes (Admin)

---

#### GET /api/v1/organizations/me/locations

**Description:** List all office locations

**Auth Required:** Yes

---

#### POST /api/v1/organizations/me/locations

**Description:** Create an office location

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Location name |
| address | string | No | Street address |
| city | string | No | City |
| state | string | No | State/province |
| country | string | No | Country |
| latitude | number | No | GPS latitude |
| longitude | number | No | GPS longitude |

---

#### DELETE /api/v1/organizations/me/locations/:id

**Description:** Delete an office location

**Auth Required:** Yes (Admin)

---

### 2.4 Users

#### GET /api/v1/users

**Description:** List users in the organization (paginated)

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `search`

---

#### GET /api/v1/users/:id

**Description:** Get a single user by ID

**Auth Required:** Yes

---

#### POST /api/v1/users

**Description:** Create a new user

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email |
| first_name | string | Yes | First name |
| last_name | string | Yes | Last name |
| role | string | Yes | One of the role values |
| department_id | number | No | Department ID |
| phone | string | No | Phone number |

---

#### PUT /api/v1/users/:id

**Description:** Update a user

**Auth Required:** Yes (Admin)

---

#### DELETE /api/v1/users/:id

**Description:** Deactivate a user (soft delete)

**Auth Required:** Yes (Admin)

---

#### POST /api/v1/users/invite

**Description:** Send an invitation email to a new user

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Invitee email |
| role | string | Yes | Assigned role |
| department_id | number | No | Department |

---

#### POST /api/v1/users/accept-invitation

**Description:** Accept an invitation and create account

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Invitation token |
| first_name | string | Yes | First name |
| last_name | string | Yes | Last name |
| password | string | Yes | Account password |

---

#### GET /api/v1/users/invitations

**Description:** List pending invitations

**Auth Required:** Yes (Admin)

**Query Parameters:** `status` (default: "pending")

---

#### GET /api/v1/users/org-chart

**Description:** Get organizational hierarchy tree

**Auth Required:** Yes

---

#### POST /api/v1/users/import

**Description:** Parse CSV and return preview of user import

**Auth Required:** Yes (Admin)

**Content-Type:** multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | CSV file (max 5MB) |

---

#### POST /api/v1/users/import/execute

**Description:** Execute the user import after preview

**Auth Required:** Yes (Admin)

**Content-Type:** multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Same CSV file |

---

### 2.5 Modules (Marketplace)

#### GET /api/v1/modules

**Description:** List all available modules in the marketplace

**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "EMP Recruit",
      "slug": "recruit",
      "description": "Applicant tracking & hiring",
      "icon": "users-search",
      "monthly_price": 50000,
      "yearly_price": 500000,
      "is_active": true
    }
  ]
}
```

---

#### GET /api/v1/modules/:id

**Description:** Get single module details

**Auth Required:** Yes

---

#### GET /api/v1/modules/:id/features

**Description:** Get features/capabilities for a module

**Auth Required:** Yes

---

#### POST /api/v1/modules

**Description:** Create a new module (platform admin only)

**Auth Required:** Yes (Super Admin)

---

#### PUT /api/v1/modules/:id

**Description:** Update a module

**Auth Required:** Yes (Super Admin)

---

### 2.6 Subscriptions & Seats

#### GET /api/v1/subscriptions

**Description:** List organization's active subscriptions

**Auth Required:** Yes

---

#### GET /api/v1/subscriptions/:id

**Description:** Get subscription details

**Auth Required:** Yes

---

#### GET /api/v1/subscriptions/billing-summary

**Description:** Billing summary for the organization

**Auth Required:** Yes

---

#### POST /api/v1/subscriptions

**Description:** Subscribe to a module

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| module_id | number | Yes | Module to subscribe to |
| plan_tier | string | Yes | "basic", "pro", or "enterprise" |
| total_seats | number | Yes | Number of seats |
| billing_period | string | No | "monthly" or "yearly" |

---

#### PUT /api/v1/subscriptions/:id

**Description:** Update subscription (change plan, seats)

**Auth Required:** Yes (Admin)

---

#### DELETE /api/v1/subscriptions/:id

**Description:** Cancel a subscription

**Auth Required:** Yes (Admin)

---

#### GET /api/v1/subscriptions/:id/seats

**Description:** List seat assignments for a subscription

**Auth Required:** Yes

---

#### POST /api/v1/subscriptions/assign-seat

**Description:** Assign a module seat to a user

**Auth Required:** Yes (Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| module_id | number | Yes | Module ID |
| user_id | number | Yes | User to assign seat to |

---

#### POST /api/v1/subscriptions/revoke-seat

**Description:** Revoke a module seat from a user

**Auth Required:** Yes (Admin)

**Request Body:** Same as assign-seat

---

#### POST /api/v1/subscriptions/check-access

**Description:** Check if a user has access to a module (used by sub-modules internally)

**Auth Required:** No (service-to-service)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | number | Yes | User ID |
| module_slug | string | Yes | Module slug (e.g., "recruit") |
| organization_id | number | Yes | Org ID |

---

### 2.7 Employees

#### GET /api/v1/employees/directory

**Description:** Employee directory with search and filters

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `search`, `department_id`, `location_id`

---

#### GET /api/v1/employees/birthdays

**Description:** Upcoming birthdays in the organization

**Auth Required:** Yes

---

#### GET /api/v1/employees/anniversaries

**Description:** Upcoming work anniversaries

**Auth Required:** Yes

---

#### GET /api/v1/employees/headcount

**Description:** Headcount analytics by department, location, etc.

**Auth Required:** Yes (HR)

---

#### GET /api/v1/employees/:id/profile

**Description:** Get employee profile (personal details, emergency contacts, etc.)

**Auth Required:** Yes (Self or HR)

---

#### PUT /api/v1/employees/:id/profile

**Description:** Create or update employee profile

**Auth Required:** Yes (Self or HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| date_of_birth | string | No | YYYY-MM-DD |
| gender | string | No | "male", "female", "other" |
| marital_status | string | No | "single", "married", etc. |
| blood_group | string | No | Blood type |
| personal_email | string | No | Personal email |
| personal_phone | string | No | Personal phone |
| emergency_contact_name | string | No | Emergency contact |
| emergency_contact_phone | string | No | Emergency phone |

---

#### GET /api/v1/employees/:id/addresses

**Description:** List employee addresses

**Auth Required:** Yes (Self or HR)

---

#### POST /api/v1/employees/:id/addresses

**Description:** Add an address

**Auth Required:** Yes (Self or HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | "permanent", "current", "temporary" |
| line1 | string | Yes | Address line 1 |
| line2 | string | No | Address line 2 |
| city | string | Yes | City |
| state | string | Yes | State |
| postal_code | string | Yes | ZIP/postal code |
| country | string | Yes | Country |

---

#### PUT /api/v1/employees/:id/addresses/:addressId

**Description:** Update an address

**Auth Required:** Yes (Self or HR)

---

#### DELETE /api/v1/employees/:id/addresses/:addressId

**Description:** Delete an address

**Auth Required:** Yes (Self or HR)

---

#### GET /api/v1/employees/:id/education

**Description:** List education records

**Auth Required:** Yes (Self or HR)

---

#### POST /api/v1/employees/:id/education

**Description:** Add education record

**Auth Required:** Yes (Self or HR)

---

#### PUT /api/v1/employees/:id/education/:educationId

**Description:** Update education record

**Auth Required:** Yes (Self or HR)

---

#### DELETE /api/v1/employees/:id/education/:educationId

**Description:** Delete education record

**Auth Required:** Yes (Self or HR)

---

#### GET /api/v1/employees/:id/experience

**Description:** List work experience records

**Auth Required:** Yes (Self or HR)

---

#### POST /api/v1/employees/:id/experience

**Description:** Add work experience record

**Auth Required:** Yes (Self or HR)

---

#### PUT /api/v1/employees/:id/experience/:experienceId

**Description:** Update work experience record

**Auth Required:** Yes (Self or HR)

---

#### DELETE /api/v1/employees/:id/experience/:experienceId

**Description:** Delete work experience record

**Auth Required:** Yes (Self or HR)

---

#### GET /api/v1/employees/:id/dependents

**Description:** List dependents

**Auth Required:** Yes (Self or HR)

---

#### POST /api/v1/employees/:id/dependents

**Description:** Add a dependent

**Auth Required:** Yes (Self or HR)

---

#### PUT /api/v1/employees/:id/dependents/:dependentId

**Description:** Update a dependent

**Auth Required:** Yes (Self or HR)

---

#### DELETE /api/v1/employees/:id/dependents/:dependentId

**Description:** Delete a dependent

**Auth Required:** Yes (Self or HR)

---

#### POST /api/v1/employees/:id/photo

**Description:** Upload a profile photo for an employee (multipart/form-data)

**Auth Required:** Yes (Self or HR)

**Request:** `multipart/form-data` with field `photo` (JPEG/PNG, max 2 MB)

**Response (200):**
```json
{ "success": true, "data": { "message": "Photo uploaded successfully", "photo_url": "/uploads/orgs/5/photos/522.jpg" } }
```

---

#### GET /api/v1/employees/:id/photo

**Description:** Get employee profile photo

**Auth Required:** Yes

**Response:** Binary image (JPEG/PNG) with appropriate Content-Type header. Returns 404 if no photo uploaded.

---

### 2.8 Attendance

#### Shifts

##### GET /api/v1/attendance/shifts

**Description:** List all shifts in the organization

**Auth Required:** Yes

---

##### POST /api/v1/attendance/shifts

**Description:** Create a new shift

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Shift name |
| start_time | string | Yes | HH:MM format |
| end_time | string | Yes | HH:MM format |
| grace_period_minutes | number | No | Late check-in grace |
| is_overnight | boolean | No | Crosses midnight |
| working_days | number[] | No | 0=Sun, 1=Mon, ... 6=Sat |

---

##### PUT /api/v1/attendance/shifts/:id

**Description:** Update a shift

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/attendance/shifts/:id

**Description:** Deactivate a shift

**Auth Required:** Yes (HR)

---

##### POST /api/v1/attendance/shifts/assign

**Description:** Assign a shift to a user

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | number | Yes | Employee ID |
| shift_id | number | Yes | Shift ID |
| effective_from | string | Yes | YYYY-MM-DD |
| effective_to | string | No | YYYY-MM-DD |

---

##### GET /api/v1/attendance/shifts/assignments

**Description:** List shift assignments

**Auth Required:** Yes (HR)

**Query Parameters:** `user_id`, `shift_id`

---

##### POST /api/v1/attendance/shifts/bulk-assign

**Description:** Bulk assign shifts to multiple users

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| shift_id | number | Yes | Shift ID |
| user_ids | number[] | Yes | Array of employee IDs |
| effective_from | string | Yes | YYYY-MM-DD |

---

##### GET /api/v1/attendance/shifts/schedule

**Description:** View shift schedule grid (HR view)

**Auth Required:** Yes (HR)

**Query Parameters:** `start_date`, `end_date`, `department_id`

---

##### GET /api/v1/attendance/shifts/my-schedule

**Description:** View current user's shift schedule

**Auth Required:** Yes

---

##### POST /api/v1/attendance/shifts/swap-request

**Description:** Request to swap shift with another employee

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| target_user_id | number | Yes | User to swap with |
| swap_date | string | Yes | Date of the swap |
| reason | string | No | Reason for swap |

---

##### GET /api/v1/attendance/shifts/swap-requests

**Description:** List shift swap requests

**Auth Required:** Yes (HR)

**Query Parameters:** `status`

---

##### POST /api/v1/attendance/shifts/swap-requests/:id/approve

**Description:** Approve a shift swap request

**Auth Required:** Yes (HR)

---

##### POST /api/v1/attendance/shifts/swap-requests/:id/reject

**Description:** Reject a shift swap request

**Auth Required:** Yes (HR)

---

##### GET /api/v1/attendance/shifts/:id

**Description:** Get a single shift by ID

**Auth Required:** Yes

---

#### Geo-Fences

##### GET /api/v1/attendance/geo-fences

**Description:** List geo-fence locations

**Auth Required:** Yes

---

##### POST /api/v1/attendance/geo-fences

**Description:** Create a geo-fence zone

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Location name |
| latitude | number | Yes | Center latitude |
| longitude | number | Yes | Center longitude |
| radius_meters | number | Yes | Fence radius |

---

##### PUT /api/v1/attendance/geo-fences/:id

**Description:** Update a geo-fence

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/attendance/geo-fences/:id

**Description:** Deactivate a geo-fence

**Auth Required:** Yes (HR)

---

#### Attendance Records

##### POST /api/v1/attendance/check-in

**Description:** Clock in for the day

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| latitude | number | No | GPS latitude |
| longitude | number | No | GPS longitude |
| notes | string | No | Check-in notes |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1234,
    "user_id": 522,
    "check_in_time": "2026-03-26T09:02:15.000Z",
    "status": "present",
    "is_late": false
  }
}
```

---

##### POST /api/v1/attendance/check-out

**Description:** Clock out for the day

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| latitude | number | No | GPS latitude |
| longitude | number | No | GPS longitude |
| notes | string | No | Check-out notes |

---

##### GET /api/v1/attendance/me/today

**Description:** Get today's attendance record for current user

**Auth Required:** Yes

---

##### GET /api/v1/attendance/me/history

**Description:** Get attendance history for current user

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `month`, `year`

---

##### GET /api/v1/attendance/records

**Description:** List attendance records (all employees)

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `month`, `year`, `user_id`, `department_id`

---

##### GET /api/v1/attendance/dashboard

**Description:** Attendance dashboard stats (today's present, absent, late, etc.)

**Auth Required:** Yes (HR)

---

##### GET /api/v1/attendance/monthly-report

**Description:** Monthly attendance report

**Auth Required:** Yes (HR)

**Query Parameters:** `month`, `year`, `user_id`

---

#### Regularizations

##### POST /api/v1/attendance/regularizations

**Description:** Submit a regularization request (correct missed check-in/out)

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| date | string | Yes | Date to regularize (YYYY-MM-DD) |
| check_in_time | string | No | Corrected check-in time |
| check_out_time | string | No | Corrected check-out time |
| reason | string | Yes | Reason for regularization |

---

##### GET /api/v1/attendance/regularizations

**Description:** List all regularization requests

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `status`

---

##### GET /api/v1/attendance/regularizations/me

**Description:** My regularization requests

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`

---

##### PUT /api/v1/attendance/regularizations/:id/approve

**Description:** Approve or reject a regularization

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "approved" or "rejected" |
| rejection_reason | string | Conditional | Required if rejecting |

---

### 2.9 Leave

#### Leave Types

##### GET /api/v1/leave/types

**Description:** List all leave types (Casual, Sick, Earned, etc.)

**Auth Required:** Yes

---

##### GET /api/v1/leave/types/:id

**Description:** Get leave type details

**Auth Required:** Yes

---

##### POST /api/v1/leave/types

**Description:** Create a leave type

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | "Casual Leave" |
| code | string | Yes | "CL" |
| description | string | No | Description |
| default_balance | number | Yes | Annual entitlement |
| is_paid | boolean | No | Default true |
| is_carry_forward | boolean | No | Can carry to next year |
| max_carry_forward | number | No | Max carry forward days |

---

##### PUT /api/v1/leave/types/:id

**Description:** Update a leave type

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/leave/types/:id

**Description:** Deactivate a leave type

**Auth Required:** Yes (HR)

---

#### Leave Policies

##### GET /api/v1/leave/policies

**Description:** List leave policies

**Auth Required:** Yes

---

##### GET /api/v1/leave/policies/:id

**Description:** Get policy details

**Auth Required:** Yes

---

##### POST /api/v1/leave/policies

**Description:** Create leave policy

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/leave/policies/:id

**Description:** Update leave policy

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/leave/policies/:id

**Description:** Deactivate leave policy

**Auth Required:** Yes (HR)

---

#### Leave Balances

##### GET /api/v1/leave/balances

**Description:** Get leave balances. Defaults to current user; HR can query by `user_id`.

**Auth Required:** Yes

**Query Parameters:** `user_id`, `year`

---

##### GET /api/v1/leave/balances/me

**Description:** Shortcut for current user's leave balances

**Auth Required:** Yes

**Query Parameters:** `year`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "leave_type_id": 1,
      "leave_type_name": "Casual Leave",
      "total_allocated": 12,
      "total_used": 3,
      "balance": 9,
      "year": 2026
    }
  ]
}
```

---

##### POST /api/v1/leave/balances/initialize

**Description:** Initialize leave balances for all employees for a given year

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| year | number | Yes | Year to initialize (e.g., 2026) |

---

#### Leave Applications

##### GET /api/v1/leave/applications/me

**Description:** Current user's leave applications

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `leave_type_id`

---

##### GET /api/v1/leave/applications

**Description:** List all leave applications (HR can filter by user_id)

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `leave_type_id`, `user_id`

---

##### GET /api/v1/leave/applications/:id

**Description:** Get leave application details

**Auth Required:** Yes

---

##### POST /api/v1/leave/applications

**Description:** Apply for leave

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| leave_type_id | number | Yes | Leave type ID |
| start_date | string | Yes | YYYY-MM-DD |
| end_date | string | Yes | YYYY-MM-DD |
| reason | string | Yes | Reason for leave |
| is_half_day | boolean | No | Half day leave |
| half_day_period | string | No | "first_half" or "second_half" |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "user_id": 522,
    "leave_type_id": 1,
    "start_date": "2026-04-10",
    "end_date": "2026-04-11",
    "days": 2,
    "status": "pending",
    "reason": "Family event"
  }
}
```

---

##### PUT /api/v1/leave/applications/:id/approve

**Description:** Approve a leave application

**Auth Required:** Yes (Manager/HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| remarks | string | No | Approval remarks |

---

##### PUT /api/v1/leave/applications/:id/reject

**Description:** Reject a leave application

**Auth Required:** Yes (Manager/HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| remarks | string | No | Rejection reason |

---

##### PUT /api/v1/leave/applications/:id/cancel

**Description:** Cancel a leave application (by the applicant)

**Auth Required:** Yes

---

##### GET /api/v1/leave/calendar

**Description:** Leave calendar showing who is on leave

**Auth Required:** Yes

**Query Parameters:** `month`, `year`

---

#### Comp-Off

##### GET /api/v1/leave/comp-off

**Description:** List comp-off requests

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `user_id`, `status`

---

##### GET /api/v1/leave/comp-off/my

**Description:** My comp-off requests

**Auth Required:** Yes

---

##### GET /api/v1/leave/comp-off/pending

**Description:** Pending comp-off approvals

**Auth Required:** Yes

---

##### GET /api/v1/leave/comp-off/balance

**Description:** My comp-off leave balance

**Auth Required:** Yes

**Query Parameters:** `year`

---

##### POST /api/v1/leave/comp-off

**Description:** Request compensatory off

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| worked_date | string | Yes | Date worked (YYYY-MM-DD) |
| reason | string | Yes | Why comp-off is requested |
| hours_worked | number | No | Hours worked on that day |

---

##### PUT /api/v1/leave/comp-off/:id/approve

**Description:** Approve comp-off request

**Auth Required:** Yes (Manager/HR)

---

##### PUT /api/v1/leave/comp-off/:id/reject

**Description:** Reject comp-off request

**Auth Required:** Yes (Manager/HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| reason | string | No | Rejection reason |

---

### 2.10 Documents

#### GET /api/v1/documents/categories

**Description:** List document categories

**Auth Required:** Yes

---

#### POST /api/v1/documents/categories

**Description:** Create a document category

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/documents/categories/:id

**Description:** Update a category

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/documents/categories/:id

**Description:** Deactivate a category

**Auth Required:** Yes (HR)

---

#### GET /api/v1/documents

**Description:** List documents. HR sees all; employees see only their own.

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `category_id`, `user_id` (HR only)

---

#### POST /api/v1/documents/upload

**Description:** Upload a document

**Auth Required:** Yes

**Content-Type:** multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Document file |
| category_id | number | Yes | Category ID |
| name | string | No | Document name (defaults to filename) |
| user_id | number | No | Employee ID (HR can upload for others) |
| expires_at | string | No | Expiry date (YYYY-MM-DD) |

---

#### GET /api/v1/documents/my

**Description:** Current user's documents

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`

---

#### GET /api/v1/documents/expiring

**Description:** Documents expiring within N days

**Auth Required:** Yes (HR)

**Query Parameters:** `days` (default: 30)

---

#### GET /api/v1/documents/mandatory-status

**Description:** Mandatory document compliance tracking

**Auth Required:** Yes (HR)

---

#### GET /api/v1/documents/tracking/mandatory

**Description:** Mandatory document tracking (alias)

**Auth Required:** Yes (HR)

---

#### GET /api/v1/documents/tracking/expiry

**Description:** Document expiry tracking

**Auth Required:** Yes (HR)

---

#### GET /api/v1/documents/:id

**Description:** Get document details

**Auth Required:** Yes

---

#### GET /api/v1/documents/:id/download

**Description:** Download document file

**Auth Required:** Yes

---

#### DELETE /api/v1/documents/:id

**Description:** Delete a document

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/documents/:id/verify

**Description:** Verify a document

**Auth Required:** Yes (HR)

---

#### POST /api/v1/documents/:id/reject

**Description:** Reject a document with reason

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rejection_reason | string | Yes | Why the document is rejected |

---

### 2.11 Announcements

#### GET /api/v1/announcements

**Description:** List announcements (filtered by user's department/role visibility)

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`

---

#### GET /api/v1/announcements/unread-count

**Description:** Count of unread announcements

**Auth Required:** Yes

---

#### POST /api/v1/announcements

**Description:** Create an announcement

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Announcement title |
| content | string | Yes | Announcement body (HTML supported) |
| priority | string | No | "low", "medium", "high" |
| target_roles | string[] | No | Target specific roles |
| target_departments | number[] | No | Target specific departments |
| publish_at | string | No | Scheduled publish date |

---

#### PUT /api/v1/announcements/:id

**Description:** Update an announcement

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/announcements/:id

**Description:** Delete an announcement

**Auth Required:** Yes (HR)

---

#### POST /api/v1/announcements/:id/read

**Description:** Mark announcement as read

**Auth Required:** Yes

---

### 2.12 Policies

#### GET /api/v1/policies

**Description:** List company policies

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `category`

---

#### GET /api/v1/policies/pending

**Description:** Policies the current user has not yet acknowledged

**Auth Required:** Yes

---

#### GET /api/v1/policies/:id

**Description:** Get policy details

**Auth Required:** Yes

---

#### POST /api/v1/policies

**Description:** Create a company policy

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Policy title |
| content | string | Yes | Policy body (HTML) |
| category | string | No | Policy category |
| version | string | No | Version number |
| requires_acknowledgment | boolean | No | Employees must acknowledge |
| effective_date | string | No | YYYY-MM-DD |

---

#### PUT /api/v1/policies/:id

**Description:** Update a policy

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/policies/:id

**Description:** Deactivate a policy

**Auth Required:** Yes (HR)

---

#### POST /api/v1/policies/:id/acknowledge

**Description:** Acknowledge a policy

**Auth Required:** Yes

---

#### GET /api/v1/policies/:id/acknowledgments

**Description:** List who has acknowledged a policy

**Auth Required:** Yes (HR)

---

### 2.13 Notifications

#### GET /api/v1/notifications

**Description:** List notifications for current user

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `unread_only` (boolean)

---

#### GET /api/v1/notifications/unread-count

**Description:** Unread notification count

**Auth Required:** Yes

**Response (200):**
```json
{ "success": true, "data": { "count": 7 } }
```

---

#### PUT /api/v1/notifications/:id/read

**Description:** Mark a notification as read

**Auth Required:** Yes

---

#### PUT /api/v1/notifications/read-all

**Description:** Mark all notifications as read

**Auth Required:** Yes

---

### 2.14 Dashboard

#### GET /api/v1/dashboard/widgets

**Description:** Dashboard widget data for all subscribed modules

**Auth Required:** Yes

---

### 2.15 Biometrics

#### Face Enrollment

##### POST /api/v1/biometrics/face/enroll

**Description:** Enroll a user's face for biometric attendance

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | number | Yes | Employee ID |
| face_encoding | string | Yes | Base64 face encoding |
| thumbnail_path | string | No | Path to face thumbnail |
| enrollment_method | string | No | "photo", "live" |
| quality_score | number | No | 0-100 quality score |

---

##### GET /api/v1/biometrics/face/enrollments

**Description:** List face enrollments

**Auth Required:** Yes (HR)

**Query Parameters:** `user_id`

---

##### DELETE /api/v1/biometrics/face/enrollments/:id

**Description:** Remove a face enrollment

**Auth Required:** Yes (HR)

---

##### POST /api/v1/biometrics/face/verify

**Description:** Verify a face against enrolled data

**Auth Required:** Yes

---

#### QR Codes

##### POST /api/v1/biometrics/qr/generate

**Description:** Generate a QR code for a user

**Auth Required:** Yes (HR)

---

##### GET /api/v1/biometrics/qr/my-code

**Description:** Get or auto-generate my QR code

**Auth Required:** Yes

---

##### POST /api/v1/biometrics/qr/scan

**Description:** Validate a scanned QR code

**Auth Required:** Yes

---

#### Biometric Check-In/Out

##### POST /api/v1/biometrics/check-in

**Description:** Biometric check-in (face, QR, fingerprint)

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| method | string | Yes | "face", "qr", "fingerprint" |
| device_id | string | No | Device identifier |
| confidence_score | number | No | Match confidence |
| liveness_passed | boolean | No | Anti-spoofing check |
| latitude | number | No | GPS latitude |
| longitude | number | No | GPS longitude |
| image_path | string | No | Captured image path |
| qr_code | string | No | QR code value (if method=qr) |

---

##### POST /api/v1/biometrics/check-out

**Description:** Biometric check-out

**Auth Required:** Yes

**Request Body:** Same as check-in

---

#### Devices

##### GET /api/v1/biometrics/devices

**Description:** List biometric devices

**Auth Required:** Yes (HR)

**Query Parameters:** `status`, `type`

---

##### POST /api/v1/biometrics/devices

**Description:** Register a new biometric device

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/biometrics/devices/:id

**Description:** Update device settings

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/biometrics/devices/:id

**Description:** Decommission a device

**Auth Required:** Yes (HR)

---

##### POST /api/v1/biometrics/devices/:id/heartbeat

**Description:** Device heartbeat (uses `X-Device-API-Key` header instead of JWT)

**Auth Required:** Device API Key

---

#### Settings

##### GET /api/v1/biometrics/settings

**Description:** Get biometric settings for the organization

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/biometrics/settings

**Description:** Update biometric settings

**Auth Required:** Yes (HR)

---

#### Logs & Dashboard

##### GET /api/v1/biometrics/logs

**Description:** Biometric verification logs

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `method`, `user_id`, `result`, `date_from`, `date_to`

---

##### GET /api/v1/biometrics/dashboard

**Description:** Biometric dashboard stats

**Auth Required:** Yes (HR)

---

### 2.16 Helpdesk

#### Tickets

##### POST /api/v1/helpdesk/tickets

**Description:** Create a support ticket

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subject | string | Yes | Ticket subject |
| description | string | Yes | Ticket description |
| category | string | Yes | "hr", "it", "finance", "general" |
| priority | string | No | "low", "medium", "high", "urgent" |

---

##### GET /api/v1/helpdesk/tickets/my

**Description:** My tickets

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `category`

---

##### GET /api/v1/helpdesk/tickets

**Description:** List all tickets (HR sees all; employees see own)

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `category`, `priority`, `assigned_to`, `raised_by`, `search`

---

##### GET /api/v1/helpdesk/tickets/:id

**Description:** Get ticket detail with comments

**Auth Required:** Yes

---

##### PUT /api/v1/helpdesk/tickets/:id

**Description:** Update ticket (status, priority, etc.)

**Auth Required:** Yes (HR)

---

##### POST /api/v1/helpdesk/tickets/:id/assign

**Description:** Assign ticket to an HR agent

**Auth Required:** Yes (HR)

---

##### POST /api/v1/helpdesk/tickets/:id/comment

**Description:** Add a comment to a ticket

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| comment | string | Yes | Comment text |
| is_internal | boolean | No | Internal note (HR only) |
| attachments | string[] | No | Attachment URLs |

---

##### POST /api/v1/helpdesk/tickets/:id/resolve

**Description:** Resolve ticket

**Auth Required:** Yes (HR)

---

##### POST /api/v1/helpdesk/tickets/:id/close

**Description:** Close ticket

**Auth Required:** Yes (HR or ticket owner)

---

##### POST /api/v1/helpdesk/tickets/:id/reopen

**Description:** Reopen a closed ticket

**Auth Required:** Yes

---

##### POST /api/v1/helpdesk/tickets/:id/rate

**Description:** Rate a resolved ticket

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rating | number | Yes | 1-5 rating |
| comment | string | No | Feedback |

---

#### Knowledge Base

##### GET /api/v1/helpdesk/kb

**Description:** List published knowledge base articles

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `category`, `search`, `all` (HR: show drafts)

---

##### GET /api/v1/helpdesk/kb/:idOrSlug

**Description:** Get article (increments view count)

**Auth Required:** Yes

---

##### POST /api/v1/helpdesk/kb

**Description:** Create a knowledge base article

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/helpdesk/kb/:id

**Description:** Update an article

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/helpdesk/kb/:id

**Description:** Unpublish an article

**Auth Required:** Yes (HR)

---

##### GET /api/v1/helpdesk/kb/:id/my-rating

**Description:** Get current user's rating on an article

**Auth Required:** Yes

---

##### POST /api/v1/helpdesk/kb/:id/helpful

**Description:** Rate article helpfulness

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| helpful | boolean | Yes | Whether the article was helpful |

---

##### GET /api/v1/helpdesk/dashboard

**Description:** Helpdesk stats dashboard

**Auth Required:** Yes (HR)

---

### 2.17 Surveys

#### GET /api/v1/surveys

**Description:** List surveys

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `type`

---

#### GET /api/v1/surveys/active

**Description:** Active surveys the employee can respond to

**Auth Required:** Yes

---

#### GET /api/v1/surveys/dashboard

**Description:** Survey analytics dashboard

**Auth Required:** Yes (HR)

---

#### GET /api/v1/surveys/my-responses

**Description:** Employee's past survey responses

**Auth Required:** Yes

---

#### GET /api/v1/surveys/:id

**Description:** Get survey detail with questions

**Auth Required:** Yes

---

#### POST /api/v1/surveys

**Description:** Create a survey

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/surveys/:id

**Description:** Update a draft survey

**Auth Required:** Yes (HR)

---

#### POST /api/v1/surveys/:id/publish

**Description:** Publish a survey

**Auth Required:** Yes (HR)

---

#### POST /api/v1/surveys/:id/close

**Description:** Close a survey

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/surveys/:id

**Description:** Delete a draft survey

**Auth Required:** Yes (HR)

---

#### POST /api/v1/surveys/:id/respond

**Description:** Submit survey response

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| answers | object[] | Yes | Array of { question_id, answer } |

---

#### GET /api/v1/surveys/:id/results

**Description:** Aggregated survey results

**Auth Required:** Yes (HR)

---

### 2.18 Assets

#### GET /api/v1/assets/categories

**Description:** List asset categories (Laptop, Phone, etc.)

**Auth Required:** Yes

---

#### POST /api/v1/assets/categories

**Description:** Create asset category

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/assets/categories/:id

**Description:** Update category

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/assets/categories/:id

**Description:** Deactivate category

**Auth Required:** Yes (HR)

---

#### GET /api/v1/assets

**Description:** List assets (HR sees all; employees see their assigned assets)

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `status`, `category_id`, `assigned_to`, `condition_status`, `search`

---

#### POST /api/v1/assets

**Description:** Register a new asset

**Auth Required:** Yes (HR)

---

#### GET /api/v1/assets/my

**Description:** My assigned assets

**Auth Required:** Yes

---

#### GET /api/v1/assets/dashboard

**Description:** Asset management dashboard

**Auth Required:** Yes (HR)

---

#### GET /api/v1/assets/expiring-warranties

**Description:** Assets with warranties expiring soon

**Auth Required:** Yes (HR)

**Query Parameters:** `days` (default: 30)

---

#### GET /api/v1/assets/:id

**Description:** Asset detail with assignment history

**Auth Required:** Yes

---

#### PUT /api/v1/assets/:id

**Description:** Update asset details

**Auth Required:** Yes (HR)

---

#### POST /api/v1/assets/:id/assign

**Description:** Assign asset to employee

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| assigned_to | number | Yes | Employee ID |
| notes | string | No | Assignment notes |

---

#### POST /api/v1/assets/:id/return

**Description:** Return an asset

**Auth Required:** Yes (HR or assigned user)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| condition | string | Yes | "good", "damaged", "needs_repair" |
| notes | string | No | Return notes |

---

#### POST /api/v1/assets/:id/retire

**Description:** Retire an asset from service

**Auth Required:** Yes (HR)

---

#### POST /api/v1/assets/:id/report-lost

**Description:** Report an asset as lost

**Auth Required:** Yes

---

### 2.19 Positions

#### GET /api/v1/positions

**Description:** List positions

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `department_id`, `status`, `employment_type`, `search`

---

#### GET /api/v1/positions/dashboard

**Description:** Position management dashboard

**Auth Required:** Yes (HR)

---

#### GET /api/v1/positions/vacancies

**Description:** Open vacancies

**Auth Required:** Yes (HR)

---

#### GET /api/v1/positions/hierarchy

**Description:** Position hierarchy tree

**Auth Required:** Yes (HR)

---

#### POST /api/v1/positions

**Description:** Create a position

**Auth Required:** Yes (HR)

---

#### GET /api/v1/positions/:id

**Description:** Get position details

**Auth Required:** Yes

---

#### PUT /api/v1/positions/:id

**Description:** Update position

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/positions/:id

**Description:** Close/delete a position

**Auth Required:** Yes (HR)

---

#### POST /api/v1/positions/:id/assign

**Description:** Assign a user to a position

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/positions/assignments/:id

**Description:** Remove user from position

**Auth Required:** Yes (HR)

---

#### Headcount Plans

##### POST /api/v1/positions/headcount-plans

**Description:** Create a headcount plan

**Auth Required:** Yes (HR)

---

##### GET /api/v1/positions/headcount-plans

**Description:** List headcount plans

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `fiscal_year`, `status`, `department_id`

---

##### PUT /api/v1/positions/headcount-plans/:id

**Description:** Update a headcount plan

**Auth Required:** Yes (HR)

---

##### POST /api/v1/positions/headcount-plans/:id/approve

**Description:** Approve a headcount plan

**Auth Required:** Yes (HR)

---

### 2.20 Anonymous Feedback

#### POST /api/v1/feedback

**Description:** Submit anonymous feedback (user identity is hashed, never exposed to HR)

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | string | Yes | "workplace", "management", "culture", "suggestion" |
| content | string | Yes | Feedback content |
| is_urgent | boolean | No | Flag as urgent |
| sentiment | string | No | "positive", "neutral", "negative" |

---

#### GET /api/v1/feedback/my

**Description:** My submitted feedback (matched by hash)

**Auth Required:** Yes

---

#### GET /api/v1/feedback/dashboard

**Description:** Feedback analytics dashboard

**Auth Required:** Yes (HR)

---

#### GET /api/v1/feedback

**Description:** All feedback (HR only -- no user identity shown)

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `category`, `status`, `sentiment`, `is_urgent`, `search`

---

#### GET /api/v1/feedback/:id

**Description:** Single feedback detail

**Auth Required:** Yes (HR)

---

#### POST /api/v1/feedback/:id/respond

**Description:** Respond to anonymous feedback

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| admin_response | string | Yes | Response text |

---

#### PUT /api/v1/feedback/:id/status

**Description:** Update feedback status

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "new", "reviewed", "in_progress", "resolved", "closed" |

---

### 2.21 Events

#### GET /api/v1/events

**Description:** List events

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `event_type`, `status`, `start_date`, `end_date`

---

#### GET /api/v1/events/upcoming

**Description:** Upcoming events

**Auth Required:** Yes

---

#### GET /api/v1/events/my

**Description:** Events I have RSVPd to

**Auth Required:** Yes

---

#### GET /api/v1/events/dashboard

**Description:** Event statistics

**Auth Required:** Yes (HR)

---

#### GET /api/v1/events/:id

**Description:** Event detail with RSVPs

**Auth Required:** Yes

---

#### POST /api/v1/events

**Description:** Create an event

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/events/:id

**Description:** Update an event

**Auth Required:** Yes (HR)

---

#### DELETE /api/v1/events/:id

**Description:** Delete an event

**Auth Required:** Yes (HR)

---

#### POST /api/v1/events/:id/cancel

**Description:** Cancel an event

**Auth Required:** Yes (HR)

---

#### POST /api/v1/events/:id/rsvp

**Description:** RSVP to an event

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "attending", "maybe", "declined" |

---

### 2.22 Wellness

#### GET /api/v1/wellness/programs

**Description:** List wellness programs

**Auth Required:** Yes

---

#### GET /api/v1/wellness/programs/:id

**Description:** Program detail

**Auth Required:** Yes

---

#### POST /api/v1/wellness/programs

**Description:** Create a wellness program

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/wellness/programs/:id

**Description:** Update a program

**Auth Required:** Yes (HR)

---

#### POST /api/v1/wellness/programs/:id/enroll

**Description:** Enroll in a program

**Auth Required:** Yes

---

#### POST /api/v1/wellness/programs/:id/complete

**Description:** Mark program as completed

**Auth Required:** Yes

---

#### GET /api/v1/wellness/my

**Description:** My enrolled programs

**Auth Required:** Yes

---

#### GET /api/v1/wellness/summary

**Description:** My wellness summary

**Auth Required:** Yes

---

#### GET /api/v1/wellness/dashboard

**Description:** Organization wellness dashboard

**Auth Required:** Yes (HR)

---

#### POST /api/v1/wellness/check-in

**Description:** Daily wellness check-in

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mood | string | Yes | "great", "good", "okay", "low", "stressed" |
| energy_level | number | No | 1-5 |
| stress_level | number | No | 1-5 |
| notes | string | No | Personal notes |

---

#### GET /api/v1/wellness/check-ins

**Description:** My check-in history

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `start_date`, `end_date`

---

#### POST /api/v1/wellness/goals

**Description:** Create a wellness goal

**Auth Required:** Yes

---

#### GET /api/v1/wellness/goals

**Description:** My wellness goals

**Auth Required:** Yes

**Query Parameters:** `status`

---

#### PUT /api/v1/wellness/goals/:id

**Description:** Update goal progress

**Auth Required:** Yes

---

### 2.23 Forum / Social Intranet

#### Categories

##### GET /api/v1/forum/categories

**Description:** List forum categories

**Auth Required:** Yes

---

##### POST /api/v1/forum/categories

**Description:** Create a category

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/forum/categories/:id

**Description:** Update a category

**Auth Required:** Yes (HR)

---

#### Posts

##### GET /api/v1/forum/posts

**Description:** List forum posts

**Auth Required:** Yes

**Query Parameters:** `page`, `per_page`, `category_id`, `sort` (recent, popular)

---

##### POST /api/v1/forum/posts

**Description:** Create a forum post

**Auth Required:** Yes

---

##### GET /api/v1/forum/posts/:id

**Description:** Get post with replies and like status

**Auth Required:** Yes

---

##### PUT /api/v1/forum/posts/:id

**Description:** Update own post

**Auth Required:** Yes

---

##### DELETE /api/v1/forum/posts/:id

**Description:** Delete post (owner or HR)

**Auth Required:** Yes

---

##### POST /api/v1/forum/posts/:id/pin

**Description:** Pin a post

**Auth Required:** Yes (HR)

---

##### POST /api/v1/forum/posts/:id/lock

**Description:** Lock a post (no more replies)

**Auth Required:** Yes (HR)

---

##### POST /api/v1/forum/posts/:id/reply

**Description:** Reply to a post

**Auth Required:** Yes

---

#### Replies

##### DELETE /api/v1/forum/replies/:id

**Description:** Delete a reply

**Auth Required:** Yes (owner or HR)

---

##### POST /api/v1/forum/replies/:id/accept

**Description:** Accept a reply as best answer (post owner)

**Auth Required:** Yes

---

#### Likes

##### POST /api/v1/forum/like

**Description:** Toggle like on a post or reply

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| target_type | string | Yes | "post" or "reply" |
| target_id | number | Yes | ID of the post or reply |

---

#### GET /api/v1/forum/dashboard

**Description:** Forum analytics dashboard

**Auth Required:** Yes (HR)

---

### 2.24 Whistleblowing

#### POST /api/v1/whistleblowing/reports

**Description:** Submit a whistleblower report (can be anonymous)

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | string | Yes | "fraud", "harassment", "safety", "ethics", "other" |
| title | string | Yes | Report title |
| description | string | Yes | Detailed description |
| severity | string | No | "low", "medium", "high", "critical" |
| is_anonymous | boolean | No | Submit anonymously (default: true) |
| evidence_urls | string[] | No | URLs to evidence files |

---

#### GET /api/v1/whistleblowing/reports/my

**Description:** My submitted reports (matched by hash)

**Auth Required:** Yes

---

#### GET /api/v1/whistleblowing/reports/lookup/:case

**Description:** Lookup report by case number

**Auth Required:** Yes

---

#### GET /api/v1/whistleblowing/dashboard

**Description:** Whistleblowing dashboard stats

**Auth Required:** Yes (HR)

---

#### GET /api/v1/whistleblowing/reports

**Description:** All reports (HR/investigator only)

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `status`, `category`, `severity`, `search`

---

#### GET /api/v1/whistleblowing/reports/:id

**Description:** Report detail with investigation timeline

**Auth Required:** Yes (HR)

---

#### POST /api/v1/whistleblowing/reports/:id/assign

**Description:** Assign an investigator

**Auth Required:** Yes (HR)

---

#### POST /api/v1/whistleblowing/reports/:id/update

**Description:** Add an investigation update/note

**Auth Required:** Yes (HR)

---

#### PUT /api/v1/whistleblowing/reports/:id/status

**Description:** Change report status

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "submitted", "under_investigation", "resolved", "closed" |
| resolution | string | No | Resolution summary |

---

#### POST /api/v1/whistleblowing/reports/:id/escalate

**Description:** Escalate to external authority

**Auth Required:** Yes (HR)

---

### 2.25 Chatbot

#### POST /api/v1/chatbot/conversations

**Description:** Start a new chatbot conversation

**Auth Required:** Yes

---

#### GET /api/v1/chatbot/conversations

**Description:** List my conversations

**Auth Required:** Yes

---

#### GET /api/v1/chatbot/conversations/:id

**Description:** Get conversation messages

**Auth Required:** Yes

---

#### POST /api/v1/chatbot/conversations/:id/send

**Description:** Send a message and get AI response

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | User message |

---

#### DELETE /api/v1/chatbot/conversations/:id

**Description:** Archive a conversation

**Auth Required:** Yes

---

#### GET /api/v1/chatbot/suggestions

**Description:** Get suggested questions

**Auth Required:** Yes

---

#### GET /api/v1/chatbot/ai-status

**Description:** Check if AI engine is active

**Auth Required:** Yes

---

### 2.26 Custom Fields

#### Definitions

##### GET /api/v1/custom-fields/definitions

**Description:** List custom field definitions

**Auth Required:** Yes

**Query Parameters:** `entity_type` (e.g., "employee", "asset", "ticket")

---

##### POST /api/v1/custom-fields/definitions

**Description:** Create a custom field definition

**Auth Required:** Yes (HR)

---

##### GET /api/v1/custom-fields/definitions/:id

**Description:** Get field definition

**Auth Required:** Yes

---

##### PUT /api/v1/custom-fields/definitions/:id

**Description:** Update field definition

**Auth Required:** Yes (HR)

---

##### DELETE /api/v1/custom-fields/definitions/:id

**Description:** Deactivate field definition

**Auth Required:** Yes (HR)

---

##### PUT /api/v1/custom-fields/definitions/reorder

**Description:** Reorder custom fields

**Auth Required:** Yes (HR)

---

#### Values

##### GET /api/v1/custom-fields/values/:entityType/:entityId

**Description:** Get custom field values for an entity

**Auth Required:** Yes

---

##### POST /api/v1/custom-fields/values/:entityType/:entityId

**Description:** Set/update custom field values

**Auth Required:** Yes

---

##### GET /api/v1/custom-fields/values/:entityType

**Description:** Bulk get values for multiple entities

**Auth Required:** Yes

**Query Parameters:** `entityIds` (comma-separated)

---

##### GET /api/v1/custom-fields/search

**Description:** Search entities by custom field value

**Auth Required:** Yes

**Query Parameters:** `entity_type`, `field_id`, `search_value`

---

### 2.27 Manager Self-Service

#### GET /api/v1/manager/team

**Description:** My direct reports

**Auth Required:** Yes

---

#### GET /api/v1/manager/attendance

**Description:** Team attendance today

**Auth Required:** Yes

---

#### GET /api/v1/manager/leaves/pending

**Description:** Pending leave approvals for my team

**Auth Required:** Yes

---

#### GET /api/v1/manager/leaves/calendar

**Description:** Team leave calendar

**Auth Required:** Yes

**Query Parameters:** `start_date`, `end_date`

---

#### GET /api/v1/manager/dashboard

**Description:** Manager dashboard with combined stats

**Auth Required:** Yes

---

### 2.28 Billing (Cloud Proxy)

These endpoints proxy data from the EMP Billing service.

#### GET /api/v1/billing/invoices

**Description:** List invoices

**Auth Required:** Yes

**Query Parameters:** `page`, `perPage`

---

#### GET /api/v1/billing/payments

**Description:** List payments

**Auth Required:** Yes

**Query Parameters:** `page`, `perPage`

---

#### GET /api/v1/billing/summary

**Description:** Billing summary (total due, upcoming charges, etc.)

**Auth Required:** Yes

---

#### GET /api/v1/billing/invoices/:id/pdf

**Description:** Download invoice PDF

**Auth Required:** Yes

---

#### POST /api/v1/billing/pay

**Description:** Create a payment checkout session

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| invoiceId | string | Yes | Invoice ID |
| gateway | string | No | "stripe" (default), "razorpay", "paypal" |

---

#### GET /api/v1/billing/gateways

**Description:** List available payment gateways

**Auth Required:** Yes

---

### 2.29 Onboarding Wizard

#### GET /api/v1/onboarding/status

**Description:** Get onboarding progress status

**Auth Required:** Yes

---

#### POST /api/v1/onboarding/step/:step

**Description:** Complete an onboarding step

**Auth Required:** Yes

---

#### POST /api/v1/onboarding/complete

**Description:** Mark onboarding as complete

**Auth Required:** Yes

---

#### POST /api/v1/onboarding/skip

**Description:** Skip onboarding

**Auth Required:** Yes

---

### 2.30 Audit Logs

#### GET /api/v1/audit

**Description:** List audit logs for the organization

**Auth Required:** Yes (Admin)

**Query Parameters:** `page`, `per_page`, `action`

---

### 2.31 Webhooks (Inbound)

#### POST /api/v1/webhooks/billing

**Description:** Receives webhooks from EMP Billing (payment confirmed, subscription updated, etc.)

**Auth Required:** No (internal service-to-service)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event | string | Yes | Event name |
| data | object | Yes | Event payload |
| orgId | number | No | Organization ID |
| timestamp | string | No | ISO timestamp |

---

#### POST /api/v1/webhooks/modules

**Description:** Receives lifecycle webhooks from sub-modules (recruit, exit, etc.)

**Auth Required:** No (internal service-to-service)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event | string | Yes | Event name |
| data | object | Yes | Event payload |
| source | string | No | Module name (e.g., "recruit") |
| timestamp | string | No | ISO timestamp |

---

### 2.32 Super Admin

All endpoints require `super_admin` role.

#### GET /api/v1/admin/overview

**Description:** Platform overview (total orgs, users, revenue, etc.)

---

#### GET /api/v1/admin/organizations

**Description:** List all organizations on the platform

**Query Parameters:** `page`, `per_page`, `search`, `sort_by`, `sort_order`

---

#### GET /api/v1/admin/organizations/:id

**Description:** Organization detail with users, subscriptions, etc.

---

#### GET /api/v1/admin/modules

**Description:** Module analytics (adoption, revenue per module)

---

#### GET /api/v1/admin/revenue

**Description:** Revenue analytics

**Query Parameters:** `period` (default: "12m")

---

#### GET /api/v1/admin/growth

**Description:** User/org growth metrics

**Query Parameters:** `period` (default: "12m")

---

#### GET /api/v1/admin/subscriptions

**Description:** Subscription metrics (MRR, churn, etc.)

---

#### GET /api/v1/admin/activity

**Description:** Recent platform activity

**Query Parameters:** `limit` (default: 30, max: 100)

---

#### GET /api/v1/admin/health

**Description:** System health check (DB, Redis, queue, etc.)

---

#### GET /api/v1/admin/module-adoption

**Description:** Module adoption stats

---

### 2.33 AI Configuration (Super Admin)

#### GET /api/v1/admin/ai-config

**Description:** Get AI configuration (API keys masked)

**Auth Required:** Yes (Super Admin)

---

#### GET /api/v1/admin/ai-config/status

**Description:** Get active AI provider and status

**Auth Required:** Yes (Super Admin)

---

#### PUT /api/v1/admin/ai-config/:key

**Description:** Update an AI config value

**Auth Required:** Yes (Super Admin)

**Allowed keys:** `anthropic_api_key`, `openai_api_key`, `openai_base_url`, `gemini_api_key`, `ai_model`, `ai_max_tokens`, `active_provider`

---

#### POST /api/v1/admin/ai-config/test

**Description:** Test an AI provider connection

**Auth Required:** Yes (Super Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider | string | Yes | "anthropic", "openai", "gemini", etc. |
| api_key | string | Conditional | Required unless provider is "ollama" |
| model | string | No | Model name |
| base_url | string | No | Custom API base URL |

---

### 2.34 Log Dashboard (Super Admin)

#### GET /api/v1/admin/logs/summary

**Description:** Last 24h log summary

**Auth Required:** Yes (Super Admin)

---

#### GET /api/v1/admin/logs/errors

**Description:** Recent errors (paginated)

**Auth Required:** Yes (Super Admin)

---

#### GET /api/v1/admin/logs/slow-queries

**Description:** Slow database queries

**Auth Required:** Yes (Super Admin)

---

#### GET /api/v1/admin/logs/auth-events

**Description:** Authentication events (login, failed, password changes)

**Auth Required:** Yes (Super Admin)

---

#### GET /api/v1/admin/logs/health

**Description:** Module health (PM2 process status)

**Auth Required:** Yes (Super Admin)

---

### 2.35 Probation Tracking

#### GET /api/v1/employees/probation

**Description:** List employees currently on probation

**Auth Required:** Yes (HR)

**Query Parameters:** `page`, `per_page`, `search`, `department_id`, `status`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "user_id": 522,
      "first_name": "Ananya",
      "last_name": "Gupta",
      "department": "Engineering",
      "probation_start_date": "2026-01-15",
      "probation_end_date": "2026-07-15",
      "probation_status": "on_probation"
    }
  ],
  "meta": { "total": 5, "page": 1, "per_page": 20 }
}
```

---

#### GET /api/v1/employees/probation/dashboard

**Description:** Probation statistics dashboard (total on probation, upcoming confirmations, recently confirmed, extended)

**Auth Required:** Yes (HR)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "on_probation": 12,
    "upcoming_confirmations": 3,
    "recently_confirmed": 5,
    "extended": 2
  }
}
```

---

#### GET /api/v1/employees/probation/upcoming

**Description:** Employees with upcoming probation confirmation dates (within next 30 days)

**Auth Required:** Yes (HR)

**Query Parameters:** `days` (default: 30)

---

#### PUT /api/v1/employees/:id/probation/confirm

**Description:** Confirm an employee's probation (mark as confirmed)

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| notes | string | No | Confirmation notes from HR |

**Response (200):**
```json
{ "success": true, "data": { "message": "Probation confirmed successfully" } }
```

---

#### PUT /api/v1/employees/:id/probation/extend

**Description:** Extend an employee's probation period

**Auth Required:** Yes (HR)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| new_end_date | string | Yes | New probation end date (YYYY-MM-DD) |
| reason | string | Yes | Reason for extension |

**Response (200):**
```json
{ "success": true, "data": { "message": "Probation extended successfully" } }
```

---

### 2.36 Service Health Dashboard (Super Admin)

#### GET /api/v1/admin/service-health

**Description:** Get health status of all modules and infrastructure (MySQL, Redis)

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "overall_status": "operational",
    "modules": [
      { "name": "EMP Cloud", "status": "operational", "response_time_ms": 45, "last_checked": "2026-03-28T10:00:00Z" },
      { "name": "EMP Recruit", "status": "operational", "response_time_ms": 120, "last_checked": "2026-03-28T10:00:00Z" }
    ],
    "infrastructure": {
      "mysql": { "status": "operational", "response_time_ms": 5 },
      "redis": { "status": "operational", "response_time_ms": 2 }
    }
  }
}
```

---

#### POST /api/v1/admin/service-health/check

**Description:** Force an immediate health check of all modules (bypasses cache)

**Auth Required:** Yes (Super Admin)

**Response (200):** Same format as GET /api/v1/admin/service-health

---

### 2.37 Data Sanity Checker (Super Admin)

#### GET /api/v1/admin/data-sanity

**Description:** Run cross-module data consistency checks (10 checks across all databases)

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "overall_status": "warnings",
    "summary": { "passed": 8, "warnings": 2, "failed": 0 },
    "checks": [
      { "name": "Orphan employee profiles", "status": "pass", "count": 0 },
      { "name": "Users without profiles", "status": "warn", "count": 3, "items": [ { "id": 101, "description": "User 101 has no employee profile" } ] }
    ]
  }
}
```

---

#### POST /api/v1/admin/data-sanity/fix

**Description:** Auto-fix known data consistency issues

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "fixes_applied": 3,
    "details": [
      { "check": "Users without profiles", "action": "Created missing profiles", "count": 3 }
    ]
  }
}
```

---

### 2.38 System Notifications (Super Admin)

#### GET /api/v1/admin/notifications

**Description:** List system notifications for Super Admin (platform alerts, maintenance notices, etc.)

**Auth Required:** Yes (Super Admin)

**Query Parameters:** `page`, `per_page`, `status` (active, dismissed)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Database maintenance scheduled",
      "message": "MySQL maintenance window on March 30, 2026 at 2:00 AM UTC",
      "type": "info",
      "status": "active",
      "created_at": "2026-03-28T10:00:00Z"
    }
  ]
}
```

---

#### POST /api/v1/admin/notifications

**Description:** Create a system notification

**Auth Required:** Yes (Super Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Notification title |
| message | string | Yes | Notification body |
| type | string | No | "info", "warning", "error", "success" (default: "info") |

---

### 2.39 Module Management (Super Admin)

#### PUT /api/v1/admin/modules/:id

**Description:** Enable or disable a module across the platform

**Auth Required:** Yes (Super Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| is_active | boolean | Yes | Enable (true) or disable (false) the module |

**Response (200):**
```json
{ "success": true, "data": { "message": "Module updated successfully", "module": { "id": 3, "name": "EMP Recruit", "is_active": false } } }
```

---

### 2.40 User Management (Super Admin)

#### PUT /api/v1/admin/organizations/:orgId/users/:userId/deactivate

**Description:** Deactivate a user account within an organization

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{ "success": true, "data": { "message": "User deactivated successfully" } }
```

---

#### PUT /api/v1/admin/organizations/:orgId/users/:userId/activate

**Description:** Reactivate a previously deactivated user account

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{ "success": true, "data": { "message": "User activated successfully" } }
```

---

#### PUT /api/v1/admin/organizations/:orgId/users/:userId/reset-password

**Description:** Force reset a user's password (generates a temporary password or sends reset email)

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{ "success": true, "data": { "message": "Password reset email sent" } }
```

---

#### PUT /api/v1/admin/organizations/:orgId/users/:userId/role

**Description:** Change a user's role within their organization

**Auth Required:** Yes (Super Admin)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | New role: "org_admin", "hr_admin", "hr_manager", "manager", "employee" |

**Response (200):**
```json
{ "success": true, "data": { "message": "Role updated successfully", "new_role": "hr_admin" } }
```

---

### 2.41 Platform Info (Super Admin)

#### GET /api/v1/admin/platform-info

**Description:** Get platform information (version, uptime, node version, database stats, module count)

**Auth Required:** Yes (Super Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "node_version": "v20.11.0",
    "uptime_seconds": 86400,
    "database": { "total_organizations": 15, "total_users": 450, "total_modules": 10 },
    "environment": "production"
  }
}
```

---

## 3. EMP Recruit

**Base URL:** `https://test-recruit-api.empcloud.com`
**API Prefix:** `/api/v1`

### 3.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/login | Direct login | No |
| POST | /auth/register | Register | No |
| POST | /auth/refresh-token | Refresh token | No |
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 3.2 Jobs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /jobs | List jobs | HR |
| POST | /jobs | Create job | HR |
| GET | /jobs/:id | Get job detail | HR |
| PUT | /jobs/:id | Update job | HR |
| PATCH | /jobs/:id/status | Change job status (open/closed/on_hold) | HR |
| GET | /jobs/:id/applications | List applications for a job | HR |

### 3.3 Candidates

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /candidates | List candidates | HR |
| POST | /candidates | Create candidate | HR |
| GET | /candidates/:id | Get candidate | HR |
| PUT | /candidates/:id | Update candidate | HR |
| DELETE | /candidates/:id | Archive candidate | HR |
| POST | /candidates/:id/resume | Upload resume (multipart) | HR |

### 3.4 Applications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /applications | List applications | HR |
| POST | /applications | Create application | HR |
| GET | /applications/:id | Get application | HR |
| PATCH | /applications/:id/stage | Move to next pipeline stage | HR |
| POST | /applications/:id/notes | Add note | HR |

### 3.5 Interviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /interviews | List interviews | Yes |
| POST | /interviews | Schedule interview | HR |
| GET | /interviews/:id | Get interview detail | Yes |
| PUT | /interviews/:id | Update interview | HR |
| POST | /interviews/:id/cancel | Cancel interview | HR |
| POST | /interviews/:id/feedback | Submit interview feedback | Yes |
| GET | /interviews/my-schedule | My upcoming interviews | Yes |
| POST | /interviews/:id/recording | Upload recording (multipart) | HR |

### 3.6 Offers

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /offers | List offers | Yes |
| POST | /offers | Create offer | HR |
| GET | /offers/:id | Get offer detail | Yes |
| PUT | /offers/:id | Update draft offer | HR |
| POST | /offers/:id/submit-approval | Submit for approval | HR |
| POST | /offers/:id/approve | Approve offer | HR |
| POST | /offers/:id/reject | Reject offer | HR |
| POST | /offers/:id/send | Send to candidate | HR |
| POST | /offers/:id/revoke | Revoke offer | HR |
| POST | /offers/:id/accept | Candidate accepts | Public |
| POST | /offers/:id/decline | Candidate declines | Public |

### 3.7 Offer Letters

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /offer-letters/templates | List letter templates | Yes |
| POST | /offer-letters/templates | Create template | Admin |
| POST | /offer-letters/generate/:offerId | Generate letter | HR |
| GET | /offer-letters/:offerId | Get generated letter | Yes |
| POST | /offer-letters/:offerId/send | Email letter to candidate | HR |

### 3.8 Assessments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /assessments/templates | Create assessment template | HR |
| GET | /assessments/templates | List templates | HR |
| GET | /assessments/templates/:id | Get template | HR |
| POST | /assessments/invite | Invite candidate to assessment | HR |
| GET | /assessments/take/:token | Get assessment (public) | No |
| POST | /assessments/submit/:token | Submit answers (public) | No |
| GET | /assessments/candidate/:candidateId | List candidate assessments | HR |
| GET | /assessments/:id/results | Get results | HR |

### 3.9 Background Checks

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /background-checks/initiate | Initiate check | HR |
| GET | /background-checks/packages | List check packages | HR |
| POST | /background-checks/packages | Create package | HR |
| GET | /background-checks | List all checks | HR |
| GET | /background-checks/candidate/:candidateId | Candidate's checks | HR |
| GET | /background-checks/:id | Get check detail | HR |
| PUT | /background-checks/:id | Update result | HR |

### 3.10 Pipeline

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /pipeline/stages | Get pipeline stages | Yes |
| POST | /pipeline/stages | Create custom stage | Admin |
| PUT | /pipeline/stages/:id | Update stage | Admin |
| DELETE | /pipeline/stages/:id | Delete stage | Admin |
| PUT | /pipeline/stages/reorder | Reorder stages | Admin |

### 3.11 Additional Recruit Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /analytics/overview | Recruitment dashboard | HR |
| GET | /analytics/pipeline | Pipeline funnel | HR |
| GET | /analytics/time-to-hire | Time-to-hire metrics | HR |
| GET | /analytics/sources | Source effectiveness | HR |
| POST | /comparison/compare | Compare candidates | HR |
| GET | /career-page | Get career page config | HR |
| PUT | /career-page | Update career page | HR |
| POST | /career-page/publish | Publish career page | HR |
| POST | /job-description/generate-description | AI job description generator | HR |
| GET | /email-templates | List email templates | HR |
| POST | /email-templates | Create template | HR |
| PUT | /email-templates/:id | Update template | HR |
| POST | /email-templates/:id/preview | Preview rendered template | HR |
| GET | /public/jobs | Public job listings | No |
| GET | /public/jobs/:id | Public job detail | No |
| POST | /public/apply | Public application | No |
| GET | /referrals | List referrals | Yes |
| POST | /referrals | Create referral | Yes |
| GET | /scoring/:applicationId | Get scorecard | HR |
| POST | /scoring/:applicationId | Submit scorecard | HR |
| GET | /surveys/:applicationId | Get candidate survey | Public |
| POST | /surveys/:applicationId/submit | Submit survey | Public |
| GET | /onboarding/templates | List templates | Yes |
| POST | /onboarding/templates | Create template | HR |
| POST | /onboarding/checklists | Generate checklist | HR |
| GET | /onboarding/checklists | List checklists | HR |
| GET | /onboarding/checklists/:id | Get checklist | Yes |
| PATCH | /onboarding/tasks/:id | Update task status | Yes |
| GET | /portal/:candidateId | Candidate self-service portal | Public |

---

## 4. EMP Performance

**Base URL:** `https://test-performance-api.empcloud.com`
**API Prefix:** `/api/v1`

### 4.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/login | Direct login | No |
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 4.2 Review Cycles

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /review-cycles | List review cycles | HR |
| POST | /review-cycles | Create review cycle | HR |
| GET | /review-cycles/:id | Get cycle detail | HR |
| PUT | /review-cycles/:id | Update cycle | HR |
| POST | /review-cycles/:id/launch | Launch cycle | HR |
| POST | /review-cycles/:id/close | Close cycle | HR |

### 4.3 Reviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /reviews | List reviews | Yes |
| GET | /reviews/:id | Get review detail | Yes |
| PUT | /reviews/:id | Update/submit review | Yes |
| GET | /reviews/my | My reviews (self + as reviewer) | Yes |
| POST | /reviews/:id/submit | Submit review | Yes |

### 4.4 Goals

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /goals | List goals | Yes |
| POST | /goals | Create goal | Yes |
| GET | /goals/:id | Get goal | Yes |
| PUT | /goals/:id | Update goal | Yes |
| DELETE | /goals/:id | Delete goal | Yes |
| PUT | /goals/:id/progress | Update progress | Yes |

### 4.5 Competencies

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /competencies | List competencies | Yes |
| POST | /competencies | Create competency | HR |
| PUT | /competencies/:id | Update competency | HR |
| DELETE | /competencies/:id | Delete competency | HR |

### 4.6 Feedback

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /feedback | List feedback | Yes |
| POST | /feedback | Give feedback | Yes |
| GET | /feedback/received | Feedback received by me | Yes |
| GET | /feedback/given | Feedback given by me | Yes |

### 4.7 One-on-Ones

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /one-on-ones | List meetings | Yes |
| POST | /one-on-ones | Schedule meeting | Yes |
| GET | /one-on-ones/:id | Get meeting detail | Yes |
| PUT | /one-on-ones/:id | Update meeting | Yes |
| POST | /one-on-ones/:id/notes | Add meeting notes | Yes |

### 4.8 Peer Reviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /peer-reviews | List peer review requests | Yes |
| POST | /peer-reviews | Request peer review | Yes |
| GET | /peer-reviews/:id | Get peer review | Yes |
| PUT | /peer-reviews/:id | Submit peer review | Yes |

### 4.9 PIPs (Performance Improvement Plans)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /pips | List PIPs | HR |
| POST | /pips | Create PIP | HR |
| GET | /pips/:id | Get PIP detail | Yes |
| PUT | /pips/:id | Update PIP | HR |
| POST | /pips/:id/checkin | Add check-in | Yes |

### 4.10 Additional Performance Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /analytics/overview | Performance dashboard | HR |
| GET | /analytics/ratings-distribution | Ratings distribution | HR |
| GET | /analytics/goal-completion | Goal completion rates | HR |
| GET | /ai-summary/review/:reviewId | AI review summary | Yes |
| GET | /ai-summary/employee/:userId | AI employee summary | HR |
| GET | /ai-summary/team/:managerId | AI team summary | HR |
| GET | /career-paths | List career paths | Yes |
| POST | /career-paths | Create career path | HR |
| GET | /letters/templates | Letter templates | HR |
| POST | /letters/generate | Generate letter | HR |
| GET | /manager-effectiveness/:managerId | Manager stats | HR |
| GET | /succession | Succession plans | HR |
| POST | /succession | Create succession plan | HR |
| GET | /notifications | Performance notifications | Yes |

---

## 5. EMP Rewards

**Base URL:** `https://test-rewards-api.empcloud.com`
**API Prefix:** `/api/v1`

### 5.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 5.2 Kudos

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /kudos | List kudos feed | Yes |
| POST | /kudos | Send kudos | Yes |
| GET | /kudos/:id | Get kudos detail | Yes |
| POST | /kudos/:id/react | React to kudos | Yes |
| GET | /kudos/received | My received kudos | Yes |
| GET | /kudos/given | My given kudos | Yes |

### 5.3 Points

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /points/balance | My points balance | Yes |
| GET | /points/history | Points transaction history | Yes |
| POST | /points/transfer | Transfer points to user | Yes |

### 5.4 Badges

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /badges | List available badges | Yes |
| POST | /badges | Create badge | HR |
| PUT | /badges/:id | Update badge | HR |
| POST | /badges/:id/award | Award badge to user | HR |
| GET | /badges/my | My earned badges | Yes |

### 5.5 Rewards & Redemption

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /rewards | List reward catalog | Yes |
| POST | /rewards | Create reward | HR |
| PUT | /rewards/:id | Update reward | HR |
| POST | /redemptions | Redeem points for reward | Yes |
| GET | /redemptions | My redemption history | Yes |
| GET | /redemptions/pending | Pending redemptions (HR) | HR |
| PUT | /redemptions/:id | Approve/reject redemption | HR |

### 5.6 Leaderboard

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /leaderboard | Overall leaderboard | Yes |
| GET | /leaderboard/department | Department leaderboard | Yes |
| GET | /leaderboard/monthly | Monthly leaderboard | Yes |

### 5.7 Additional Rewards Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /analytics/overview | Rewards dashboard | HR |
| GET | /analytics/trends | Recognition trends | HR |
| GET | /budget | Rewards budget | HR |
| PUT | /budget | Update budget | HR |
| GET | /celebrations | Auto-celebrations (birthdays, anniversaries) | Yes |
| POST | /celebrations/settings | Update celebration settings | HR |
| GET | /challenges | Active challenges | Yes |
| POST | /challenges | Create challenge | HR |
| GET | /milestones | Service milestones | Yes |
| GET | /nominations | List nominations | Yes |
| POST | /nominations | Create nomination | Yes |
| GET | /settings | Rewards settings | HR |
| PUT | /settings | Update settings | HR |
| GET | /teams | Team recognition stats | Yes |

---

## 6. EMP Exit

**Base URL:** `https://test-exit-api.empcloud.com`
**API Prefix:** `/api/v1`

### 6.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 6.2 Exit Requests

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /exit | List exit requests | HR |
| POST | /exit | Create exit request (resignation/termination) | Yes |
| GET | /exit/:id | Get exit request detail | Yes |
| PUT | /exit/:id | Update exit request | HR |
| POST | /exit/:id/approve | Approve resignation | HR |
| POST | /exit/:id/reject | Reject resignation | HR |

### 6.3 Exit Interviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /interviews | List exit interviews | HR |
| POST | /interviews | Schedule exit interview | HR |
| GET | /interviews/:id | Get interview detail | Yes |
| PUT | /interviews/:id | Submit interview feedback | Yes |

### 6.4 Checklists

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /checklists | List offboarding checklists | HR |
| POST | /checklists | Create checklist from template | HR |
| GET | /checklists/:id | Get checklist detail | Yes |
| PATCH | /checklists/:id/tasks/:taskId | Update task status | Yes |

### 6.5 Clearance

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /clearance | List clearance requests | HR |
| GET | /clearance/:id | Get clearance detail | Yes |
| POST | /clearance/:id/approve | Approve clearance item | Yes |
| GET | /clearance/my-pending | My pending clearances to approve | Yes |

### 6.6 Knowledge Transfer

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /kt | List KT plans | HR |
| POST | /kt | Create KT plan | HR |
| GET | /kt/:id | Get KT plan detail | Yes |
| PUT | /kt/:id | Update KT plan | Yes |
| POST | /kt/:id/sessions | Add KT session | Yes |

### 6.7 Full & Final Settlement

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /fnf | List FnF records | HR |
| GET | /fnf/:id | Get FnF detail | HR |
| PUT | /fnf/:id | Update FnF calculation | HR |
| POST | /fnf/:id/approve | Approve FnF | HR |

### 6.8 Additional Exit Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /analytics/overview | Exit analytics dashboard | HR |
| GET | /analytics/trends | Attrition trends | HR |
| GET | /alumni | Alumni directory | Yes |
| POST | /alumni/opt-in | Opt into alumni network | Yes |
| GET | /alumni/:id | Get alumni profile | Yes |
| PUT | /alumni/my | Update my alumni profile | Yes |
| GET | /assets | Exit-related asset returns | HR |
| GET | /buyout | Buyout requests (notice period) | HR |
| POST | /buyout | Create buyout request | Yes |
| GET | /letters/templates | Exit letter templates | HR |
| POST | /letters/generate | Generate exit letter | HR |
| GET | /prediction | Attrition prediction | HR |
| GET | /rehire | Rehire eligibility list | HR |
| GET | /self-service | Employee self-service portal | Yes |
| GET | /settings | Exit settings | HR |
| PUT | /settings | Update settings | HR |

---

## 7. EMP Payroll

**Base URL:** `https://testpayroll-api.empcloud.com`
**API Prefix:** `/api/v1`

### 7.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 7.2 Payroll Runs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /payroll | List payroll runs | HR |
| POST | /payroll | Create payroll run | HR |
| GET | /payroll/:id | Get run detail | HR |
| POST | /payroll/:id/process | Process payroll | HR |
| POST | /payroll/:id/approve | Approve payroll | HR |
| POST | /payroll/:id/finalize | Finalize and lock | HR |

### 7.3 Salary Structure

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /salary/structures | List salary structures | HR |
| POST | /salary/structures | Create structure | HR |
| GET | /salary/structures/:id | Get structure detail | HR |
| PUT | /salary/structures/:id | Update structure | HR |
| GET | /salary/employee/:empId | Get employee salary | HR |
| PUT | /salary/employee/:empId | Set employee salary | HR |

### 7.4 Payslips

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /payslips | List payslips | HR |
| GET | /payslips/my | My payslips | Yes |
| GET | /payslips/:id | Get payslip detail | Yes |
| GET | /payslips/:id/pdf | Download payslip PDF | Yes |

### 7.5 Tax

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /tax/declarations | List tax declarations | Yes |
| POST | /tax/declarations | Submit declaration | Yes |
| GET | /tax/employee/:empId | Employee tax details | HR |
| POST | /tax/compute | Compute tax estimate | HR |

### 7.6 Loans & Advances

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /loans | List loans | HR |
| POST | /loans | Create loan | HR |
| GET | /loans/:id | Get loan detail | Yes |
| POST | /loans/:id/approve | Approve loan | HR |
| GET | /loans/my | My loans | Yes |

### 7.7 Reimbursements

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /reimbursements | List reimbursements | HR |
| POST | /reimbursements | Submit reimbursement | Yes |
| GET | /reimbursements/:id | Get detail | Yes |
| PUT | /reimbursements/:id | Update | Yes |
| POST | /reimbursements/:id/approve | Approve | HR |
| GET | /reimbursements/my | My reimbursements | Yes |

### 7.8 Adjustments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /adjustments | List adjustments | HR |
| POST | /adjustments | Create adjustment | HR |
| GET | /adjustments/employee/:empId | Employee adjustments | HR |
| GET | /adjustments/employee/:empId/pending | Pending for payroll run | HR |
| POST | /adjustments/:id/cancel | Cancel adjustment | HR |

### 7.9 Additional Payroll Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /benefits | List benefits | HR |
| POST | /benefits | Create benefit | HR |
| GET | /benefits/employee/:empId | Employee benefits | Yes |
| GET | /compensation-benchmark | Compensation benchmarks | HR |
| GET | /earned-wage | Earned wage access | Yes |
| POST | /earned-wage/request | Request earned wage | Yes |
| GET | /employee | Payroll employee list | HR |
| GET | /gl-accounting | GL accounting entries | HR |
| GET | /global-payroll | Global payroll dashboard | HR |
| GET | /insurance | Insurance plans | HR |
| POST | /insurance/enroll | Enroll in plan | Yes |
| GET | /leave | Leave data (proxied from Cloud) | HR |
| GET | /attendance | Attendance data (proxied from Cloud) | HR |
| GET | /org | Org settings for payroll | HR |
| PUT | /org | Update payroll settings | HR |
| GET | /pay-equity | Pay equity analysis | HR |
| GET | /self-service | Employee self-service portal | Yes |
| GET | /total-rewards | Total rewards statement | Yes |
| POST | /upload | Bulk upload payroll data | HR |
| POST | /webhook | Inbound webhooks | Internal |
| GET | /announcements | Payroll announcements | Yes |
| GET | /exit | Exit payroll data | HR |

---

## 8. EMP LMS

**Base URL:** `https://testlms-api.empcloud.com`
**API Prefix:** `/api/v1`

### 8.1 Auth (SSO)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/sso | SSO from EMP Cloud token | No |

### 8.2 Courses

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /courses | List courses | Yes |
| POST | /courses | Create course | HR |
| GET | /courses/:id | Get course detail | Yes |
| PUT | /courses/:id | Update course | HR |
| DELETE | /courses/:id | Delete/archive course | HR |
| POST | /courses/:id/publish | Publish course | HR |
| POST | /courses/:id/modules | Add module to course | HR |
| PUT | /courses/:id/modules/:moduleId | Update module | HR |
| POST | /courses/:id/modules/:moduleId/lessons | Add lesson | HR |

### 8.3 Enrollments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /enrollments | List enrollments | HR |
| POST | /enrollments | Enroll user(s) | HR |
| GET | /enrollments/my | My enrollments | Yes |
| GET | /enrollments/:id | Get enrollment detail | Yes |
| POST | /enrollments/:id/progress | Update lesson progress | Yes |
| POST | /enrollments/:id/complete | Mark course complete | Yes |

### 8.4 Quizzes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /quizzes/course/:courseId | List quizzes for course | Yes |
| POST | /quizzes | Create quiz | HR |
| GET | /quizzes/:id | Get quiz | Yes |
| PUT | /quizzes/:id | Update quiz | HR |
| POST | /quizzes/:id/attempt | Start attempt | Yes |
| POST | /quizzes/:id/submit | Submit answers | Yes |
| GET | /quizzes/:id/results | Get results | Yes |

### 8.5 Learning Paths

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /learning-paths | List learning paths | Yes |
| POST | /learning-paths | Create path | HR |
| GET | /learning-paths/:id | Get path detail | Yes |
| PUT | /learning-paths/:id | Update path | HR |
| POST | /learning-paths/:id/enroll | Enroll in path | Yes |

### 8.6 Certifications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /certifications | List certifications | Yes |
| POST | /certifications | Create certification | HR |
| GET | /certifications/my | My certifications | Yes |
| GET | /certifications/:id/verify | Verify certification | No |

### 8.7 Additional LMS Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /analytics/overview | LMS dashboard | HR |
| GET | /analytics/course/:courseId | Course analytics | HR |
| GET | /analytics/user/:userId | User analytics | Self/HR |
| GET | /compliance | Compliance tracking | HR |
| POST | /compliance/assign | Assign compliance training | HR |
| GET | /discussions | Course discussions | Yes |
| POST | /discussions | Create discussion thread | Yes |
| POST | /discussions/:id/reply | Reply to discussion | Yes |
| GET | /gamification/leaderboard | Learning leaderboard | Yes |
| GET | /gamification/badges | Learning badges | Yes |
| GET | /ilt | Instructor-led trainings | Yes |
| POST | /ilt | Create ILT session | HR |
| POST | /ilt/:id/register | Register for ILT | Yes |
| GET | /marketplace | Course marketplace | Yes |
| GET | /notifications | LMS notifications | Yes |
| GET | /ratings/course/:courseId | Course ratings | Yes |
| POST | /ratings | Submit rating | Yes |
| GET | /recommendations | AI course recommendations | Yes |
| GET | /scorm/:courseId | SCORM package info | HR |
| POST | /scorm/upload | Upload SCORM package | HR |
| GET | /video/:lessonId | Get video streaming URL | Yes |

---

## 9. EMP Billing

**Base URL:** Internal only (proxied through EMP Cloud `/api/v1/billing/*`)

EMP Billing is an internal service. Mobile apps access billing data through EMP Cloud proxy endpoints (see section 2.28). Direct API access is not available externally.

### Internal Endpoints (for reference)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /invoices | List invoices |
| POST | /invoices | Create invoice |
| GET | /invoices/:id | Get invoice detail |
| GET | /invoices/:id/pdf | Download PDF |
| GET | /payments | List payments |
| POST | /payments | Process payment |
| GET | /subscriptions | List subscriptions |
| POST | /subscriptions | Create subscription |
| PUT | /subscriptions/:id | Update subscription |
| DELETE | /subscriptions/:id | Cancel subscription |
| GET | /products | List products |
| POST | /products | Create product |
| GET | /clients | List billing clients |
| POST | /clients | Create client |
| GET | /coupons | List coupons |
| POST | /coupons | Create coupon |
| GET | /credit-notes | List credit notes |
| GET | /currencies | List currencies |
| GET | /disputes | List disputes |
| GET | /dunning | Dunning campaigns |
| GET | /expenses | List expenses |
| GET | /gateway | Gateway config |
| GET | /metrics | Business metrics |
| GET | /notifications | Billing notifications |
| GET | /org | Org billing config |
| GET | /portal | Customer portal |
| GET | /quotes | List quotes |
| GET | /recurring | Recurring billing |
| GET | /reports | Financial reports |
| GET | /scheduled-reports | Scheduled reports |
| GET | /search | Search across billing |
| GET | /settings | Billing settings |
| POST | /upload | Upload billing docs |
| GET | /usage | Usage-based billing |
| GET | /vendors | List vendors |
| POST | /webhooks | Outbound webhooks |
| GET | /api-keys | API key management |
| GET | /domains | Domain management |

---

## 10. Webhook Format

### Outbound Webhooks (from sub-modules to EMP Cloud)

Sub-modules send event webhooks to EMP Cloud at:

```
POST https://test-empcloud-api.empcloud.com/api/v1/webhooks/modules
```

**Payload format:**
```json
{
  "event": "recruit.candidate_hired",
  "source": "recruit",
  "data": {
    "organization_id": 5,
    "candidate_id": "uuid-here",
    "candidate_name": "John Doe",
    "job_title": "Software Engineer",
    "start_date": "2026-04-01"
  },
  "timestamp": "2026-03-26T10:30:00.000Z"
}
```

### Common Webhook Events

| Source | Event | Description |
|--------|-------|-------------|
| recruit | `recruit.candidate_hired` | Candidate accepted offer |
| recruit | `recruit.application_rejected` | Application rejected |
| exit | `exit.resignation_submitted` | Employee resigned |
| exit | `exit.clearance_completed` | All clearances done |
| exit | `exit.fnf_approved` | Full & final approved |
| performance | `performance.review_completed` | Review cycle completed |
| performance | `performance.pip_created` | PIP initiated |
| rewards | `rewards.kudos_sent` | Kudos recognition |
| rewards | `rewards.milestone_reached` | Service milestone |
| lms | `lms.course_completed` | Employee completed course |
| lms | `lms.certification_earned` | Certification earned |
| payroll | `payroll.run_finalized` | Payroll finalized |
| billing | `billing.payment_received` | Payment confirmed |
| billing | `billing.subscription_activated` | Subscription activated |
| billing | `billing.invoice_overdue` | Invoice overdue |

### Billing Webhooks (from EMP Billing to EMP Cloud)

```
POST https://test-empcloud-api.empcloud.com/api/v1/webhooks/billing
```

**Payload format:**
```json
{
  "event": "payment.received",
  "data": {
    "invoice_id": "INV-2026-0042",
    "amount": 50000,
    "currency": "INR",
    "gateway": "stripe",
    "subscription_id": 12
  },
  "orgId": 5,
  "timestamp": "2026-03-26T10:30:00.000Z"
}
```

**Note:** Webhooks are acknowledged immediately with `{ "received": true }`. Processing happens asynchronously.

---

*This document covers 530+ API endpoints across 8 modules of the EMP Cloud platform. For questions or clarifications, contact the platform engineering team.*
