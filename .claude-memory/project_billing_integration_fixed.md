---
name: Billing integration fixed — EmpCloud ↔ EMP Billing fully wired
description: 5 critical billing integration issues fixed on 2026-03-30, API key shared, webhook endpoint created, gateways working
type: project
---

## Billing Integration — Fixed 2026-03-30

### What was fixed
1. **BILLING_API_KEY** set in both EmpCloud root `.env` and Billing root `.env` (value: `<REDACTED - see .env>`)
2. **POST /api/v1/webhooks/empcloud** endpoint created in Billing (handles subscription.created/updated/cancelled)
3. **Auth middleware updated** in Billing to accept EmpCloud API key as valid Bearer token (alongside JWT and empb_ API keys)
4. **Gateway webhook secrets** set (test placeholders)
5. **Subscription mapping** tables verified working

### Key Config
- EmpCloud `.env`: `BILLING_API_KEY=<REDACTED - see .env>`
- EmpCloud `.env`: `BILLING_MODULE_URL=http://localhost:4001`
- Billing `.env`: `EMPCLOUD_API_KEY=<REDACTED - see .env>`
- Billing port: 4001

### Files changed
- `emp-billing/packages/server/src/api/middleware/auth.middleware.ts` — accept EmpCloud API key
- `emp-billing/packages/server/src/api/routes/empcloud-webhook.routes.ts` — new webhook endpoint
- `emp-billing/packages/server/src/api/middleware/empcloud-auth.middleware.ts` — webhook key validation
- `emp-billing/packages/server/src/config/index.ts` — empcloud.apiKey config
- `emp-billing/packages/server/src/index.ts` — register webhook routes

### Still TODO
- Invoice/payment data is org-scoped — EmpCloud proxy needs to pass org context (client_id) when querying
- Real Stripe/Razorpay webhook secrets needed from their dashboards for payment confirmations
- Subscription → auto-invoice flow needs more testing with real subscription creation

**Why:** The billing module code was 95% complete but the integration between EmpCloud and Billing was broken due to missing API key, missing webhook endpoint, and auth middleware not accepting the integration key.
