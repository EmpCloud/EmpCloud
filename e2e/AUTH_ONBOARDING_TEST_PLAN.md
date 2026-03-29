# Authentication & Onboarding — End-to-End Test Plan

## Module Overview
Authentication is the centralized identity layer for the entire EMP ecosystem. It handles login, registration, password management, OAuth2/OIDC, and SSO token exchange. Onboarding is the guided setup wizard for new organizations.

---

## Test Phases

### Phase 1: Organization Registration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/register` | Registration form loads with org + admin fields |
| 2 | Fill org details (name, legal name, country, timezone, email) | Fields accept valid input |
| 3 | Fill admin details (name, email, password) | Password validates: 8+ chars, upper, lower, digit, special |
| 4 | Submit with weak password (e.g., "123") | Validation error shown |
| 5 | Submit with valid data | Org created, admin user logged in, redirected to `/onboarding` |
| 6 | Attempt duplicate org email registration | Error: email already registered |
| 7 | Rate limiting: 6th registration attempt within 1 hour | Rate limit error (429) |

### Phase 2: Login

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Navigate to `/login` | Login form with email + password fields |
| 9 | Login with valid credentials | Redirected to `/` (dashboard) |
| 10 | Login with wrong password | Error: "Login failed" |
| 11 | Login with non-existent email | Error: "Login failed" (no email enumeration) |
| 12 | Rate limiting: 11th failed attempt in 15 min | Rate limit error (429) |
| 13 | Password visibility toggle | Type toggles between `password` and `text` |
| 14 | Login as terminated user (status=0) | Blocked with appropriate error |
| 15 | Login persists across page refresh | Auth state restored from localStorage |

### Phase 3: Password Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Change password with correct current password | Password updated, audit logged |
| 17 | Change password with wrong current password | Error: incorrect password |
| 18 | Change to weak password | Validation error |
| 19 | Forgot password with valid email | Success message (no email enumeration) |
| 20 | Forgot password with invalid email | Same success message (no enumeration) |
| 21 | Reset password with valid token | Password changed, can login with new password |
| 22 | Reset password with expired/invalid token | Error: invalid or expired token |

### Phase 4: Onboarding Wizard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | New org redirected to `/onboarding` | Wizard loads at step 1 |
| 24 | Step 1: Fill company info (name, timezone, etc.) | Step completes, advances to step 2 |
| 25 | Step 2: Create departments from presets | Departments created, advance to step 3 |
| 26 | Step 2: Add custom department name | Custom department created |
| 27 | Step 3: Invite team members by email + role | Invitations sent |
| 28 | Step 3: Skip invitations | Can proceed without inviting |
| 29 | Step 4: Select modules for trial | 14-day trial subscriptions created |
| 30 | Step 5: Configure leave types (EL, CL, SL) | Leave types with quotas created |
| 31 | Step 5: Configure default shift | Shift created with times + grace periods |
| 32 | Complete onboarding | Redirected to dashboard, onboarding marked done |
| 33 | Skip onboarding | Onboarding skipped, goes to dashboard |
| 34 | Resume onboarding (refresh mid-wizard) | Resumes at last completed step |

### Phase 5: SSO Token Exchange

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 35 | Generate SSO token for module | Valid RS256 token returned |
| 36 | Navigate to module with `?sso_token=` | Module exchanges token for local session |
| 37 | SSO with expired Cloud token | Module redirects to login |
| 38 | SSO with tampered token | Module rejects, shows error |

### Phase 6: OAuth2/OIDC

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | `GET /.well-known/openid-configuration` | Returns OIDC discovery document |
| 40 | `GET /oauth/jwks` | Returns public key set |
| 41 | `GET /oauth/userinfo` with valid token | Returns user claims (email, name, org) |
| 42 | `POST /oauth/token` with auth code + PKCE | Returns access + refresh tokens |
| 43 | `POST /oauth/revoke` with access token | Token revoked, subsequent use fails |
| 44 | `POST /oauth/introspect` with valid token | Returns `active: true` with metadata |
| 45 | `POST /oauth/introspect` with revoked token | Returns `active: false` |

### Phase 7: Session & Token Lifecycle

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 46 | Access token expires, refresh token used | New access token issued |
| 47 | Refresh token rotated on use | Old refresh token invalidated |
| 48 | Logout clears auth state | localStorage cleared, redirected to `/login` |
| 49 | Access protected route without auth | Redirected to `/login` |
| 50 | Access `/login` while authenticated | Redirected to `/` |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/auth/register` | POST | Organization + admin registration |
| `/api/v1/auth/login` | POST | User authentication |
| `/api/v1/auth/change-password` | POST | Password change (authenticated) |
| `/api/v1/auth/forgot-password` | POST | Request password reset |
| `/api/v1/auth/reset-password` | POST | Reset with token |
| `/api/v1/auth/sso/token` | POST | Generate SSO token |
| `/api/v1/auth/sso/validate` | POST | Validate SSO token |
| `/api/v1/onboarding/status` | GET | Get onboarding progress |
| `/api/v1/onboarding/step/:n` | POST | Complete onboarding step |
| `/api/v1/onboarding/complete` | POST | Mark onboarding done |
| `/api/v1/onboarding/skip` | POST | Skip onboarding |
| `/oauth/authorize` | GET | OAuth2 authorization |
| `/oauth/token` | POST | Token exchange |
| `/oauth/revoke` | POST | Token revocation |
| `/oauth/introspect` | POST | Token introspection |
| `/oauth/userinfo` | GET | OIDC user claims |
| `/oauth/jwks` | GET | Public key set |
| `/.well-known/openid-configuration` | GET | OIDC discovery |

## Security Validations

- No email enumeration on login/forgot-password (same error for valid/invalid emails)
- Rate limiting enforced on auth endpoints
- PKCE required for public OAuth clients
- Refresh tokens rotated on each use
- Token revocation is instant (DB check, not just JWT expiry)
- Passwords hashed with bcrypt (12 rounds)
- All auth events audit-logged
