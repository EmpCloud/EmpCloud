# Announcements & Policies — End-to-End Test Plan

## Module Overview
**Announcements**: Company-wide or targeted communications with priority levels, read tracking, and expiry. **Policies**: Versioned company policies with employee acknowledgment tracking.

---

## Part A: Announcements

### Phase 1: Create & Publish (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create announcement for all employees | Title, content, priority saved, visible to all |
| 2 | Create announcement targeting department | Only department employees see it |
| 3 | Create announcement targeting role | Only users with that role see it |
| 4 | Create with priority = Urgent | Red urgent badge displayed |
| 5 | Create with priority = Normal | Blue badge |
| 6 | Set expiry date | Announcement hidden after expiry |
| 7 | Set future published_at | Not visible until scheduled time |
| 8 | Multi-department targeting | Select multiple departments |

### Phase 2: Read Tracking

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 9 | Employee views announcement feed | Cards with title, priority, content preview |
| 10 | Unread count badge shows | Correct count of unread announcements |
| 11 | Click "Mark as Read" | Read status persists, unread count decreases |
| 12 | Already-read announcements show checkmark | Read indicator visible |
| 13 | Read tracking persists across sessions | Status saved in DB |

### Phase 3: Priority & Sorting

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | Urgent announcements appear first | Sorted: urgent > high > normal > low |
| 15 | Within same priority, newest first | Sorted by published_at DESC |
| 16 | Priority badges display correctly | Red, orange, blue, gray for U/H/N/L |

### Phase 4: Edit & Delete (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 17 | Edit announcement content | Changes reflected |
| 18 | Edit announcement priority | Badge updates |
| 19 | Edit expiry date | New expiry applied |
| 20 | Soft-delete announcement | is_active = false, hidden from feed |
| 21 | Deleted announcement not in unread count | Count updates |

### Phase 5: Content Display

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Long content truncated to 2 lines | Expand/collapse chevron shown |
| 23 | Expand content | Full text visible |
| 24 | Collapse content | Back to 2-line preview |
| 25 | Pagination works | Previous/Next buttons functional |

---

## Part B: Company Policies

### Phase 6: Create & Update (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 26 | Create policy with title, content, category | Version = 1, policy active |
| 27 | Set effective date | Date stored and displayed |
| 28 | Update policy content | Version increments to 2 |
| 29 | Update again | Version increments to 3 |
| 30 | Category is optional | Shows dash when empty |

### Phase 7: Acknowledgment Flow

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Employee sees pending policies alert | "You have X policies pending" |
| 32 | Employee acknowledges policy | Status = acknowledged, timestamp saved |
| 33 | Acknowledged policy shows green badge | Visual confirmation |
| 34 | Pending count decreases | Alert updates |
| 35 | Re-acknowledge is idempotent | No error, no duplicate |

### Phase 8: HR Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | HR creates policy with form | Title, category, effective date, content saved |
| 37 | Policy table shows version | Correct version number |
| 38 | View acknowledgment list for policy | Users who acknowledged + dates |
| 39 | Acknowledgment count clickable | Expands to show acknowledgers |
| 40 | View full policy content | Content panel expands |

### Phase 9: Soft Delete

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 41 | HR deletes policy | is_active = false |
| 42 | Deleted policy not in employee list | Hidden from view |
| 43 | Deleted policy not in pending alerts | Not counted |
| 44 | Existing acknowledgments preserved | DB records remain |

### Phase 10: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 45 | Employee cannot create policies | Create form hidden |
| 46 | Employee cannot edit/delete policies | Buttons hidden |
| 47 | Employee can only acknowledge | Acknowledge button visible |
| 48 | HR sees full management controls | CRUD + acknowledgment views |

---

## Key API Endpoints Under Test

### Announcements

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/announcements` | GET/POST | List/Create announcements |
| `/api/v1/announcements/unread-count` | GET | Unread count |
| `/api/v1/announcements/:id` | GET/PUT/DELETE | CRUD |
| `/api/v1/announcements/:id/read` | POST | Mark as read |

### Policies

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/policies` | GET/POST | List/Create policies |
| `/api/v1/policies/pending` | GET | Policies needing acknowledgment |
| `/api/v1/policies/:id` | GET/PUT/DELETE | CRUD |
| `/api/v1/policies/:id/acknowledge` | POST | Acknowledge policy |
| `/api/v1/policies/:id/acknowledgments` | GET | List acknowledgers |

## Announcement Targeting

| Target Type | Behavior |
|-------------|----------|
| `all` | Visible to all org employees |
| `department` | Only employees in specified department IDs (JSON array) |
| `role` | Only users with specified roles (JSON array) |

## Policy Versioning

```
Create → v1
Update → v2 (auto-increment)
Update → v3 (auto-increment)
Delete → is_active = false (version preserved)
```
