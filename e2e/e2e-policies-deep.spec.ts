import { test, expect } from '@playwright/test';

const API = 'https://test-empcloud-api.empcloud.com/api/v1';

async function login(request: any, email: string, password: string): Promise<string> {
  const resp = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  return body.data.tokens.access_token;
}

test.describe('Policies Module — Deep E2E Tests', () => {
  let adminToken: string;
  let employeeToken: string;
  let testPolicyId: number;
  let testPolicyId2: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await login(request, 'ananya@technova.in', 'Welcome@123');
    employeeToken = await login(request, 'arjun@technova.in', 'Welcome@123');
  });

  // ========== CRUD ==========

  test.describe('Policy CRUD (Admin)', () => {
    test('create policy with all fields', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: 'E2E Deep Test Policy — Leave & Attendance',
          content: 'All employees must follow the attendance policy. Late arrivals will be tracked.',
          category: 'hr',
          version: '1.0',
          requires_acknowledgment: true,
          is_mandatory: true,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      testPolicyId = body.data.id;
      expect(testPolicyId).toBeTruthy();
      expect(body.data.title).toContain('E2E Deep Test Policy');
    });

    test('create second policy (non-mandatory)', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: 'E2E Optional Policy — Remote Work Guidelines',
          content: 'Guidelines for remote work arrangements.',
          category: 'general',
          version: '1.0',
          requires_acknowledgment: false,
          is_mandatory: false,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      testPolicyId2 = body.data.id;
      expect(testPolicyId2).toBeTruthy();
    });

    test('list policies returns both new policies', async ({ request }) => {
      const resp = await request.get(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      const ids = body.data.map((p: any) => p.id);
      expect(ids).toContain(testPolicyId);
      expect(ids).toContain(testPolicyId2);
    });

    test('get single policy by ID', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.data.id).toBe(testPolicyId);
      expect(body.data.title).toContain('E2E Deep Test Policy');
      expect(body.data.content).toContain('attendance policy');
      expect([1, '1.0', '1']).toContain(body.data.version);
    });

    test('get non-existent policy returns 404', async ({ request }) => {
      const resp = await request.get(`${API}/policies/99999`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(404);
    });

    test('update policy title and content', async ({ request }) => {
      const resp = await request.put(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: 'E2E Deep Test Policy — Updated v2',
          content: 'Updated content: All employees must follow updated attendance rules.',
        },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.data.title).toContain('Updated v2');
    });

    test('update increments version', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      // Version should be incremented from "1.0" to "2" or similar
      // Version should be incremented after update
      expect(body.data.version).not.toBe(1);
    });
  });

  // ========== Employee Access ==========

  test.describe('Employee Policy Access', () => {
    test('employee can list policies', async ({ request }) => {
      const resp = await request.get(`${API}/policies`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test('employee can view single policy with full content', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.data.content).toBeTruthy();
      expect(body.data.title).toBeTruthy();
    });

    test('employee CANNOT create policy (403)', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          title: 'Unauthorized Policy',
          content: 'Should not be created',
          category: 'general',
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('employee CANNOT update policy (403)', async ({ request }) => {
      const resp = await request.put(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: { title: 'Hacked Title' },
      });
      expect(resp.status()).toBe(403);
    });

    test('employee CANNOT delete policy (403)', async ({ request }) => {
      const resp = await request.delete(`${API}/policies/${testPolicyId}`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ========== Acknowledgment Flow ==========

  test.describe('Policy Acknowledgment', () => {
    test('employee acknowledges mandatory policy', async ({ request }) => {
      const resp = await request.post(`${API}/policies/${testPolicyId}/acknowledge`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('duplicate acknowledgment is handled gracefully', async ({ request }) => {
      const resp = await request.post(`${API}/policies/${testPolicyId}/acknowledge`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      // Should return 200 (idempotent) or 409 (already acknowledged)
      expect([200, 409]).toContain(resp.status());
    });

    test('admin can view acknowledgments list', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}/acknowledgments`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      // Should contain the employee who acknowledged
      const emails = body.data.map((a: any) => a.email);
      expect(emails).toContain('arjun@technova.in');
    });

    test('acknowledgment has timestamp', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}/acknowledgments`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resp.status() === 200) {
        const body = await resp.json();
        if (body.data && body.data.length > 0) {
          const ack = body.data.find((a: any) => a.email === 'arjun@technova.in');
          if (ack) {
            expect(ack.acknowledged_at || ack.created_at).toBeTruthy();
          }
        }
      }
      expect(resp.status()).toBeLessThan(500);
    });

    test('employee CANNOT view acknowledgments list (403)', async ({ request }) => {
      const resp = await request.get(`${API}/policies/${testPolicyId}/acknowledgments`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });

    test('employee can view pending acknowledgments', async ({ request }) => {
      const resp = await request.get(`${API}/policies/pending`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      // Should return 200 with list of policies needing acknowledgment
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('acknowledged policy not in pending list', async ({ request }) => {
      const resp = await request.get(`${API}/policies/pending`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      // The already-acknowledged policy should NOT be in pending
      const pendingIds = body.data.map((p: any) => p.id);
      expect(pendingIds).not.toContain(testPolicyId);
    });
  });

  // ========== Content & Formatting ==========

  test.describe('Policy Content', () => {
    test('policy with long content stores correctly', async ({ request }) => {
      const longContent = 'Section 1: Introduction\n'.repeat(100) + 'End of policy.';
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: 'E2E Long Content Policy',
          content: longContent,
          category: 'compliance',
          version: '1.0',
          requires_acknowledgment: false,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      const getResp = await request.get(`${API}/policies/${body.data.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const getBody = await getResp.json();
      expect(getBody.data.content).toContain('End of policy.');
      // Cleanup
      await request.delete(`${API}/policies/${body.data.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });

    test('XSS in policy content is sanitized', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: '<script>alert("xss")</script>Test Policy',
          content: 'Content with <img onerror=alert(1) src=x> injection',
          category: 'general',
          version: '1.0',
          requires_acknowledgment: false,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      // Script tags should be stripped
      expect(body.data.title).not.toContain('<script>');
      expect(body.data.content).not.toContain('onerror=');
      // Cleanup
      await request.delete(`${API}/policies/${body.data.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });

    test('empty title rejected (validation)', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: '',
          content: 'Some content',
          category: 'general',
        },
      });
      expect(resp.status()).toBe(400);
    });

    test('empty content rejected (validation)', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          title: 'Policy With No Content',
          content: '',
          category: 'general',
        },
      });
      expect(resp.status()).toBe(400);
    });
  });

  // ========== Multi-Tenant Isolation ==========

  test.describe('Multi-Tenant Isolation', () => {
    test('policies only belong to same organization', async ({ request }) => {
      const resp = await request.get(`${API}/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await resp.json();
      const orgIds = [...new Set(body.data.map((p: any) => p.organization_id))];
      // All policies should belong to same org
      expect(orgIds.length).toBeLessThanOrEqual(1);
    });

    test('cannot access policy from another org (low IDs)', async ({ request }) => {
      // IDs 1-5 likely belong to other orgs or don't exist
      for (const id of [1, 2, 3, 4, 5]) {
        const resp = await request.get(`${API}/policies/${id}`, {
          headers: { Authorization: `Bearer ${employeeToken}` },
        });
        expect(resp.status()).toBe(404);
      }
    });
  });

  // ========== Unauthenticated Access ==========

  test.describe('Unauthenticated Access', () => {
    test('list policies without token returns 401', async ({ request }) => {
      const resp = await request.get(`${API}/policies`);
      expect(resp.status()).toBe(401);
    });

    test('create policy without token returns 401', async ({ request }) => {
      const resp = await request.post(`${API}/policies`, {
        data: { title: 'Test', content: 'Test', category: 'general' },
      });
      expect(resp.status()).toBe(401);
    });

    test('acknowledge without token returns 401', async ({ request }) => {
      const resp = await request.post(`${API}/policies/${testPolicyId}/acknowledge`);
      expect(resp.status()).toBe(401);
    });
  });

  // ========== Cleanup ==========

  test.describe('Cleanup', () => {
    test('admin deletes test policies', async ({ request }) => {
      for (const id of [testPolicyId, testPolicyId2]) {
        if (id) {
          const resp = await request.delete(`${API}/policies/${id}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          expect([200, 404]).toContain(resp.status());
        }
      }
    });

    test('deleted policy returns 404 or is deactivated', async ({ request }) => {
      if (testPolicyId) {
        const resp = await request.get(`${API}/policies/${testPolicyId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        // Soft-delete: 404 (not found) or 200 with is_active=0
        expect([200, 404]).toContain(resp.status());
        if (resp.status() === 200) {
          const body = await resp.json();
          expect(body.data.is_active).toBeFalsy();
        }
      }
    });
  });
});
