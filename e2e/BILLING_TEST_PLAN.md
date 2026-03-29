# Billing Module — End-to-End Test Plan

## Architecture Context

- **EMP Cloud** owns subscriptions, seats, and module access
- **EMP Billing** (separate microservice at port 4001) handles invoices, payments, and gateways
- Cloud calls Billing via REST API — non-blocking, so Cloud works even if Billing is down
- All prices stored in paise (smallest currency unit): ₹500 = 50,000 paise

### Pricing Model

| Plan Tier     | Price/Seat/Month | INR   |
|---------------|------------------|-------|
| Free          | 0                | ₹0    |
| Basic         | 50,000 paise     | ₹500  |
| Professional  | 100,000 paise    | ₹1,000|
| Enterprise    | 175,000 paise    | ₹1,750|

### Billing Cycle Discounts

| Cycle     | Discount |
|-----------|----------|
| Monthly   | 0%       |
| Quarterly | 5%       |
| Annual    | 20%      |

---

## Pre-requisites

1. EMP Billing service running on server (`pm2 status`)
2. `BILLING_MODULE_URL` and `BILLING_API_KEY` configured in Cloud `.env`
3. Stripe/Razorpay/PayPal test keys configured in Billing `.env`
4. At least one active module in the `modules` table (e.g., EMP Payroll)

---

## Test Phases

### Phase 1: Organization Registration & Setup

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Register a brand new org via `/register` | Org created, admin user logged in |
| 2 | Complete onboarding wizard | Onboarding marked complete |
| 3 | Verify new org lands on dashboard | Dashboard loads with welcome content |

### Phase 2: Module Marketplace

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 4 | Navigate to `/modules` | Module list loads with cards |
| 5 | Verify module cards show name, description, status | All modules visible with correct info |
| 6 | Verify "Core — Included Free" badge on HRMS | HRMS module shows free badge |
| 7 | Verify Subscribe/Unsubscribe buttons for org admin | Buttons visible and clickable |

### Phase 3: Subscribe to a Module

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Click Subscribe on EMP Payroll | Subscription modal opens |
| 9 | Select Professional plan, 10 seats, Monthly cycle | Form fields populated correctly |
| 10 | Verify price preview | Shows ₹1,000 × 10 = ₹10,000/month |
| 11 | Confirm subscription | Success toast, modal closes |
| 12 | Verify subscription on `/billing` | Subscription card shows Active status |

### Phase 4: Billing Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 13 | `/billing` → Subscriptions tab | Subscription card with correct plan, seats, price |
| 14 | Switch to Invoices tab | Invoice generated (if Billing service running) |
| 15 | Switch to Payments tab | Empty — no payments yet |
| 16 | Switch to Overview tab | Outstanding amount shown, monthly cost correct |

### Phase 5: Seat Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 17 | Check used seats on subscription card | used_seats = 0 |
| 18 | `POST /subscriptions/assign-seat` for a user | 200 OK, seat assigned |
| 19 | Verify used_seats incremented | used_seats = 1 |
| 20 | `POST /subscriptions/revoke-seat` | 200 OK, seat revoked |
| 21 | Verify used_seats decremented | used_seats = 0 |

### Phase 6: Subscription Updates

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Edit subscription → upgrade to Enterprise | Price updates to ₹1,750/seat |
| 23 | Edit subscription → increase seats to 20 | total_seats = 20, price recalculated |
| 24 | Edit subscription → change to Annual cycle | 20% discount applied |
| 25 | Verify change summary before saving | Shows old vs new values |

### Phase 7: Payment Flow (Requires Billing Service + Stripe Test Keys)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 26 | Invoices tab → expand invoice → Pay Now → Stripe | Checkout URL returned |
| 27 | Verify Stripe test checkout page opens | Stripe checkout form visible |
| 28 | Simulate payment via webhook (`invoice.paid`) | Webhook processed, subscription stays active |
| 29 | Verify payment appears in Payments tab | Payment record with Stripe reference |

### Phase 8: Cancellation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 30 | Cancel the subscription | Status changes to "Cancelled" |
| 31 | Verify cancelled_at timestamp set | Non-null timestamp |
| 32 | Verify all seats revoked | used_seats = 0, org_module_seats empty |
| 33 | `POST /subscriptions/check-access` | `has_access: false` |

### Phase 9: Free Tier Limits

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 34 | Subscribe to a module on Free tier | Subscription created, status = active |
| 35 | Subscribe to 2nd module on Free tier | Blocked — max 1 free module per org |
| 36 | Add 6th user to free-tier org | Blocked — max 5 users on free tier |

### Phase 10: Billing Status & Dunning (API-Level)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Set `current_period_end` to past date via DB | Subscription now overdue |
| 38 | `GET /subscriptions/billing-status` | `has_overdue: true`, correct `days_overdue` |
| 39 | Verify warning levels escalate | none → info → warning → critical |
| 40 | Verify `checkModuleAccess` for suspended sub | `has_access: false` |
| 41 | Verify dunning stages progress | current → reminder → warning → suspended → deactivated |

---

## Test Approach

| Phase | Method | Target |
|-------|--------|--------|
| 1-4, 6, 8 | Playwright browser tests | `test-empcloud.empcloud.com` |
| 5, 9-10 | Playwright API tests (request context) | `test-empcloud.empcloud.com/api/v1` |
| 7 | Playwright + webhook simulation | Requires EMP Billing service |

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/subscriptions` | GET | List org subscriptions |
| `/api/v1/subscriptions` | POST | Create subscription |
| `/api/v1/subscriptions/:id` | PUT | Update subscription |
| `/api/v1/subscriptions/:id` | DELETE | Cancel subscription |
| `/api/v1/subscriptions/assign-seat` | POST | Assign module seat |
| `/api/v1/subscriptions/revoke-seat` | POST | Revoke module seat |
| `/api/v1/subscriptions/check-access` | POST | Check user module access |
| `/api/v1/subscriptions/billing-status` | GET | Get overdue warnings |
| `/api/v1/billing/invoices` | GET | List invoices |
| `/api/v1/billing/payments` | GET | List payments |
| `/api/v1/billing/summary` | GET | Billing overview |
| `/api/v1/billing/pay` | POST | Create payment checkout |
| `/api/v1/billing/gateways` | GET | List payment gateways |
| `/api/v1/billing/invoices/:id/pdf` | GET | Download invoice PDF |
| `/api/v1/webhooks/billing` | POST | Inbound billing events |

## Subscription State Machine

```
FREE:     Create → [ACTIVE] → Cancel → [CANCELLED]

TRIAL:    Create → [TRIAL] → Trial expires → [ACTIVE] → ...

PAID:     Create → [ACTIVE]
                      ↓ (payment failed)
                  [PAST_DUE]
                      ↓ (grace + 15 days)
                  [SUSPENDED] (read-only)
                      ↓ (grace + 30 days)
                  [DEACTIVATED] (no access)
                      ↓ (payment received)
                  [ACTIVE]
```

## Dunning Timeline

| Day (post-grace) | Action | Status |
|-------------------|--------|--------|
| 0 | Grace period active | active |
| 1 | Friendly reminder email | past_due |
| 7 | Warning email | past_due |
| 15 | Suspend (read-only) | suspended |
| 30 | Deactivate (no access) | deactivated |
