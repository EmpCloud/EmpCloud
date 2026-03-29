# Positions & Org Chart — End-to-End Test Plan

## Module Overview
Position management with hierarchical reporting structure, position assignments, vacancy tracking, and headcount planning with approval workflows.

---

## Test Phases

### Phase 1: Position CRUD (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create position with title + department | Position created |
| 2 | Set employment type (full_time/part_time/contract/intern) | Type saved |
| 3 | Set headcount budget | Budget number saved |
| 4 | Add job description | Description persists |
| 5 | Set salary range (min/max) with currency | Range saved |
| 6 | Mark as critical position | Critical flag set |
| 7 | Set "reports to" position | Hierarchy link created |
| 8 | Edit position details | Changes persist |
| 9 | Close position (soft delete) | Status = closed |
| 10 | List positions with pagination | Paginated table |
| 11 | Filter by department | Department-specific positions |
| 12 | Filter by status | Open/filled/closed |
| 13 | Filter by employment type | Type-specific list |
| 14 | Search positions | Text search works |

### Phase 2: Position Assignment

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 15 | Assign user to position | User linked with start date |
| 16 | Set assignment end date | End date saved |
| 17 | View position with current assignee | Assignment visible |
| 18 | Remove user from position | Assignment ended |
| 19 | Re-assign position to different user | New assignment created |

### Phase 3: Position Hierarchy

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 20 | View position hierarchy tree | Tree structure renders |
| 21 | Positions show reporting relationships | Parent-child links correct |
| 22 | Department grouping in hierarchy | Organized by department |
| 23 | Navigate hierarchy levels | Expandable tree nodes |

### Phase 4: Vacancies

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | View open vacancies | Unfilled positions listed |
| 25 | Vacancy count by department | Grouped counts |
| 26 | Position filled → removed from vacancies | Auto-updated |

### Phase 5: Position Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 27 | Total positions count | Correct number |
| 28 | Filled vs open positions | Accurate split |
| 29 | Critical positions count | Flagged positions counted |
| 30 | Budget utilization | Budget metrics |

### Phase 6: Headcount Planning

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Create headcount plan | Title, fiscal year, quarter, department saved |
| 32 | Set planned vs current headcount | Numbers saved |
| 33 | Set budget amount + currency | Budget recorded |
| 34 | Add notes/remarks | Text saved |
| 35 | Save as draft | Status = draft |
| 36 | Submit plan | Status = submitted |
| 37 | Approve plan (HR) | Status = approved, audit logged |
| 38 | Reject plan | Status = rejected |
| 39 | List plans with filters | Fiscal year, status, department filters |
| 40 | Edit plan details | Changes persist |
| 41 | Pagination on plans list | Page navigation |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/positions` | GET/POST | List/Create positions |
| `/api/v1/positions/:id` | GET/PUT/DELETE | Position CRUD |
| `/api/v1/positions/:id/assign` | POST | Assign user |
| `/api/v1/positions/assignments/:id` | DELETE | Remove assignment |
| `/api/v1/positions/hierarchy` | GET | Position tree |
| `/api/v1/positions/vacancies` | GET | Open vacancies |
| `/api/v1/positions/dashboard` | GET | Position stats |
| `/api/v1/positions/headcount-plans` | GET/POST | List/Create plans |
| `/api/v1/positions/headcount-plans/:id` | PUT | Update plan |
| `/api/v1/positions/headcount-plans/:id/approve` | POST | Approve plan |

## Position Status Values

`open` | `filled` | `closed`

## Headcount Plan State Machine

```
Create → [DRAFT]
            ↓ Submit
         [SUBMITTED]
            ↓ Approve        ↓ Reject
         [APPROVED]        [REJECTED]
```

## Headcount Plan Quarters

`Q1` | `Q2` | `Q3` | `Q4` | `annual`
