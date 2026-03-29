# Super Admin Module — End-to-End Test Plan

## Module Overview
Platform-level administration for managing organizations, users across orgs, module management, revenue analytics, service health monitoring, data sanity checks, system notifications, and audit trails. Only accessible to `super_admin` role.

---

## Test Phases

### Phase 1: Platform Overview Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Login as super admin, navigate to `/admin` | Dashboard loads |
| 2 | View total organizations count | Correct number |
| 3 | View total users count | Accurate across all orgs |
| 4 | View active subscriptions | Current active count |
| 5 | Recent activity feed | Latest platform-wide actions |

### Phase 2: Organization Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6 | List all organizations | Paginated org list |
| 7 | Search by org name/email | Matching orgs found |
| 8 | Sort by created_at | Chronological order |
| 9 | Sort by user_count | Size-based order |
| 10 | Sort by subscription_count | Subscription-based order |
| 11 | Sort by monthly_spend | Revenue-based order |
| 12 | View organization detail | Full org info + users + subscriptions |
| 13 | See org monthly revenue | Revenue metrics |
| 14 | See org total spend | Cumulative spend |
| 15 | See org audit logs | Org-specific audit trail |

### Phase 3: Cross-Org User Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Deactivate user in any org | User status = 0 |
| 17 | Activate deactivated user | User status = 1 |
| 18 | Reset user password | New password set (8+ chars) |
| 19 | Change user role | Role updated (employee/manager/hr_manager/hr_admin/org_admin) |
| 20 | Deactivated user cannot login | Login blocked |
| 21 | Reactivated user can login | Login works again |

### Phase 4: Module Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | View all modules with adoption stats | Subscriber count, seats, revenue per module |
| 23 | Toggle module active status | Module enabled/disabled platform-wide |
| 24 | Disabled module not available for subscription | Module hidden from marketplace |
| 25 | Module adoption rates displayed | Percentage of orgs using module |

### Phase 5: Revenue Analytics

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 26 | Revenue data for 12-month period | Monthly revenue data points |
| 27 | Revenue formatted in INR | Correct currency formatting |
| 28 | Revenue trends visible | Growth/decline patterns |

### Phase 6: Subscription & Growth Metrics

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Active subscriptions count | Accurate number |
| 30 | Trial subscriptions count | Current trials |
| 31 | Subscription distribution | By plan tier, by module |
| 32 | User growth trends | Growth data points |
| 33 | Overdue organizations list | Orgs with past-due subscriptions |

### Phase 7: Service Health Monitoring

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 34 | Navigate to `/admin/health` | Health dashboard loads |
| 35 | Basic health check: DB + email | Status indicators |
| 36 | Detailed service health | Module-by-module status |
| 37 | Module response times | Latency metrics |
| 38 | Infrastructure health (DB, Redis) | Connection status |
| 39 | Overall status: operational/degraded/outage | Correct aggregate |
| 40 | Force manual health check | Trigger re-check |

### Phase 8: Data Sanity

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 41 | Navigate to `/admin/data-sanity` | Data sanity page loads |
| 42 | Run sanity check | 10 checks execute |
| 43 | Check 1: User count consistency | Pass/warn/fail status |
| 44 | Check 2: Cross-module employee sync | Pass/warn/fail |
| 45 | Check 3: Leave balance integrity | Pass/warn/fail |
| 46 | Check 4: Attendance consistency | Pass/warn/fail |
| 47 | Check 5: Subscription seat consistency | Pass/warn/fail |
| 48 | Check 6: Orphaned records | Pass/warn/fail |
| 49 | Check 7: Payroll-leave sync | Pass/warn/fail |
| 50 | Check 8: Exit-user status sync | Pass/warn/fail |
| 51 | Check 9: Department/location integrity | Pass/warn/fail |
| 52 | Check 10: Duplicate detection | Pass/warn/fail |
| 53 | Overall status: healthy/warnings/critical | Correct aggregate |
| 54 | Auto-fix applies corrections | Fixes applied with counts |

