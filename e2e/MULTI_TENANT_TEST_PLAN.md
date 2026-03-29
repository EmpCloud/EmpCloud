# Multi-Tenant Isolation — End-to-End Test Plan

## Module Overview
Verifies that all data operations are strictly scoped by `organization_id`. No user in Org A should ever see, modify, or affect data belonging to Org B. Tests cover every major resource type across the platform.

---

## Test Phases

### Phase 1: Setup — Two Isolated Organizations

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create Org A with admin + employees | Org A fully provisioned |
| 2 | Create Org B with admin + employees | Org B fully provisioned |
| 3 | Org A and Org B have different org IDs | Confirmed different |
| 4 | Login as Org A admin → get token A | Token contains org_id = A |
| 5 | Login as Org B admin → get token B | Token contains org_id = B |

### Phase 2: Employee Data Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6 | Org A lists employees | Only Org A employees returned |
| 7 | Org B lists employees | Only Org B employees returned |
| 8 | Org A token → GET Org B employee by ID | 404 Not Found |
| 9 | Org A token → PUT Org B employee profile | 403 or 404 |
| 10 | Employee search in Org A | No Org B results |
| 11 | Org chart in Org A | Only Org A hierarchy |

### Phase 3: Attendance Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 12 | Org A attendance records | Only Org A records |
| 13 | Org A token → GET Org B attendance | Empty or 403 |
| 14 | Org A check-in | Creates record under Org A |
| 15 | Org A shifts | Only Org A shifts returned |
| 16 | Org A geo-fence locations | Only Org A locations |
| 17 | Regularization requests scoped | Only own org's requests |

### Phase 4: Leave Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 18 | Org A leave types | Only Org A types |
| 19 | Org A leave applications | Only Org A applications |
| 20 | Org A token → approve Org B leave | 403 or 404 |
| 21 | Leave balance query | Only own org's balances |
| 22 | Leave calendar | Only own org's calendar data |
| 23 | Comp-off requests scoped | Only own org |

### Phase 5: Document Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | Org A documents list | Only Org A documents |
| 25 | Org A token → GET Org B document | 404 |
| 26 | Document categories scoped | Only own org's categories |
| 27 | Org A token → delete Org B document | 403 or 404 |

### Phase 6: Announcement & Policy Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Org A announcements | Only Org A announcements |
| 29 | Org A token → GET Org B announcement | 404 |
| 30 | Org A policies | Only Org A policies |
| 31 | Org A token → acknowledge Org B policy | 403 or 404 |
| 32 | Read tracking isolated | No cross-org reads |

### Phase 7: Helpdesk Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 33 | Org A tickets | Only Org A tickets |
| 34 | Org A token → GET Org B ticket | 404 |
| 35 | Org A token → comment on Org B ticket | 403 or 404 |
| 36 | Knowledge base scoped | Only own org's articles |

### Phase 8: Survey & Feedback Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Org A surveys | Only Org A surveys |
| 38 | Org A token → submit response to Org B survey | 403 or 404 |
| 39 | Survey analytics scoped | Only own org's data |
| 40 | Feedback submissions scoped | Only own org |

### Phase 9: Forum & Events Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 41 | Org A forum posts | Only Org A posts |
| 42 | Org A token → reply to Org B post | 403 or 404 |
| 43 | Org A events | Only Org A events |
| 44 | Org A token → RSVP to Org B event | 403 or 404 |

### Phase 10: Asset & Wellness Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 45 | Org A assets | Only Org A assets |
| 46 | Org A token → GET Org B asset | 404 |
| 47 | Wellness check-ins scoped | Only own org |
| 48 | Wellness goals/programs scoped | Only own org |

### Phase 11: Subscription & Billing Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 49 | Org A subscriptions | Only Org A subscriptions |
| 50 | Org A token → GET Org B subscription | 403 or 404 |
| 51 | Org A invoices | Only Org A invoices |
| 52 | Module seats scoped by org | Correct per-org counts |

### Phase 12: Settings & Configuration Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 53 | Org A departments | Only Org A departments |
| 54 | Org A locations | Only Org A locations |
| 55 | Org A custom fields | Only Org A custom fields |
| 56 | Org A notification settings | Only own org |
| 57 | AI config scoped (if per-org) | Only own org's config |

### Phase 13: Biometrics Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 58 | Org A face enrollments | Only Org A enrollments |
| 59 | Org A QR code from Org B scan | valid=false |
| 60 | Org A devices | Only Org A devices |
| 61 | Biometric logs scoped | Only own org's logs |
| 62 | Biometric settings scoped | Only own org's settings |

### Phase 14: Audit & Notifications Isolation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 63 | Org A audit logs | Only Org A actions |
| 64 | Org A notifications | Only Org A notifications |
| 65 | Unread count scoped | Only own org's unread |

---

## Isolation Verification Pattern

For each resource type, the test follows this pattern:
1. **List** — Org A token returns only Org A data
2. **Get by ID** — Org A token + Org B resource ID = 404/403
3. **Create** — New resource always gets Org A's org_id
4. **Update** — Cannot modify Org B's resources
5. **Delete** — Cannot delete Org B's resources

## Key Principle
Every SQL query in the codebase MUST include `WHERE organization_id = ?` for tenant isolation. These tests verify that this is consistently applied across all 20+ resource types.
