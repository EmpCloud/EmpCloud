# Rate Limiting — End-to-End Test Plan

## Module Overview
Express-rate-limit based throttling to protect authentication endpoints from brute force and API endpoints from abuse. Two tiers: aggressive auth limiting (20 req/15min) and standard API limiting (100 req/1min).

---

## Rate Limit Configuration

| Tier | Window | Max Requests | Target |
|------|--------|-------------|--------|
| Auth | 15 minutes | 20 | `/api/v1/auth/*` |
| API | 1 minute | 100 | All other `/api/v1/*` |

---

## Test Phases

### Phase 1: Auth Rate Limiting

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Login 20 times within 15 min (valid) | All 20 succeed |
| 2 | 21st login attempt | 429 Too Many Requests |
| 3 | Response includes Retry-After header | Seconds until reset |
| 4 | Response includes X-RateLimit-Limit | 20 |
| 5 | Response includes X-RateLimit-Remaining | Decrements per request |
| 6 | Response includes X-RateLimit-Reset | Reset timestamp |
| 7 | Wait for window reset → login again | Succeeds after 15 min |
| 8 | Failed login attempts count toward limit | 20 failures = rate limited |
| 9 | Mixed success/failure count equally | Both consume quota |

### Phase 2: Auth Endpoint Coverage

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 10 | POST /auth/login rate limited | 429 after 20 |
| 11 | POST /auth/register rate limited | 429 after 20 |
| 12 | POST /auth/forgot-password rate limited | 429 after 20 |
| 13 | POST /auth/reset-password rate limited | 429 after 20 |
| 14 | POST /auth/refresh-token rate limited | 429 after 20 |
| 15 | Auth rate limit is per-IP | Different IPs have separate limits |

### Phase 3: API Rate Limiting

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | 100 GET /employees within 1 min | All 100 succeed |
| 17 | 101st request within same minute | 429 Too Many Requests |
| 18 | Retry-After header in API 429 | Seconds until reset |
| 19 | X-RateLimit headers present | Limit, Remaining, Reset |
| 20 | Wait 1 minute → requests succeed | Quota reset |
| 21 | Different endpoints share API quota | Combined count |

### Phase 4: API Endpoint Coverage

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | GET /employees rate limited | Counts toward API quota |
| 23 | GET /attendance rate limited | Counts toward API quota |
| 24 | GET /leave rate limited | Counts toward API quota |
| 25 | POST /leave/applications rate limited | Counts toward API quota |
| 26 | GET /documents rate limited | Counts toward API quota |
| 27 | GET /announcements rate limited | Counts toward API quota |

### Phase 5: Rate Limit Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Auth and API limits are separate | Auth 429 doesn't block API calls |
| 29 | API 429 doesn't block auth | Separate quotas |
| 30 | User A rate limited, User B unaffected | Per-IP, not per-user |
| 31 | Rate limit survives across different endpoints | Shared window counter |

### Phase 6: 429 Response Format

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 32 | 429 response body format | `{ error: "Too many requests" }` |
| 33 | 429 Content-Type | application/json |
| 34 | 429 status code correct | Exactly 429 |
| 35 | Retry-After is accurate | Matches actual reset time |

### Phase 7: Edge Cases

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Rapid-fire requests (100 in 1 second) | First N succeed, rest 429 |
| 37 | Concurrent requests at limit boundary | Race condition handled |
| 38 | Request during window rollover | Clean transition |
| 39 | OPTIONS (preflight) requests | Not rate limited |
| 40 | HEAD requests | Count toward limit |

---

## Key Response Headers

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Max requests per window | 20 or 100 |
| `X-RateLimit-Remaining` | Requests left in window | 15 |
| `X-RateLimit-Reset` | Window reset timestamp | 1711756800 |
| `Retry-After` | Seconds until retry (on 429) | 300 |

## Rate Limit Implementation

```
express-rate-limit({
  windowMs: 15 * 60 * 1000,  // Auth: 15 min
  max: 20,                     // Auth: 20 requests
  standardHeaders: true,       // X-RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests" }
})
```
