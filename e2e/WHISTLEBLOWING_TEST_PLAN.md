# Whistleblowing Module — End-to-End Test Plan

## Module Overview
Anonymous and identified reporting system for workplace misconduct, fraud, harassment, and safety violations. Features case number tracking, investigator assignment, status management, escalation to external bodies, and compliance dashboard.

---

## Test Phases

### Phase 1: Report Submission

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Submit anonymous report | Report created, case number generated |
| 2 | Submit identified (non-anonymous) report | Reporter name visible to HR |
| 3 | Select category: fraud | Category saved |
| 4 | Select category: harassment | Category saved |
| 5 | Select severity: low | Blue severity badge |
| 6 | Select severity: medium | Yellow badge |
| 7 | Select severity: high | Orange badge |
| 8 | Select severity: critical | Red badge |
| 9 | Enter subject (255 char max) | Subject saved |
| 10 | Enter detailed description | Description saved |
| 11 | Success screen shows case number | Monospace case number displayed |
| 12 | Case number save instructions shown | User prompted to save |
| 13 | Submit another report option | Form resets |
| 14 | Validation: subject required | Error if empty |
| 15 | Validation: description required | Error if empty |

### Phase 2: Report Tracking (Any User)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Enter case number to track | Report details displayed |
| 17 | See category, severity, subject | Correct info shown |
| 18 | See status badge | Current status visible |
| 19 | See updates timeline | Notes/responses chronologically |
| 20 | See resolution (if resolved) | Resolution text shown |
| 21 | Invalid case number | Error message |
| 22 | Only reporter-visible updates shown | Internal notes hidden |

### Phase 3: Report List (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | View all reports | Paginated table with all reports |
| 24 | Filter by status | Status-specific list |
| 25 | Filter by category | Category-specific list |
| 26 | Filter by severity | Severity-specific list |
| 27 | Search reports | Text search works |
| 28 | Table shows: Case#, Category, Severity, Subject, Anonymous, Investigator, Status | Correct columns |
| 29 | Click case number → detail page | Navigation works |
| 30 | Anonymous reports show "Yes" | No identity exposed |

### Phase 4: Investigation Management (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Assign investigator to report | Investigator name shown |
| 32 | Change status to "Under Investigation" | Status badge updates |
| 33 | Add internal note | Note saved, NOT visible to reporter |
| 34 | Add response visible to reporter | Note saved, visible in tracking |
| 35 | Change status to "Resolved" with resolution | Resolution text saved |
| 36 | Change status to "Dismissed" with reason | Reason saved |
| 37 | Change status to "Closed" | Report closed |
| 38 | Escalate to external body | External body name recorded |

### Phase 5: Report Detail (HR View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | Full report info card | Subject, category, anonymous status, description |
| 40 | Investigation timeline | All updates with type, visibility, content |
| 41 | Add update form | Type dropdown, visibility checkbox, content textarea |
| 42 | Sidebar: submitted date, investigator, escalated to | Info card |
| 43 | Sidebar: assign investigator dropdown | User list from org |
| 44 | Sidebar: change status dropdown | Valid status transitions |
| 45 | Sidebar: resolution textarea | Appears for resolved/dismissed/closed |
| 46 | Sidebar: escalate externally | External body name input |

### Phase 6: Compliance Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 47 | Stat cards: Total, Open, Resolved, Avg Resolution Days | Correct values |
| 48 | By severity chart | Low/medium/high/critical with counts |
| 49 | By category chart | Category distribution |
| 50 | Recent reports table | Case#, category, severity, subject, status, date |
| 51 | "View All Reports" button | Navigates to report list |

### Phase 7: Audit & Compliance

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 52 | All status changes audit logged | Audit trail complete |
| 53 | Investigator assignment logged | Audit entry created |
| 54 | Escalation logged | Audit entry created |
| 55 | Anonymous identity never exposed | No user ID in any response |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/whistleblowing/reports` | GET/POST | List/Submit reports |
| `/api/v1/whistleblowing/reports/my` | GET | Own reports |
| `/api/v1/whistleblowing/reports/lookup/:case` | GET | Track by case number |
| `/api/v1/whistleblowing/reports/:id` | GET | Report detail (HR) |
| `/api/v1/whistleblowing/reports/:id/assign` | POST | Assign investigator |
| `/api/v1/whistleblowing/reports/:id/status` | PUT | Change status |
| `/api/v1/whistleblowing/reports/:id/update` | POST | Add note/response |
| `/api/v1/whistleblowing/reports/:id/escalate` | POST | Escalate externally |
| `/api/v1/whistleblowing/dashboard` | GET | Compliance dashboard |

## Report Categories

`fraud` | `corruption` | `harassment` | `discrimination` | `safety_violation` | `data_breach` | `financial_misconduct` | `environmental` | `retaliation` | `other`

## Report Status Flow

```
Submit → [SUBMITTED]
            ↓ Assign investigator
         [UNDER_INVESTIGATION]
            ↓                    ↓ Escalate
         [RESOLVED]           [ESCALATED]
            ↓                    ↓
         [CLOSED]             [RESOLVED] → [CLOSED]

         At any point → [DISMISSED] → [CLOSED]
```

## Update Visibility

| Type | Visible To |
|------|-----------|
| Internal Note | HR/Investigator only |
| Response to Reporter | Reporter + HR |
| Status Change Note | Depends on visibility flag |
