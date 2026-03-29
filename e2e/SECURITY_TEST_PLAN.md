# Security Testing — End-to-End Test Plan

## Module Overview
Comprehensive security testing covering OWASP Top 10 vulnerabilities, authentication bypass, authorization escalation, injection attacks, and session management across the EMP Cloud platform.

---

## Test Phases

### Phase 1: SQL Injection

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Login with `' OR 1=1 --` as email | Rejected, no auth bypass |
| 2 | Search employees with `'; DROP TABLE users; --` | Parameterized query blocks injection |
| 3 | Filter attendance with SQL in date parameter | Validation rejects malformed input |
| 4 | Leave application reason with SQL payload | Stored safely, no execution |
| 5 | Organization name with SQL injection | Input sanitized |
| 6 | Employee code search with UNION SELECT | Query parameterization prevents leak |
| 7 | Pagination params (`page=1;DROP TABLE`) | Zod validation rejects |
| 8 | Sort column injection (`sort=name;DELETE FROM`) | Whitelist-based sorting blocks |

### Phase 2: Cross-Site Scripting (XSS)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 9 | Announcement body with `<script>alert(1)</script>` | Script not executed, HTML escaped |
| 10 | Employee name with XSS payload | Rendered as text, not HTML |
| 11 | Forum post with `<img onerror=alert(1) src=x>` | Event handler stripped |
| 12 | Document name with JavaScript URL | `javascript:` protocol blocked |
| 13 | Feedback message with stored XSS | Sanitized on display |
| 14 | Policy content with embedded script | Content sanitized |
| 15 | Search input reflected XSS | Input encoded in response |
| 16 | Notification title with XSS | Escaped before rendering |
| 17 | Custom field values with XSS | Sanitized on save/display |

### Phase 3: Authentication Bypass

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 18 | Access API without Authorization header | 401 Unauthorized |
| 19 | Access API with expired JWT | 401 Unauthorized |
| 20 | Access API with malformed JWT | 401 Unauthorized |
| 21 | Access API with JWT signed by wrong key | 401 Unauthorized |
| 22 | Modify JWT payload (change user_id) | Signature validation fails, 401 |
| 23 | Use revoked refresh token | 401, token family revoked |
| 24 | Replay old access token after password change | 401 Unauthorized |
| 25 | Brute force login (>20 attempts) | Rate limited, 429 |
| 26 | Login with deactivated account | 403 Forbidden |
| 27 | Access OAuth token endpoint without PKCE | 400 Bad Request |

### Phase 4: Authorization / Privilege Escalation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Employee accesses admin API endpoints | 403 Forbidden |
| 29 | Employee accesses another employee's profile edit | 403 Forbidden |
| 30 | Manager accesses HR-only endpoints | 403 Forbidden |
| 31 | HR admin accesses super admin endpoints | 403 Forbidden |
| 32 | org_admin accesses different org's data | 403 / empty result |
| 33 | Change own role via API (employee → admin) | 403 Forbidden |
| 34 | Access leave applications of other org | Organization filter blocks |
| 35 | Modify another user's attendance record | 403 Forbidden |
| 36 | Delete documents from another org | 403 Forbidden |
| 37 | Approve own leave request | Self-approval blocked |

### Phase 5: Insecure Direct Object References (IDOR)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 38 | GET /employees/:id with other org's employee ID | 404 or 403 |
| 39 | PUT /leave/applications/:id with other user's leave | 403 Forbidden |
| 40 | GET /documents/:id with other org's document | 404 or 403 |
| 41 | GET /announcements/:id from different org | 404 or 403 |
| 42 | PUT /attendance/:id with other org's record | 403 Forbidden |
| 43 | GET /users/:id with sequential ID enumeration | Only own org data returned |
| 44 | DELETE /helpdesk/tickets/:id across org boundary | 403 Forbidden |
| 45 | GET /surveys/:id/responses from other org | 403 or empty |

### Phase 6: CSRF Protection

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 46 | POST request without origin header | Rejected by CORS |
| 47 | POST from unauthorized origin | CORS blocks request |
| 48 | State-changing GET requests | None exist (REST compliance) |
| 49 | Cookie-based auth without SameSite | SameSite=Strict set |

### Phase 7: Session Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 50 | Refresh token rotation on each use | Old token invalidated |
| 51 | Concurrent sessions from different devices | All valid independently |
| 52 | Logout invalidates refresh token | Token revoked in DB |
| 53 | Password change invalidates all sessions | All refresh tokens revoked |
| 54 | Access token expiry (15 min default) | Token rejected after expiry |
| 55 | Refresh token expiry (7 days default) | Token rejected after expiry |

### Phase 8: Input Validation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 56 | Email field with invalid format | Zod validation rejects |
| 57 | Phone number with letters | Validation rejects |
| 58 | Date field with non-date string | Validation rejects |
| 59 | Numeric field with string | Type coercion or rejection |
| 60 | File upload with executable extension | Rejected (whitelist check) |
| 61 | Oversized file upload (>10MB) | 413 Payload Too Large |
| 62 | Empty required fields | 400 with field-level errors |
| 63 | String exceeding max length | Validation rejects |
| 64 | Negative values for positive-only fields | Validation rejects |
| 65 | Future date for DOB | Validation rejects |
| 66 | Underage DOB (< 18 years) | Validation rejects |

### Phase 9: API Security Headers

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 67 | X-Content-Type-Options: nosniff | Header present |
| 68 | X-Frame-Options: DENY | Header present |
| 69 | Strict-Transport-Security | HSTS header set |
| 70 | Content-Security-Policy | CSP header configured |
| 71 | X-XSS-Protection | Header present |
| 72 | Server header hidden | No Express/version leak |

### Phase 10: Data Exposure

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 73 | API response does not include password hash | Password field excluded |
| 74 | API key masked in GET response | Only last 4 chars visible |
| 75 | Error responses don't leak stack traces (prod) | Generic error message |
| 76 | JWT does not contain sensitive data | No PII in token payload |
| 77 | Audit logs don't contain passwords | Sanitized before logging |
| 78 | GET /ai-config masks API keys | Keys returned as ****... |

---

## Key Attack Vectors

| Category | Tools/Techniques | Target Endpoints |
|----------|-----------------|------------------|
| SQL Injection | Parameterized inputs, UNION, blind | All search/filter endpoints |
| XSS | Stored, reflected, DOM-based | All text input fields |
| Auth Bypass | JWT manipulation, token replay | /auth/*, /oauth/* |
| IDOR | Sequential ID enumeration | All /:id endpoints |
| Privilege Escalation | Role manipulation, cross-org access | All role-gated endpoints |
| Rate Limiting | Burst requests, distributed | /auth/login, /auth/register |

## OWASP Top 10 Coverage

| # | Category | Test Cases |
|---|----------|------------|
| A01 | Broken Access Control | 28-45 |
| A02 | Cryptographic Failures | 73-78 |
| A03 | Injection | 1-8 |
| A04 | Insecure Design | 37, 48 |
| A05 | Security Misconfiguration | 67-72 |
| A06 | Vulnerable Components | Dependency audit |
| A07 | Auth Failures | 18-27, 50-55 |
| A08 | Data Integrity Failures | 46-49 |
| A09 | Logging Failures | 77 |
| A10 | SSRF | API URL validation |
