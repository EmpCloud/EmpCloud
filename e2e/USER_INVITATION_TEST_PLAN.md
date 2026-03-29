# User Invitation Flow — End-to-End Test Plan

## Module Overview
Complete user onboarding workflow: HR/admin invites user → email with token → user accepts invitation → account created with role, department, location → employee profile initialized with 6-month probation period.

---

## Test Phases

### Phase 1: Sending Invitations

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | HR admin opens invite form | Form with email, role, department, location fields |
| 2 | Invite with valid email + role | Invitation created, status=pending |
| 3 | Invite with employee role | Role set to employee |
| 4 | Invite with manager role | Role set to manager |
| 5 | Invite with hr_manager role | Role set to hr_manager |
| 6 | Invite with hr_admin role | Role set to hr_admin |
| 7 | Invite with org_admin role | Role set to org_admin |
| 8 | Specify department on invite | Department assigned |
| 9 | Specify location on invite | Location assigned |
| 10 | Invitation token generated | Unique UUID token created |
| 11 | Invitation email sent | Email with accept link |
| 12 | Token expires after 72 hours | Configurable expiry |
| 13 | Duplicate email for same org | 409 Conflict |
| 14 | Invite already-registered user | 409 Conflict |

### Phase 2: Invitation Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 15 | List pending invitations | All pending invites shown |
| 16 | List accepted invitations | Completed invites shown |
| 17 | List expired invitations | Expired invites shown |
| 18 | Resend invitation | New token generated, email resent |
| 19 | Cancel pending invitation | Status → cancelled |
| 20 | Expired invitation cannot be accepted | 400 Bad Request |
| 21 | Cancelled invitation cannot be accepted | 400 Bad Request |
| 22 | Invitation shows inviter name | Who sent it |
| 23 | Invitation shows created_at | When it was sent |

### Phase 3: Accepting Invitation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | Accept invitation page loads | Form with name, password fields |
| 25 | Valid token → form accessible | Token validated |
| 26 | Invalid token → error page | "Invalid or expired invitation" |
| 27 | Fill name + password → submit | User account created |
| 28 | Password must be 8+ characters | Validation enforces |
| 29 | Password requires complexity | Uppercase, lowercase, number |
| 30 | User created with invited role | Role matches invitation |
| 31 | User assigned to invited department | Department matches |
| 32 | User assigned to invited location | Location matches |
| 33 | Invitation status → accepted | Status updated |
| 34 | accepted_at timestamp set | Completion time recorded |
| 35 | Auto-login after acceptance | JWT tokens returned |

### Phase 4: Post-Acceptance Setup

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Employee profile auto-created | Profile linked to user |
| 37 | emp_code generated | Unique employee code assigned |
| 38 | Probation period set (6 months) | probation_start_date = join date |
| 39 | Probation end date calculated | start + 6 months |
| 40 | Probation status = on_probation | Default probation state |
| 41 | Leave balances initialized | Default balances for org's leave types |
| 42 | Default shift assigned | If org has a default shift |
| 43 | Organization user count incremented | org.current_user_count += 1 |
| 44 | Audit log: USER_INVITED | Invite action logged |
| 45 | Audit log: USER_REGISTERED | Acceptance action logged |

### Phase 5: Bulk Invitation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 46 | Invite multiple users (CSV/batch) | Multiple invitations created |
| 47 | Partial failure (some emails invalid) | Valid ones sent, errors reported |
| 48 | Duplicate emails in batch | Duplicates rejected, rest processed |
| 49 | Rate limit on bulk invites | Reasonable limit enforced |

### Phase 6: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 50 | Employee cannot send invitations | 403 Forbidden |
| 51 | Manager cannot send invitations | 403 Forbidden |
| 52 | HR admin can send invitations | Allowed |
| 53 | org_admin can send invitations | Allowed |
| 54 | HR can invite up to hr_manager role | Cannot invite org_admin |
| 55 | org_admin can invite any role | Full role access |
| 56 | Invitation respects seat limits | Cannot invite beyond subscription seats |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/users/invite` | POST | Send invitation |
| `/api/v1/users/invitations` | GET | List invitations |
| `/api/v1/users/invitations/:id/resend` | POST | Resend invitation |
| `/api/v1/users/invitations/:id/cancel` | PUT | Cancel invitation |
| `/api/v1/users/accept-invitation` | POST | Accept & create account |

## Invitation States

```
pending → accepted (user completed signup)
pending → expired (72h passed)
pending → cancelled (admin cancelled)
pending → resent (new token, old invalidated)
```

## Post-Acceptance Checklist

| Step | System Action |
|------|---------------|
| 1 | User record created in `users` table |
| 2 | Employee profile created in `employee_profiles` |
| 3 | Employee code generated (EMP-{org}-{seq}) |
| 4 | Probation tracking initialized |
| 5 | Leave balances initialized per org policy |
| 6 | Default shift assigned (if configured) |
| 7 | Organization user count updated |
| 8 | Invitation marked as accepted |
| 9 | Audit log entries created |
| 10 | Welcome notification sent |
