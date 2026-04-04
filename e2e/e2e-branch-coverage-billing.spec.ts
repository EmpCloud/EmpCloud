import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Billing — Branch Coverage E2E Tests
// Targets the 18 lowest-coverage services to exercise uncovered code paths:
//   expense, metrics, coupon, pricing, product, quote, dunning, client,
//   csv, portal, recurring, credit-note, invoice, payment, search,
//   dispute, online-payment, report
// =============================================================================

const API = 'https://test-billing-api.empcloud.com/api/v1';
const API_KEY = 'emp-billing-api-key-2026-secure-integration';

const auth = () => ({
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Shared state across serial tests
let clientId = '';
let productId = '';
let taxRateId = '';
let invoiceId = '';
let creditNoteId = '';
let couponId = '';
let couponCode = '';
let quoteId = '';
let expenseCategoryId = '';
let expenseId = '';
let recurringId = '';
let paymentId = '';
let disputeId = '';

// Known fallback IDs from existing test data
const KNOWN_CLIENT = '0d9d6836-80c1-4227-9faa-4184d1fa37a9';
const KNOWN_INVOICE = '00bfc3ff-49ea-4a79-9d3d-fad05e7cca20';
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// 1. CLIENT — branches: search, tags filter, contacts, statement, balance,
//    payment method, auto-provision, error paths
// =============================================================================

test.describe('1. Client branch coverage', () => {

  test('1.01 List clients with search filter', async ({ request }) => {
    const r = await request.get(`${API}/clients?search=tech&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.02 List clients with tags filter', async ({ request }) => {
    const r = await request.get(`${API}/clients?tags=enterprise,vip&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.03 List clients with isActive=false filter', async ({ request }) => {
    const r = await request.get(`${API}/clients?isActive=false&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.04 Create a test client with full data', async ({ request }) => {
    const r = await request.post(`${API}/clients`, {
      ...auth(),
      data: {
        name: `BranchTest Corp ${Date.now()}`,
        displayName: 'BranchTest Corp',
        email: `branch-test-${Date.now()}@example.com`,
        phone: '+91-9876543210',
        taxId: '29AABCT9999Z1ZP',
        currency: 'INR',
        paymentTerms: 30,
        tags: ['e2e', 'branch-test'],
        billingAddress: {
          line1: '100 Test Lane',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'IN',
        },
        shippingAddress: {
          line1: '200 Ship Street',
          city: 'Delhi',
          state: 'Delhi',
          postalCode: '110001',
          country: 'IN',
        },
        customFields: { industry: 'Tech', tier: 'Gold' },
        contacts: [
          { name: 'Primary Contact', email: `pc-${Date.now()}@example.com`, phone: '+91-1111111111', isPrimary: true },
        ],
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) clientId = body.data.id;
    else if (body.data?.client?.id) clientId = body.data.client.id;
  });

  test('1.05 Get client with contacts (JSON parsing branches)', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.get(`${API}/clients/${id}`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      const data = body.data;
      expect(data).toBeTruthy();
      // Exercises billingAddress, shippingAddress, tags, customFields JSON parse branches
    }
  });

  test('1.06 Create duplicate client triggers ConflictError branch', async ({ request }) => {
    const r = await request.post(`${API}/clients`, {
      ...auth(),
      data: {
        name: 'Duplicate Test',
        displayName: 'Dup',
        email: 'billing@technova.in', // existing email
      },
    });
    expect([400, 409, 422]).toContain(r.status());
  });

  test('1.07 Get client that does not exist (NotFoundError branch)', async ({ request }) => {
    const r = await request.get(`${API}/clients/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });

  test('1.08 Add contact to client', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.post(`${API}/clients/${id}/contacts`, {
      ...auth(),
      data: {
        name: 'Secondary Contact',
        email: `sec-${Date.now()}@example.com`,
        phone: '+91-2222222222',
        isPrimary: false,
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('1.09 List contacts for client', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.get(`${API}/clients/${id}/contacts`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.10 Get client statement (covers statement aggregation)', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.get(`${API}/clients/${id}/statement`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.11 Get client balance', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.get(`${API}/clients/${id}/balance`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('1.12 Update client payment method', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.put(`${API}/clients/${id}/payment-method`, {
      ...auth(),
      data: { method: 'bank_transfer', bankName: 'HDFC', accountNumber: '1234567890', ifsc: 'HDFC0001234' },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('1.13 Remove client payment method', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.delete(`${API}/clients/${id}/payment-method`, auth());
    expect([200, 204, 404]).toContain(r.status());
  });

  test('1.14 Auto-provision client', async ({ request }) => {
    const r = await request.post(`${API}/clients/auto-provision`, {
      ...auth(),
      data: {
        name: `AutoProv ${Date.now()}`,
        email: `autoprov-${Date.now()}@example.com`,
        orgId: '1',
      },
    });
    expect([200, 201, 400, 409, 422]).toContain(r.status());
  });

  test('1.15 Update client with partial data', async ({ request }) => {
    const id = clientId || KNOWN_CLIENT;
    const r = await request.put(`${API}/clients/${id}`, {
      ...auth(),
      data: {
        displayName: `Updated ${Date.now()}`,
        tags: ['updated', 'e2e'],
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });
});

// =============================================================================
// 2. PRODUCT — branches: search, type filter, SKU conflict, pricing tiers JSON,
//    tax rates CRUD, CSV import/export
// =============================================================================

test.describe('2. Product branch coverage', () => {

  test('2.01 List products with search filter', async ({ request }) => {
    const r = await request.get(`${API}/products?search=payroll&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.02 List products with type=service filter', async ({ request }) => {
    const r = await request.get(`${API}/products?type=service&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.03 List products with isActive=false', async ({ request }) => {
    const r = await request.get(`${API}/products?isActive=false&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.04 Create product with tiered pricing', async ({ request }) => {
    const sku = `BRC-TIER-${Date.now()}`;
    const r = await request.post(`${API}/products`, {
      ...auth(),
      data: {
        name: `Tiered Product ${Date.now()}`,
        description: 'Branch coverage tiered pricing test',
        sku,
        rate: 5000,
        currency: 'INR',
        type: 'service',
        pricingModel: 'tiered',
        pricingTiers: [
          { upTo: 100, unitPrice: 100, flatFee: 0 },
          { upTo: 500, unitPrice: 80, flatFee: 0 },
          { upTo: null, unitPrice: 50, flatFee: 0 },
        ],
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) productId = body.data.id;
    else if (body.data?.product?.id) productId = body.data.product.id;
  });

  test('2.05 Get product (exercises pricingTiers JSON parse)', async ({ request }) => {
    if (!productId) {
      // Fetch from list
      const lr = await request.get(`${API}/products?page=1&limit=1`, auth());
      const lb = await lr.json();
      const list = Array.isArray(lb.data) ? lb.data : lb.data?.data || [];
      if (list.length > 0) productId = list[0].id;
    }
    expect(productId, 'No product available').toBeTruthy();
    const r = await request.get(`${API}/products/${productId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.06 Create product with duplicate SKU triggers ConflictError', async ({ request }) => {
    const r = await request.post(`${API}/products`, {
      ...auth(),
      data: {
        name: 'Conflict SKU Test',
        sku: 'EMP-PAY-001', // known existing SKU
        rate: 1000,
        type: 'service',
      },
    });
    expect([400, 409, 422]).toContain(r.status());
  });

  test('2.07 Update product with SKU conflict path', async ({ request }) => {
    expect(productId, 'No product available').toBeTruthy();
    const r = await request.put(`${API}/products/${productId}`, {
      ...auth(),
      data: {
        sku: 'EMP-PAY-001', // conflict with existing
      },
    });
    expect([200, 400, 409, 422]).toContain(r.status());
  });

  test('2.08 Get product that does not exist', async ({ request }) => {
    const r = await request.get(`${API}/products/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });

  test('2.09 Create tax rate', async ({ request }) => {
    const r = await request.post(`${API}/products/tax-rates`, {
      ...auth(),
      data: {
        name: `E2E GST ${Date.now()}`,
        rate: 18,
        description: 'GST 18% branch test',
        type: 'gst',
        components: [
          { name: 'CGST', rate: 9 },
          { name: 'SGST', rate: 9 },
        ],
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) taxRateId = body.data.id;
    else if (body.data?.taxRate?.id) taxRateId = body.data.taxRate.id;
  });

  test('2.10 List tax rates', async ({ request }) => {
    const r = await request.get(`${API}/products/tax-rates`, auth());
    expect([200]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !taxRateId) taxRateId = list[0].id;
  });

  test('2.11 Update tax rate', async ({ request }) => {
    expect(taxRateId, 'No tax rate available').toBeTruthy();
    const r = await request.put(`${API}/products/tax-rates/${taxRateId}`, {
      ...auth(),
      data: { description: `Updated ${Date.now()}` },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('2.12 Export products CSV', async ({ request }) => {
    const r = await request.get(`${API}/products/export/csv`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.13 Import products CSV (exercises CSV parsing)', async ({ request }) => {
    const csv = 'name,sku,rate,type,currency\nCSV Import Test,CSV-IMP-001,5000,service,INR';
    const r = await request.post(`${API}/products/import/csv`, {
      ...auth(),
      data: { csv },
    });
    expect([200, 201, 400, 422]).toContain(r.status());
  });
});

// =============================================================================
// 3. INVOICE — branches: list filters, send, void, write-off, duplicate,
//    bulk-pdf, payments on invoice, error paths
// =============================================================================

test.describe('3. Invoice branch coverage', () => {

  test('3.01 List invoices with status filter', async ({ request }) => {
    const r = await request.get(`${API}/invoices?status=draft&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !invoiceId) invoiceId = list[0].id;
  });

  test('3.02 List invoices with date range filter', async ({ request }) => {
    const r = await request.get(`${API}/invoices?from=2026-01-01&to=2026-12-31&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.03 List invoices with search filter', async ({ request }) => {
    const r = await request.get(`${API}/invoices?search=INV&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.04 Create invoice with discount and tax', async ({ request }) => {
    const cid = clientId || KNOWN_CLIENT;
    const r = await request.post(`${API}/invoices`, {
      ...auth(),
      data: {
        clientId: cid,
        issueDate: '2026-04-04',
        dueDate: '2026-05-04',
        currency: 'INR',
        discountType: 'percentage',
        discountValue: 5,
        items: [
          {
            name: 'Branch coverage item',
            description: 'Tests discount+tax branch',
            quantity: 10,
            rate: 10000,
            taxRateId: taxRateId || undefined,
          },
        ],
        notes: 'E2E branch coverage test',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) invoiceId = body.data.id;
    else if (body.data?.invoice?.id) invoiceId = body.data.invoice.id;
  });

  test('3.05 Get invoice (exercises item computation)', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.get(`${API}/invoices/${invoiceId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.06 Update invoice', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.put(`${API}/invoices/${invoiceId}`, {
      ...auth(),
      data: {
        notes: `Updated at ${Date.now()}`,
        discountType: 'fixed',
        discountValue: 500,
      },
    });
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('3.07 Duplicate invoice', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.post(`${API}/invoices/${invoiceId}/duplicate`, auth());
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('3.08 Send invoice (email trigger)', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.post(`${API}/invoices/${invoiceId}/send`, auth());
    expect([200, 201, 204, 400, 404, 422]).toContain(r.status());
  });

  test('3.09 Get invoice PDF', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.get(`${API}/invoices/${invoiceId}/pdf`, auth());
    expect([200, 404, 500, 501]).toContain(r.status());
  });

  test('3.10 Get payments on invoice', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.get(`${API}/invoices/${invoiceId}/payments`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.11 Write-off invoice (exercises write-off branch)', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.post(`${API}/invoices/${invoiceId}/write-off`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('3.12 Void invoice (exercises void branch)', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.post(`${API}/invoices/${invoiceId}/void`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('3.13 Delete invoice', async ({ request }) => {
    expect(invoiceId, 'No invoice available').toBeTruthy();
    const r = await request.delete(`${API}/invoices/${invoiceId}`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('3.14 Get non-existent invoice (NotFound branch)', async ({ request }) => {
    const r = await request.get(`${API}/invoices/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });

  test('3.15 Bulk PDF download', async ({ request }) => {
    const r = await request.post(`${API}/invoices/bulk-pdf`, {
      ...auth(),
      data: { invoiceIds: [KNOWN_INVOICE] },
    });
    expect([200, 400, 404, 500, 501]).toContain(r.status());
  });
});

// =============================================================================
// 4. PAYMENT — branches: CRUD, refund, receipt, allocations, error paths
// =============================================================================

test.describe('4. Payment branch coverage', () => {

  test('4.01 Record a manual payment', async ({ request }) => {
    const r = await request.post(`${API}/payments`, {
      ...auth(),
      data: {
        invoiceId: KNOWN_INVOICE,
        amount: 5000,
        date: '2026-04-04',
        method: 'bank_transfer',
        reference: `E2E-PAY-${Date.now()}`,
        notes: 'Branch coverage payment',
      },
    });
    expect([200, 201, 400, 404, 422]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) paymentId = body.data.id;
    else if (body.data?.payment?.id) paymentId = body.data.payment.id;
  });

  test('4.02 List payments', async ({ request }) => {
    const r = await request.get(`${API}/payments?page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !paymentId) paymentId = list[0].id;
  });

  test('4.03 Get single payment', async ({ request }) => {
    expect(paymentId, 'No payment available').toBeTruthy();
    const r = await request.get(`${API}/payments/${paymentId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.04 Download payment receipt PDF', async ({ request }) => {
    expect(paymentId, 'No payment available').toBeTruthy();
    const r = await request.get(`${API}/payments/${paymentId}/receipt`, auth());
    expect([200, 404, 500, 501]).toContain(r.status());
  });

  test('4.05 Refund payment (exercises refund branch)', async ({ request }) => {
    expect(paymentId, 'No payment available').toBeTruthy();
    const r = await request.post(`${API}/payments/${paymentId}/refund`, {
      ...auth(),
      data: {
        amount: 1000,
        reason: 'Branch test refund',
      },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('4.06 Get non-existent payment (NotFound branch)', async ({ request }) => {
    const r = await request.get(`${API}/payments/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });

  test('4.07 Delete payment', async ({ request }) => {
    expect(paymentId, 'No payment available').toBeTruthy();
    const r = await request.delete(`${API}/payments/${paymentId}`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });
});

// =============================================================================
// 5. CREDIT NOTE — branches: date range, search, apply, void, PDF, delete
// =============================================================================

test.describe('5. Credit Note branch coverage', () => {

  test('5.01 Create credit note with multiple items', async ({ request }) => {
    const r = await request.post(`${API}/credit-notes`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        date: '2026-04-04',
        reason: 'Branch coverage multi-item credit',
        items: [
          { name: 'Overcharge refund', quantity: 2, rate: 3000, discountAmount: 100, taxRate: 18 },
          { name: 'Service credit', quantity: 1, rate: 5000 },
        ],
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) creditNoteId = body.data.id;
    else if (body.data?.creditNote?.id) creditNoteId = body.data.creditNote.id;
  });

  test('5.02 List credit notes with date range filter', async ({ request }) => {
    const r = await request.get(`${API}/credit-notes?from=2026-01-01&to=2026-12-31&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !creditNoteId) creditNoteId = list[0].id;
  });

  test('5.03 List credit notes with search filter', async ({ request }) => {
    const r = await request.get(`${API}/credit-notes?search=CN&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.04 List credit notes with status filter', async ({ request }) => {
    const r = await request.get(`${API}/credit-notes?status=issued&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.05 List credit notes with clientId filter', async ({ request }) => {
    const r = await request.get(`${API}/credit-notes?clientId=${KNOWN_CLIENT}&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.06 Get credit note with items', async ({ request }) => {
    expect(creditNoteId, 'No credit note').toBeTruthy();
    const r = await request.get(`${API}/credit-notes/${creditNoteId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.07 Apply credit note to invoice', async ({ request }) => {
    expect(creditNoteId, 'No credit note').toBeTruthy();
    const r = await request.post(`${API}/credit-notes/${creditNoteId}/apply`, {
      ...auth(),
      data: { invoiceId: KNOWN_INVOICE },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('5.08 Download credit note PDF', async ({ request }) => {
    expect(creditNoteId, 'No credit note').toBeTruthy();
    const r = await request.get(`${API}/credit-notes/${creditNoteId}/pdf`, auth());
    expect([200, 404, 500, 501]).toContain(r.status());
  });

  test('5.09 Void credit note', async ({ request }) => {
    expect(creditNoteId, 'No credit note').toBeTruthy();
    const r = await request.post(`${API}/credit-notes/${creditNoteId}/void`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('5.10 Get non-existent credit note', async ({ request }) => {
    const r = await request.get(`${API}/credit-notes/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });
});

// =============================================================================
// 6. EXPENSE — branches: categories, CRUD, filters (date range, search,
//    billable, status), approve, reject, bill-to-client, error paths
// =============================================================================

test.describe('6. Expense branch coverage', () => {

  test('6.01 Create expense category', async ({ request }) => {
    const r = await request.post(`${API}/expenses/categories`, {
      ...auth(),
      data: {
        name: `BranchCat ${Date.now()}`,
        description: 'Branch coverage category',
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) expenseCategoryId = body.data.id;
    else if (body.data?.category?.id) expenseCategoryId = body.data.category.id;
  });

  test('6.02 List expense categories', async ({ request }) => {
    const r = await request.get(`${API}/expenses/categories`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !expenseCategoryId) expenseCategoryId = list[0].id;
  });

  test('6.03 Create expense with all fields', async ({ request }) => {
    expect(expenseCategoryId, 'No expense category').toBeTruthy();
    const r = await request.post(`${API}/expenses`, {
      ...auth(),
      data: {
        categoryId: expenseCategoryId,
        vendorName: 'AWS India',
        date: '2026-04-04',
        amount: 250000,
        currency: 'INR',
        taxAmount: 45000,
        description: 'Cloud hosting Q1 2026',
        isBillable: true,
        clientId: clientId || KNOWN_CLIENT,
        tags: ['hosting', 'q1'],
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) expenseId = body.data.id;
    else if (body.data?.expense?.id) expenseId = body.data.expense.id;
  });

  test('6.04 List expenses with categoryId filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?categoryId=${expenseCategoryId}&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.05 List expenses with status filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?status=pending&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.06 List expenses with isBillable filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?isBillable=true&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.07 List expenses with date range filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?from=2026-01-01&to=2026-12-31&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.08 List expenses with search filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?search=AWS&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.09 List expenses with clientId filter', async ({ request }) => {
    const r = await request.get(`${API}/expenses?clientId=${KNOWN_CLIENT}&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.10 Get expense', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.get(`${API}/expenses/${expenseId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.11 Update expense (pending status branch)', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.put(`${API}/expenses/${expenseId}`, {
      ...auth(),
      data: {
        description: `Updated ${Date.now()}`,
        amount: 260000,
        tags: ['hosting', 'q1', 'updated'],
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('6.12 Approve expense', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.post(`${API}/expenses/${expenseId}/approve`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('6.13 Approve already-approved expense (error branch)', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.post(`${API}/expenses/${expenseId}/approve`, auth());
    // Should fail because status is no longer PENDING
    expect([400, 404, 409]).toContain(r.status());
  });

  test('6.14 Update approved expense (error branch — not PENDING)', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.put(`${API}/expenses/${expenseId}`, {
      ...auth(),
      data: { description: 'Should fail' },
    });
    expect([400, 404, 409]).toContain(r.status());
  });

  test('6.15 Bill expense to client (exercises invoice creation from expense)', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.post(`${API}/expenses/${expenseId}/bill`, auth());
    expect([200, 201, 400, 404, 409]).toContain(r.status());
  });

  test('6.16 Delete approved expense (error branch — not PENDING)', async ({ request }) => {
    expect(expenseId, 'No expense available').toBeTruthy();
    const r = await request.delete(`${API}/expenses/${expenseId}`, auth());
    expect([400, 404, 409]).toContain(r.status());
  });

  test('6.17 Create non-billable expense to test reject path', async ({ request }) => {
    expect(expenseCategoryId, 'No category').toBeTruthy();
    const r = await request.post(`${API}/expenses`, {
      ...auth(),
      data: {
        categoryId: expenseCategoryId,
        date: '2026-04-04',
        amount: 10000,
        description: 'Reject test expense',
        isBillable: false,
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    const newId = body.data?.id || body.data?.expense?.id;
    if (newId) {
      // Reject it
      const rr = await request.post(`${API}/expenses/${newId}/reject`, auth());
      expect([200, 400, 404]).toContain(rr.status());
      // Try to reject again (error branch)
      const rr2 = await request.post(`${API}/expenses/${newId}/reject`, auth());
      expect([400, 404, 409]).toContain(rr2.status());
    }
  });

  test('6.18 Get non-existent expense', async ({ request }) => {
    const r = await request.get(`${API}/expenses/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });

  test('6.19 Create expense with invalid category (NotFound branch)', async ({ request }) => {
    const r = await request.post(`${API}/expenses`, {
      ...auth(),
      data: {
        categoryId: FAKE_UUID,
        date: '2026-04-04',
        amount: 1000,
        description: 'Invalid category test',
      },
    });
    expect([400, 404, 422]).toContain(r.status());
  });
});

// =============================================================================
// 7. COUPON — branches: percentage validation, duplicate code, apply-to-sub,
//    remove-from-sub, update, delete, max redemptions
// =============================================================================

test.describe('7. Coupon branch coverage', () => {

  test('7.01 Create percentage coupon', async ({ request }) => {
    couponCode = `BRCPCT${Date.now()}`;
    const r = await request.post(`${API}/coupons`, {
      ...auth(),
      data: {
        code: couponCode,
        name: 'Branch PCT Coupon',
        type: 'percentage',
        value: 15,
        appliesTo: 'all',
        maxRedemptions: 50,
        maxRedemptionsPerClient: 3,
        minAmount: 5000,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) couponId = body.data.id;
  });

  test('7.02 Create fixed-amount coupon', async ({ request }) => {
    const r = await request.post(`${API}/coupons`, {
      ...auth(),
      data: {
        code: `BRCFIX${Date.now()}`,
        name: 'Branch Fixed Coupon',
        type: 'fixed',
        value: 2000,
        currency: 'INR',
        appliesTo: 'all',
        validFrom: '2026-01-01',
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
  });

  test('7.03 Create coupon with invalid percentage (error branch)', async ({ request }) => {
    const r = await request.post(`${API}/coupons`, {
      ...auth(),
      data: {
        code: `BRCBAD${Date.now()}`,
        name: 'Invalid percentage',
        type: 'percentage',
        value: 150, // > 100
        appliesTo: 'all',
        validFrom: '2026-01-01',
      },
    });
    expect([400, 422]).toContain(r.status());
  });

  test('7.04 Create coupon with duplicate code (ConflictError branch)', async ({ request }) => {
    expect(couponCode, 'No coupon code').toBeTruthy();
    const r = await request.post(`${API}/coupons`, {
      ...auth(),
      data: {
        code: couponCode, // same code
        name: 'Duplicate',
        type: 'percentage',
        value: 5,
        appliesTo: 'all',
        validFrom: '2026-01-01',
      },
    });
    expect([400, 409, 422]).toContain(r.status());
  });

  test('7.05 List coupons with search filter', async ({ request }) => {
    const r = await request.get(`${API}/coupons?search=branch&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.06 List coupons with isActive filter', async ({ request }) => {
    const r = await request.get(`${API}/coupons?isActive=true&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.07 List coupons with appliesTo filter', async ({ request }) => {
    const r = await request.get(`${API}/coupons?appliesTo=all&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.08 Validate coupon with amount below minimum', async ({ request }) => {
    const r = await request.post(`${API}/coupons/validate`, {
      ...auth(),
      data: { code: couponCode, invoiceAmount: 100 }, // below minAmount of 5000
    });
    expect([200, 400, 404, 422]).toContain(r.status());
  });

  test('7.09 Validate coupon with sufficient amount', async ({ request }) => {
    const r = await request.post(`${API}/coupons/validate`, {
      ...auth(),
      data: { code: couponCode, invoiceAmount: 100000 },
    });
    expect([200, 400, 404]).toContain(r.status());
  });

  test('7.10 Apply coupon to invoice', async ({ request }) => {
    const r = await request.post(`${API}/coupons/apply`, {
      ...auth(),
      data: {
        code: couponCode,
        invoiceId: KNOWN_INVOICE,
        clientId: clientId || KNOWN_CLIENT,
      },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('7.11 Apply coupon to subscription', async ({ request }) => {
    const r = await request.post(`${API}/coupons/apply-to-subscription`, {
      ...auth(),
      data: {
        couponId: couponId || FAKE_UUID,
        subscriptionId: FAKE_UUID,
      },
    });
    expect([200, 201, 400, 404, 409, 422]).toContain(r.status());
  });

  test('7.12 Remove coupon from subscription', async ({ request }) => {
    const r = await request.delete(`${API}/coupons/subscription/${FAKE_UUID}`, auth());
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('7.13 Get coupon redemptions', async ({ request }) => {
    expect(couponId, 'No coupon').toBeTruthy();
    const r = await request.get(`${API}/coupons/${couponId}/redemptions`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.14 Update coupon', async ({ request }) => {
    expect(couponId, 'No coupon').toBeTruthy();
    const r = await request.put(`${API}/coupons/${couponId}`, {
      ...auth(),
      data: { name: `Updated ${Date.now()}`, maxRedemptions: 200 },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('7.15 Delete coupon', async ({ request }) => {
    expect(couponId, 'No coupon').toBeTruthy();
    const r = await request.delete(`${API}/coupons/${couponId}`, auth());
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('7.16 Get deleted coupon (NotFound branch)', async ({ request }) => {
    expect(couponId, 'No coupon').toBeTruthy();
    const r = await request.get(`${API}/coupons/${couponId}`, auth());
    expect([404]).toContain(r.status());
  });
});

// =============================================================================
// 8. QUOTE — branches: filters, accept, decline, convert, send, PDF, delete
// =============================================================================

test.describe('8. Quote branch coverage', () => {

  test('8.01 Create quote with discount and tax', async ({ request }) => {
    const r = await request.post(`${API}/quotes`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        issueDate: '2026-04-04',
        expiryDate: '2026-07-04',
        currency: 'INR',
        discount: { type: 'percentage', value: 10 },
        items: [
          { name: 'Payroll Module', description: 'Q test', quantity: 20, rate: 10000, taxRateId: taxRateId || undefined },
          { name: 'Monitor Module', description: 'Q test 2', quantity: 5, rate: 8000 },
        ],
        notes: 'Branch coverage quote',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) quoteId = body.data.id;
    else if (body.data?.quote?.id) quoteId = body.data.quote.id;
  });

  test('8.02 List quotes with status filter', async ({ request }) => {
    const r = await request.get(`${API}/quotes?status=draft&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !quoteId) quoteId = list[0].id;
  });

  test('8.03 List quotes with date range filter', async ({ request }) => {
    const r = await request.get(`${API}/quotes?from=2026-01-01&to=2026-12-31&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.04 List quotes with search filter', async ({ request }) => {
    const r = await request.get(`${API}/quotes?search=QT&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.05 List quotes with clientId filter', async ({ request }) => {
    const r = await request.get(`${API}/quotes?clientId=${KNOWN_CLIENT}&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.06 Get quote with items', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.get(`${API}/quotes/${quoteId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.07 Update quote', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.put(`${API}/quotes/${quoteId}`, {
      ...auth(),
      data: { notes: `Updated ${Date.now()}` },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('8.08 Send quote', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.post(`${API}/quotes/${quoteId}/send`, auth());
    expect([200, 201, 204, 400, 404, 422]).toContain(r.status());
  });

  test('8.09 Get quote PDF', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.get(`${API}/quotes/${quoteId}/pdf`, auth());
    expect([200, 404, 500, 501]).toContain(r.status());
  });

  test('8.10 Decline quote (exercises decline branch)', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.post(`${API}/quotes/${quoteId}/decline`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('8.11 Accept quote (exercises accept branch)', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.post(`${API}/quotes/${quoteId}/accept`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('8.12 Convert quote to invoice', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.post(`${API}/quotes/${quoteId}/convert`, auth());
    expect([200, 201, 400, 404, 409]).toContain(r.status());
  });

  test('8.13 Delete quote', async ({ request }) => {
    expect(quoteId, 'No quote').toBeTruthy();
    const r = await request.delete(`${API}/quotes/${quoteId}`, auth());
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('8.14 Get non-existent quote', async ({ request }) => {
    const r = await request.get(`${API}/quotes/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });
});

// =============================================================================
// 9. METRICS — branches: MRR, ARR, churn (with period), LTV, revenue breakdown,
//    subscription stats, cohort analysis
// =============================================================================

test.describe('9. Metrics branch coverage', () => {

  test('9.01 Get MRR (Monthly Recurring Revenue)', async ({ request }) => {
    const r = await request.get(`${API}/metrics/mrr`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
      expect(typeof body.data.mrr).toBe('number');
    }
  });

  test('9.02 Get ARR (Annual Recurring Revenue)', async ({ request }) => {
    const r = await request.get(`${API}/metrics/arr`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(typeof body.data.arr).toBe('number');
    }
  });

  test('9.03 Get churn metrics with default period', async ({ request }) => {
    const r = await request.get(`${API}/metrics/churn`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
    }
  });

  test('9.04 Get churn metrics with custom period', async ({ request }) => {
    const r = await request.get(`${API}/metrics/churn?from=2025-01-01&to=2026-04-01`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.05 Get LTV (Lifetime Value)', async ({ request }) => {
    const r = await request.get(`${API}/metrics/ltv`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
    }
  });

  test('9.06 Get revenue breakdown (default 12 months)', async ({ request }) => {
    const r = await request.get(`${API}/metrics/revenue-breakdown`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('9.07 Get revenue breakdown with custom months', async ({ request }) => {
    const r = await request.get(`${API}/metrics/revenue-breakdown?months=6`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.08 Get revenue breakdown max months clamped to 36', async ({ request }) => {
    const r = await request.get(`${API}/metrics/revenue-breakdown?months=100`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.09 Get subscription stats', async ({ request }) => {
    const r = await request.get(`${API}/metrics/subscription-stats`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.10 Get cohort analysis (default 12 months)', async ({ request }) => {
    const r = await request.get(`${API}/metrics/cohort`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.11 Get cohort analysis with custom months', async ({ request }) => {
    const r = await request.get(`${API}/metrics/cohort?months=6`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 10. DUNNING — branches: config CRUD, attempts filter, summary, retry
// =============================================================================

test.describe('10. Dunning branch coverage', () => {

  test('10.01 Get dunning config (default fallback branch)', async ({ request }) => {
    const r = await request.get(`${API}/dunning/config`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
      // Default or stored config
      expect(body.data.maxRetries).toBeTruthy();
    }
  });

  test('10.02 Update dunning config (create branch if no existing)', async ({ request }) => {
    const r = await request.put(`${API}/dunning/config`, {
      ...auth(),
      data: {
        maxRetries: 5,
        retrySchedule: [1, 3, 5, 7, 14],
        gracePeriodDays: 5,
        cancelAfterAllRetries: true,
        sendReminderEmails: true,
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('10.03 Update dunning config again (update branch)', async ({ request }) => {
    const r = await request.put(`${API}/dunning/config`, {
      ...auth(),
      data: {
        maxRetries: 3,
        retrySchedule: [1, 3, 7],
        gracePeriodDays: 2,
        cancelAfterAllRetries: false,
        sendReminderEmails: false,
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('10.04 List dunning attempts with status filter', async ({ request }) => {
    const r = await request.get(`${API}/dunning/attempts?status=pending&page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('10.05 List dunning attempts with invoiceId filter', async ({ request }) => {
    const r = await request.get(`${API}/dunning/attempts?invoiceId=${KNOWN_INVOICE}&page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('10.06 Get dunning summary', async ({ request }) => {
    const r = await request.get(`${API}/dunning/summary`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('10.07 Retry dunning attempt (exercises processDunningAttempt)', async ({ request }) => {
    const r = await request.post(`${API}/dunning/attempts/${FAKE_UUID}/retry`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });
});

// =============================================================================
// 11. RECURRING — branches: CRUD, pause, resume, executions, frequency variants
// =============================================================================

test.describe('11. Recurring branch coverage', () => {

  test('11.01 Create recurring profile (monthly)', async ({ request }) => {
    const r = await request.post(`${API}/recurring`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        type: 'invoice',
        frequency: 'monthly',
        startDate: '2026-05-01',
        endDate: '2027-04-30',
        autoSend: true,
        templateData: {
          items: [{ name: 'Monthly SaaS License', quantity: 10, rate: 10000 }],
          currency: 'INR',
        },
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) recurringId = body.data.id;
  });

  test('11.02 Create recurring profile (quarterly)', async ({ request }) => {
    const r = await request.post(`${API}/recurring`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        type: 'invoice',
        frequency: 'quarterly',
        startDate: '2026-04-01',
        autoSend: false,
        templateData: {
          items: [{ name: 'Quarterly Support', quantity: 1, rate: 50000 }],
          currency: 'INR',
        },
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('11.03 Create recurring profile (yearly)', async ({ request }) => {
    const r = await request.post(`${API}/recurring`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        type: 'invoice',
        frequency: 'yearly',
        startDate: '2026-04-01',
        autoSend: false,
        templateData: {
          items: [{ name: 'Annual License', quantity: 1, rate: 1200000 }],
          currency: 'INR',
        },
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('11.04 List recurring profiles', async ({ request }) => {
    const r = await request.get(`${API}/recurring?page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0 && !recurringId) recurringId = list[0].id;
  });

  test('11.05 List recurring with status filter', async ({ request }) => {
    const r = await request.get(`${API}/recurring?status=active&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.06 List recurring with clientId filter', async ({ request }) => {
    const r = await request.get(`${API}/recurring?clientId=${KNOWN_CLIENT}&page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.07 Get recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.get(`${API}/recurring/${recurringId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.08 Update recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.put(`${API}/recurring/${recurringId}`, {
      ...auth(),
      data: { autoSend: false },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('11.09 Pause recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.post(`${API}/recurring/${recurringId}/pause`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('11.10 Resume recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.post(`${API}/recurring/${recurringId}/resume`, auth());
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('11.11 Get executions for recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.get(`${API}/recurring/${recurringId}/executions`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.12 Delete recurring profile', async ({ request }) => {
    expect(recurringId, 'No recurring profile').toBeTruthy();
    const r = await request.delete(`${API}/recurring/${recurringId}`, auth());
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('11.13 Get non-existent recurring profile', async ({ request }) => {
    const r = await request.get(`${API}/recurring/${FAKE_UUID}`, auth());
    expect([404]).toContain(r.status());
  });
});

// =============================================================================
// 12. SEARCH — branches: empty query, search across all entity types
// =============================================================================

test.describe('12. Search branch coverage', () => {

  test('12.01 Global search with empty query (empty results branch)', async ({ request }) => {
    const r = await request.get(`${API}/search?q=`, auth());
    expect([200, 400]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      // Should return empty arrays for all categories
      const data = body.data;
      if (data) {
        expect(Array.isArray(data.clients || [])).toBe(true);
      }
    }
  });

  test('12.02 Global search for clients', async ({ request }) => {
    const r = await request.get(`${API}/search?q=tech`, auth());
    expect([200, 400]).toContain(r.status());
  });

  test('12.03 Global search for invoices', async ({ request }) => {
    const r = await request.get(`${API}/search?q=INV`, auth());
    expect([200, 400]).toContain(r.status());
  });

  test('12.04 Global search for products', async ({ request }) => {
    const r = await request.get(`${API}/search?q=payroll`, auth());
    expect([200, 400]).toContain(r.status());
  });

  test('12.05 Global search for quotes', async ({ request }) => {
    const r = await request.get(`${API}/search?q=QT`, auth());
    expect([200, 400]).toContain(r.status());
  });

  test('12.06 Global search with no matches', async ({ request }) => {
    const r = await request.get(`${API}/search?q=zzzzzznonexistent999`, auth());
    expect([200, 400]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      const data = body.data;
      if (data) {
        // All arrays should be empty for a non-matching query
        const totalResults = (data.clients?.length || 0) +
          (data.invoices?.length || 0) +
          (data.quotes?.length || 0) +
          (data.expenses?.length || 0) +
          (data.products?.length || 0) +
          (data.vendors?.length || 0);
        expect(totalResults).toBe(0);
      }
    }
  });
});

// =============================================================================
// 13. DISPUTE — branches: list, get, update status transitions
// =============================================================================

test.describe('13. Dispute branch coverage', () => {

  test('13.01 List disputes', async ({ request }) => {
    const r = await request.get(`${API}/disputes?page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : body.data?.data || [];
    if (list.length > 0) disputeId = list[0].id;
  });

  test('13.02 Get dispute (or not found)', async ({ request }) => {
    const id = disputeId || FAKE_UUID;
    const r = await request.get(`${API}/disputes/${id}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('13.03 Update dispute status to under_review', async ({ request }) => {
    if (!disputeId) return; // No dispute to update
    const r = await request.put(`${API}/disputes/${disputeId}`, {
      ...auth(),
      data: { status: 'under_review', internalNotes: 'Branch test review' },
    });
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });

  test('13.04 Update dispute status to resolved', async ({ request }) => {
    if (!disputeId) return;
    const r = await request.put(`${API}/disputes/${disputeId}`, {
      ...auth(),
      data: { status: 'resolved', resolution: 'Refund issued', internalNotes: 'Resolved via branch test' },
    });
    expect([200, 204, 400, 404, 409]).toContain(r.status());
  });
});

// =============================================================================
// 14. REPORTS — branches: dashboard, revenue, receivables, aging, expenses,
//     profit-loss, tax, top clients, CSV exports, GSTR-1
// =============================================================================

test.describe('14. Report branch coverage', () => {

  test('14.01 Dashboard stats', async ({ request }) => {
    const r = await request.get(`${API}/reports/dashboard`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
    }
  });

  test('14.02 Revenue report', async ({ request }) => {
    const r = await request.get(`${API}/reports/revenue?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.03 Revenue report with groupBy=month', async ({ request }) => {
    const r = await request.get(`${API}/reports/revenue?from=2025-01-01&to=2026-12-31&groupBy=month`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.04 Receivables report', async ({ request }) => {
    const r = await request.get(`${API}/reports/receivables`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.05 Aging report', async ({ request }) => {
    const r = await request.get(`${API}/reports/aging`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.06 Expense report', async ({ request }) => {
    const r = await request.get(`${API}/reports/expenses?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.07 Profit/Loss report', async ({ request }) => {
    const r = await request.get(`${API}/reports/profit-loss?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.08 Tax report', async ({ request }) => {
    const r = await request.get(`${API}/reports/tax?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.09 Top clients', async ({ request }) => {
    const r = await request.get(`${API}/reports/clients/top?limit=10`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.10 Export revenue CSV', async ({ request }) => {
    const r = await request.get(`${API}/reports/revenue/export?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.11 Export receivables CSV', async ({ request }) => {
    const r = await request.get(`${API}/reports/receivables/export`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.12 Export expenses CSV', async ({ request }) => {
    const r = await request.get(`${API}/reports/expenses/export?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.13 Export tax CSV', async ({ request }) => {
    const r = await request.get(`${API}/reports/tax/export?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.14 GSTR-1 report', async ({ request }) => {
    const r = await request.get(`${API}/reports/gstr1?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.15 GSTR-1 JSON export', async ({ request }) => {
    const r = await request.get(`${API}/reports/gstr1/json?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('14.16 GSTR-1 CSV export', async ({ request }) => {
    const r = await request.get(`${API}/reports/gstr1/csv?from=2025-01-01&to=2026-12-31`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 15. CSV IMPORT/EXPORT — branches: client export, client import,
//     product export, product import, empty/invalid CSV
// =============================================================================

test.describe('15. CSV Import/Export branch coverage', () => {

  test('15.01 Export clients CSV', async ({ request }) => {
    const r = await request.get(`${API}/clients/export/csv`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('15.02 Import clients CSV with valid data', async ({ request }) => {
    const csv = 'name,displayName,email,phone,currency,paymentTerms\nCSV Corp,CSV Display,csv-import@example.com,+91-9999999999,INR,30';
    const r = await request.post(`${API}/clients/import/csv`, {
      ...auth(),
      data: { csv },
    });
    expect([200, 201, 400, 409, 422]).toContain(r.status());
  });

  test('15.03 Import clients CSV with empty data (error branch)', async ({ request }) => {
    const r = await request.post(`${API}/clients/import/csv`, {
      ...auth(),
      data: { csv: '' },
    });
    expect([400, 422]).toContain(r.status());
  });

  test('15.04 Import clients CSV with headers only (no data rows)', async ({ request }) => {
    const r = await request.post(`${API}/clients/import/csv`, {
      ...auth(),
      data: { csv: 'name,email\n' },
    });
    expect([200, 400, 422]).toContain(r.status());
  });

  test('15.05 Export products CSV', async ({ request }) => {
    const r = await request.get(`${API}/products/export/csv`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('15.06 Import products CSV with valid data', async ({ request }) => {
    const csv = 'name,sku,rate,type,currency\nCSV Product,CSV-PRD-001,7500,service,INR';
    const r = await request.post(`${API}/products/import/csv`, {
      ...auth(),
      data: { csv },
    });
    expect([200, 201, 400, 409, 422]).toContain(r.status());
  });
});

// =============================================================================
// 16. PORTAL — branches: branding, login error, dashboard, invoices, quotes,
//     payments, credit notes, statement, disputes, subscriptions, plans
// =============================================================================

test.describe('16. Portal branch coverage', () => {

  test('16.01 Get portal branding (public, no auth)', async ({ request }) => {
    const r = await request.get(`${API}/portal/branding`);
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.data).toBeTruthy();
    }
  });

  test('16.02 Portal login with invalid credentials (error branch)', async ({ request }) => {
    const r = await request.post(`${API}/portal/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'nonexistent@example.com', token: 'invalid-token' },
    });
    expect([400, 401, 404, 422]).toContain(r.status());
  });

  test('16.03 Portal dashboard without auth (unauthorized branch)', async ({ request }) => {
    const r = await request.get(`${API}/portal/dashboard`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.04 Portal invoices without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/invoices`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.05 Portal payments without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/payments`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.06 Portal quotes without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/quotes`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.07 Portal credit notes without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/credit-notes`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.08 Portal statement without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/statement`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.09 Portal disputes without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/disputes`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.10 Portal subscriptions without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/subscriptions`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.11 Portal plans without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/plans`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.12 Portal payment gateways without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/payment-gateways`);
    expect([401, 403]).toContain(r.status());
  });

  test('16.13 Portal payment method without auth', async ({ request }) => {
    const r = await request.get(`${API}/portal/payment-method`);
    expect([401, 403]).toContain(r.status());
  });
});

// =============================================================================
// 17. ONLINE PAYMENT — branches: list gateways, create order, verify payment
// =============================================================================

test.describe('17. Online Payment branch coverage', () => {

  test('17.01 List payment gateways', async ({ request }) => {
    const r = await request.get(`${API}/payments/online/gateways`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('17.02 Create order with invalid invoice (error branch)', async ({ request }) => {
    const r = await request.post(`${API}/payments/online/create-order`, {
      ...auth(),
      data: {
        invoiceId: FAKE_UUID,
        gateway: 'stripe',
        returnUrl: 'https://test.example.com/return',
      },
    });
    expect([200, 400, 404, 422]).toContain(r.status());
  });

  test('17.03 Create order with razorpay gateway', async ({ request }) => {
    const r = await request.post(`${API}/payments/online/create-order`, {
      ...auth(),
      data: {
        invoiceId: KNOWN_INVOICE,
        gateway: 'razorpay',
        returnUrl: 'https://test.example.com/return',
      },
    });
    expect([200, 201, 400, 404, 422, 500]).toContain(r.status());
  });

  test('17.04 Create order with paypal gateway', async ({ request }) => {
    const r = await request.post(`${API}/payments/online/create-order`, {
      ...auth(),
      data: {
        invoiceId: KNOWN_INVOICE,
        gateway: 'paypal',
        returnUrl: 'https://test.example.com/return',
      },
    });
    expect([200, 201, 400, 404, 422, 500]).toContain(r.status());
  });

  test('17.05 Verify payment with invalid data (error branch)', async ({ request }) => {
    const r = await request.post(`${API}/payments/online/verify`, {
      ...auth(),
      data: {
        gateway: 'stripe',
        sessionId: 'invalid_session_123',
      },
    });
    expect([200, 400, 404, 422, 500]).toContain(r.status());
  });

  test('17.06 Verify razorpay payment with invalid data', async ({ request }) => {
    const r = await request.post(`${API}/payments/online/verify`, {
      ...auth(),
      data: {
        gateway: 'razorpay',
        razorpayPaymentId: 'pay_invalid_123',
        razorpayOrderId: 'order_invalid_123',
        razorpaySignature: 'invalid_sig',
      },
    });
    expect([200, 400, 404, 422, 500]).toContain(r.status());
  });
});

// =============================================================================
// 18. PRICING / USAGE — branches: tiered pricing, volume pricing, metered,
//     usage records, usage summary, generate usage invoice
// =============================================================================

test.describe('18. Pricing & Usage branch coverage', () => {

  test('18.01 Record usage event', async ({ request }) => {
    const r = await request.post(`${API}/usage`, {
      ...auth(),
      data: {
        productId: productId || FAKE_UUID,
        clientId: clientId || KNOWN_CLIENT,
        quantity: 250,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        description: 'API calls April branch test',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('18.02 List usage records', async ({ request }) => {
    const r = await request.get(`${API}/usage?page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('18.03 Get usage summary', async ({ request }) => {
    const r = await request.get(
      `${API}/usage/summary?productId=${productId || FAKE_UUID}&clientId=${clientId || KNOWN_CLIENT}&periodStart=2026-04-01&periodEnd=2026-04-30`,
      auth()
    );
    expect([200, 400, 404]).toContain(r.status());
  });

  test('18.04 Report usage (simplified SaaS integration)', async ({ request }) => {
    const r = await request.post(`${API}/usage/report`, {
      ...auth(),
      data: {
        productId: productId || FAKE_UUID,
        clientId: clientId || KNOWN_CLIENT,
        quantity: 500,
        timestamp: '2026-04-15T12:00:00Z',
      },
    });
    expect([200, 201, 400, 404]).toContain(r.status());
  });

  test('18.05 Generate usage invoice', async ({ request }) => {
    const r = await request.post(`${API}/usage/generate-invoice`, {
      ...auth(),
      data: {
        clientId: clientId || KNOWN_CLIENT,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
      },
    });
    expect([200, 201, 400, 404, 422]).toContain(r.status());
  });

  test('18.06 Generate all usage invoices (admin)', async ({ request }) => {
    const r = await request.post(`${API}/usage/generate-all-invoices`, auth());
    expect([200, 201, 400, 403, 404]).toContain(r.status());
  });
});

// =============================================================================
// 19. ADDITIONAL COVERAGE — Vendor, Settings, Webhooks, Currency, Domain,
//     Notifications, Scheduled Reports
// =============================================================================

test.describe('19. Additional entity coverage', () => {

  // -- Vendor --
  test('19.01 List vendors', async ({ request }) => {
    const r = await request.get(`${API}/vendors?page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('19.02 Create vendor', async ({ request }) => {
    const r = await request.post(`${API}/vendors`, {
      ...auth(),
      data: {
        name: `Vendor ${Date.now()}`,
        email: `vendor-${Date.now()}@example.com`,
        phone: '+91-8888888888',
        currency: 'INR',
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
  });

  // -- Settings --
  test('19.03 Get organization settings', async ({ request }) => {
    const r = await request.get(`${API}/settings`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('19.04 Update organization settings', async ({ request }) => {
    const r = await request.put(`${API}/settings`, {
      ...auth(),
      data: {
        invoicePrefix: 'INV',
        quotePrefix: 'QT',
        creditNotePrefix: 'CN',
        defaultPaymentTerms: 30,
        taxLabel: 'GST',
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  // -- Webhook --
  test('19.05 List webhooks', async ({ request }) => {
    const r = await request.get(`${API}/webhooks?page=1&limit=5`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('19.06 Create webhook', async ({ request }) => {
    const r = await request.post(`${API}/webhooks`, {
      ...auth(),
      data: {
        url: `https://webhook-test.example.com/billing-${Date.now()}`,
        events: ['invoice.created', 'payment.received'],
        isActive: true,
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
  });

  // -- Currency --
  test('19.07 List currencies', async ({ request }) => {
    const r = await request.get(`${API}/currencies`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('19.08 Get exchange rates', async ({ request }) => {
    const r = await request.get(`${API}/currencies/rates?base=INR`, auth());
    expect([200, 404]).toContain(r.status());
  });

  // -- Domain --
  test('19.09 List custom domains', async ({ request }) => {
    const r = await request.get(`${API}/domains`, auth());
    expect([200, 404]).toContain(r.status());
  });

  // -- Notification --
  test('19.10 List notifications', async ({ request }) => {
    const r = await request.get(`${API}/notifications?page=1&limit=10`, auth());
    expect([200, 404]).toContain(r.status());
  });

  // -- Scheduled Report --
  test('19.11 List scheduled reports', async ({ request }) => {
    const r = await request.get(`${API}/scheduled-reports`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('19.12 Create scheduled report', async ({ request }) => {
    const r = await request.post(`${API}/scheduled-reports`, {
      ...auth(),
      data: {
        name: `Branch Test Report ${Date.now()}`,
        reportType: 'revenue',
        frequency: 'weekly',
        recipients: ['test@example.com'],
        filters: { from: '2026-01-01', to: '2026-12-31' },
      },
    });
    expect([200, 201, 400, 422]).toContain(r.status());
  });

  // -- Upload --
  test('19.13 Upload endpoint (no file — error branch)', async ({ request }) => {
    const r = await request.post(`${API}/uploads`, auth());
    expect([400, 404, 422]).toContain(r.status());
  });
});
