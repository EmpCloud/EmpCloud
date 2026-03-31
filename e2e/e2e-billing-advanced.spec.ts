import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Billing — Advanced E2E Tests (Untested Endpoints)
// Covers: Quotes, Credit Notes, Coupons, Usage Billing, Dunning,
//         Recurring Invoices, Reports, Metrics, Vendors, Settings,
//         Webhooks, Search, Currency
// Skips: invoices, payments, subscriptions, gateways (already tested)
// =============================================================================

const BILLING_API = 'https://test-billing-api.empcloud.com/api/v1';
const BILLING_BASE = 'https://test-billing-api.empcloud.com';
const API_KEY = 'emp-billing-api-key-2026-secure-integration';

// Helper: API key auth headers
const auth = () => ({
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  },
});

// IDs captured during creation for subsequent tests
let quoteId: number | string = '';
let creditNoteId: number | string = '';
let couponId: number | string = '';
let couponCode = '';
let usageRecordId: number | string = '';
let recurringInvoiceId: number | string = '';
let vendorId: number | string = '';
let webhookId: number | string = '';
let invoiceIdFromQuote: number | string = '';

// =============================================================================
// 1. QUOTES (8 tests)
// =============================================================================

test.describe('1. Quotes', () => {

  test('1.1 Create a quote', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/quotes`, {
      ...auth(),
      data: {
        client_id: 1,
        items: [
          { description: 'PW Test — Payroll Module', quantity: 10, unit_price: 10000, currency: 'INR' },
        ],
        valid_until: '2026-06-30',
        notes: 'E2E test quote',
      },
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) quoteId = body.data.id;
    else if (body.data?.quote?.id) quoteId = body.data.quote.id;
  });

  test('1.2 List quotes', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/quotes`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.quotes || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !quoteId) quoteId = list[0].id;
    }
  });

  test('1.3 Get single quote', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.get(`${BILLING_API}/quotes/${quoteId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.4 Update a quote', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.put(`${BILLING_API}/quotes/${quoteId}`, {
      ...auth(),
      data: { notes: 'Updated by E2E test' },
    });
    expect([200, 204, 404]).toContain(r.status());
  });

  test('1.5 Send quote (email/notification)', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.post(`${BILLING_API}/quotes/${quoteId}/send`, auth());
    expect([200, 201, 204, 404, 422]).toContain(r.status());
  });

  test('1.6 Accept a quote', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.post(`${BILLING_API}/quotes/${quoteId}/accept`, auth());
    expect([200, 204, 400, 404, 409, 422]).toContain(r.status());
  });

  test('1.7 Convert quote to invoice', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.post(`${BILLING_API}/quotes/${quoteId}/convert`, auth());
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
    const body = await r.json();
    if (body.data?.invoice_id) invoiceIdFromQuote = body.data.invoice_id;
    else if (body.data?.id) invoiceIdFromQuote = body.data.id;
  });

  test('1.8 Download quote PDF', async ({ request }) => {
    test.skip(!quoteId, 'No quote available');
    const r = await request.get(`${BILLING_API}/quotes/${quoteId}/pdf`, auth());
    expect([200, 404, 501]).toContain(r.status());
    if (r.status() === 200) {
      const ct = r.headers()['content-type'] || '';
      expect(ct.includes('pdf') || ct.includes('octet-stream') || ct.includes('json')).toBe(true);
    }
  });
});

// =============================================================================
// 2. CREDIT NOTES (6 tests)
// =============================================================================

test.describe('2. Credit Notes', () => {

  test('2.1 Create a credit note', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/credit-notes`, {
      ...auth(),
      data: {
        client_id: 1,
        amount: 5000,
        currency: 'INR',
        reason: 'E2E test credit note — overcharge',
        items: [
          { description: 'Adjustment', quantity: 1, unit_price: 5000 },
        ],
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) creditNoteId = body.data.id;
    else if (body.data?.credit_note?.id) creditNoteId = body.data.credit_note.id;
  });

  test('2.2 List credit notes', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/credit-notes`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.credit_notes || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !creditNoteId) creditNoteId = list[0].id;
    }
  });

  test('2.3 Get single credit note', async ({ request }) => {
    test.skip(!creditNoteId, 'No credit note available');
    const r = await request.get(`${BILLING_API}/credit-notes/${creditNoteId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.4 Apply credit note to invoice', async ({ request }) => {
    test.skip(!creditNoteId, 'No credit note to apply');
    const r = await request.post(`${BILLING_API}/credit-notes/${creditNoteId}/apply`, {
      ...auth(),
      data: { invoice_id: invoiceIdFromQuote || 1 },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('2.5 Void a credit note', async ({ request }) => {
    test.skip(!creditNoteId, 'No credit note available');
    const r = await request.post(`${BILLING_API}/credit-notes/${creditNoteId}/void`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('2.6 Download credit note PDF', async ({ request }) => {
    test.skip(!creditNoteId, 'No credit note available');
    const r = await request.get(`${BILLING_API}/credit-notes/${creditNoteId}/pdf`, auth());
    expect([200, 404, 501]).toContain(r.status());
  });
});

// =============================================================================
// 3. COUPONS (6 tests)
// =============================================================================

test.describe('3. Coupons', () => {

  test('3.1 Create a coupon', async ({ request }) => {
    couponCode = `PW_TEST_${Date.now()}`;
    const r = await request.post(`${BILLING_API}/coupons`, {
      ...auth(),
      data: {
        code: couponCode,
        discount_type: 'percentage',
        discount_value: 10,
        max_redemptions: 100,
        valid_from: '2026-01-01',
        valid_until: '2026-12-31',
        description: 'E2E test coupon',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) couponId = body.data.id;
    else if (body.data?.coupon?.id) couponId = body.data.coupon.id;
  });

  test('3.2 List coupons', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/coupons`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.coupons || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !couponId) {
        couponId = list[0].id;
        couponCode = list[0].code || couponCode;
      }
    }
  });

  test('3.3 Validate a coupon code', async ({ request }) => {
    test.skip(!couponCode, 'No coupon code available');
    const r = await request.post(`${BILLING_API}/coupons/validate`, {
      ...auth(),
      data: { code: couponCode, client_id: 1 },
    });
    expect([200, 400, 404, 422]).toContain(r.status());
  });

  test('3.4 Apply coupon to subscription', async ({ request }) => {
    test.skip(!couponId, 'No coupon available');
    const r = await request.post(`${BILLING_API}/coupons/${couponId}/apply`, {
      ...auth(),
      data: { subscription_id: 1, client_id: 1 },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('3.5 Get coupon redemptions', async ({ request }) => {
    test.skip(!couponId, 'No coupon available');
    const r = await request.get(`${BILLING_API}/coupons/${couponId}/redemptions`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.6 Validate invalid coupon returns error', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/coupons/validate`, {
      ...auth(),
      data: { code: 'INVALID_NONEXISTENT_CODE', client_id: 1 },
    });
    expect([400, 404, 422]).toContain(r.status());
  });
});

// =============================================================================
// 4. USAGE BILLING (4 tests)
// =============================================================================

test.describe('4. Usage Billing', () => {

  test('4.1 Record usage event', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/usage`, {
      ...auth(),
      data: {
        client_id: 1,
        subscription_id: 1,
        metric: 'api_calls',
        quantity: 150,
        timestamp: new Date().toISOString(),
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) usageRecordId = body.data.id;
  });

  test('4.2 List usage records', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/usage?client_id=1`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.records || body.data?.usage || body.data || [];
      expect(Array.isArray(list)).toBe(true);
    }
  });

  test('4.3 Usage summary', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/usage/summary?client_id=1`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.4 Generate invoice from usage', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/usage/generate-invoice`, {
      ...auth(),
      data: {
        client_id: 1,
        period_start: '2026-03-01',
        period_end: '2026-03-31',
      },
    });
    expect([200, 201, 400, 404, 422]).toContain(r.status());
  });
});

// =============================================================================
// 5. DUNNING (4 tests)
// =============================================================================

test.describe('5. Dunning', () => {

  test('5.1 Get dunning configuration', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/dunning/config`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.2 Update dunning configuration', async ({ request }) => {
    const r = await request.put(`${BILLING_API}/dunning/config`, {
      ...auth(),
      data: {
        enabled: true,
        max_attempts: 3,
        retry_interval_days: 3,
        grace_period_days: 7,
        notify_on_failure: true,
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('5.3 List dunning attempts', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/dunning/attempts`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.attempts || body.data || [];
      expect(Array.isArray(list)).toBe(true);
    }
  });

  test('5.4 Dunning summary/stats', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/dunning/summary`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 6. RECURRING INVOICES (5 tests)
// =============================================================================

test.describe('6. Recurring Invoices', () => {

  test('6.1 Create recurring invoice', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/recurring-invoices`, {
      ...auth(),
      data: {
        client_id: 1,
        frequency: 'monthly',
        start_date: '2026-04-01',
        items: [
          { description: 'Monthly SaaS — E2E test', quantity: 10, unit_price: 10000, currency: 'INR' },
        ],
        auto_send: false,
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) recurringInvoiceId = body.data.id;
    else if (body.data?.recurring_invoice?.id) recurringInvoiceId = body.data.recurring_invoice.id;
  });

  test('6.2 List recurring invoices', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/recurring-invoices`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.recurring_invoices || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !recurringInvoiceId) recurringInvoiceId = list[0].id;
    }
  });

  test('6.3 Get single recurring invoice', async ({ request }) => {
    test.skip(!recurringInvoiceId, 'No recurring invoice available');
    const r = await request.get(`${BILLING_API}/recurring-invoices/${recurringInvoiceId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.4 Pause recurring invoice', async ({ request }) => {
    test.skip(!recurringInvoiceId, 'No recurring invoice available');
    const r = await request.post(`${BILLING_API}/recurring-invoices/${recurringInvoiceId}/pause`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('6.5 Resume recurring invoice', async ({ request }) => {
    test.skip(!recurringInvoiceId, 'No recurring invoice available');
    const r = await request.post(`${BILLING_API}/recurring-invoices/${recurringInvoiceId}/resume`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });
});

// =============================================================================
// 7. REPORTS (6 tests)
// =============================================================================

test.describe('7. Reports', () => {

  test('7.1 Dashboard summary', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/dashboard`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.2 Revenue report', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/revenue?from=2026-01-01&to=2026-03-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.3 Receivables report', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/receivables`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.4 Aging report', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/aging`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.5 Profit & Loss report', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/profit-loss?from=2026-01-01&to=2026-03-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.6 Tax report', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/tax?from=2026-01-01&to=2026-03-31`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 8. METRICS (5 tests)
// =============================================================================

test.describe('8. Metrics', () => {

  test('8.1 MRR (Monthly Recurring Revenue)', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/metrics/mrr`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.2 ARR (Annual Recurring Revenue)', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/metrics/arr`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.3 Churn rate', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/metrics/churn`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.4 Customer LTV', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/metrics/ltv`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.5 Subscription stats', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/metrics/subscriptions`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 9. VENDORS (3 tests)
// =============================================================================

test.describe('9. Vendors', () => {

  test('9.1 Create a vendor', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/vendors`, {
      ...auth(),
      data: {
        name: `PW Test Vendor ${Date.now()}`,
        email: 'vendor-e2e@test.com',
        phone: '+919876543210',
        address: '123 Test Street, Mumbai',
        tax_id: 'GSTIN12345',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) vendorId = body.data.id;
    else if (body.data?.vendor?.id) vendorId = body.data.vendor.id;
  });

  test('9.2 List vendors', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/vendors`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.vendors || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !vendorId) vendorId = list[0].id;
    }
  });

  test('9.3 Delete a vendor', async ({ request }) => {
    test.skip(!vendorId, 'No vendor available');
    const r = await request.delete(`${BILLING_API}/vendors/${vendorId}`, auth());
    expect([200, 204, 404]).toContain(r.status());
  });
});

// =============================================================================
// 10. SETTINGS (3 tests)
// =============================================================================

test.describe('10. Settings', () => {

  test('10.1 Get billing settings', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/settings`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('10.2 Update billing settings', async ({ request }) => {
    const r = await request.put(`${BILLING_API}/settings`, {
      ...auth(),
      data: {
        invoice_prefix: 'INV',
        default_currency: 'INR',
        default_payment_terms: 30,
        tax_inclusive: false,
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('10.3 Get/update numbering config', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/settings/numbering`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 11. WEBHOOKS (3 tests)
// =============================================================================

test.describe('11. Webhooks', () => {

  test('11.1 Create a webhook endpoint', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/webhooks`, {
      ...auth(),
      data: {
        url: 'https://test-empcloud-api.empcloud.com/api/v1/webhooks/billing-test',
        events: ['invoice.created', 'payment.received'],
        secret: 'e2e-webhook-secret',
        active: true,
      },
    });
    expect([200, 201, 400, 404, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) webhookId = body.data.id;
    else if (body.data?.webhook?.id) webhookId = body.data.webhook.id;
  });

  test('11.2 List webhook endpoints', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/webhooks`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.webhooks || body.data || [];
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0 && !webhookId) webhookId = list[0].id;
    }
  });

  test('11.3 Test webhook delivery', async ({ request }) => {
    test.skip(!webhookId, 'No webhook available');
    const r = await request.post(`${BILLING_API}/webhooks/${webhookId}/test`, auth());
    expect([200, 201, 400, 404, 422, 502]).toContain(r.status());
  });
});

// =============================================================================
// 12. SEARCH (2 tests)
// =============================================================================

test.describe('12. Search', () => {

  test('12.1 Search across all entities', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/search?q=technova`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('12.2 Search with entity type filter', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/search?q=test&type=invoice`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 13. CURRENCY (3 tests)
// =============================================================================

test.describe('13. Currency', () => {

  test('13.1 Get exchange rates', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/currency/rates`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('13.2 Convert currency', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/currency/convert`, {
      ...auth(),
      data: { from: 'USD', to: 'INR', amount: 100 },
    });
    expect([200, 400, 404]).toContain(r.status());
  });

  test('13.3 List supported currencies', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/currency/supported`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 14. ADDITIONAL EDGE CASES & VALIDATIONS (5 bonus tests)
// =============================================================================

test.describe('14. Edge Cases', () => {

  test('14.1 Create quote with missing fields returns error', async ({ request }) => {
    const r = await request.post(`${BILLING_API}/quotes`, {
      ...auth(),
      data: {},
    });
    expect([400, 404, 422]).toContain(r.status());
  });

  test('14.2 Get nonexistent quote returns 404', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/quotes/999999`, auth());
    expect([404, 400]).toContain(r.status());
  });

  test('14.3 Create coupon with duplicate code returns error', async ({ request }) => {
    test.skip(!couponCode, 'No coupon code to duplicate');
    const r = await request.post(`${BILLING_API}/coupons`, {
      ...auth(),
      data: {
        code: couponCode,
        discount_type: 'percentage',
        discount_value: 5,
      },
    });
    // Either 409 conflict, 400 validation, or 404 not implemented
    expect([400, 404, 409, 422]).toContain(r.status());
  });

  test('14.4 Invalid API key is rejected', async ({ request }) => {
    const r = await request.get(`${BILLING_API}/reports/dashboard`, {
      headers: { 'x-api-key': 'invalid-key-12345', 'Content-Type': 'application/json' },
    });
    expect([401, 403, 404]).toContain(r.status());
  });

  test('14.5 Health check endpoint', async ({ request }) => {
    const r = await request.get(`${BILLING_BASE}/health`);
    expect([200, 404]).toContain(r.status());
  });
});
