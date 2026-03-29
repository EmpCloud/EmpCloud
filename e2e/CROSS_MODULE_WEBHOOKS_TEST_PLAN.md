# Cross-Module Webhooks — End-to-End Test Plan

## Module Overview
EMP Cloud receives inbound webhooks from connected modules (Recruit, Exit, Performance, Rewards) to maintain a unified activity feed, trigger notifications, and update audit trails. Modules POST events to `/api/v1/webhooks/inbound` with standardized payloads.

---

## Webhook Architecture

```
Module Event → Module POSTs to Cloud → Cloud processes webhook →
  → Activity feed updated
  → Notification triggered
  → Audit trail entry created
```

---

## Test Phases

### Phase 1: Webhook Endpoint

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | POST /webhooks/inbound with valid payload | 200 OK |
| 2 | POST without authorization | 401 Unauthorized |
| 3 | POST with invalid module token | 403 Forbidden |
| 4 | POST with malformed JSON | 400 Bad Request |
| 5 | POST with missing required fields | 400 Validation error |
| 6 | POST with valid module but wrong org | 403 Forbidden |

### Phase 2: Webhook Payload Validation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 7 | Payload includes `module` field | Required, validated |
| 8 | Payload includes `event` field | Required, validated |
| 9 | Payload includes `organization_id` | Required, tenant isolation |
| 10 | Payload includes `payload` object | Event-specific data |
| 11 | Payload includes `timestamp` | Event time |
| 12 | Unknown module name | 400 Bad Request |
| 13 | Unknown event type for module | 400 Bad Request |
| 14 | Extra fields ignored | No error, fields dropped |

### Phase 3: Recruit Module Webhooks

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 15 | Event: candidate_hired | Activity feed: "New hire: {name}" |
| 16 | Hired event triggers onboarding | Invitation auto-created (if configured) |
| 17 | Event: candidate_rejected | Activity feed updated |
| 18 | Event: job_posted | Activity feed: "New position: {title}" |
| 19 | Event: interview_scheduled | Activity logged |
| 20 | Hire webhook includes position, department | Correct metadata |

### Phase 4: Exit Module Webhooks

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 21 | Event: exit_initiated | Activity feed: "Exit started: {employee}" |
| 22 | Exit initiated → employee flagged | Profile shows pending exit |
| 23 | Event: exit_completed | Activity feed: "Exit completed" |
| 24 | Exit completed → user deactivated | Account disabled in Cloud |
| 25 | Event: exit_cancelled | Activity feed: "Exit cancelled" |
| 26 | Exit cancelled → flag removed | Profile restored |
| 27 | Exit webhook includes last_working_day | Date captured |

### Phase 5: Performance Module Webhooks

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Event: review_completed | Activity feed: "Review completed for {employee}" |
| 29 | Event: goal_achieved | Activity logged |
| 30 | Event: pip_initiated | Activity feed: "PIP started for {employee}" |
| 31 | Review data includes rating, reviewer | Metadata captured |
| 32 | Notification sent to employee | "Your review is complete" |

### Phase 6: Rewards Module Webhooks

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 33 | Event: recognition_given | Activity feed: "Recognition: {from} → {to}" |
| 34 | Event: reward_redeemed | Activity logged |
| 35 | Event: milestone_achieved | Activity: "Milestone: {employee} - {years}" |
| 36 | Recognition triggers notification | Recipient notified |

### Phase 7: Activity Feed Integration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Webhook events appear in unified feed | Cross-module timeline |
| 38 | Activity feed sorted by timestamp | Newest first |
| 39 | Activity feed scoped by org | Tenant isolation |
| 40 | Activity shows source module badge | Module name/icon |
| 41 | Admin dashboard shows all activity | Platform-wide view |
| 42 | Activity feed paginated | Page navigation works |

### Phase 8: Notification Integration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 43 | Webhook triggers in-app notification | Bell icon updated |
| 44 | Notification references source module | reference_type = module event |
| 45 | Only relevant users notified | Target scoping correct |
| 46 | Manager notified of team events | Reporting hierarchy respected |

### Phase 9: Audit Trail Integration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 47 | Webhook creates audit entry | Action type logged |
| 48 | Audit includes source module | Module field populated |
| 49 | Audit includes event payload | Details JSON saved |
| 50 | Audit scoped by organization | Tenant isolation |

### Phase 10: Error Handling & Retry

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 51 | Cloud returns 500 → module retries | Retry after delay |
| 52 | Idempotent processing | Duplicate webhook = no double-action |
| 53 | Webhook processing failure logged | Error in logs |
| 54 | Partial failure (notification fails, audit succeeds) | Graceful degradation |
| 55 | Webhook processing timeout | Reasonable timeout (30s) |

---

## Webhook Payload Format

```json
{
  "module": "recruit",
  "event": "candidate_hired",
  "organization_id": "uuid",
  "timestamp": "2026-03-30T10:00:00Z",
  "payload": {
    "employee_name": "John Doe",
    "position": "Software Engineer",
    "department": "Engineering",
    "start_date": "2026-04-01"
  }
}
```

## Module Event Types

| Module | Events |
|--------|--------|
| Recruit | candidate_hired, candidate_rejected, job_posted, interview_scheduled |
| Exit | exit_initiated, exit_completed, exit_cancelled |
| Performance | review_completed, goal_achieved, pip_initiated |
| Rewards | recognition_given, reward_redeemed, milestone_achieved |

## Key API Endpoint

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/webhooks/inbound` | POST | Receive module webhooks |
