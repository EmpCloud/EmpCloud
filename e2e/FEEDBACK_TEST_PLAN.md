# Anonymous Feedback Module — End-to-End Test Plan

## Module Overview
Fully anonymous feedback system where employees submit feedback that cannot be traced to their identity (hashed). HR can view, respond to, and manage feedback with category-based filtering and sentiment analysis.

---

## Test Phases

### Phase 1: Feedback Submission (Employee)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to feedback submission page | Anonymity disclaimer shown (amber box) |
| 2 | Select category (workplace, management, etc.) | Category saved |
| 3 | Enter subject (required) | Subject validated |
| 4 | Enter message (required) | Message validated |
| 5 | Mark as urgent | Urgent flag set |
| 6 | Submit feedback | Success screen with "Feedback Submitted" |
| 7 | Click "Submit Another" | Form resets |
| 8 | Submit without subject | Validation error |
| 9 | Submit without message | Validation error |
| 10 | Verify anonymity: no user ID stored | Only hashed identity |

### Phase 2: My Feedback (Employee View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 11 | View own feedback history | Submitted feedback listed (matched by hash) |
| 12 | See status badges | New, Acknowledged, Under Review, Resolved, Archived |
| 13 | See category badge | Color-coded by category |
| 14 | See HR response | Response text + date shown |
| 15 | See urgent indicator | Alert icon on urgent items |
| 16 | Pagination works | Navigate through pages |

### Phase 3: Feedback List (HR View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 17 | HR views all feedback (no user identity visible) | Anonymous feedback listed |
| 18 | Filter by category | Category-specific list |
| 19 | Filter by status | Status-specific list |
| 20 | Filter urgent only | Only urgent items shown |
| 21 | Search feedback | Text search works |
| 22 | Combine filters | Multiple filters work together |
| 23 | Feedback cards show sentiment tag | Positive (green), Neutral (gray), Negative (red) |
| 24 | Pagination (20/page) | Correct navigation |

### Phase 4: HR Response & Status Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 25 | HR responds to feedback | Response text saved, visible to employee |
| 26 | HR edits response | Updated response saved |
| 27 | Update status to "Acknowledged" | Status badge updates |
| 28 | Update status to "Under Review" | Status badge updates |
| 29 | Update status to "Resolved" | Status badge updates |
| 30 | Update status to "Archived" | Feedback archived |

### Phase 5: Feedback Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Dashboard stat cards | Total, Urgent, Response Rate %, New count |
| 32 | Category breakdown | Bar chart with counts per category |
| 33 | Sentiment distribution | Bar chart: positive/neutral/negative |
| 34 | Status breakdown chips | Count per status |
| 35 | Recent feedback list | Latest items with category + status |

### Phase 6: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Employee cannot view all feedback | Only own history |
| 37 | Employee cannot respond to feedback | Respond button hidden |
| 38 | Employee cannot change status | Status controls hidden |
| 39 | HR cannot see submitter identity | No user info exposed |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/feedback` | POST | Submit anonymous feedback |
| `/api/v1/feedback` | GET | All feedback (HR only) |
| `/api/v1/feedback/my` | GET | Own feedback (hash-matched) |
| `/api/v1/feedback/dashboard` | GET | Stats dashboard (HR) |
| `/api/v1/feedback/:id` | GET | Single feedback (HR) |
| `/api/v1/feedback/:id/respond` | POST | HR response |
| `/api/v1/feedback/:id/status` | PUT | Update status (HR) |

## Feedback Categories

| Category | Badge Color |
|----------|-------------|
| workplace | Blue |
| management | Indigo |
| process | Cyan |
| culture | Pink |
| harassment | Red |
| safety | Orange |
| suggestion | Green |
| other | Gray |

## Feedback Status Flow

```
Submit → [NEW]
           ↓ HR acknowledges
        [ACKNOWLEDGED]
           ↓ HR reviews
        [UNDER_REVIEW]
           ↓ HR resolves
        [RESOLVED]
           ↓ HR archives
        [ARCHIVED]
```

## Anonymity Design

- User identity is hashed, not stored in plain text
- HR can NEVER see who submitted feedback
- Employee can see their own feedback via hash matching
- Anonymity disclaimer is prominently displayed before submission
