# In-App Notifications — End-to-End Test Plan

## Module Overview
Real-time in-app notification system with bell icon dropdown, unread count badge, mark-as-read, and auto-refresh. Notifications are triggered by system events (leave approvals, document uploads, etc.).

---

## Test Phases

### Phase 1: Notification Display

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Bell icon visible in header | Notification bell present |
| 2 | Unread count badge shows number | Red badge with count |
| 3 | Count capped at 99+ | Shows "99+" for > 99 unread |
| 4 | Zero unread = no badge | Badge hidden |
| 5 | Click bell opens dropdown | 396px wide notification panel |
| 6 | Click outside closes dropdown | Panel dismisses |

### Phase 2: Notification List

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 7 | Notifications listed (10 per page) | Scrollable list loads |
| 8 | Unread notifications highlighted | brand-50 background + blue dot |
| 9 | Read notifications normal style | No highlight |
| 10 | Each shows: title (bold), body (2-line clamp), timestamp | Correct layout |
| 11 | Notifications sorted newest first | Chronological DESC |

### Phase 3: Read/Unread Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 12 | Click notification marks as read | is_read=true, read_at set |
| 13 | Blue dot disappears after read | Visual indicator removed |
| 14 | Unread count decrements | Badge updates |
| 15 | "Mark all as read" button | All notifications marked read |
| 16 | Badge disappears after mark all | Count = 0, badge hidden |
| 17 | Mark all only shows if unread exist | Button hidden when all read |

### Phase 4: Auto-Refresh

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 18 | Unread count refreshes every 30s | Poll interval active |
| 19 | New notification appears | Count increments without page refresh |
| 20 | Dropdown refreshes on open | Latest notifications fetched |

### Phase 5: Notification Types

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 21 | Leave approval triggers notification | Employee notified |
| 22 | Document verification triggers notification | Employee notified |
| 23 | Announcement creates notification | Target users notified |
| 24 | System notification (admin-created) | All/org users notified |
| 25 | Notification references source (type + ID) | reference_type + reference_id set |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/notifications` | GET | List notifications (paginated, unread_only filter) |
| `/api/v1/notifications/unread-count` | GET | Unread count |
| `/api/v1/notifications/:id/read` | PUT | Mark single as read |
| `/api/v1/notifications/read-all` | PUT | Mark all as read |
