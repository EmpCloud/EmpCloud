# Helpdesk Module — End-to-End Test Plan

## Module Overview
Internal IT/HR helpdesk with ticket lifecycle management, SLA tracking, internal/external comments, satisfaction ratings, and a knowledge base for self-service.

---

## Part A: Ticket Management

### Phase 1: Ticket Creation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Employee creates ticket | Category, priority, subject, description saved (status: open) |
| 2 | Select category: leave, payroll, IT, etc. | Category stored correctly |
| 3 | Select priority: low/medium/high/urgent | Priority badge shown |
| 4 | Validation: subject required | Error if empty |
| 5 | Validation: description required | Error if empty |
| 6 | Ticket ID generated | Unique ticket reference |

### Phase 2: Ticket Views

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 7 | Employee views "My Tickets" | Only own tickets shown |
| 8 | Filter by status | Correct tickets displayed |
| 9 | Search by subject/description | Matching tickets found |
| 10 | HR views all tickets | Organization-wide tickets |
| 11 | HR filters by category | Category-specific list |
| 12 | HR filters by priority | Priority-specific list |
| 13 | Pagination (20/page) | Correct page navigation |

### Phase 3: Ticket Detail & Comments

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | View ticket detail page | Subject, description, status, priority, SLA info shown |
| 15 | Add public comment (employee) | Comment visible to all parties |
| 16 | Add internal note (HR) | Only visible to HR users |
| 17 | Employee cannot see internal notes | Internal notes hidden |
| 18 | Conversation thread shows chronologically | Comments in order |

### Phase 4: Ticket Assignment & Resolution

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 19 | HR assigns ticket to agent | Assigned to field updated |
| 20 | HR resolves ticket | Status = resolved |
| 21 | HR closes ticket | Status = closed |
| 22 | Employee closes own ticket | Status = closed |
| 23 | Employee reopens resolved ticket | Status = reopened |
| 24 | Rate resolved ticket (1-5 stars) | Rating + optional comment saved |

### Phase 5: SLA Tracking

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 25 | New ticket shows response due time | SLA deadline displayed |
| 26 | Resolution due time shown | Based on priority SLA |
| 27 | SLA status: on-track | Green indicator |
| 28 | SLA status: at-risk | Yellow indicator |
| 29 | SLA status: breached | Red indicator |

### Phase 6: Helpdesk Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 30 | Dashboard loads with stat cards | Open, In Progress, Overdue, Resolved Today |
| 31 | SLA Compliance gauge | Percentage shown |
| 32 | Average Resolution Time | Hours displayed |
| 33 | Satisfaction Rating | Stars + count |
| 34 | Category breakdown chart | Bar chart with counts |
| 35 | Recent tickets list (max 8) | Latest tickets with badges |

---

## Part B: Knowledge Base

### Phase 7: Article Management (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Create KB article | Title, category, content, published flag saved |
| 37 | Mark article as featured | Featured star displayed |
| 38 | Toggle published status | Unpublished hidden from employees |
| 39 | Edit article content | Changes reflected |
| 40 | Delete/unpublish article | Hidden from employee view |

### Phase 8: Article Browsing (Employee)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 41 | Browse knowledge base | Grid of published articles |
| 42 | Search articles by keyword | Matching articles shown |
| 43 | Filter by category | Category-specific articles |
| 44 | View article detail | Full content, view count increments |
| 45 | Rate article helpful/not helpful | Helpfulness recorded |
| 46 | Thank you message after rating | Confirmation shown |
| 47 | View count increases on each visit | Counter increments |

---

## Ticket Status Flow

```
Create → [OPEN]
            ↓ HR assigns
         [IN_PROGRESS]
            ↓                ↓
         [AWAITING_RESPONSE] ↓
            ↓                ↓
         [RESOLVED] ← HR resolves
            ↓ Employee reopens     ↓ Close
         [REOPENED]              [CLOSED]
            ↓ HR resolves
         [RESOLVED]
```

## Key API Endpoints Under Test

### Tickets

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/helpdesk/tickets` | GET/POST | List/Create tickets |
| `/api/v1/helpdesk/tickets/my` | GET | My tickets |
| `/api/v1/helpdesk/tickets/:id` | GET/PUT | Detail/Update |
| `/api/v1/helpdesk/tickets/:id/assign` | POST | Assign agent |
| `/api/v1/helpdesk/tickets/:id/comment` | POST | Add comment |
| `/api/v1/helpdesk/tickets/:id/resolve` | POST | Resolve |
| `/api/v1/helpdesk/tickets/:id/close` | POST | Close |
| `/api/v1/helpdesk/tickets/:id/reopen` | POST | Reopen |
| `/api/v1/helpdesk/tickets/:id/rate` | POST | Rate service |

### Knowledge Base

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/helpdesk/kb` | GET/POST | List/Create articles |
| `/api/v1/helpdesk/kb/:idOrSlug` | GET/PUT/DELETE | Article CRUD |
| `/api/v1/helpdesk/kb/:id/helpful` | POST | Rate helpfulness |
| `/api/v1/helpdesk/kb/:id/my-rating` | GET | User's rating |

## Ticket Categories

`leave` | `payroll` | `benefits` | `it` | `facilities` | `onboarding` | `policy` | `general`

## Ticket Priorities & SLA

| Priority | Response SLA | Resolution SLA |
|----------|-------------|----------------|
| Urgent | Shortest | Shortest |
| High | Short | Short |
| Medium | Standard | Standard |
| Low | Relaxed | Relaxed |
