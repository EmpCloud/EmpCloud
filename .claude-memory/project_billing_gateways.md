---
name: Payment Gateway Keys & Configuration
description: Stripe, Razorpay, PayPal test keys from Suresh, configured in emp-billing, gateway architecture details
type: project
---

## Payment Gateway Test Keys (from Suresh Babu G, Technical Architect, 2026-03-23)

### Stripe (Test Mode)
- **Secret Key**: sk_test_51TE8gCENLkTi95UjlsZQVUFDx8NdEciDxZgZohIYKAcSfe41oDt5dDaWS39IycN5GRtx4nvPiqOl86MrburzS77E00HndPEH6P
- **Publishable Key**: pk_test_51TE8gCENLkTi95Uj3ZUMYitY4n6S9gNVFwz92AOP8jwxInjLSYBibvAtC90yZTWtHJhhXuzwdHKdDcjT3Q8ZmeRS00DKVSwjeZ
- **Webhook Secret**: not set yet

### Razorpay (Test Mode)
- **Key ID**: <REDACTED>
- **Key Secret**: fYY7RBRu0dBddcOKD9HoitK4
- **Webhook Secret**: not set yet

### PayPal (Sandbox)
- **Client ID**: AQGbnb7FD4KV23zTs9B2J_th3RY-IrAhQCx62v8J7BRvbl4GaWobbs-rqAettTp8FP76Co3bo2L5lSBt
- **Client Secret**: EHpbAsjs916KoR8a8mVcuesmVqWEM2v9k9_L92LyhUlwoUe0czamUxLcr5b_M_nLvbOOyvIMZva3Iz62
- **Webhook ID**: not set yet
- **Sandbox**: true

## Architecture
- Plugin-based: `IPaymentGateway` interface in `emp-billing/packages/server/src/services/payment/gateways/`
- Registry: `initializeGateways()` reads env vars at startup
- Gateway files: `stripe.gateway.ts`, `razorpay.gateway.ts`, `paypal.gateway.ts`
- Orchestrator: `online-payment.service.ts`
- Portal routes: `/api/v1/portal/pay`, `/api/v1/portal/payment-gateways`
- API key routes: `/api/v1/payments/online/create-order`, `/api/v1/payments/online/gateways`, `/api/v1/payments/online/verify`
- Webhook routes: `/webhooks/gateway/stripe`, `/webhooks/gateway/razorpay`, `/webhooks/gateway/paypal`
- EMP Cloud calls billing via: `POST /api/v1/billing/pay` → proxies to billing's `/api/v1/payments/online/create-order`

## Status
- Keys configured in both local .env and server .env (emp-billing)
- All 3 gateways initialize on startup (confirmed in PM2 logs)
- Gateway list endpoint returns empty [] — needs debugging (likely portalAuth vs apiKeyAuth issue in controller)

**How to apply:** These keys are test/sandbox only. For production, get live keys from Stripe/Razorpay/PayPal dashboards.
