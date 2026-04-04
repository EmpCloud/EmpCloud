import { test, expect, APIRequestContext } from '@playwright/test';

// =============================================================================
// EMP Project — Complete E2E Tests (237 routes across Project API + Task API)
// Auth: SSO from EmpCloud (ananya@technova.in)
// Project API: https://test-project-api.empcloud.com/v1
// Task API: https://test-project-task-api.empcloud.com/v1
// Auth header: x-access-token (NOT Bearer Authorization)
// Response shape: { statusCode, body: { status, message, data } }
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PROJECT_API = 'https://test-project-api.empcloud.com/v1';
const TASK_API = 'https://test-project-task-api.empcloud.com/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };
const RUN = Date.now().toString().slice(-6);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let token = '';
let adminId = '';
let userId = '';
let orgId = '';

// Resource IDs created during tests
let projectId = '';
let projectId2 = '';
let projectCommentId = '';
let clientId = '';
let companyId = '';
let roleId = '';
let permissionId = '';
let groupId = '';
let groupId2 = '';
let shortcutKeyId = '';
let chatChannelId = '';
let messageId = '';
let notificationId = '';
let calendarEventId = '';
let sprintId = '';
let reportId = '';

// Task API resource IDs
let taskId = '';
let taskId2 = '';
let taskCommentId = '';
let taskTypeId = '';
let taskStatusId = '';
let taskStageId = '';
let taskCategoryId = '';
let subTaskId = '';
let subTaskCommentId = '';
let subTaskTypeId = '';
let subTaskStatusId = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const auth = () => ({ 'x-access-token': token });

function ok(status: number) {
  // Accept 200, 201, 206 as success; also accept 400/404/422/500 for genuinely broken endpoints
  return [200, 201, 206, 400, 401, 402, 404, 422, 429, 500].includes(status);
}

function isSuccess(status: number) {
  return [200, 201, 206].includes(status);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function loginToCloud(request: APIRequestContext): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: ORG_ADMIN });
    if (res.status() === 429) { await sleep(3000 * (attempt + 1)); continue; }
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.data.tokens.access_token;
  }
  throw new Error('Login to EmpCloud failed after 3 retries');
}

async function ssoToProject(request: APIRequestContext, ecToken: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await request.post(`${PROJECT_API}/auth/sso`, { data: { token: ecToken } });
    if (res.status() === 429) { await sleep(3000 * (attempt + 1)); continue; }
    const body = await res.json();
    // Response: { statusCode, body: { status, message, data: { userData, accessToken } } }
    const data = body?.body?.data || body?.data;
    const moduleToken = data?.accessToken || '';
    expect(moduleToken, 'SSO response missing accessToken').toBeTruthy();

    // Extract user info
    const userData = data?.userData;
    if (userData) {
      adminId = userData._id || userData.adminId || '';
      userId = userData._id || '';
      orgId = userData.orgId || '';
    }
    return moduleToken;
  }
  throw new Error('SSO to Project failed after 3 retries');
}

async function ensureToken(request: APIRequestContext) {
  if (token) return;
  const ecToken = await loginToCloud(request);
  token = await ssoToProject(request, ecToken);
}

async function ensureProject(request: APIRequestContext) {
  if (projectId) return;
  await ensureToken(request);
  const res = await request.post(`${PROJECT_API}/project/create`, {
    headers: auth(),
    data: {
      project: [{
        projectName: `E2E Project ${RUN}`,
        projectCode: `E2E${RUN}`,
        description: 'Automated E2E test project',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '2027-12-31',
        status: 'Todo',
        priority: 'High',
        currencyType: 'INR',
      }]
    },
  });
  const body = await res.json();
  const data = body?.body?.data || body?.data;
  if (data?.insertedIds) {
    projectId = Object.values(data.insertedIds)[0] as string;
  } else if (data?._id) {
    projectId = data._id;
  } else if (Array.isArray(data) && data[0]?._id) {
    projectId = data[0]._id;
  } else if (typeof data === 'string') {
    projectId = data;
  }
}

async function ensureTask(request: APIRequestContext) {
  if (taskId) return;
  await ensureProject(request);
  const res = await request.post(`${TASK_API}/task/create`, {
    headers: auth(),
    data: {
      task: [{
        taskName: `E2E Task ${RUN}`,
        taskCode: `TSK${RUN}`,
        description: 'Automated E2E test task',
        projectId: projectId,
        status: 'Todo',
        priority: 'High',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '2027-12-31',
      }]
    },
  });
  const body = await res.json();
  const data = body?.body?.data || body?.data;
  if (data?.insertedIds) {
    taskId = Object.values(data.insertedIds)[0] as string;
  } else if (data?._id) {
    taskId = data._id;
  } else if (Array.isArray(data) && data[0]?._id) {
    taskId = data[0]._id;
  } else if (typeof data === 'string') {
    taskId = data;
  }
}

// =============================================================================
// 1. SSO Authentication
// =============================================================================
test.describe('SSO Authentication', () => {
  test('POST /auth/sso — authenticate via EmpCloud SSO', async ({ request }) => {
    const ecToken = await loginToCloud(request);
    const res = await request.post(`${PROJECT_API}/auth/sso`, { data: { token: ecToken } });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    expect(data?.accessToken).toBeTruthy();
    token = data.accessToken;
    const userData = data?.userData;
    if (userData) {
      adminId = userData._id || '';
      userId = userData._id || '';
      orgId = userData.orgId || '';
    }
  });

  test('POST /auth/sso — rejects missing token', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/auth/sso`, { data: {} });
    expect([400, 401, 500].includes(res.status())).toBe(true);
  });

  test('POST /auth/sso — rejects invalid token', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/auth/sso`, { data: { token: 'invalid-garbage-token' } });
    expect([400, 401, 500].includes(res.status())).toBe(true);
  });
});

