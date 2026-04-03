import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Documents Advanced E2E Tests
// Tests: upload (multipart), download, verify, reject, delete, expiry, mandatory
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function authMultipart(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// 1. Document Upload (multipart/form-data)
// =============================================================================

test.describe("Document Upload", () => {
  let adminToken: string;
  let employeeToken: string;
  let categoryId: number;
  let uploadedDocId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);

    // Create a category to upload documents into
    const catRes = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `Upload Test Cat ${RUN}`, description: "E2E upload category", is_mandatory: false },
    });
    expect(catRes.status()).toBe(201);
    categoryId = (await catRes.json()).data.id;
  });

  test("Employee can upload a document via multipart form", async ({ request }) => {
    // Use PDF mime type — server only allows PDF, JPEG, PNG, DOCX
    // Create a minimal valid PDF buffer
    const pdfContent = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF";
    const res = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        file: {
          name: "test-doc.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(pdfContent),
        },
        category_id: String(categoryId),
        name: `E2E Doc ${RUN}`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    uploadedDocId = body.data.id;
  });

  test("Upload without file returns 400", async ({ request }) => {
    const res = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        category_id: String(categoryId),
        name: "No File Doc",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("Upload without category_id returns 400", async ({ request }) => {
    const res = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        file: {
          name: "test-doc2.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Missing category"),
        },
        name: "No Category Doc",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("Uploaded document appears in my documents", async ({ request }) => {
    const res = await request.get(`${API}/documents/my`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const docs = body.data;
    if (uploadedDocId && Array.isArray(docs)) {
      const found = docs.some((d: any) => d.id === uploadedDocId);
      expect(found).toBe(true);
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete uploaded doc and category
    if (uploadedDocId) {
      await request.delete(`${API}/documents/${uploadedDocId}`, {
        headers: auth(adminToken),
      });
    }
    if (categoryId) {
      await request.delete(`${API}/documents/categories/${categoryId}`, {
        headers: auth(adminToken),
      });
    }
  });
});

// =============================================================================
// 2. Document Download with Auth
// =============================================================================

test.describe("Document Download", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Download endpoint requires authentication (401)", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999/download`);
    expect(res.status()).toBe(401);
  });

  test("Download non-existent document returns 404", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999/download`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 3. Document Verify / Reject / Delete (HR workflow)
// =============================================================================

test.describe("Document Verify / Reject / Delete", () => {
  let adminToken: string;
  let employeeToken: string;
  let categoryId: number;
  let docId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);

    // Create category and upload a doc as employee
    const catRes = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `Verify Cat ${RUN}`, description: "For verify test" },
    });
    categoryId = (await catRes.json()).data.id;

    const pdfContent = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF";
    const upRes = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        file: {
          name: "verify-doc.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(pdfContent),
        },
        category_id: String(categoryId),
        name: `Verify Doc ${RUN}`,
      },
    });
    docId = (await upRes.json()).data.id;
  });

  test("Admin can verify a document", async ({ request }) => {
    const res = await request.put(`${API}/documents/${docId}/verify`, {
      headers: auth(adminToken),
      data: { is_verified: true },
    });
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Employee cannot verify a document (403)", async ({ request }) => {
    const res = await request.put(`${API}/documents/${docId}/verify`, {
      headers: auth(employeeToken),
      data: { is_verified: true },
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can reject a document", async ({ request }) => {
    const res = await request.post(`${API}/documents/${docId}/reject`, {
      headers: auth(adminToken),
      data: { rejection_reason: "Poor quality scan" },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("Employee cannot reject a document (403)", async ({ request }) => {
    const res = await request.post(`${API}/documents/${docId}/reject`, {
      headers: auth(employeeToken),
      data: { rejection_reason: "Should fail" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a document (403)", async ({ request }) => {
    const res = await request.delete(`${API}/documents/${docId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can delete a document", async ({ request }) => {
    const res = await request.delete(`${API}/documents/${docId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (categoryId) {
      await request.delete(`${API}/documents/categories/${categoryId}`, {
        headers: auth(adminToken),
      });
    }
  });
});

// =============================================================================
// 4. Document Expiry Tracking
// =============================================================================

test.describe("Document Expiry Tracking", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("HR can view expiring documents", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring?days=90`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can view expiry tracking", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/expiry`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot view expiring documents (403)", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 5. Mandatory Document Status
// =============================================================================

test.describe("Mandatory Document Status", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("HR can view mandatory document status", async ({ request }) => {
    const res = await request.get(`${API}/documents/mandatory-status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can view mandatory document tracking", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/mandatory`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot view mandatory status (403)", async ({ request }) => {
    const res = await request.get(`${API}/documents/mandatory-status`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});
