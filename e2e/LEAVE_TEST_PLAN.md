# Leave Module — End-to-End Test Plan

## Module Overview
Manages leave types, policies, balances, leave applications (apply/approve/reject/cancel), leave calendar, and compensatory off (comp-off) requests.

---

## Test Phases

### Phase 1: Leave Types (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create leave type (e.g., Casual Leave) | Name, code, paid, carry-forward, color saved |
| 2 | Create unpaid leave type | is_paid = false |
| 3 | Create leave type with carry-forward enabled | is_carry_forward = true, max days set |
| 4 | Create encashable leave type | is_encashable = true |
| 5 | Edit leave type name/properties | Changes persist |
| 6 | Deactivate leave type | is_active = false, hidden from dropdowns |
| 7 | List all leave types | Active types displayed with color codes |
| 8 | Validation: duplicate code in same org | Error: code must be unique |

### Phase 2: Leave Policies (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 9 | Create policy for leave type | Annual quota, accrual type, constraints saved |
| 10 | Set accrual type = monthly | Policy accrues monthly |
| 11 | Set applicable gender = female | Only female employees eligible |
| 12 | Set min notice days = 2 | Applications < 2 days out blocked |
| 13 | Set max consecutive days = 5 | Applications > 5 days blocked |
| 14 | Edit policy quota | New quota applied |
| 15 | Deactivate policy | Policy no longer enforced |

### Phase 3: Leave Balances

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Initialize balances for year | Balances created per leave type per employee |
| 17 | Employee views own balances | Cards show balance, allocated, used, carry-forward |
| 18 | HR views employee balances | Can query any user's balances |
| 19 | Balance = allocated - used + carry-forward | Math checks out |
| 20 | Balance decreases after approved leave | Used incremented, balance decremented |

### Phase 4: Leave Applications

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 21 | Employee applies for leave | Type, dates, days, reason submitted (pending) |
| 22 | Auto-calculate days count | Correct working days between start-end |
| 23 | Apply half-day leave (first half) | is_half_day = true, half_day_type = "first_half" |
| 24 | Apply half-day leave (second half) | half_day_type = "second_half" |
| 25 | Apply leave exceeding balance | Blocked with error |
| 26 | Apply leave violating min notice days | Blocked per policy constraint |
| 27 | Apply leave exceeding max consecutive | Blocked per policy constraint |
| 28 | HR approves leave with remarks | Status = approved, balance updated |
| 29 | HR rejects leave with reason | Status = rejected, balance unchanged |
| 30 | Employee cancels own pending leave | Status = cancelled |
| 31 | Employee cancels approved leave | Status = cancelled, balance restored |
| 32 | View all leave applications (HR) | Org-wide applications with filters |
| 33 | View my applications (Employee) | Own applications only |
| 34 | Filter by status (pending/approved/rejected) | Correct filtering |
| 35 | Self-approval blocked | Employee cannot approve own leave |

### Phase 5: Leave Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Dashboard shows balance cards | One card per active leave type |
| 37 | Apply leave button opens form | Form with type, dates, reason |
| 38 | Leave type dropdown shows active types | Only active types listed |
| 39 | Date pickers work correctly | Start/end dates selectable |
| 40 | Submit form creates application | Success toast, application appears |

### Phase 6: Leave Calendar

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 41 | Calendar renders current month | 7-column grid with dates |
| 42 | Navigate to next/previous month | Calendar updates |
| 43 | Approved leaves shown on calendar | Employee name + leave type on dates |
| 44 | Color-coded by leave type | Colors match leave type configuration |
| 45 | HR sees org-wide leaves | All employees' approved leaves |
| 46 | Multi-day leave spans cells | Leave shown across date range |

### Phase 7: Compensatory Off (Comp-Off)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 47 | Employee requests comp-off | Worked date, reason, days submitted (pending) |
| 48 | Expiry auto-set to 30 days | expires_on = worked_date + 30 |
| 49 | View comp-off balance | Current balance, allocated, used shown |
| 50 | HR views pending comp-off approvals | Pending requests listed |
| 51 | HR approves comp-off | Status = approved, balance credited |
| 52 | HR rejects comp-off with reason | Status = rejected, rejection reason saved |
| 53 | Employee views own comp-off requests | My Comp-Off tab shows history |
| 54 | Use comp-off as leave type | Can apply leave using comp-off balance |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/leave/types` | GET/POST | List/Create leave types |
| `/api/v1/leave/types/:id` | GET/PUT/DELETE | Leave type CRUD |
| `/api/v1/leave/policies` | GET/POST | List/Create policies |
| `/api/v1/leave/policies/:id` | GET/PUT/DELETE | Policy CRUD |
| `/api/v1/leave/balances` | GET | Employee balances |
| `/api/v1/leave/balances/me` | GET | Own balances |
| `/api/v1/leave/balances/initialize` | POST | Initialize for year |
| `/api/v1/leave/applications` | GET/POST | List/Apply leave |
| `/api/v1/leave/applications/me` | GET | Own applications |
| `/api/v1/leave/applications/:id` | GET/PUT | View/Cancel |
| `/api/v1/leave/applications/:id/approve` | PUT | Approve leave |
| `/api/v1/leave/applications/:id/reject` | PUT | Reject leave |
| `/api/v1/leave/calendar` | GET | Calendar view |
| `/api/v1/leave/comp-off` | GET/POST | Comp-off list/request |
| `/api/v1/leave/comp-off/my` | GET | Own comp-off requests |
| `/api/v1/leave/comp-off/pending` | GET | Pending approvals |
| `/api/v1/leave/comp-off/balance` | GET | Comp-off balance |
| `/api/v1/leave/comp-off/:id/approve` | PUT | Approve comp-off |
| `/api/v1/leave/comp-off/:id/reject` | PUT | Reject comp-off |

## Leave Application State Machine

```
Apply → [PENDING]
           ↓ HR Approve       ↓ HR Reject        ↓ Employee Cancel
        [APPROVED]          [REJECTED]           [CANCELLED]
           ↓ Employee Cancel
        [CANCELLED] (balance restored)
```

## Leave Policy Constraints

| Constraint | Effect |
|------------|--------|
| annual_quota | Max days per year |
| min_days_before_application | Minimum advance notice |
| max_consecutive_days | Max days in one application |
| applicable_gender | Restricts to male/female/both |
| applicable_employment_types | Restricts by employment type |
| is_carry_forward + max_carry_forward_days | Year-end carry-forward limit |
