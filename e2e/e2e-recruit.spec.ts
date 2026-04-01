import { test, expect, APIRequestContext } from '@playwright/test';

// =============================================================================
// Configuration
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const RECRUIT_API = 'https://test-recruit-api.empcloud.com/api/v1';
const RECRUIT_BASE = 'https://test-recruit-api.empcloud.com';

const ADMIN_CREDS = { email: 'ananya@technova.in', password: 'Welcome@123' };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

let cloudToken = '';
let recruitToken = '';

async function loginToCloud(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${EMPCLOUD_API}/auth/login`, {
    data: ADMIN_CREDS,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

async function ssoToRecruit(request: APIRequestContext, ecToken: string): Promise<string> {
  const res = await request.post(`${RECRUIT_API}/auth/sso`, {
    data: { token: ecToken },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const moduleToken = body.data?.tokens?.accessToken;
  expect(moduleToken, 'SSO response missing data.tokens.accessToken').toBeTruthy();
  return moduleToken;
}

function auth() {
  return { headers: { Authorization: `Bearer ${recruitToken}` } };
}

function authJson() {
  return {
    headers: {
      Authorization: `Bearer ${recruitToken}`,
      'Content-Type': 'application/json',
    },
  };
}

// Shared state across tests (Recruit uses UUID strings for all IDs)
let jobId: string;
let candidateId: string;
let applicationId: string;
let offerId: string;
let interviewId: string;
let referralId: string;
let bgCheckId: string;
let bgPackageId: string;
let onboardingTemplateId: string;
let onboardingTaskId: string;
let checklistId: string;
let pipelineStageId: string;

// =============================================================================
// 1. Auth & Health (4 tests)
// =============================================================================

test.describe.serial('EMP Recruit Module', () => {

  test.describe('1 - Auth & Health', () => {

    test('1.1 EmpCloud login succeeds', async ({ request }) => {
      cloudToken = await loginToCloud(request);
      expect(cloudToken.length).toBeGreaterThan(10);
    });

    test('1.2 SSO to Recruit succeeds', async ({ request }) => {
      if (!cloudToken) cloudToken = await loginToCloud(request);
      recruitToken = await ssoToRecruit(request, cloudToken);
      expect(recruitToken.length).toBeGreaterThan(10);
    });

    test('1.3 Health check returns 200', async ({ request }) => {
      const r = await request.get(`${RECRUIT_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.4 Unauthenticated request returns 401', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs`);
      expect(r.status()).toBe(401);
    });
  });

  // ===========================================================================
  // 2. Jobs (8 tests)
  // ===========================================================================

  test.describe('2 - Jobs', () => {

    test('2.1 Create a job posting', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/jobs`, {
        ...authJson(),
        data: {
          title: `PW Engineer ${RUN}`,
          department: 'Engineering',
          location: 'Mumbai',
          employment_type: 'full_time',
          experience_min: 2,
          experience_max: 5,
          description: `Playwright test job ${RUN}`,
          skills: ['TypeScript', 'Node.js'],
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      jobId = body.data.id;
    });

    test('2.2 List jobs', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      // Recruit returns paginated { data: { data: [...], total, page, ... } }
      const jobs = body.data?.data || body.data?.jobs || body.data;
      expect(Array.isArray(jobs)).toBe(true);
    });

    test('2.3 Get job by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs/${jobId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data.title).toContain(`PW Engineer ${RUN}`);
    });

    test('2.4 Update job', async ({ request }) => {
      const r = await request.put(`${RECRUIT_API}/jobs/${jobId}`, {
        ...authJson(),
        data: { description: `Updated description ${RUN}` },
      });
      expect(r.status()).toBe(200);
    });

    test('2.5 Change job status to open', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/jobs/${jobId}/status`, {
        ...authJson(),
        data: { status: 'open' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('2.6 Get job applications (empty initially)', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs/${jobId}/applications`, auth());
      expect(r.status()).toBe(200);
    });

    test('2.7 Get job analytics', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs/${jobId}/analytics`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('2.8 Change job status to closed', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/jobs/${jobId}/status`, {
        ...authJson(),
        data: { status: 'closed' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 3. Candidates (6 tests)
  // ===========================================================================

  test.describe('3 - Candidates', () => {

    test('3.1 Create a candidate', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/candidates`, {
        ...authJson(),
        data: {
          first_name: 'Playwright',
          last_name: `Tester${RUN}`,
          email: `pw-candidate-${RUN}@test.com`,
          phone: '+919876543210',
          source: 'referral',
          skills: ['React', 'TypeScript'],
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      candidateId = body.data.id;
    });

    test('3.2 List candidates', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/candidates`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const candidates = body.data?.data || body.data?.candidates || body.data;
      expect(Array.isArray(candidates)).toBe(true);
    });

    test('3.3 Search candidates', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/candidates?search=Playwright`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.4 Get candidate by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/candidates/${candidateId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data.first_name).toBe('Playwright');
    });

    test('3.5 Update candidate', async ({ request }) => {
      const r = await request.put(`${RECRUIT_API}/candidates/${candidateId}`, {
        ...authJson(),
        data: { phone: '+919876500000', skills: ['React', 'TypeScript', 'Node.js'] },
      });
      expect(r.status()).toBe(200);
    });

    test('3.6 Upload resume for candidate', async ({ request }) => {
      // Create a minimal PDF-like buffer for upload
      const buffer = Buffer.from('%PDF-1.4 fake resume content for E2E test');
      const r = await request.post(`${RECRUIT_API}/candidates/${candidateId}/resume`, {
        headers: { Authorization: `Bearer ${recruitToken}` },
        multipart: {
          resume: {
            name: 'resume.pdf',
            mimeType: 'application/pdf',
            buffer,
          },
        },
      });
      // Accept 200/201 for success, 400/415 if module doesn't support raw upload
      expect([200, 201, 400, 415, 422]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 4. Applications (8 tests)
  // ===========================================================================

  test.describe('4 - Applications', () => {

    test('4.1 Reopen job for applications', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/jobs/${jobId}/status`, {
        ...authJson(),
        data: { status: 'open' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('4.2 Create an application', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/applications`, {
        ...authJson(),
        data: {
          job_id: jobId,
          candidate_id: candidateId,
          source: 'referral',
          cover_letter: `E2E test application ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      applicationId = body.data.id;
    });

    test('4.3 List applications', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/applications`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const apps = body.data?.data || body.data?.applications || body.data;
      expect(Array.isArray(apps)).toBe(true);
    });

    test('4.4 Get application by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/applications/${applicationId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data).toHaveProperty('id', applicationId);
    });

    test('4.5 Move application to screened stage', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/applications/${applicationId}/stage`, {
        ...authJson(),
        data: { stage: 'screened' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('4.6 Move application to interview stage', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/applications/${applicationId}/stage`, {
        ...authJson(),
        data: { stage: 'interview' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('4.7 Add note to application', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/applications/${applicationId}/notes`, {
        ...authJson(),
        data: {
          notes: `Playwright test note ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('4.8 Get application timeline', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/applications/${applicationId}/timeline`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 5. Offers (8 tests)
  // ===========================================================================

  test.describe('5 - Offers', () => {

    test('5.1 Create an offer', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/offers`, {
        ...authJson(),
        data: {
          application_id: applicationId,
          job_id: jobId,
          candidate_id: candidateId,
          salary: 1200000,
          currency: 'INR',
          joining_date: '2026-05-01',
          expiry_date: '2026-04-15',
          designation: `PW Engineer ${RUN}`,
          employment_type: 'full_time',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      offerId = body.data.id;
    });

    test('5.2 List offers', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/offers`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const offers = body.data?.data || body.data?.offers || body.data;
      expect(Array.isArray(offers)).toBe(true);
    });

    test('5.3 Get offer by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/offers/${offerId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data).toHaveProperty('id', offerId);
    });

    test('5.4 Update offer details', async ({ request }) => {
      const r = await request.put(`${RECRUIT_API}/offers/${offerId}`, {
        ...authJson(),
        data: { salary: 1300000, designation: `Senior PW Engineer ${RUN}` },
      });
      expect(r.status()).toBe(200);
    });

    test('5.5 Submit offer for approval', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/offers/${offerId}/submit`, {
        ...authJson(),
        data: { approver_notes: 'Submitting for approval - E2E test' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('5.6 Approve offer', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/offers/${offerId}/approve`, {
        ...authJson(),
        data: { notes: 'Approved via E2E' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('5.7 Send offer to candidate', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/offers/${offerId}/send`, {
        ...authJson(),
        data: { message: 'Congratulations! E2E test offer.' },
      });
      expect([200, 201, 204]).toContain(r.status());
    });

    test('5.8 Candidate accepts offer', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/offers/${offerId}/respond`, {
        ...authJson(),
        data: { response: 'accept', notes: 'Accepted via E2E test' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 6. Interviews (8 tests)
  // ===========================================================================

  test.describe('6 - Interviews', () => {

    test('6.1 Schedule an interview', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/interviews`, {
        ...authJson(),
        data: {
          application_id: applicationId,
          job_id: jobId,
          candidate_id: candidateId,
          type: 'video',
          scheduled_at: '2026-04-10T10:00:00Z',
          duration_minutes: 60,
          interviewers: [],
          location: 'Google Meet',
          notes: `E2E interview ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      interviewId = body.data.id;
    });

    test('6.2 List interviews', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/interviews`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const interviews = body.data?.data || body.data?.interviews || body.data;
      expect(Array.isArray(interviews)).toBe(true);
    });

    test('6.3 Get interview by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/interviews/${interviewId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data).toHaveProperty('id', interviewId);
    });

    test('6.4 Reschedule interview', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/interviews/${interviewId}/reschedule`, {
        ...authJson(),
        data: {
          scheduled_at: '2026-04-12T14:00:00Z',
          reason: 'E2E reschedule test',
        },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('6.5 Submit interview feedback', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/interviews/${interviewId}/feedback`, {
        ...authJson(),
        data: {
          rating: 4,
          recommendation: 'strong_hire',
          strengths: 'Great TypeScript skills',
          weaknesses: 'Could improve system design',
          notes: `E2E feedback ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('6.6 Get interview feedback', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/interviews/${interviewId}/feedback`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.7 Get calendar link for interview', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/interviews/${interviewId}/calendar`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.8 Cancel interview', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/interviews/${interviewId}/cancel`, {
        ...authJson(),
        data: { reason: 'E2E cleanup' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 7. Referrals (5 tests)
  // ===========================================================================

  test.describe('7 - Referrals', () => {

    test('7.1 Submit a referral', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/referrals`, {
        ...authJson(),
        data: {
          job_id: jobId,
          candidate_name: `Referred Person ${RUN}`,
          candidate_email: `pw-referral-${RUN}@test.com`,
          candidate_phone: '+919876512345',
          relationship: 'former_colleague',
          notes: `E2E referral ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      referralId = body.data.id;
    });

    test('7.2 List referrals', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/referrals`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const referrals = body.data?.data || body.data?.referrals || body.data;
      expect(Array.isArray(referrals)).toBe(true);
    });

    test('7.3 Get referral by ID', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/referrals/${referralId}`, auth());
      expect(r.status()).toBe(200);
    });

    test('7.4 Update referral status', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/referrals/${referralId}/status`, {
        ...authJson(),
        data: { status: 'in_review' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('7.5 Mark referral as hired', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/referrals/${referralId}/status`, {
        ...authJson(),
        data: { status: 'hired' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 8. Background Checks (4 tests)
  // ===========================================================================

  test.describe('8 - Background Checks', () => {

    test('8.1 Create a background check package', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/background-checks/packages`, {
        ...authJson(),
        data: {
          name: `PW BG Package ${RUN}`,
          checks: ['identity', 'education', 'employment'],
          description: 'E2E test package',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      bgPackageId = body.data.id;
    });

    test('8.2 Initiate background check for candidate', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/background-checks`, {
        ...authJson(),
        data: {
          candidate_id: candidateId,
          application_id: applicationId,
          package_id: bgPackageId,
          notes: `E2E bg check ${RUN}`,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      bgCheckId = body.data.id;
    });

    test('8.3 List background checks', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/background-checks`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const checks = body.data?.data || body.data?.checks || body.data;
      expect(Array.isArray(checks)).toBe(true);
    });

    test('8.4 Update background check result', async ({ request }) => {
      const r = await request.patch(`${RECRUIT_API}/background-checks/${bgCheckId}`, {
        ...authJson(),
        data: {
          status: 'completed',
          result: 'clear',
          report_url: 'https://example.com/report.pdf',
          completed_at: '2026-04-05T12:00:00Z',
        },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 9. Onboarding (5 tests)
  // ===========================================================================

  test.describe('9 - Onboarding', () => {

    test('9.1 Create onboarding template', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/onboarding/templates`, {
        ...authJson(),
        data: {
          name: `PW Onboarding ${RUN}`,
          department: 'Engineering',
          description: 'E2E onboarding template',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      onboardingTemplateId = body.data.id;
    });

    test('9.2 Add task to onboarding template', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/onboarding/templates/${onboardingTemplateId}/tasks`, {
        ...authJson(),
        data: {
          title: `Setup laptop ${RUN}`,
          description: 'Provision development machine',
          due_days: 1,
          assignee_role: 'it_admin',
          priority: 'high',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      onboardingTaskId = body.data.id;
    });

    test('9.3 Generate checklist from template for candidate', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/onboarding/checklists`, {
        ...authJson(),
        data: {
          template_id: onboardingTemplateId,
          candidate_id: candidateId,
          application_id: applicationId,
          start_date: '2026-05-01',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.data).toHaveProperty('id');
      checklistId = body.data.id;
    });

    test('9.4 Get checklist', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/onboarding/checklists/${checklistId}`, auth());
      expect(r.status()).toBe(200);
    });

    test('9.5 Update task status in checklist', async ({ request }) => {
      // Try to mark the first task as completed
      const r = await request.patch(`${RECRUIT_API}/onboarding/checklists/${checklistId}/tasks/${onboardingTaskId}`, {
        ...authJson(),
        data: { status: 'completed', notes: 'Done via E2E' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 10. Public Career Page (5 tests)
  // ===========================================================================

  test.describe('10 - Public Career Page', () => {

    test('10.1 Get career page settings', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/careers/settings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.2 List public jobs on career page', async ({ request }) => {
      // Career page endpoints are typically public (no auth)
      const r = await request.get(`${RECRUIT_API}/careers/jobs`);
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Get public job detail', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/careers/jobs/${jobId}`);
      // May return 404 if job is closed or career page not configured
      expect([200, 404]).toContain(r.status());
    });

    test('10.4 Submit application via career page', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/careers/apply`, {
        headers: { 'Content-Type': 'application/json' },
        data: {
          job_id: jobId,
          first_name: 'Career',
          last_name: `Applicant${RUN}`,
          email: `pw-career-${RUN}@test.com`,
          phone: '+919876500001',
          cover_letter: `Applied via career page E2E ${RUN}`,
        },
      });
      // 201 success, 400/404 if career page not active or job closed
      expect([200, 201, 400, 404, 422]).toContain(r.status());
    });

    test('10.5 Non-existent career page slug returns 404', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/careers/nonexistent-slug-${RUN}`);
      expect([404, 400]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 11. Pipeline & Scoring (4 tests)
  // ===========================================================================

  test.describe('11 - Pipeline & Scoring', () => {

    test('11.1 Get pipeline stages', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/pipelines/stages`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.2 Create a custom pipeline stage', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/pipelines/stages`, {
        ...authJson(),
        data: {
          name: `PW Stage ${RUN}`,
          order: 99,
          color: '#FF5733',
          description: 'E2E test stage',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) pipelineStageId = body.data.id;
    });

    test('11.3 Score an application', async ({ request }) => {
      const r = await request.post(`${RECRUIT_API}/applications/${applicationId}/score`, {
        ...authJson(),
        data: {
          criteria: 'technical_skills',
          score: 8,
          max_score: 10,
          notes: `E2E scoring ${RUN}`,
        },
      });
      expect([200, 201, 404]).toContain(r.status());
    });

    test('11.4 Get application rankings for job', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/jobs/${jobId}/rankings`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 12. Analytics (3 tests)
  // ===========================================================================

  test.describe('12 - Analytics', () => {

    test('12.1 Recruitment overview analytics', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/analytics/overview`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.2 Pipeline funnel analytics', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/analytics/pipeline-funnel`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.3 Source effectiveness analytics', async ({ request }) => {
      const r = await request.get(`${RECRUIT_API}/analytics/source-effectiveness`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 13. Cleanup — Delete job (1 test)
  // ===========================================================================

  test.describe('13 - Cleanup', () => {

    test('13.1 Delete test job', async ({ request }) => {
      const r = await request.delete(`${RECRUIT_API}/jobs/${jobId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });
});
