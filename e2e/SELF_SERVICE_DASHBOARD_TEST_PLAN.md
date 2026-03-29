# Employee Self-Service Dashboard — End-to-End Test Plan

## Module Overview
The employee dashboard is the landing page after login, showing 5 key widgets: today's attendance status, leave balance summary, pending documents, recent announcements, and policy acknowledgments. Provides quick actions for common tasks.

---

## Test Phases

### Phase 1: Dashboard Layout

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Login as employee → dashboard loads | `/dashboard` with all 5 widgets |
| 2 | Welcome message shows user's name | "Welcome, {firstName}" |
| 3 | Dashboard responsive on mobile | Widgets stack vertically |
| 4 | Dashboard responsive on tablet | 2-column layout |
| 5 | Dashboard loads within 3 seconds | Acceptable performance |

### Phase 2: Attendance Today Widget

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6 | Shows "Not Checked In" before check-in | Status indicator |
| 7 | Check-in button available | Clickable action |
| 8 | After check-in: shows check-in time | Time displayed |
| 9 | Status changes to "Checked In" | Green indicator |
| 10 | Check-out button appears after check-in | Available action |
| 11 | After check-out: both times shown | Check-in and check-out |
| 12 | Worked hours calculated | Duration displayed |
| 13 | Late indicator if past grace period | "Late" badge shown |
| 14 | On approved leave: shows "On Leave" | Leave status displayed |
| 15 | Holiday: shows "Holiday" | Holiday indicator |

### Phase 3: Leave Balance Widget

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | All leave types shown | Casual, Sick, Earned, etc. |
| 17 | Balance = total - used | Correct calculation |
| 18 | Color-coded by remaining % | Green (>50%), Yellow (25-50%), Red (<25%) |
| 19 | Click "Apply Leave" → opens form | Quick action works |
| 20 | Shows pending leave count | Awaiting approval count |
| 21 | Zero balance shown correctly | "0 days" displayed |
| 22 | Annual/earned leave accrual note | If applicable |

### Phase 4: Pending Documents Widget

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | Mandatory documents listed | Documents needing upload |
| 24 | Uploaded but unverified shown | Pending verification indicator |
| 25 | Expiring documents highlighted | Warning for near-expiry |
| 26 | Expired documents flagged red | Overdue indicator |
| 27 | Click document → navigate to upload | Quick action |
| 28 | "All documents complete" state | Green checkmark / no items |
| 29 | Count badge on widget header | Number of pending items |

### Phase 5: Recent Announcements Widget

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 30 | Latest 5 announcements shown | Sorted newest first |
| 31 | Unread announcements highlighted | Bold or dot indicator |
| 32 | Title + preview text shown | First 2 lines of body |
| 33 | Published date displayed | Relative time (e.g., "2 hours ago") |
| 34 | Click announcement → detail page | Navigation works |
| 35 | "No announcements" empty state | Friendly message |
| 36 | "View All" link | Navigates to announcements page |

### Phase 6: Policy Acknowledgments Widget

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Unacknowledged policies listed | Policies needing attention |
| 38 | Policy name + version shown | Correct info |
| 39 | "Acknowledge" button per policy | Quick action |
| 40 | After acknowledging → removed from list | Widget updates |
| 41 | "All policies acknowledged" state | Completion indicator |
| 42 | Mandatory policies flagged | Required indicator |
| 43 | Count badge on widget header | Number of pending |

### Phase 7: Quick Actions

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 44 | Quick check-in button | Triggers attendance check-in |
| 45 | Quick leave apply button | Opens leave application form |
| 46 | Quick document upload | Opens document upload |
| 47 | Quick profile edit | Navigates to own profile |
| 48 | Quick helpdesk ticket | Opens ticket creation |

### Phase 8: Role-Based Dashboard Variations

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 49 | Employee sees standard 5 widgets | Default dashboard |
| 50 | Manager sees team stats | Additional team widget |
| 51 | HR admin sees pending items | Pending approvals count |
| 52 | org_admin sees org overview | Broader org metrics |
| 53 | Super admin redirected to `/admin` | Admin dashboard instead |

### Phase 9: Data Freshness

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 54 | Dashboard reflects real-time check-in | Immediate update |
| 55 | Leave approval updates balance widget | Balance recalculated |
| 56 | New announcement appears | Widget refreshes |
| 57 | Page refresh loads fresh data | No stale cache |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/attendance/today` | GET | Current attendance status |
| `/api/v1/leave/balances` | GET | Leave balances |
| `/api/v1/documents/my` | GET | Employee's documents |
| `/api/v1/announcements` | GET | Recent announcements |
| `/api/v1/policies` | GET | Policies needing acknowledgment |
| `/api/v1/dashboard` | GET | Combined dashboard data |

## Widget Summary

| Widget | Data Source | Refresh Trigger |
|--------|------------|-----------------|
| Attendance Today | attendance/today | Check-in/out action |
| Leave Balance | leave/balances | Leave approval |
| Pending Documents | documents/my | Document upload |
| Announcements | announcements | New announcement |
| Policy Acks | policies | Acknowledgment |
