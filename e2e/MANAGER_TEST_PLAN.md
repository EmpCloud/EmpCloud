# Manager Self-Service — End-to-End Test Plan

## Module Overview
Dedicated dashboard for managers to view their direct reports, team attendance, pending leave approvals, and team leave calendar — all in one page.

---

## Test Phases

### Phase 1: Manager Dashboard Overview

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/manager` as manager role | Dashboard loads |
| 2 | Stats card: Team Size | Correct count of direct reports |
| 3 | Stats card: Present Today | Employees checked in today |
| 4 | Stats card: Absent Today | Employees not checked in |
| 5 | Stats card: On Leave Today | Employees with approved leave |
| 6 | Stats card: Late Today | Employees past grace period |
| 7 | Stats card: Pending Leave Requests | Count of pending approvals |

### Phase 2: Team Attendance

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Team attendance card shows today's status | Each report with check-in/out times |
| 9 | Present employees show times | Check-in and check-out visible |
| 10 | Absent employees marked | No check-in indicator |
| 11 | On-leave employees marked | Leave status shown |

### Phase 3: Team Leave Calendar

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 12 | Calendar shows current week (Mon-Sun) | Week date range displayed |
| 13 | Approved leaves shown with colors | Leave type colors applied |
| 14 | Leave shows employee name + type | Correct info per day |
| 15 | Multi-day leaves span dates | Visual spanning |

### Phase 4: Pending Leave Approvals

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Pending leave table loads | Employee, Type, Dates, Days, Reason shown |
| 17 | Click Review on a leave | Expands with remarks input |
| 18 | Approve leave with remarks | Status → approved, disappears from pending |
| 19 | Reject leave with remarks | Status → rejected, disappears from pending |
| 20 | Approve without remarks | Allowed (remarks optional) |
| 21 | Leave balance updated after approval | Employee's balance decremented |

### Phase 5: Direct Reports List

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Direct reports listed | Names, designations, emp codes |
| 23 | Click report name | Navigates to employee profile |
| 24 | Only direct reports shown | No skip-level employees |

### Phase 6: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 25 | Employee (non-manager) accesses `/manager` | Redirected or empty dashboard |
| 26 | Manager sees only own team | No cross-team data |
| 27 | HR admin can also access | HR role has access |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/manager/team` | GET | Direct reports list |
| `/api/v1/manager/attendance` | GET | Team attendance today |
| `/api/v1/manager/leaves/pending` | GET | Pending leave approvals |
| `/api/v1/manager/leaves/calendar` | GET | Team leave calendar |
| `/api/v1/manager/dashboard` | GET | Combined dashboard stats |
| `/api/v1/leave/applications/:id/approve` | PUT | Approve leave |
| `/api/v1/leave/applications/:id/reject` | PUT | Reject leave |
