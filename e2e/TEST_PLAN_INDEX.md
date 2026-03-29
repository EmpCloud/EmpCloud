# EMP Cloud — Master Test Plan Index

**Platform:** EMP Cloud HRMS
**Total Test Plans:** 35
**Total Test Cases:** ~1,720+
**Last Updated:** 2026-03-30

---

## How to Use This Document

Each link below opens a detailed test plan with phased test cases, expected results, API endpoints, and edge cases. Work through each plan phase-by-phase. Mark each test case as PASS/FAIL and note any bugs found.

**Priority:** Start with Core Modules (Section A), then move to Extended Modules (B), Cross-Cutting (C), and finally Integration Workflows (D).

---

## A. Core Modules

These are the foundational modules that every organization uses daily.

| # | Module | Test Cases | Test Plan |
|---|--------|-----------|-----------|
| 1 | Authentication & Onboarding | 50 | [AUTH_ONBOARDING_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/AUTH_ONBOARDING_TEST_PLAN.md) |
| 2 | Employee Directory & Profiles | 67 | [EMPLOYEES_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/EMPLOYEES_TEST_PLAN.md) |
| 3 | Attendance Management | 52 | [ATTENDANCE_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/ATTENDANCE_TEST_PLAN.md) |
| 4 | Leave Management | 54 | [LEAVE_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/LEAVE_TEST_PLAN.md) |
| 5 | Documents | 40 | [DOCUMENTS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/DOCUMENTS_TEST_PLAN.md) |
| 6 | Announcements & Policies | 48 | [ANNOUNCEMENTS_POLICIES_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/ANNOUNCEMENTS_POLICIES_TEST_PLAN.md) |
| 7 | Employee Self-Service Dashboard | 57 | [SELF_SERVICE_DASHBOARD_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/SELF_SERVICE_DASHBOARD_TEST_PLAN.md) |
| 8 | Manager Self-Service | 27 | [MANAGER_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/MANAGER_TEST_PLAN.md) |

**Subtotal: 395 test cases**

---

## B. Extended Modules

Feature modules that organizations subscribe to individually.

| # | Module | Test Cases | Test Plan |
|---|--------|-----------|-----------|
| 9 | Billing & Subscriptions | 41 | [BILLING_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/BILLING_TEST_PLAN.md) |
| 10 | Helpdesk & Ticketing | 47 | [HELPDESK_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/HELPDESK_TEST_PLAN.md) |
| 11 | Surveys | 54 | [SURVEYS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/SURVEYS_TEST_PLAN.md) |
| 12 | Feedback | 39 | [FEEDBACK_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/FEEDBACK_TEST_PLAN.md) |
| 13 | Asset Management | 40 | [ASSETS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/ASSETS_TEST_PLAN.md) |
| 14 | Events | 47 | [EVENTS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/EVENTS_TEST_PLAN.md) |
| 15 | Wellness | 51 | [WELLNESS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/WELLNESS_TEST_PLAN.md) |
| 16 | Forum | 56 | [FORUM_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/FORUM_TEST_PLAN.md) |
| 17 | Whistleblowing | 55 | [WHISTLEBLOWING_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/WHISTLEBLOWING_TEST_PLAN.md) |
| 18 | AI Chatbot | 37 | [CHATBOT_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/CHATBOT_TEST_PLAN.md) |
| 19 | Biometrics | 69 | [BIOMETRICS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/BIOMETRICS_TEST_PLAN.md) |
| 20 | Positions & Org Structure | 41 | [POSITIONS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/POSITIONS_TEST_PLAN.md) |
| 21 | In-App Notifications | 25 | [NOTIFICATIONS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/NOTIFICATIONS_TEST_PLAN.md) |
| 22 | Settings (Company Config) | 34 | [SETTINGS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/SETTINGS_TEST_PLAN.md) |

**Subtotal: 636 test cases**

---

## C. Platform Administration

Super admin and platform-level management.

