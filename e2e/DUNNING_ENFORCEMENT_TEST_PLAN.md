# Dunning & Enforcement — End-to-End Test Plan

## Module Overview
Automated subscription lifecycle enforcement: when payments fail or subscriptions become overdue, the system progresses through grace → past_due → suspended → deactivated states with automated notifications at each stage. Covers reactivation after late payment.

---

## Subscription State Machine

```
active → past_due (payment failed) → suspended (15 days) → deactivated (30 days)
  ↑                                       ↑                      ↑
  └──── pay ────────────────────────── pay ─────────────────── pay ──→ reactivated
```

## Timeline

| Day | State | Action |
|-----|-------|--------|
| 0 | active | Subscription renews, payment attempted |
| 0 | past_due | Payment fails → grace period starts |
| 1 | past_due | Reminder email #1 |
| 7 | past_due | Reminder email #2 |
| 15 | suspended | Module access restricted |
| 15 | suspended | Suspension notification |
| 30 | deactivated | Module fully disabled |
| 30 | deactivated | Final notification + data retention warning |

---

## Test Phases

### Phase 1: Payment Failure → Past Due

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Subscription renewal payment fails | Status → past_due |
| 2 | past_due_since timestamp set | Current date |
| 3 | Grace period starts (15 days) | Countdown begins |
| 4 | Module access still works during grace | No restriction |
| 5 | Admin notified of payment failure | Email + in-app notification |
| 6 | Dashboard shows "Payment Overdue" banner | Warning visible |
| 7 | Billing page shows overdue status | Red indicator |

### Phase 2: Dunning Notifications

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Day 1: First reminder email sent | "Payment failed" email |
| 9 | Day 7: Second reminder email sent | "Action required" email |
| 10 | Day 14: Final warning email | "Suspension imminent" email |
| 11 | In-app notifications at each stage | Bell icon alerts |
| 12 | Super admin sees overdue org | In overdue organizations list |
| 13 | Dunning emails include payment link | Direct payment URL |

### Phase 3: Suspension (Day 15)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | After 15 days past_due → suspended | Status → suspended |
| 15 | Suspended module access restricted | 403 on module API calls |
| 16 | Core features still work (login, profile) | Basic access maintained |
| 17 | Admin can still access billing page | To make payment |
| 18 | Suspension notification sent | Email + in-app |
| 19 | Dashboard shows "Suspended" banner | Red warning |
| 20 | Module data still exists | Not deleted |
| 21 | Seat assignments preserved | Can reactivate |

### Phase 4: Deactivation (Day 30)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | After 30 days → deactivated | Status → deactivated |
| 23 | Module fully disabled | All module access blocked |
| 24 | Deactivation email sent | Final notification |
| 25 | Data retention policy applies | Data preserved for N days |
| 26 | Super admin can still see org | Admin visibility maintained |
| 27 | Seats released from count | Module seats freed |
| 28 | Module removed from org's active list | Not shown in navigation |

### Phase 5: Reactivation — Pay During Grace

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Pay while past_due (within 15 days) | Status → active immediately |
| 30 | Invoice marked as paid | Payment recorded |
| 31 | "Overdue" banner removed | UI normalized |
| 32 | Full module access restored | No disruption |
| 33 | Next billing cycle scheduled | Renewal date set |

### Phase 6: Reactivation — Pay During Suspension

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 34 | Pay while suspended | Status → active |
| 35 | Module access immediately restored | 403s removed |
| 36 | Seat assignments preserved | Users regain access |
| 37 | Reactivation notification sent | "Access restored" email |
| 38 | Billing page shows active status | Green indicator |

### Phase 7: Reactivation — Pay After Deactivation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | Pay after deactivation | Status → active |
| 40 | Previous data still accessible | Data preserved |
| 41 | Seats need reassignment | Admin must reassign users |
| 42 | Module reappears in navigation | UI restored |
| 43 | Full reactivation email | Confirmation sent |

### Phase 8: Multiple Subscriptions

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 44 | Org has 3 modules, 1 fails payment | Only failing module → past_due |
| 45 | Other 2 modules unaffected | Still active |
| 46 | Suspension affects only overdue module | Granular enforcement |
| 47 | Pay overdue module → restored | Only that module reactivated |
| 48 | All 3 modules fail | Each follows own timeline |

### Phase 9: Super Admin Oversight

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 49 | Overdue organizations list | Shows all past_due/suspended/deactivated |
| 50 | Sort by days overdue | Most overdue first |
| 51 | Filter by status (past_due/suspended/deactivated) | Filtered results |
| 52 | Org detail shows dunning timeline | State transitions logged |
| 53 | Super admin can manually override | Force activate/deactivate |
| 54 | Revenue impact shown | Lost MRR from overdue orgs |

### Phase 10: Edge Cases

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 55 | Payment retry succeeds on auto-retry | Status → active automatically |
| 56 | Partial payment | Handled per gateway rules |
| 57 | Org cancels subscription while past_due | Cancellation processed |
| 58 | Free plan (₹0) never enters dunning | No payment = no failure |
| 59 | Trial subscription expires | Trial → expired, not dunning |
| 60 | Downgrade while past_due | Allowed, may resolve balance |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/subscriptions/:id` | GET | Subscription status + dunning info |
| `/api/v1/billing/invoices` | GET | Invoice list with overdue status |
| `/api/v1/billing/pay` | POST | Process payment |
| `/api/v1/admin/overdue-organizations` | GET | Super admin overdue list |
| `/api/v1/admin/subscriptions` | GET | Platform subscription metrics |

## Pricing Tiers

| Plan | Price/Seat/Month | In Paise |
|------|-----------------|----------|
| Free | ₹0 | 0 |
| Basic | ₹500 | 50000 |
| Professional | ₹1,000 | 100000 |
| Enterprise | ₹1,750 | 175000 |

## Subscription Statuses

`active` | `past_due` | `suspended` | `deactivated` | `cancelled` | `trial` | `expired`
