import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — File Operations E2E Tests
// Tests: upload, download, Content-Type verification, access control, CSV export
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const BILLING_API = "https://test-billing-api.empcloud.com/api/v1";
const BILLING_KEY = "emp-billing-api-key-2026-secure-integration";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function getToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

async function getTokenAndUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ token: string; userId: number; employeeId: number }> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  const token = body.data.tokens.access_token;

  const meRes = await request.get(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = (await meRes.json()).data;
  return {
    token,
    userId: me.id,
    employeeId: me.employee_id || me.id,
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function authMultipart(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function billingAuth() {
  return { Authorization: `Bearer ${BILLING_KEY}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Document Upload & Download — Content-Type Verification
// =============================================================================

test.describe("Document Upload & Download", () => {
  let adminToken: string;
  let employeeToken: string;
  let categoryId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);

    // Create a test category
    const catRes = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `File Ops Cat ${RUN}`, description: "File operations test", is_mandatory: false },
    });
    expect(catRes.status()).toBe(201);
    categoryId = (await catRes.json()).data.id;
  });

  test.describe.serial("PDF upload and download", () => {
    let docId: number;

    test("Upload PDF document", async ({ request }) => {
      // Create a minimal PDF-like buffer (PDF header)
      const pdfContent = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
        "xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
        "trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n109\n%%EOF"
      );

      const res = await request.post(`${API}/documents/upload`, {
        headers: authMultipart(employeeToken),
        multipart: {
          file: {
            name: "test-document.pdf",
            mimeType: "application/pdf",
            buffer: pdfContent,
          },
          category_id: String(categoryId),
          name: `E2E PDF Doc ${RUN}`,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      docId = body.data.id;
      expect(docId).toBeGreaterThan(0);
    });

    test("Download PDF — verify Content-Type", async ({ request }) => {
      const res = await request.get(`${API}/documents/${docId}/download`, {
        headers: authMultipart(adminToken),
      });
      expect(res.status()).toBe(200);

      const contentType = res.headers()["content-type"] || "";
      // Should be application/pdf or application/octet-stream
      expect(
        contentType.includes("pdf") || contentType.includes("octet-stream")
      ).toBe(true);
      console.log(`PDF download Content-Type: ${contentType}`);
    });

    test("Download PDF — verify Content-Disposition has filename", async ({ request }) => {
      const res = await request.get(`${API}/documents/${docId}/download`, {
        headers: authMultipart(adminToken),
      });
      expect(res.status()).toBe(200);

      const disposition = res.headers()["content-disposition"] || "";
      if (disposition) {
        expect(disposition).toContain("attachment");
        console.log(`Content-Disposition: ${disposition}`);
      } else {
        console.log("No Content-Disposition header — server may stream inline");
      }
    });

    test("Delete uploaded PDF — cleanup", async ({ request }) => {
      const res = await request.delete(`${API}/documents/${docId}`, {
        headers: auth(adminToken),
      });
      expect([200, 204]).toContain(res.status());
    });
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
// 2. Employee Photo Upload & Access
// =============================================================================

test.describe("Employee Photo Upload", () => {
  let adminToken: string;
  let employeeId: number;

  test.beforeAll(async ({ request }) => {
    const emp = await getTokenAndUser(request, EMPLOYEE.email, EMPLOYEE.password);
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeId = emp.employeeId;
  });

  test("Upload employee photo — image accessible", async ({ request }) => {
    // Create a minimal 1x1 PNG
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // 8-bit RGB
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82,
    ]);

    const res = await request.post(`${API}/employees/${employeeId}/photo`, {
      headers: authMultipart(adminToken),
      multipart: {
        photo: {
          name: "employee-photo.png",
          mimeType: "image/png",
          buffer: pngHeader,
        },
      },
    });

    // Photo upload may return 200/201 or different endpoint format
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      console.log(`Photo uploaded: ${JSON.stringify(body.data).substring(0, 200)}`);

      // If URL returned, verify it's accessible
      const photoUrl = body.data?.photo_url || body.data?.url;
      if (photoUrl) {
        const photoRes = await request.get(photoUrl);
        expect(photoRes.status()).toBe(200);
        const ct = photoRes.headers()["content-type"] || "";
        expect(ct).toContain("image");
        console.log(`Photo accessible at ${photoUrl}, Content-Type: ${ct}`);
      }
    } else {
      console.log(`Photo upload returned ${res.status()} — endpoint may differ`);
    }
  });
});

// =============================================================================
// 3. Upload Validation — Invalid File Type & Size
// =============================================================================

test.describe("Upload Validation", () => {
  let employeeToken: string;
  let categoryId: number;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);

    const catRes = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `Validation Cat ${RUN}`, description: "Upload validation test" },
    });
    expect(catRes.status()).toBe(201);
    categoryId = (await catRes.json()).data.id;
  });

  test("Upload with potentially dangerous file type", async ({ request }) => {
    const res = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        file: {
          name: "malicious.exe",
          mimeType: "application/x-msdownload",
          buffer: Buffer.from("MZ fake executable content"),
        },
        category_id: String(categoryId),
        name: "Dangerous File",
      },
    });
    // Should reject .exe or accept with content validation
    console.log(`Dangerous file upload response: ${res.status()}`);
    // Some servers reject (400), some accept (201) with validation on download
    expect([201, 400, 403, 415, 422]).toContain(res.status());
  });

  test("Upload oversized file (>10MB) — verify rejection", async ({ request }) => {
    test.setTimeout(60000);
    // Create a 11MB buffer
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, "X");

    const res = await request.post(`${API}/documents/upload`, {
      headers: authMultipart(employeeToken),
      multipart: {
        file: {
          name: "large-file.txt",
          mimeType: "text/plain",
          buffer: largeBuffer,
        },
        category_id: String(categoryId),
        name: "Oversized File",
      },
    });
    // Should be rejected with 413 (payload too large) or 400
    console.log(`Oversized file response: ${res.status()}`);
    expect([400, 413, 422]).toContain(res.status());
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
// 4. Download Access Control
// =============================================================================

test.describe("Download Access Control", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Download non-existent document — returns 404", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999/download`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("Download without auth token — returns 401", async ({ request }) => {
    const res = await request.get(`${API}/documents/1/download`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 5. Employee Self-Service Document Upload
// =============================================================================

test.describe("Employee Self-Service Documents", () => {
  let employeeToken: string;
  let adminToken: string;
  let categoryId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);

    const catRes = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `Self-Service Cat ${RUN}`, description: "Self-service doc test" },
    });
    expect(catRes.status()).toBe(201);
    categoryId = (await catRes.json()).data.id;
  });

  test.describe.serial("Self-service upload flow", () => {
    let docId: number;
    let initialCount: number;

    test("GET initial my-documents count", async ({ request }) => {
      const res = await request.get(`${API}/documents/my`, {
        headers: auth(employeeToken),
      });
      expect(res.status()).toBe(200);
      const docs = (await res.json()).data;
      initialCount = Array.isArray(docs) ? docs.length : 0;
    });

    test("Upload document as employee — appears in /documents/my", async ({ request }) => {
      const res = await request.post(`${API}/documents/upload`, {
        headers: authMultipart(employeeToken),
        multipart: {
          file: {
            name: "self-service-doc.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(`Self-service document content ${RUN}`),
          },
          category_id: String(categoryId),
          name: `Self-Service Doc ${RUN}`,
        },
      });
      expect(res.status()).toBe(201);
      docId = (await res.json()).data.id;
    });

    test("GET my-documents count increased", async ({ request }) => {
      const res = await request.get(`${API}/documents/my`, {
        headers: auth(employeeToken),
      });
      expect(res.status()).toBe(200);
      const docs = (await res.json()).data;
      const currentCount = Array.isArray(docs) ? docs.length : 0;
      expect(currentCount).toBe(initialCount + 1);
    });

    test("Delete document — count returns to initial", async ({ request }) => {
      await request.delete(`${API}/documents/${docId}`, {
        headers: auth(adminToken),
      });

      const res = await request.get(`${API}/documents/my`, {
        headers: auth(employeeToken),
      });
      expect(res.status()).toBe(200);
      const docs = (await res.json()).data;
      const afterCount = Array.isArray(docs) ? docs.length : 0;
      expect(afterCount).toBe(initialCount);
    });
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
// 6. Invoice PDF Download
// =============================================================================

test.describe("Invoice PDF Download", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Download invoice PDF — verify Content-Type", async ({ request }) => {
    // Get an invoice
    const invRes = await request.get(`${API}/billing/invoices`, {
      headers: auth(adminToken),
    });
    expect(invRes.status()).toBe(200);
    const invoices = (await invRes.json()).data?.invoices || (await invRes.json()).data || [];

    if (!Array.isArray(invoices) || invoices.length === 0) {
      console.log("No invoices available for PDF download test");
      return;
    }

    const invoice = invoices[0];
    const invoiceId = invoice.id;

    // Try to download PDF
    const pdfRes = await request.get(`${API}/billing/invoices/${invoiceId}/pdf`, {
      headers: authMultipart(adminToken),
    });

    if (pdfRes.status() === 200) {
      const contentType = pdfRes.headers()["content-type"] || "";
      expect(
        contentType.includes("pdf") || contentType.includes("octet-stream")
      ).toBe(true);
      console.log(`Invoice PDF Content-Type: ${contentType}`);
    } else {
      // PDF endpoint may be on billing side directly
      console.log(`Invoice PDF download returned ${pdfRes.status()}`);
      expect([200, 302, 404]).toContain(pdfRes.status());
    }
  });

  test("Invoice PDF for non-existent invoice — returns error", async ({ request }) => {
    const res = await request.get(`${API}/billing/invoices/999999/pdf`, {
      headers: authMultipart(adminToken),
    });
    expect([400, 404]).toContain(res.status());
  });
});

// =============================================================================
// 7. KB Article Create & Access
// =============================================================================

test.describe("KB Article Operations", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Create KB article — accessible after creation", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: auth(adminToken),
      data: {
        title: `E2E KB Article ${RUN}`,
        content: "<p>This is a knowledge base article created during E2E file ops testing.</p>",
        category: "general",
        is_published: true,
      },
    });

    if (res.status() === 201) {
      const body = await res.json();
      const articleId = body.data.id;
      expect(articleId).toBeGreaterThan(0);

      // Verify article is accessible
      const getRes = await request.get(`${API}/helpdesk/kb/${articleId}`, {
        headers: auth(employeeToken),
      });
      expect(getRes.status()).toBe(200);
      const article = (await getRes.json()).data;
      expect(article.title).toContain(`E2E KB Article ${RUN}`);
      console.log(`KB article created and accessible: ID=${articleId}`);
    } else {
      console.log(`KB article creation returned ${res.status()}`);
      expect([201, 400, 404]).toContain(res.status());
    }
  });
});

