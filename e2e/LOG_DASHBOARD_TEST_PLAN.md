# Log Dashboard — End-to-End Test Plan

## Module Overview
Super admin log viewer with 5 tabs: Overview, Errors, Slow Queries, Auth Events, and Module Health. Provides real-time visibility into platform operations, error rates, and performance metrics.

---

## Test Phases

### Phase 1: Dashboard Overview Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/admin/logs` as super admin | Log dashboard loads with Overview tab active |
| 2 | Total requests count displayed | Accurate count for selected period |
| 3 | Error rate percentage shown | Errors / total * 100 |
| 4 | Average response time displayed | Mean latency in ms |
| 5 | Request volume chart (24h) | Time-series graph loads |
| 6 | Top endpoints by request count | Ranked list with counts |
| 7 | Status code distribution | 2xx/3xx/4xx/5xx breakdown |
| 8 | Date range selector | Filters all metrics |
| 9 | Auto-refresh toggle (30s) | Metrics update periodically |

### Phase 2: Errors Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 10 | Switch to Errors tab | Error log table loads |
| 11 | Error entries show: timestamp, endpoint, status, message | All columns visible |
| 12 | Filter by status code (4xx vs 5xx) | Filtered results |
| 13 | Filter by endpoint path | Matching errors shown |
| 14 | Filter by date range | Date-bounded results |
| 15 | Error stack trace expandable | Click row to see full trace |
| 16 | 500 errors highlighted in red | Visual distinction |
| 17 | Pagination (20 per page) | Navigation works |
| 18 | Sort by timestamp (newest first) | Chronological DESC default |
| 19 | Sort by frequency | Most common errors first |

### Phase 3: Slow Queries Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 20 | Switch to Slow Queries tab | Slow query log loads |
| 21 | Queries > 1000ms shown | Threshold-based filtering |
| 22 | Columns: query, duration, endpoint, timestamp | All visible |
| 23 | Sort by duration (slowest first) | DESC by default |
| 24 | Filter by endpoint | Matching queries shown |
| 25 | Filter by minimum duration | Adjustable threshold |
| 26 | Query text truncated with expand | Full query on click |
| 27 | Pagination works | Page navigation |

### Phase 4: Auth Events Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Switch to Auth Events tab | Auth event log loads |
| 29 | Login success events shown | User, IP, timestamp, org |
| 30 | Login failure events shown | Reason (invalid password, locked, etc.) |
| 31 | Password reset events | Reset request + completion |
| 32 | Token refresh events | Token rotation logged |
| 33 | Filter by event type | Login/logout/reset/token filters |
| 34 | Filter by user email | User-specific events |
| 35 | Filter by organization | Org-specific events |
| 36 | Filter by IP address | IP-specific events |
| 37 | Suspicious patterns flagged | Multiple failures from same IP |
| 38 | Pagination and sorting | Standard table controls |

### Phase 5: Module Health Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | Switch to Module Health tab | Module health grid loads |
| 40 | Each module shows status badge | operational/degraded/outage |
| 41 | Response time per module | Latency in ms |
| 42 | Last check timestamp | When health was last verified |
| 43 | Error rate per module | Module-specific error % |
| 44 | Click module for detail | Expanded health metrics |
| 45 | Infrastructure status (DB, Redis) | Connection health shown |
| 46 | Force health check button | Triggers immediate re-check |

### Phase 6: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 47 | Non-super-admin accesses logs | 403 Forbidden |
| 48 | org_admin accesses log API | 403 Forbidden |
| 49 | Super admin has full access | All tabs and filters available |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/logs/overview` | GET | Dashboard metrics |
| `/api/v1/admin/logs/errors` | GET | Error log (paginated) |
| `/api/v1/admin/logs/slow-queries` | GET | Slow query log |
| `/api/v1/admin/logs/auth-events` | GET | Auth event log |
| `/api/v1/admin/service-health` | GET | Module health status |
| `/api/v1/admin/service-health/check` | POST | Force health check |