### Phase 9: System Notifications

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 55 | Create notification (type: info) | Notification created |
| 56 | Create notification (type: warning) | Warning notification |
| 57 | Create notification (type: maintenance) | Maintenance notice |
| 58 | Create notification (type: release) | Release announcement |
| 59 | Target: all organizations | Visible to everyone |
| 60 | Target: specific org | Only that org sees it |
| 61 | Schedule notification (future) | Not shown until scheduled_at |
| 62 | Set expiry date | Hidden after expires_at |
| 63 | Deactivate notification | Status = inactive |
| 64 | List notifications with filters | Pagination + active_only |

### Phase 10: Platform Configuration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 65 | View platform info | Server version, Node version, uptime |
| 66 | Environment indicator | dev/prod shown |
| 67 | Email config status | Configured/not configured |
| 68 | Security config | Bcrypt rounds, token expiry, rate limits |

### Phase 11: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 69 | Non-super_admin accesses `/admin` | Redirected / 403 |
| 70 | org_admin accesses admin API | 403 Forbidden |
| 71 | hr_admin accesses admin API | 403 Forbidden |
| 72 | Super admin can access all endpoints | Full access |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/overview` | GET | Platform overview |
| `/api/v1/admin/organizations` | GET | List organizations |
| `/api/v1/admin/organizations/:id` | GET | Org detail |
| `/api/v1/admin/organizations/:orgId/users/:userId/deactivate` | PUT | Deactivate user |
| `/api/v1/admin/organizations/:orgId/users/:userId/activate` | PUT | Activate user |
| `/api/v1/admin/organizations/:orgId/users/:userId/reset-password` | PUT | Reset password |
| `/api/v1/admin/organizations/:orgId/users/:userId/role` | PUT | Change role |
| `/api/v1/admin/modules` | GET | Module analytics |
| `/api/v1/admin/modules/:id` | PUT | Toggle module status |
| `/api/v1/admin/revenue` | GET | Revenue data |
| `/api/v1/admin/growth` | GET | Growth metrics |
| `/api/v1/admin/subscriptions` | GET | Subscription metrics |
| `/api/v1/admin/activity` | GET | Recent activity |
| `/api/v1/admin/overdue-organizations` | GET | Overdue orgs |
| `/api/v1/admin/health` | GET | Basic health |
| `/api/v1/admin/service-health` | GET | Detailed health |
| `/api/v1/admin/service-health/check` | POST | Force check |
| `/api/v1/admin/data-sanity` | GET | Run sanity checks |
| `/api/v1/admin/data-sanity/fix` | POST | Auto-fix issues |
| `/api/v1/admin/notifications` | GET/POST | Notifications CRUD |
| `/api/v1/admin/notifications/:id/deactivate` | PUT | Deactivate |
| `/api/v1/admin/platform-info` | GET | Platform config |
| `/api/v1/admin/audit` | GET | Audit logs |

## Data Sanity Checks (10 Total)

| # | Check | What It Verifies |
|---|-------|-----------------|
| 1 | User Count Consistency | org.current_user_count matches actual |
| 2 | Cross-Module Employee Sync | Seat holders exist in module DBs |
| 3 | Leave Balance Integrity | No negatives, used matches approved |
| 4 | Attendance Consistency | No time anomalies, worked_minutes correct |
| 5 | Subscription Seat Consistency | used_seats matches actual assignments |
| 6 | Orphaned Records | No FKs pointing to deleted entities |
| 7 | Payroll-Leave Sync | Unpaid leaves have payroll deductions |
| 8 | Exit-User Status Sync | Exited users deactivated |
| 9 | Department/Location Integrity | No invalid FK references |
| 10 | Duplicate Detection | No duplicate emails or emp_codes |

## Notification Types

`info` | `warning` | `maintenance` | `release`

## Service Health Statuses

`operational` | `degraded` | `major_outage`
