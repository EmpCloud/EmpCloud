# Attendance Module — End-to-End Test Plan

## Module Overview
Manages daily check-in/check-out, shifts, shift assignments, shift swaps, geo-fencing, regularization requests, attendance dashboard, and monthly reports.

---

## Test Phases

### Phase 1: Daily Check-In/Check-Out

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Employee clicks Check In | Check-in recorded with timestamp, status updates |
| 2 | View today's attendance status | Shows check-in time, status = "present" |
| 3 | Employee clicks Check Out | Check-out recorded, worked duration calculated |
| 4 | View after check-out | Both times visible, worked hours/minutes shown |
| 5 | Attempt double check-in same day | Blocked or updates existing record |
| 6 | Check-in with geo-location (source: geofence) | Lat/lng recorded with check-in |
| 7 | Today's status refreshes on page focus | Date change triggers re-fetch |

### Phase 2: Attendance History & Records

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Employee views personal history | Own records only, paginated |
| 9 | Filter by month/year | Correct month's records shown |
| 10 | HR views all records | Organization-wide records |
| 11 | HR filters by department | Only department employees shown |
| 12 | HR filters by user_id | Specific employee records |
| 13 | Record columns | Name, emp_code, date, check-in, check-out, worked, status, late |
| 14 | Late minutes calculation | Minutes late beyond shift grace period |
| 15 | Pagination works (20/page) | Correct page navigation |

### Phase 3: Shift Management (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Create shift with all fields | Name, start/end time, break, grace periods saved |
| 17 | Create night shift | is_night_shift flag set |
| 18 | Mark shift as default | is_default flag set, other defaults cleared |
| 19 | Edit shift times | Changes persist |
| 20 | Deactivate shift | is_active = false, shift hidden from assignment |
| 21 | List all shifts | Active shifts displayed |
| 22 | Validation: end time = start time | Error or warning |

### Phase 4: Shift Assignments

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | Assign shift to single employee | Assignment created with effective dates |
| 24 | Bulk assign shift to multiple employees | All assignments created |
| 25 | View shift assignments list | Shows employee, shift, dates |
| 26 | Team shift schedule (weekly view) | Employee rows x date columns |
| 27 | Personal shift schedule (My Schedule) | Own shifts for the week |

### Phase 5: Shift Swap Requests

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Employee requests shift swap | Swap request created (pending) |
| 29 | HR views pending swap requests | List of pending swaps |
| 30 | HR approves swap request | Status = approved, shifts exchanged |
| 31 | HR rejects swap request | Status = rejected |
| 32 | Swap request audit logged | SHIFT_SWAP_REQUESTED/APPROVED/REJECTED |

### Phase 6: Geo-Fencing (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 33 | Create geo-fence location | Name, lat, lng, radius saved |
| 34 | Edit geo-fence radius | Updated value persists |
| 35 | Deactivate geo-fence | is_active = false |
| 36 | List geo-fence locations | Active locations shown |

### Phase 7: Attendance Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Dashboard loads with 5 stat cards | Total, Present, Absent, Late, On Leave counts |
| 38 | Filter by month | Stats recalculate for selected month |
| 39 | Filter by department | Stats filtered to department |
| 40 | Filter by date range | Records within range |
| 41 | Clear filters | Reset to defaults |
| 42 | Export to CSV | CSV downloads with correct columns |
| 43 | CSV columns correct | Employee, Emp Code, Date, Check In/Out, Worked, Status, Late |

### Phase 8: Monthly Report

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 44 | Generate monthly report for org | Summary stats per user for month |
| 45 | Report for specific user | Individual monthly summary |

### Phase 9: Regularization Requests

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 46 | Employee submits regularization | Date, requested times, reason saved (pending) |
| 47 | Employee views own requests (My Requests tab) | Own regularizations listed |
| 48 | HR views pending requests | All pending regularizations |
| 49 | HR approves regularization | Status = approved, attendance record updated |
| 50 | HR rejects with reason | Status = rejected, rejection reason saved |
| 51 | HR views all requests | Complete regularization history |
| 52 | Validation: reason is mandatory | Error if empty |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/attendance/check-in` | POST | Employee check-in |
| `/api/v1/attendance/check-out` | POST | Employee check-out |
| `/api/v1/attendance/me/today` | GET | Today's record |
| `/api/v1/attendance/me/history` | GET | Personal history |
| `/api/v1/attendance/records` | GET | All records (HR) |
| `/api/v1/attendance/dashboard` | GET | Dashboard stats |
| `/api/v1/attendance/monthly-report` | GET | Monthly report |
| `/api/v1/attendance/shifts` | GET/POST | List/Create shifts |
| `/api/v1/attendance/shifts/:id` | GET/PUT/DELETE | Shift CRUD |
| `/api/v1/attendance/shifts/assign` | POST | Assign shift |
| `/api/v1/attendance/shifts/bulk-assign` | POST | Bulk assign shifts |
| `/api/v1/attendance/shifts/assignments` | GET | List assignments |
| `/api/v1/attendance/shifts/schedule` | GET | Team schedule |
| `/api/v1/attendance/shifts/my-schedule` | GET | Personal schedule |
| `/api/v1/attendance/shifts/swap-request` | POST | Request swap |
| `/api/v1/attendance/shifts/swap-requests` | GET | List swaps |
| `/api/v1/attendance/shifts/swap-requests/:id/approve` | POST | Approve swap |
| `/api/v1/attendance/shifts/swap-requests/:id/reject` | POST | Reject swap |
| `/api/v1/attendance/geo-fences` | GET/POST | Geo-fence CRUD |
| `/api/v1/attendance/geo-fences/:id` | PUT/DELETE | Update/deactivate fence |
| `/api/v1/attendance/regularizations` | GET/POST | Regularization list/create |
| `/api/v1/attendance/regularizations/me` | GET | Own regularizations |
| `/api/v1/attendance/regularizations/:id/approve` | PUT | Approve/reject |

## Shift Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| name | string | Shift name (e.g., "Morning Shift") |
| start_time | time | 24-hour format (e.g., "09:00") |
| end_time | time | 24-hour format (e.g., "18:00") |
| break_minutes | int | Break duration in minutes |
| grace_minutes_late | int | Grace period for late arrival |
| grace_minutes_early | int | Grace period for early departure |
| is_night_shift | boolean | Night shift flag |
| is_default | boolean | Default shift for new employees |