| # | Module | Test Cases | Test Plan |
|---|--------|-----------|-----------|
| 23 | Super Admin Panel | 72 | [SUPER_ADMIN_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/SUPER_ADMIN_TEST_PLAN.md) |
| 24 | AI Configuration | 34 | [AI_CONFIG_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/AI_CONFIG_TEST_PLAN.md) |
| 25 | Log Dashboard | 49 | [LOG_DASHBOARD_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/LOG_DASHBOARD_TEST_PLAN.md) |
| 26 | Audit Trail | 58 | [AUDIT_TRAIL_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/AUDIT_TRAIL_TEST_PLAN.md) |

**Subtotal: 213 test cases**

---

## D. Cross-Cutting Concerns

Tests that span across all modules — security, isolation, i18n, and RBAC.

| # | Area | Test Cases | Test Plan |
|---|------|-----------|-----------|
| 27 | Security (OWASP Top 10) | 78 | [SECURITY_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/SECURITY_TEST_PLAN.md) |
| 28 | Multi-Tenant Isolation | 65 | [MULTI_TENANT_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/MULTI_TENANT_TEST_PLAN.md) |
| 29 | Internationalization (9 Languages) | 54 | [I18N_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/I18N_TEST_PLAN.md) |
| 30 | Rate Limiting | 40 | [RATE_LIMITING_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/RATE_LIMITING_TEST_PLAN.md) |
| 31 | Role Transition & RBAC | 78 | [ROLE_TRANSITION_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/ROLE_TRANSITION_TEST_PLAN.md) |

**Subtotal: 315 test cases**

---

## E. Integration & Workflow Tests

End-to-end workflows that cross multiple modules.

| # | Workflow | Test Cases | Test Plan |
|---|---------|-----------|-----------|
| 32 | User Invitation Flow | 56 | [USER_INVITATION_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/USER_INVITATION_TEST_PLAN.md) |
| 33 | Employee Lifecycle (Hire to Exit) | 65 | [EMPLOYEE_LIFECYCLE_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/EMPLOYEE_LIFECYCLE_TEST_PLAN.md) |
| 34 | Cross-Module Webhooks | 55 | [CROSS_MODULE_WEBHOOKS_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/CROSS_MODULE_WEBHOOKS_TEST_PLAN.md) |
| 35 | Dunning & Enforcement | 60 | [DUNNING_ENFORCEMENT_TEST_PLAN.md](https://github.com/EmpCloud/EmpCloud/blob/main/e2e/DUNNING_ENFORCEMENT_TEST_PLAN.md) |

**Subtotal: 236 test cases**

---

## Test Environment

| Item | Details |
|------|---------|
| **Base URL** | https://test.empcloud.com |
| **API Base** | https://test-api.empcloud.com/api/v1 |
| **Super Admin Login** | Available in test credentials doc |
| **Org Admin Login** | Available in test credentials doc |
| **Employee Login** | Available in test credentials doc |
| **Browser** | Chrome (latest), Firefox, Safari |
| **Mobile** | Chrome Android, Safari iOS |

## Test Accounts Needed

| Role | Purpose |
|------|---------|
| super_admin | Platform admin tests, log dashboard, data sanity |
| org_admin (Org A) | Full org management, billing, subscriptions |
| org_admin (Org B) | Multi-tenant isolation testing |
| hr_admin | HR operations, employee management, biometrics |
| hr_manager | Limited HR + team management |
| manager | Team dashboard, leave approvals |
| employee | Self-service, basic access |

## Bug Reporting

When a test case fails, create a GitHub issue with:
1. **Test Plan:** Which plan and test case # failed
2. **Steps to Reproduce:** Exact steps taken
3. **Expected Result:** What should have happened
4. **Actual Result:** What actually happened
5. **Screenshot/Video:** Visual evidence
6. **Browser/Device:** Where it was tested

---

**Total: 35 test plans | ~1,720+ test cases | Full platform coverage**
