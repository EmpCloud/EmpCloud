# Role Transition & RBAC — End-to-End Test Plan

## Module Overview
Tests that changing a user's role immediately and correctly updates their access permissions across all modules. Covers all 5 roles (employee → manager → hr_manager → hr_admin → org_admin) and verifies both promotion and demotion paths.

---

## Role Hierarchy

```
super_admin (platform-level, separate)
  └─ org_admin (full org access)
       └─ hr_admin (HR operations + employee management)
            └─ hr_manager (limited HR + team management)
                 └─ manager (team management only)
                      └─ employee (self-service only)
```

## RBAC Middleware

| Middleware | Roles Allowed |
|-----------|--------------|
| `requireRole('employee')` | All authenticated users |
| `requireRole('manager')` | manager, hr_manager, hr_admin, org_admin |
| `requireHR` | hr_manager, hr_admin, org_admin |
| `requireOrgAdmin` | org_admin only |
| `requireSuperAdmin` | super_admin only |
| `requireSelfOrHR` | Self (own data) OR hr_manager+ |

---

## Test Phases

### Phase 1: Employee Role Access

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Employee can view own profile | 200 OK |
| 2 | Employee can check-in/out | 200 OK |
| 3 | Employee can apply for leave | 200 OK |
| 4 | Employee can view own documents | 200 OK |
| 5 | Employee can view announcements | 200 OK |
| 6 | Employee CANNOT access /manager | 403 Forbidden |
| 7 | Employee CANNOT access HR endpoints | 403 Forbidden |
| 8 | Employee CANNOT access admin endpoints | 403 Forbidden |
| 9 | Employee CANNOT view other employees' profiles | 403 Forbidden |
| 10 | Employee CANNOT approve leaves | 403 Forbidden |
| 11 | Employee CANNOT manage shifts | 403 Forbidden |
| 12 | Employee CANNOT send invitations | 403 Forbidden |

### Phase 2: Employee → Manager Promotion

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 13 | Admin changes role: employee → manager | Role updated |
| 14 | New token reflects manager role | role claim = manager |
| 15 | /manager dashboard now accessible | 200 OK |
| 16 | Can view direct reports | Team data visible |
| 17 | Can approve team leave requests | Approval works |
| 18 | Can view team attendance | Team data visible |
| 19 | Still can access own self-service | Employee features intact |
| 20 | Still CANNOT access HR endpoints | 403 Forbidden |
| 21 | Still CANNOT access admin endpoints | 403 Forbidden |
| 22 | Still CANNOT manage all employees | Only direct reports |

### Phase 3: Manager → HR Manager Promotion

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | Admin changes role: manager → hr_manager | Role updated |
| 24 | Can access HR-level endpoints | requireHR passes |
| 25 | Can view all employees (not just team) | Full directory access |
| 26 | Can verify documents | Verification capability |
| 27 | Can manage leave types | Leave admin access |
| 28 | Can manage shifts | Shift admin access |
| 29 | Still has team management | Manager features intact |
| 30 | Still CANNOT access org admin endpoints | 403 Forbidden |

### Phase 4: HR Manager → HR Admin Promotion

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Admin changes role: hr_manager → hr_admin | Role updated |
| 32 | Full HR operations access | All HR endpoints available |
| 33 | Can send invitations | Invite capability |
| 34 | Can manage biometrics | Biometric admin access |
| 35 | Can manage all employees' data | Full CRUD |
| 36 | Can manage departments/locations | Settings access |
| 37 | Still CANNOT access org admin endpoints | 403 Forbidden |
| 38 | Still CANNOT change other users' roles | 403 Forbidden |

### Phase 5: HR Admin → Org Admin Promotion

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | Super admin changes role: hr_admin → org_admin | Role updated |
| 40 | Full organization access | All org endpoints available |
| 41 | Can manage subscriptions | Subscription CRUD |
| 42 | Can manage billing | Payment access |
| 43 | Can change user roles | Role management |
| 44 | Can view org settings | Full settings access |
| 45 | Can invite any role (including org_admin) | Full invite capability |
| 46 | Still CANNOT access super admin | 403 Forbidden |

### Phase 6: Demotion — Org Admin → Employee

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 47 | Super admin demotes: org_admin → employee | Role updated |
| 48 | All admin endpoints now 403 | Immediate restriction |
| 49 | All HR endpoints now 403 | Immediate restriction |
| 50 | All manager endpoints now 403 | Immediate restriction |
| 51 | Only self-service available | Basic employee access |
| 52 | Previous admin actions still in audit | History preserved |

### Phase 7: Demotion — Manager → Employee

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 53 | Admin demotes: manager → employee | Role updated |
| 54 | /manager dashboard now 403 | Immediate restriction |
| 55 | Cannot approve team leaves | 403 Forbidden |
| 56 | Cannot view team attendance | 403 Forbidden |
| 57 | Direct reports reassigned | Or show no manager |
| 58 | Pending approvals reassigned | Or escalated to HR |

### Phase 8: Token & Session Impact

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 59 | Role change → existing token still works | Until expiry |
| 60 | After token refresh → new role reflected | Updated claims |
| 61 | New login → correct role in token | Fresh JWT |
| 62 | Multiple sessions → all updated on refresh | Consistent |

### Phase 9: Cross-Module Role Enforcement

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 63 | Employee accesses biometrics admin | 403 Forbidden |
| 64 | Employee accesses survey management | 403 Forbidden |
| 65 | Employee accesses event management | 403 (create) |
| 66 | Employee accesses forum moderation | 403 Forbidden |
| 67 | Manager accesses biometrics admin | 403 Forbidden |
| 68 | HR admin accesses survey analytics | 200 OK |
| 69 | HR admin accesses document management | 200 OK |
| 70 | Org admin accesses all module settings | 200 OK |

### Phase 10: Self-Approval Prevention

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 71 | Manager approves own leave | Blocked (self-approval) |
| 72 | HR admin approves own leave | Blocked or escalated |
| 73 | Manager approves own regularization | Blocked |
| 74 | HR verifies own document | Blocked or flagged |

### Phase 11: Audit Trail for Role Changes

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 75 | Role change creates audit entry | USER_ROLE_CHANGED logged |
| 76 | Audit shows old role → new role | Transition recorded |
| 77 | Audit shows who made the change | Admin/super_admin ID |
| 78 | Audit shows timestamp | When change occurred |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/organizations/:orgId/users/:userId/role` | PUT | Super admin: change role |
| `/api/v1/users/:id` | PUT | Org admin: update user role |
| `/api/v1/auth/refresh-token` | POST | Get new token with updated role |

## Role Permission Matrix

| Capability | employee | manager | hr_manager | hr_admin | org_admin |
|-----------|----------|---------|------------|----------|-----------|
| Self-service (profile, attendance, leave) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own team | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve team leave | ❌ | ✅ | ✅ | ✅ | ✅ |
| View all employees | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage leave types | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage shifts | ❌ | ❌ | ✅ | ✅ | ✅ |
| Send invitations | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage biometrics | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage subscriptions | ❌ | ❌ | ❌ | ❌ | ✅ |
| Change user roles | ❌ | ❌ | ❌ | ❌ | ✅ |
| Access billing | ❌ | ❌ | ❌ | ❌ | ✅ |