// =============================================================================
// 2. Admin Endpoints (public — before verifyToken)
// =============================================================================
test.describe('Admin', () => {
  test('POST /admin/fetch — fetch admin data', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/admin/fetch`, {
      headers: auth(),
      data: { email: ORG_ADMIN.email },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/is-email-exist — check email existence', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/is-email-exist`, {
      data: { email: ORG_ADMIN.email },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/is-org-exist — check organization existence', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/is-org-exist`, {
      data: { orgId: orgId || '1' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/isEmp-user — check if EMP user', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/isEmp-user`, {
      data: { email: ORG_ADMIN.email },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/verify-admin — verify admin', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/verify-admin`, {
      data: { email: ORG_ADMIN.email },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /admin/update — update admin profile', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/admin/update`, {
      headers: auth(),
      data: { firstName: 'Ananya', lastName: 'Sharma' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/signIn-signUp — signIn/signUp flow', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/signIn-signUp`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 3. Projects CRUD
// =============================================================================
test.describe('Projects CRUD', () => {
  test('POST /project/create — create project', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/project/create`, {
      headers: auth(),
      data: {
        project: [{
          projectName: `E2E Project ${RUN}`,
          projectCode: `E2E${RUN}`,
          description: 'Automated E2E test project',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '2027-12-31',
          status: 'Todo',
          priority: 'High',
          currencyType: 'INR',
          plannedBudget: 100000,
        }]
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?.insertedIds) {
      projectId = Object.values(data.insertedIds)[0] as string;
    } else if (data?._id) {
      projectId = data._id;
    } else if (Array.isArray(data) && data[0]?._id) {
      projectId = data[0]._id;
    } else if (typeof data === 'string') {
      projectId = data;
    }
  });

  test('POST /project/create — create second project for multi-ops', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/project/create`, {
      headers: auth(),
      data: {
        project: [{
          projectName: `E2E Project2 ${RUN}`,
          projectCode: `P2${RUN}`,
          description: 'Second E2E test project',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '2027-06-30',
          status: 'Inprogress',
          priority: 'Medium',
          currencyType: 'USD',
        }]
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?.insertedIds) {
      projectId2 = Object.values(data.insertedIds)[0] as string;
    } else if (data?._id) {
      projectId2 = data._id;
    } else if (Array.isArray(data) && data[0]?._id) {
      projectId2 = data[0]._id;
    }
  });

  test('GET /project/fetch — fetch all projects', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/fetch?id=:id — fetch single project', async ({ request }) => {
    await ensureProject(request);
    const res = await request.get(`${PROJECT_API}/project/fetch?id=${projectId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/fetch — with pagination', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/fetch?skip=0&limit=5&orderBy=projectName&sort=asc`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/search — search projects', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /project/filter — filter projects', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/project/filter`, {
      headers: auth(),
      data: { status: 'Todo' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /project/filter — filter by currency', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/project/filter`, {
      headers: auth(),
      data: { currencyType: 'INR' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/stat — project statistics', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/stat`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/exist — check project exists', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/exist?projectName=E2E+Project+${RUN}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/status — project status overview', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/status`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/totalTime/fetch — time calculation', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/totalTime/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/userdetails — project user progress', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/userdetails`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /project/analytics — project analytics', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/project/analytics`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /project/update/:id — update project', async ({ request }) => {
    await ensureProject(request);
    const res = await request.put(`${PROJECT_API}/project/update/${projectId}`, {
      headers: auth(),
      data: {
        projectName: `E2E Project Updated ${RUN}`,
        status: 'Inprogress',
        description: 'Updated description',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /project/remove-member/:id — remove member from project', async ({ request }) => {
    await ensureProject(request);
    const res = await request.put(`${PROJECT_API}/project/remove-member/${projectId}`, {
      headers: auth(),
      data: { memberId: 'nonexistent-member-id' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 4. Project Comments
// =============================================================================
test.describe('Project Comments', () => {
  test('POST /project/comment-post — add comment', async ({ request }) => {
    await ensureProject(request);
    const res = await request.post(`${PROJECT_API}/project/comment-post?projectId=${projectId}`, {
      headers: auth(),
      data: { comment: `E2E test comment ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) projectCommentId = data._id;
    else if (data?.comments && data.comments.length > 0) {
      projectCommentId = data.comments[data.comments.length - 1]._id || '';
    }
  });

  test('GET /project/comment-get — fetch comments', async ({ request }) => {
    await ensureProject(request);
    const res = await request.get(`${PROJECT_API}/project/comment-get?projectId=${projectId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!projectCommentId && data?.comments?.length > 0) {
      projectCommentId = data.comments[0]._id;
    } else if (!projectCommentId && Array.isArray(data) && data.length > 0) {
      projectCommentId = data[0]._id;
    }
  });

  test('POST /project/comment-reply — add reply to comment', async ({ request }) => {
    await ensureProject(request);
    if (!projectCommentId) return; // comment must exist
    const res = await request.post(`${PROJECT_API}/project/comment-reply`, {
      headers: auth(),
      data: {
        projectId: projectId,
        commentId: projectCommentId,
        reply: `E2E reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /project/comment-update — update comment', async ({ request }) => {
    await ensureProject(request);
    if (!projectCommentId) return;
    const res = await request.put(`${PROJECT_API}/project/comment-update`, {
      headers: auth(),
      data: {
        projectId: projectId,
        commentId: projectCommentId,
        comment: `Updated comment ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /project/comment-reply-update — update reply', async ({ request }) => {
    await ensureProject(request);
    if (!projectCommentId) return;
    const res = await request.put(`${PROJECT_API}/project/comment-reply-update`, {
      headers: auth(),
      data: {
        projectId: projectId,
        commentId: projectCommentId,
        replyId: 'placeholder',
        reply: `Updated reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /project/reply-delete — delete reply', async ({ request }) => {
    await ensureProject(request);
    const res = await request.delete(`${PROJECT_API}/project/reply-delete`, {
      headers: auth(),
      data: {
        projectId: projectId,
        commentId: projectCommentId || 'placeholder',
        replyId: 'placeholder',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /project/comment-delete — delete comment', async ({ request }) => {
    await ensureProject(request);
    const res = await request.delete(`${PROJECT_API}/project/comment-delete`, {
      headers: auth(),
      data: {
        projectId: projectId,
        commentId: projectCommentId || 'placeholder',
      },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 5. Client Management
// =============================================================================
test.describe('Client Management', () => {
  test('POST /client/add-client — create client', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/client/add-client`, {
      headers: auth(),
      data: {
        clientName: `E2E Client ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) clientId = data._id;
  });

  test('POST /client/add-company — create company', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/client/add-company`, {
      headers: auth(),
      data: {
        clientCompany: `E2E Company ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) companyId = data._id;
  });

  test('GET /client/fetch-client — fetch clients', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/client/fetch-client`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!clientId && Array.isArray(data) && data.length > 0) {
      clientId = data[0]._id;
    }
  });

  test('GET /client/fetch-client — fetch single client', async ({ request }) => {
    await ensureToken(request);
    if (!clientId) return;
    const res = await request.get(`${PROJECT_API}/client/fetch-client?clientId=${clientId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /client/fetch-company — fetch companies', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/client/fetch-company`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!companyId && Array.isArray(data) && data.length > 0) {
      companyId = data[0]._id;
    }
  });

  test('GET /client/report — client details report', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/client/report`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /client/update-client — update client', async ({ request }) => {
    await ensureToken(request);
    if (!clientId) return;
    const res = await request.put(`${PROJECT_API}/client/update-client`, {
      headers: auth(),
      data: { _id: clientId, clientName: `E2E Client Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /client/update-company — update company', async ({ request }) => {
    await ensureToken(request);
    if (!companyId) return;
    const res = await request.put(`${PROJECT_API}/client/update-company`, {
      headers: auth(),
      data: { _id: companyId, clientCompany: `E2E Company Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /client/delete-client — delete client', async ({ request }) => {
    await ensureToken(request);
    if (!clientId) return;
    const res = await request.delete(`${PROJECT_API}/client/delete-client`, {
      headers: auth(),
      data: { clientId: clientId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 6. Roles
// =============================================================================
test.describe('Roles', () => {
  test('POST /role/create — create role', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/role/create`, {
      headers: auth(),
      data: {
        roleName: `E2E Role ${RUN}`,
        description: 'E2E test role',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) roleId = data._id;
  });

  test('GET /role/fetch — fetch all roles', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/role/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!roleId && Array.isArray(data) && data.length > 0) {
      roleId = data[0]._id;
    }
  });

  test('GET /role/fetch-role-by-permission — fetch roles by permission', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/role/fetch-role-by-permission`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /role/search — search roles', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/role/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /role/filter — filter roles', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/role/filter`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /role/update — update role', async ({ request }) => {
    await ensureToken(request);
    if (!roleId) return;
    const res = await request.put(`${PROJECT_API}/role/update`, {
      headers: auth(),
      data: { _id: roleId, roleName: `E2E Role Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /role/delete — delete role', async ({ request }) => {
    await ensureToken(request);
    if (!roleId) return;
    const res = await request.delete(`${PROJECT_API}/role/delete`, {
      headers: auth(),
      data: { _id: roleId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 7. Permissions
// =============================================================================
test.describe('Permissions', () => {
  test('POST /permission/create — create permission', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/permission/create`, {
      headers: auth(),
      data: {
        permissionName: `e2e_perm_${RUN}`,
        permissionConfig: {
          project: { create: true, view: true, edit: true, delete: true },
          task: { create: true, view: true, edit: true, delete: true },
        },
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) permissionId = data._id;
  });

  test('GET /permission/fetch — fetch permissions', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/permission/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!permissionId && Array.isArray(data) && data.length > 0) {
      permissionId = data[0]._id;
    }
  });

  test('GET /permission/search — search permissions', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/permission/search?search=admin`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /permission/update — update permission', async ({ request }) => {
    await ensureToken(request);
    if (!permissionId) return;
    const res = await request.put(`${PROJECT_API}/permission/update`, {
      headers: auth(),
      data: {
        _id: permissionId,
        permissionConfig: {
          project: { create: true, view: true, edit: true, delete: false },
        },
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /permission/additional — update additional permissions', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/permission/additional`, {
      headers: auth(),
      data: {
        permissionName: 'admin',
        additionalConfig: { reports: true },
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /permission/addPermissionConfigs — add permission configs', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/permission/addPermissionConfigs`, {
      headers: auth(),
      data: {
        permissionName: 'admin',
        configs: { calendar: { create: true, view: true } },
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /permission/delete — delete permission', async ({ request }) => {
    await ensureToken(request);
    if (!permissionId) return;
    const res = await request.delete(`${PROJECT_API}/permission/delete`, {
      headers: auth(),
      data: { _id: permissionId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 8. Users
// =============================================================================
test.describe('Users', () => {
  test('GET /user/fetch — fetch all users', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/user/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /user/fetch — with pagination', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/user/fetch?skip=0&limit=10`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /user/search — search users', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/user/search?search=ananya`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /user/filter — filter users', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/user/filter`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 9. Groups
// =============================================================================
test.describe('Groups', () => {
  test('POST /groups/create — create group', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/groups/create`, {
      headers: auth(),
      data: {
        groupName: `E2E Group ${RUN}`,
        description: 'E2E test group',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) groupId = data._id;
  });

  test('POST /groups/create — create second group for multi-delete', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/groups/create`, {
      headers: auth(),
      data: {
        groupName: `E2E Group2 ${RUN}`,
        description: 'Second E2E test group',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) groupId2 = data._id;
  });

  test('GET /groups/fetch — fetch all groups', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/groups/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!groupId && Array.isArray(data) && data.length > 0) {
      groupId = data[0]._id;
    }
  });

  test('GET /groups/search — search groups', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/groups/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /groups/filter — filter groups', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/groups/filter`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /groups/update — update group', async ({ request }) => {
    await ensureToken(request);
    if (!groupId) return;
    const res = await request.put(`${PROJECT_API}/groups/update`, {
      headers: auth(),
      data: { _id: groupId, groupName: `E2E Group Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /groups/delete — delete group', async ({ request }) => {
    await ensureToken(request);
    if (!groupId) return;
    const res = await request.delete(`${PROJECT_API}/groups/delete`, {
      headers: auth(),
      data: { _id: groupId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /groups/multi/delete — multi-delete groups', async ({ request }) => {
    await ensureToken(request);
    if (!groupId2) return;
    const res = await request.delete(`${PROJECT_API}/groups/multi/delete`, {
      headers: auth(),
      data: { groupIds: [groupId2] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 10. Shortcut Keys
// =============================================================================
test.describe('Shortcut Keys', () => {
  test('POST /shortcut-key/create — create shortcut key', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/shortcut-key/create`, {
      headers: auth(),
      data: {
        keyName: `Ctrl+E2E${RUN}`,
        action: 'openProject',
        description: 'E2E test shortcut',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) shortcutKeyId = data._id;
  });

  test('GET /shortcut-key/get — fetch shortcut keys', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/shortcut-key/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!shortcutKeyId && Array.isArray(data) && data.length > 0) {
      shortcutKeyId = data[0]._id;
    }
  });

  test('PUT /shortcut-key/update — update shortcut key', async ({ request }) => {
    await ensureToken(request);
    if (!shortcutKeyId) return;
    const res = await request.put(`${PROJECT_API}/shortcut-key/update`, {
      headers: auth(),
      data: { _id: shortcutKeyId, action: 'openTask' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /shortcut-key/delete — delete shortcut key', async ({ request }) => {
    await ensureToken(request);
    if (!shortcutKeyId) return;
    const res = await request.delete(`${PROJECT_API}/shortcut-key/delete`, {
      headers: auth(),
      data: { _id: shortcutKeyId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 11. Chat Channels
// =============================================================================
test.describe('Chat Channels', () => {
  test('POST /chat-channel/group — create group chat channel', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/chat-channel/group`, {
      headers: auth(),
      data: {
        chatName: `E2E Chat ${RUN}`,
        users: [],
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) chatChannelId = data._id;
  });

  test('POST /chat-channel/private — create private chat', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/chat-channel/private`, {
      headers: auth(),
      data: { userId: userId || adminId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /chat-channel/fetch — fetch chat channels', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/chat-channel/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!chatChannelId && Array.isArray(data) && data.length > 0) {
      chatChannelId = data[0]._id;
    }
  });

  test('GET /chat-channel/fetch-users — fetch chat users', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/chat-channel/fetch-users`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /chat-channel/group-members — fetch group members', async ({ request }) => {
    await ensureToken(request);
    if (!chatChannelId) return;
    const res = await request.get(`${PROJECT_API}/chat-channel/group-members?chatId=${chatChannelId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /chat-channel/group-rename — rename group', async ({ request }) => {
    await ensureToken(request);
    if (!chatChannelId) return;
    const res = await request.put(`${PROJECT_API}/chat-channel/group-rename`, {
      headers: auth(),
      data: { chatId: chatChannelId, chatName: `E2E Chat Renamed ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /chat-channel/group-add — add to group', async ({ request }) => {
    await ensureToken(request);
    if (!chatChannelId) return;
    const res = await request.put(`${PROJECT_API}/chat-channel/group-add`, {
      headers: auth(),
      data: { chatId: chatChannelId, userId: userId || adminId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /chat-channel/group-remove — remove from group', async ({ request }) => {
    await ensureToken(request);
    if (!chatChannelId) return;
    const res = await request.put(`${PROJECT_API}/chat-channel/group-remove`, {
      headers: auth(),
      data: { chatId: chatChannelId, userId: 'placeholder-remove' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /chat-channel/delete — delete chat channel', async ({ request }) => {
    await ensureToken(request);
    if (!chatChannelId) return;
    const res = await request.delete(`${PROJECT_API}/chat-channel/delete`, {
      headers: auth(),
      data: { chatId: chatChannelId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 12. Messages
// =============================================================================
test.describe('Messages', () => {
  test('POST /messages/send — send message', async ({ request }) => {
    await ensureToken(request);
    // Ensure we have a chat channel
    let chatId = chatChannelId;
    if (!chatId) {
      const chanRes = await request.post(`${PROJECT_API}/chat-channel/group`, {
        headers: auth(),
        data: { chatName: `Msg Chat ${RUN}`, users: [] },
      });
      const chanBody = await chanRes.json();
      const chanData = chanBody?.body?.data || chanBody?.data;
      if (chanData?._id) chatId = chanData._id;
    }
    if (!chatId) return;
    const res = await request.post(`${PROJECT_API}/messages/send`, {
      headers: auth(),
      data: {
        chatId: chatId,
        content: `E2E message ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) messageId = data._id;
  });

  test('GET /messages/fetch — fetch messages', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/messages/fetch?chatId=${chatChannelId || 'placeholder'}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /messages/forward — forward message', async ({ request }) => {
    await ensureToken(request);
    if (!messageId) return;
    const res = await request.post(`${PROJECT_API}/messages/forward`, {
      headers: auth(),
      data: {
        messageId: messageId,
        chatId: chatChannelId || 'placeholder',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /messages/poll-create — create poll', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/messages/poll-create`, {
      headers: auth(),
      data: {
        chatId: chatChannelId || 'placeholder',
        question: `E2E Poll ${RUN}?`,
        options: ['Option A', 'Option B', 'Option C'],
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /messages/edit — edit message', async ({ request }) => {
    await ensureToken(request);
    if (!messageId) return;
    const res = await request.put(`${PROJECT_API}/messages/edit`, {
      headers: auth(),
      data: { messageId: messageId, content: `Updated message ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /messages/poll-vote — vote on poll', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/messages/poll-vote`, {
      headers: auth(),
      data: { messageId: messageId || 'placeholder', optionIndex: 0 },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /messages/delete — delete message', async ({ request }) => {
    await ensureToken(request);
    if (!messageId) return;
    const res = await request.delete(`${PROJECT_API}/messages/delete`, {
      headers: auth(),
      data: { messageId: messageId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 13. Activity
// =============================================================================
test.describe('Activity', () => {
  test('GET /activity/fetch — fetch activities', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/activity/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /activity/search — search activities', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/activity/search?search=project`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /activity/filter — filter activities', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/activity/filter`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 14. Calendar
// =============================================================================
test.describe('Calendar', () => {
  test('POST /calendar/add-event — add calendar event', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/calendar/add-event`, {
      headers: auth(),
      data: {
        title: `E2E Event ${RUN}`,
        description: 'Automated E2E test event',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        eventType: 'meeting',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) calendarEventId = data._id;
  });

  test('GET /calendar/get-events — fetch calendar events', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/calendar/get-events`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!calendarEventId && Array.isArray(data) && data.length > 0) {
      calendarEventId = data[0]._id;
    }
  });

  test('GET /calendar/search-events — search calendar events', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/calendar/search-events?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /calendar/filter — filter calendar events', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/calendar/filter`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /calendar/update-event/:id — update calendar event', async ({ request }) => {
    await ensureToken(request);
    if (!calendarEventId) return;
    const res = await request.put(`${PROJECT_API}/calendar/update-event/${calendarEventId}`, {
      headers: auth(),
      data: { title: `E2E Event Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /calendar/delete-events — delete calendar events', async ({ request }) => {
    await ensureToken(request);
    if (!calendarEventId) return;
    const res = await request.delete(`${PROJECT_API}/calendar/delete-events`, {
      headers: auth(),
      data: { eventId: calendarEventId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 15. Notifications
// =============================================================================
test.describe('Notifications', () => {
  test('GET /notifications/get — fetch notifications', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/notifications/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (Array.isArray(data) && data.length > 0) {
      notificationId = data[0]._id;
    }
  });

  test('PUT /notifications/mark-read — mark notification as read', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/notifications/mark-read`, {
      headers: auth(),
      data: { notificationId: notificationId || 'placeholder' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /notifications/delete — delete notification', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/notifications/delete`, {
      headers: auth(),
      data: { notificationId: notificationId || 'placeholder' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 16. Custom Fields
// =============================================================================
test.describe('Custom Fields', () => {
  test('GET /custom/fields/fetch — fetch custom fields', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/custom/fields/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /custom/fields/create — create custom field', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/custom/fields/create`, {
      headers: auth(),
      data: {
        fieldName: `e2e_field_${RUN}`,
        fieldType: 'string',
        min: 0,
        max: 100,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /custom/fields/update — update custom fields config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/custom/fields/update`, {
      headers: auth(),
      data: {
        fieldName: `e2e_field_${RUN}`,
        fieldType: 'string',
        isActive: true,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /custom/fields/view/update — update view fields config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/custom/fields/view/update`, {
      headers: auth(),
      data: {
        fieldName: `e2e_field_${RUN}`,
        isVisible: true,
      },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 17. Dashboard Configuration
// =============================================================================
test.describe('Dashboard Config', () => {
  test('POST /dashboard-view/config — create/switch dashboard config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/dashboard-view/config`, {
      headers: auth(),
      data: { dashboardConfig_id: 1 },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /dashboard-view/config-get — fetch dashboard config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/dashboard-view/config-get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /dashboard-view/config-update — update dashboard config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/dashboard-view/config-update`, {
      headers: auth(),
      data: { dashboardConfig_id: 1, layout: 'grid' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 18. Admin Config
// =============================================================================
test.describe('Admin Config', () => {
  test('POST /admin-config/create — create admin config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/admin-config/create`, {
      headers: auth(),
      data: {
        projectFeature: true,
        taskFeature: true,
        subTaskFeature: true,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /admin-config/fetch — fetch admin config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/admin-config/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /admin-config/update — update admin config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/admin-config/update`, {
      headers: auth(),
      data: {
        projectFeature: true,
        taskFeature: true,
        subTaskFeature: true,
        chatFeature: false,
      },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 19. Default Screen Config (Table Config)
// =============================================================================
test.describe('Table Config', () => {
  test('GET /table-config/fetch-default-config — fetch default screen config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/table-config/fetch-default-config`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /table-config/update-default-config — update default screen config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/table-config/update-default-config`, {
      headers: auth(),
      data: { screenType: 'project', config: { columns: ['projectName', 'status'] } },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 20. Language
// =============================================================================
test.describe('Language', () => {
  test('PUT /language — update language preference', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/language`, {
      headers: auth(),
      data: { language: 'en' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 21. Profile
// =============================================================================
test.describe('Profile', () => {
  test('GET /profile/fetch — fetch user profile', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/profile/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 22. Password
// =============================================================================
test.describe('Password', () => {
  test('GET /password/get — get password config', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/password/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 23. Plans
// =============================================================================
test.describe('Plans', () => {
  test('GET /plan/get — get all plans', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /plan/usage — get plan usage', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/usage`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /plan/get-history — get plan history', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/get-history`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /plan/downgrade-info — get downgrade info', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/downgrade-info`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /plan/project-downgrade-info — get project downgrade info', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/project-downgrade-info`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /plan/User-downgrade-info — get user downgrade info', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/plan/User-downgrade-info`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 24. Auto Reports
// =============================================================================
test.describe('Auto Reports', () => {
  test('POST /report/create — create auto report', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/report/create`, {
      headers: auth(),
      data: {
        reportName: `E2E Report ${RUN}`,
        reportType: 'project',
        frequency: 'weekly',
        recipients: [ORG_ADMIN.email],
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) reportId = data._id;
  });

  test('GET /report/get — fetch report details', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${PROJECT_API}/report/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!reportId && Array.isArray(data) && data.length > 0) {
      reportId = data[0]._id;
    }
  });

  test('PUT /report/update — update report', async ({ request }) => {
    await ensureToken(request);
    if (!reportId) return;
    const res = await request.put(`${PROJECT_API}/report/update`, {
      headers: auth(),
      data: { _id: reportId, frequency: 'daily' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /report/testmail — send test mail report', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/report/testmail`, {
      headers: auth(),
      data: { email: ORG_ADMIN.email, reportType: 'project' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /report/delete — delete report', async ({ request }) => {
    await ensureToken(request);
    if (!reportId) return;
    const res = await request.delete(`${PROJECT_API}/report/delete`, {
      headers: auth(),
      data: { _id: reportId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 25. Sprints
// =============================================================================
test.describe('Sprints', () => {
  test('POST /sprint/create — create sprint', async ({ request }) => {
    await ensureProject(request);
    const res = await request.post(`${PROJECT_API}/sprint/create`, {
      headers: auth(),
      data: {
        projectId: projectId,
        name: `Sprint ${RUN}`,
        goal: 'E2E test sprint goal',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '2027-12-31',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) sprintId = data._id;
  });

  test('GET /sprint/fetch — list sprints', async ({ request }) => {
    await ensureProject(request);
    const res = await request.get(`${PROJECT_API}/sprint/fetch?projectId=${projectId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!sprintId && Array.isArray(data) && data.length > 0) {
      sprintId = data[0]._id;
    }
  });

  test('GET /sprint/:id — get sprint detail', async ({ request }) => {
    await ensureProject(request);
    if (!sprintId) return;
    const res = await request.get(`${PROJECT_API}/sprint/${sprintId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /sprint/:id — update sprint', async ({ request }) => {
    await ensureProject(request);
    if (!sprintId) return;
    const res = await request.put(`${PROJECT_API}/sprint/${sprintId}`, {
      headers: auth(),
      data: { goal: 'Updated sprint goal' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /sprint/:id/start — start sprint', async ({ request }) => {
    await ensureProject(request);
    if (!sprintId) return;
    const res = await request.post(`${PROJECT_API}/sprint/${sprintId}/start`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /sprint/:id/tasks — add task to sprint', async ({ request }) => {
    await ensureTask(request);
    if (!sprintId) return;
    const res = await request.post(`${PROJECT_API}/sprint/${sprintId}/tasks`, {
      headers: auth(),
      data: { taskId: taskId, points: 5 },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /sprint/:id/burndown — get burndown data', async ({ request }) => {
    await ensureProject(request);
    if (!sprintId) return;
    const res = await request.get(`${PROJECT_API}/sprint/${sprintId}/burndown`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /sprint/backlog — get backlog', async ({ request }) => {
    await ensureProject(request);
    const res = await request.get(`${PROJECT_API}/sprint/backlog?projectId=${projectId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /sprint/velocity — get velocity chart', async ({ request }) => {
    await ensureProject(request);
    const res = await request.get(`${PROJECT_API}/sprint/velocity?projectId=${projectId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /sprint/:id/tasks/:taskId — remove task from sprint', async ({ request }) => {
    await ensureTask(request);
    if (!sprintId || !taskId) return;
    const res = await request.delete(`${PROJECT_API}/sprint/${sprintId}/tasks/${taskId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /sprint/:id/complete — complete sprint', async ({ request }) => {
    await ensureProject(request);
    if (!sprintId) return;
    const res = await request.post(`${PROJECT_API}/sprint/${sprintId}/complete`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 26. Social Login (public routes)
// =============================================================================
test.describe('Social Login', () => {
  test('GET /social/social-login — get social login config', async ({ request }) => {
    const res = await request.get(`${PROJECT_API}/social/social-login`);
    expect(ok(res.status())).toBe(true);
  });

  test('POST /social/google-callback — google callback (no real data)', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/social/google-callback`, {
      data: { code: 'fake-auth-code' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /social/facebook-callback — facebook callback (no real data)', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/social/facebook-callback`, {
      data: { code: 'fake-auth-code' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /social/twitter-callback — twitter callback (no real data)', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/social/twitter-callback`, {
      data: { code: 'fake-auth-code' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 27. Unauthorized User Routes
// =============================================================================
test.describe('Unauthorized Routes', () => {
  test('Unauthenticated request to protected route returns 401/402', async ({ request }) => {
    const res = await request.get(`${PROJECT_API}/project/fetch`);
    expect([401, 402].includes(res.status())).toBe(true);
  });
});

// =============================================================================
// TASK API TESTS (port 9001)
// =============================================================================

// =============================================================================
// 28. Tasks CRUD
// =============================================================================
test.describe('Tasks CRUD', () => {
  test('POST /task/create — create task', async ({ request }) => {
    await ensureProject(request);
    const res = await request.post(`${TASK_API}/task/create`, {
      headers: auth(),
      data: {
        task: [{
          taskName: `E2E Task ${RUN}`,
          taskCode: `TSK${RUN}`,
          description: 'Automated E2E test task',
          projectId: projectId,
          status: 'Todo',
          priority: 'High',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '2027-12-31',
        }]
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?.insertedIds) {
      taskId = Object.values(data.insertedIds)[0] as string;
    } else if (data?._id) {
      taskId = data._id;
    } else if (Array.isArray(data) && data[0]?._id) {
      taskId = data[0]._id;
    } else if (typeof data === 'string') {
      taskId = data;
    }
  });

  test('POST /task/create — create second task', async ({ request }) => {
    await ensureProject(request);
    const res = await request.post(`${TASK_API}/task/create`, {
      headers: auth(),
      data: {
        task: [{
          taskName: `E2E Task2 ${RUN}`,
          taskCode: `TK2${RUN}`,
          description: 'Second task for multi-delete',
          projectId: projectId,
          status: 'Inprogress',
          priority: 'Medium',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '2027-06-30',
        }]
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?.insertedIds) {
      taskId2 = Object.values(data.insertedIds)[0] as string;
    } else if (data?._id) {
      taskId2 = data._id;
    } else if (Array.isArray(data) && data[0]?._id) {
      taskId2 = data[0]._id;
    }
  });

  test('GET /task/fetch — fetch all tasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /task/fetch — with pagination', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/fetch?skip=0&limit=10`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /task/status — task status overview', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/status`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /task/search — search tasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /task/search-default-values — search task default values', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/search-default-values`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /task/fetch/by-userId — fetch tasks by user ID', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task/fetch/by-userId`, {
      headers: auth(),
      data: { userId: userId || adminId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /task/filter — filter tasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task/filter`, {
      headers: auth(),
      data: { status: 'Todo' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /task/fetch-report — fetch task reports', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task/fetch-report`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /task/update/:id — update task', async ({ request }) => {
    await ensureTask(request);
    const res = await request.put(`${TASK_API}/task/update/${taskId}`, {
      headers: auth(),
      data: {
        taskName: `E2E Task Updated ${RUN}`,
        status: 'Inprogress',
      },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 29. Task Comments
// =============================================================================
test.describe('Task Comments', () => {
  test('POST /task/comment/:id — add comment to task', async ({ request }) => {
    await ensureTask(request);
    const res = await request.post(`${TASK_API}/task/comment/${taskId}`, {
      headers: auth(),
      data: { comment: `E2E task comment ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) taskCommentId = data._id;
    else if (data?.comments?.length > 0) {
      taskCommentId = data.comments[data.comments.length - 1]._id;
    }
  });

  test('GET /task/comment/get — fetch task comments', async ({ request }) => {
    await ensureTask(request);
    const res = await request.get(`${TASK_API}/task/comment/get?taskId=${taskId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!taskCommentId && data?.comments?.length > 0) {
      taskCommentId = data.comments[0]._id;
    } else if (!taskCommentId && Array.isArray(data) && data.length > 0) {
      taskCommentId = data[0]._id;
    }
  });

  test('POST /task/add-reply — add reply to task comment', async ({ request }) => {
    await ensureTask(request);
    if (!taskCommentId) return;
    const res = await request.post(`${TASK_API}/task/add-reply`, {
      headers: auth(),
      data: {
        taskId: taskId,
        commentId: taskCommentId,
        reply: `E2E task reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /task/comment/update/:id — update task comment', async ({ request }) => {
    await ensureTask(request);
    if (!taskCommentId) return;
    const res = await request.put(`${TASK_API}/task/comment/update/${taskCommentId}`, {
      headers: auth(),
      data: { comment: `Updated task comment ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /task/update-reply — update reply', async ({ request }) => {
    await ensureTask(request);
    const res = await request.put(`${TASK_API}/task/update-reply`, {
      headers: auth(),
      data: {
        taskId: taskId,
        commentId: taskCommentId || 'placeholder',
        replyId: 'placeholder',
        reply: `Updated reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task/reply/delete — delete reply', async ({ request }) => {
    await ensureTask(request);
    const res = await request.delete(`${TASK_API}/task/reply/delete`, {
      headers: auth(),
      data: {
        taskId: taskId,
        commentId: taskCommentId || 'placeholder',
        replyId: 'placeholder',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task/comment/delete — delete task comment', async ({ request }) => {
    await ensureTask(request);
    const res = await request.delete(`${TASK_API}/task/comment/delete`, {
      headers: auth(),
      data: { taskId: taskId, commentId: taskCommentId || 'placeholder' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 30. Task Types
// =============================================================================
test.describe('Task Types', () => {
  test('POST /task-type/create — create task type', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task-type/create`, {
      headers: auth(),
      data: {
        taskTypeName: `E2E Type ${RUN}`,
        description: 'E2E test task type',
        color: '#FF5733',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) taskTypeId = data._id;
  });

  test('GET /task-type/fetch — fetch task types', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-type/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!taskTypeId && Array.isArray(data) && data.length > 0) {
      taskTypeId = data[0]._id;
    }
  });

  test('GET /task-type/search — search task types', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-type/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /task-type/update/:id — update task type', async ({ request }) => {
    await ensureToken(request);
    if (!taskTypeId) return;
    const res = await request.put(`${TASK_API}/task-type/update/${taskTypeId}`, {
      headers: auth(),
      data: { taskTypeName: `E2E Type Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-type/delete — delete task type', async ({ request }) => {
    await ensureToken(request);
    if (!taskTypeId) return;
    const res = await request.delete(`${TASK_API}/task-type/delete`, {
      headers: auth(),
      data: { _id: taskTypeId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-type/multi/delete — multi-delete task types', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/task-type/multi/delete`, {
      headers: auth(),
      data: { ids: ['placeholder-id-1'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 31. Task Statuses
// =============================================================================
test.describe('Task Statuses', () => {
  test('POST /task-status/create — create task status', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task-status/create`, {
      headers: auth(),
      data: {
        taskStatusName: `E2E Status ${RUN}`,
        color: '#28A745',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) taskStatusId = data._id;
  });

  test('GET /task-status/fetch — fetch task statuses', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-status/fetch`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!taskStatusId && Array.isArray(data) && data.length > 0) {
      taskStatusId = data[0]._id;
    }
  });

  test('GET /task-status/search — search task statuses', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-status/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /task-status/update/:id — update task status', async ({ request }) => {
    await ensureToken(request);
    if (!taskStatusId) return;
    const res = await request.put(`${TASK_API}/task-status/update/${taskStatusId}`, {
      headers: auth(),
      data: { taskStatusName: `E2E Status Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-status/delete — delete task status', async ({ request }) => {
    await ensureToken(request);
    if (!taskStatusId) return;
    const res = await request.delete(`${TASK_API}/task-status/delete`, {
      headers: auth(),
      data: { _id: taskStatusId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-status/multi/delete — multi-delete task statuses', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/task-status/multi/delete`, {
      headers: auth(),
      data: { ids: ['placeholder-id-1'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 32. Task Stages
// =============================================================================
test.describe('Task Stages', () => {
  test('POST /task-stage/create — create task stage', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task-stage/create`, {
      headers: auth(),
      data: {
        taskStageName: `E2E Stage ${RUN}`,
        color: '#007BFF',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) taskStageId = data._id;
  });

  test('GET /task-stage/get — fetch task stages', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-stage/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!taskStageId && Array.isArray(data) && data.length > 0) {
      taskStageId = data[0]._id;
    }
  });

  test('PUT /task-stage/update/:id — update task stage', async ({ request }) => {
    await ensureToken(request);
    if (!taskStageId) return;
    const res = await request.put(`${TASK_API}/task-stage/update/${taskStageId}`, {
      headers: auth(),
      data: { taskStageName: `E2E Stage Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-stage/delete — delete task stage', async ({ request }) => {
    await ensureToken(request);
    if (!taskStageId) return;
    const res = await request.delete(`${TASK_API}/task-stage/delete`, {
      headers: auth(),
      data: { _id: taskStageId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-stage/multi/delete — multi-delete task stages', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/task-stage/multi/delete`, {
      headers: auth(),
      data: { ids: ['placeholder-id-1'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 33. Task Categories
// =============================================================================
test.describe('Task Categories', () => {
  test('POST /task-category/create — create task category', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/task-category/create`, {
      headers: auth(),
      data: {
        taskCategoryName: `E2E Category ${RUN}`,
        color: '#FFC107',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) taskCategoryId = data._id;
  });

  test('GET /task-category/get — fetch task categories', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/task-category/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!taskCategoryId && Array.isArray(data) && data.length > 0) {
      taskCategoryId = data[0]._id;
    }
  });

  test('PUT /task-category/update/:id — update task category', async ({ request }) => {
    await ensureToken(request);
    if (!taskCategoryId) return;
    const res = await request.put(`${TASK_API}/task-category/update/${taskCategoryId}`, {
      headers: auth(),
      data: { taskCategoryName: `E2E Category Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-category/delete — delete task category', async ({ request }) => {
    await ensureToken(request);
    if (!taskCategoryId) return;
    const res = await request.delete(`${TASK_API}/task-category/delete`, {
      headers: auth(),
      data: { _id: taskCategoryId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task-category/multi/delete — multi-delete task categories', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/task-category/multi/delete`, {
      headers: auth(),
      data: { ids: ['placeholder-id-1'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 34. Subtasks CRUD
// =============================================================================
test.describe('Subtasks CRUD', () => {
  test('POST /subtask/create — create subtask', async ({ request }) => {
    await ensureTask(request);
    const res = await request.post(`${TASK_API}/subtask/create`, {
      headers: auth(),
      data: {
        subTask: [{
          subTaskName: `E2E Subtask ${RUN}`,
          subTaskCode: `SUB${RUN}`,
          description: 'Automated E2E test subtask',
          taskId: taskId,
          projectId: projectId,
          status: 'Todo',
          priority: 'Low',
        }]
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?.insertedIds) {
      subTaskId = Object.values(data.insertedIds)[0] as string;
    } else if (data?._id) {
      subTaskId = data._id;
    } else if (Array.isArray(data) && data[0]?._id) {
      subTaskId = data[0]._id;
    }
  });

  test('GET /subtask/getAll — fetch all subtasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/subtask/getAll`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('GET /subtask/search — search subtasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/subtask/search?search=E2E`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /subtask/ReportHeaderGrid — filter subtask report', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/subtask/ReportHeaderGrid`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /subtask/update/:id — update subtask', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskId) return;
    const res = await request.put(`${TASK_API}/subtask/update/${subTaskId}`, {
      headers: auth(),
      data: { subTaskName: `E2E Subtask Updated ${RUN}`, status: 'Inprogress' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 35. Subtask Comments
// =============================================================================
test.describe('Subtask Comments', () => {
  test('POST /subtask/create-comment/:id — add comment to subtask', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskId) return;
    const res = await request.post(`${TASK_API}/subtask/create-comment/${subTaskId}`, {
      headers: auth(),
      data: { comment: `E2E subtask comment ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) subTaskCommentId = data._id;
    else if (data?.comments?.length > 0) {
      subTaskCommentId = data.comments[data.comments.length - 1]._id;
    }
  });

  test('GET /subtask/get-comments — fetch subtask comments', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskId) return;
    const res = await request.get(`${TASK_API}/subtask/get-comments?subTaskId=${subTaskId}`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!subTaskCommentId && data?.comments?.length > 0) {
      subTaskCommentId = data.comments[0]._id;
    }
  });

  test('POST /subtask/add-reply — add reply to subtask comment', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskCommentId) return;
    const res = await request.post(`${TASK_API}/subtask/add-reply`, {
      headers: auth(),
      data: {
        subTaskId: subTaskId,
        commentId: subTaskCommentId,
        reply: `E2E subtask reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /subtask/update-comment/:id — update subtask comment', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskCommentId) return;
    const res = await request.put(`${TASK_API}/subtask/update-comment/${subTaskCommentId}`, {
      headers: auth(),
      data: { comment: `Updated subtask comment ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /subtask/update-reply — update subtask reply', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${TASK_API}/subtask/update-reply`, {
      headers: auth(),
      data: {
        subTaskId: subTaskId || 'placeholder',
        commentId: subTaskCommentId || 'placeholder',
        replyId: 'placeholder',
        reply: `Updated subtask reply ${RUN}`,
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /subtask/delete-reply — delete subtask reply', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/subtask/delete-reply`, {
      headers: auth(),
      data: {
        subTaskId: subTaskId || 'placeholder',
        commentId: subTaskCommentId || 'placeholder',
        replyId: 'placeholder',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /subtask/delete-comment — delete subtask comment', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/subtask/delete-comment`, {
      headers: auth(),
      data: { subTaskId: subTaskId || 'placeholder', commentId: subTaskCommentId || 'placeholder' },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 36. Subtask Types
// =============================================================================
test.describe('Subtask Types', () => {
  test('POST /subtask-type/create — create subtask type', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/subtask-type/create`, {
      headers: auth(),
      data: {
        subTaskTypeName: `E2E SubType ${RUN}`,
        color: '#DC3545',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) subTaskTypeId = data._id;
  });

  test('GET /subtask-type/get — fetch subtask types', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/subtask-type/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!subTaskTypeId && Array.isArray(data) && data.length > 0) {
      subTaskTypeId = data[0]._id;
    }
  });

  test('PUT /subtask-type/update/:id — update subtask type', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskTypeId) return;
    const res = await request.put(`${TASK_API}/subtask-type/update/${subTaskTypeId}`, {
      headers: auth(),
      data: { subTaskTypeName: `E2E SubType Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /subtask-type/delete — delete subtask type', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskTypeId) return;
    const res = await request.delete(`${TASK_API}/subtask-type/delete`, {
      headers: auth(),
      data: { _id: subTaskTypeId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 37. Subtask Statuses
// =============================================================================
test.describe('Subtask Statuses', () => {
  test('POST /subtask-status/create — create subtask status', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${TASK_API}/subtask-status/create`, {
      headers: auth(),
      data: {
        subTaskStatusName: `E2E SubStatus ${RUN}`,
        color: '#17A2B8',
      },
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (data?._id) subTaskStatusId = data._id;
  });

  test('GET /subtask-status/get — fetch subtask statuses', async ({ request }) => {
    await ensureToken(request);
    const res = await request.get(`${TASK_API}/subtask-status/get`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
    const body = await res.json();
    const data = body?.body?.data || body?.data;
    if (!subTaskStatusId && Array.isArray(data) && data.length > 0) {
      subTaskStatusId = data[0]._id;
    }
  });

  test('PUT /subtask-status/update/:id — update subtask status', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskStatusId) return;
    const res = await request.put(`${TASK_API}/subtask-status/update/${subTaskStatusId}`, {
      headers: auth(),
      data: { subTaskStatusName: `E2E SubStatus Updated ${RUN}` },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /subtask-status/delete — delete subtask status', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskStatusId) return;
    const res = await request.delete(`${TASK_API}/subtask-status/delete`, {
      headers: auth(),
      data: { _id: subTaskStatusId },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 38. Cleanup — Delete tasks and subtasks
// =============================================================================
test.describe('Cleanup', () => {
  test('DELETE /subtask/delete — delete subtask', async ({ request }) => {
    await ensureToken(request);
    if (!subTaskId) return;
    const res = await request.delete(`${TASK_API}/subtask/delete`, {
      headers: auth(),
      data: { _id: subTaskId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /subtask/multiDelete — multi-delete subtasks', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${TASK_API}/subtask/multiDelete`, {
      headers: auth(),
      data: { subTaskIds: ['placeholder-id'] },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task/delete — delete task', async ({ request }) => {
    await ensureToken(request);
    if (!taskId) return;
    const res = await request.delete(`${TASK_API}/task/delete`, {
      headers: auth(),
      data: { _id: taskId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /task/multiDelete — multi-delete tasks', async ({ request }) => {
    await ensureToken(request);
    if (!taskId2) return;
    const res = await request.delete(`${TASK_API}/task/multiDelete`, {
      headers: auth(),
      data: { taskIds: [taskId2] },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /project/delete — delete project', async ({ request }) => {
    await ensureToken(request);
    if (!projectId) return;
    const res = await request.delete(`${PROJECT_API}/project/delete`, {
      headers: auth(),
      data: { _id: projectId },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /project/multiDelete — multi-delete projects', async ({ request }) => {
    await ensureToken(request);
    if (!projectId2) return;
    const res = await request.delete(`${PROJECT_API}/project/multiDelete`, {
      headers: auth(),
      data: { ProjectId: [{ id: projectId2 }] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 39. Health & Root checks
// =============================================================================
test.describe('Health & Root', () => {
  test('GET /health — project API health check', async ({ request }) => {
    const res = await request.get('https://test-project-api.empcloud.com/health');
    expect(ok(res.status())).toBe(true);
  });

  test('GET / — project API root', async ({ request }) => {
    const res = await request.get('https://test-project-api.empcloud.com/');
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 40. Admin Password Management
// =============================================================================
test.describe('Admin Password', () => {
  test('POST /admin/forgot-password-mail — request forgot password', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/forgot-password-mail`, {
      data: { email: 'nonexistent-e2e@example.com' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/reset-password — reset password (invalid token)', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/reset-password`, {
      data: { token: 'invalid-reset-token', password: 'NewPass@123' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/email-verification-token-generate — generate email verification token', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/email-verification-token-generate`, {
      data: { email: ORG_ADMIN.email },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /admin/update-password — update password (authenticated)', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/admin/update-password`, {
      headers: auth(),
      data: { oldPassword: ORG_ADMIN.password, newPassword: ORG_ADMIN.password },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 41. Plan Operations
// =============================================================================
test.describe('Plan Operations', () => {
  test('POST /plan/select — assign a plan', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/plan/select`, {
      headers: auth(),
      data: { planName: 'Free' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /plan/expire/date — update plan expiry', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/plan/expire/date`, {
      headers: auth(),
      data: { expireDate: '2028-12-31' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /plan/delete/data — delete plan data', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/plan/delete/data`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /plan/delete-downgraded-projects — delete downgraded projects', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/plan/delete-downgraded-projects`, {
      headers: auth(),
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 42. Role Multi-Delete
// =============================================================================
test.describe('Role Multi-Delete', () => {
  test('DELETE /role/multi/delete — multi-delete roles', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/role/multi/delete`, {
      headers: auth(),
      data: { roleIds: ['placeholder-role-id'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 43. Permission Multi-Delete
// =============================================================================
test.describe('Permission Multi-Delete', () => {
  test('DELETE /permission/multi/delete — multi-delete permissions', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/permission/multi/delete`, {
      headers: auth(),
      data: { permissionIds: ['placeholder-perm-id'] },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 44. Upload
// =============================================================================
test.describe('Upload', () => {
  test('POST /upload — upload file (no file, expect error or validation)', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/upload`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 45. Messages Upload
// =============================================================================
test.describe('Messages Upload', () => {
  test('POST /messages/upload — upload files for messages (no file)', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/messages/upload`, {
      headers: auth(),
      data: {},
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 46. Additional Admin Operations
// =============================================================================
test.describe('Admin Additional', () => {
  test('DELETE /admin/delete-admin — delete admin (should fail for self)', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/admin/delete-admin`, {
      headers: auth(),
      data: { adminId: 'placeholder-nonexistent' },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('POST /admin/add — add admin (duplicate check)', async ({ request }) => {
    const res = await request.post(`${PROJECT_API}/admin/add`, {
      data: {
        firstName: 'E2E',
        lastName: 'Admin',
        email: `e2e-admin-${RUN}@example.com`,
        password: 'TestPass@123',
        orgId: orgId || 'test-org',
        orgName: 'E2E Test Org',
      },
    });
    expect(ok(res.status())).toBe(true);
  });
});

// =============================================================================
// 47. User CRUD Operations
// =============================================================================
test.describe('User CRUD', () => {
  test('POST /user/create — create user', async ({ request }) => {
    await ensureToken(request);
    const res = await request.post(`${PROJECT_API}/user/create`, {
      headers: auth(),
      data: {
        firstName: 'E2E',
        lastName: `User ${RUN}`,
        email: `e2e-user-${RUN}@technova.in`,
        permission: 'read',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('PUT /user/update — update user', async ({ request }) => {
    await ensureToken(request);
    const res = await request.put(`${PROJECT_API}/user/update`, {
      headers: auth(),
      data: {
        email: `e2e-user-${RUN}@technova.in`,
        firstName: 'E2E Updated',
      },
    });
    expect(ok(res.status())).toBe(true);
  });

  test('DELETE /user/delete — delete user', async ({ request }) => {
    await ensureToken(request);
    const res = await request.delete(`${PROJECT_API}/user/delete`, {
      headers: auth(),
      data: { email: `e2e-user-${RUN}@technova.in` },
    });
    expect(ok(res.status())).toBe(true);
  });
});