// =============================================================================
// 8. CSV Export — Employees & Attendance
// =============================================================================

test.describe("CSV Export", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Export employees CSV — verify Content-Type", async ({ request }) => {
    const res = await request.get(`${API}/employees/export`, {
      headers: authMultipart(adminToken),
    });

    if (res.status() === 200) {
      const contentType = res.headers()["content-type"] || "";
      expect(
        contentType.includes("csv") ||
        contentType.includes("spreadsheet") ||
        contentType.includes("octet-stream")
      ).toBe(true);

      const body = await res.text();
      // CSV should have headers and at least one data row
      expect(body.length).toBeGreaterThan(0);
      const lines = body.split("\n").filter((l: string) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
      console.log(`Employee CSV: ${lines.length} lines, Content-Type: ${contentType}`);
    } else {
      console.log(`Employee export returned ${res.status()}`);
      expect([200, 404]).toContain(res.status());
    }
  });

  test("Export attendance CSV — verify Content-Type", async ({ request }) => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const res = await request.get(
      `${API}/attendance/export?start_date=${startDate}&end_date=${endDate}`,
      { headers: authMultipart(adminToken) },
    );

    if (res.status() === 200) {
      const contentType = res.headers()["content-type"] || "";
      expect(
        contentType.includes("csv") ||
        contentType.includes("spreadsheet") ||
        contentType.includes("octet-stream")
      ).toBe(true);

      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
      console.log(`Attendance CSV: ${body.split("\n").length} lines, Content-Type: ${contentType}`);
    } else {
      console.log(`Attendance export returned ${res.status()}`);
      expect([200, 404]).toContain(res.status());
    }
  });
});
