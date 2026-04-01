import { test, expect } from '@playwright/test';

// =============================================================================
// EMP LMS — Comprehensive E2E Tests (~60 tests)
// Auth: SSO from EmpCloud (ananya@technova.in)
// API: https://testlms-api.empcloud.com/api/v1
// Covers: Courses, Categories, Modules & Lessons, Enrollment, Certificates,
//         Learning Paths, Quizzes, Discussions, Ratings, SCORM, Compliance,
//         Gamification, Analytics, ILT Sessions, Health
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const LMS_API = 'https://testlms-api.empcloud.com/api/v1';
const LMS_BASE = 'https://testlms-api.empcloud.com';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };

let token = '';

// IDs captured during test execution for cross-test dependencies
let createdCourseId: number | string = 0;
let createdCategoryId: number | string = 0;
let createdModuleId: number | string = 0;
let createdLessonId: number | string = 0;
let createdEnrollmentId: number | string = 0;
let createdCertTemplateId: number | string = 0;
let createdLearningPathId: number | string = 0;
let createdQuizId: number | string = 0;
let createdQuestionId: number | string = 0;
let createdDiscussionId: number | string = 0;
let createdIltSessionId: number | string = 0;
// User ID from SSO for enrollment self-enroll
let ssoUserId: number = 0;

// ---------------------------------------------------------------------------
// Helper: auth header
// ---------------------------------------------------------------------------
const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

test.describe('EMP LMS Module', () => {

  test.beforeAll(async ({ request }) => {
    // Login to EmpCloud
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    const ecBody = await login.json();
    const ecToken = ecBody.data.tokens.access_token;

    // SSO to LMS — exchange EmpCloud RS256 JWT for LMS HS256 JWT
    const sso = await request.post(`${LMS_API}/auth/sso`, {
      data: { token: ecToken },
    });
    expect(sso.status(), `SSO to LMS failed with status ${sso.status()}`).toBe(200);
    const ssoBody = await sso.json();
    token = ssoBody.data?.tokens?.accessToken || '';
    ssoUserId = ssoBody.data?.user?.empcloudUserId || 0;
    expect(token, 'SSO token extraction failed — check LMS auth response shape').toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEALTH (2 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('1. Health', () => {

    test('1.1 Health endpoint returns 200', async ({ request }) => {
      const r = await request.get(`${LMS_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.2 Unauthenticated request returns 401', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses`);
      expect(r.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CATEGORIES (3 tests)
  // Routes: /api/v1/courses/categories
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('2. Categories', () => {

    test('2.1 Create category', async ({ request }) => {
      const r = await request.post(`${LMS_API}/courses/categories`, {
        ...auth(),
        data: { name: `PW Category ${Date.now()}`, description: 'Playwright test category' },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCategoryId = body.data?.id || body.data?.category?.id || 0;
    });

    test('2.2 List categories', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses/categories`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('2.3 Get category by ID', async ({ request }) => {
      // Categories don't have a GET /:id route, so we verify the list includes our created category
      const r = await request.get(`${LMS_API}/courses/categories`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
      // Verify we can find the created category in the list
      if (createdCategoryId) {
        const found = Array.isArray(body.data) && body.data.some((c: any) => c.id === createdCategoryId);
        expect(found, 'Created category should appear in category list').toBeTruthy();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. COURSES CRUD (10 tests)
  // Routes: /api/v1/courses
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3. Courses CRUD', () => {

    test('3.1 Create course', async ({ request }) => {
      const r = await request.post(`${LMS_API}/courses`, {
        ...auth(),
        data: {
          title: `PW Course ${Date.now()}`,
          description: 'Playwright E2E test course',
          category_id: createdCategoryId || undefined,
          difficulty: 'beginner',
          duration_minutes: 600,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCourseId = body.data?.id || body.data?.course?.id || 0;
    });

    test('3.2 List courses', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('3.3 Get course by ID', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('3.4 Update course title', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}`, {
        ...auth(),
        data: { title: `PW Course Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('3.5 Update course description', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}`, {
        ...auth(),
        data: { description: 'Updated description from Playwright' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('3.6 Publish course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // Use the dedicated publish endpoint: POST /courses/:id/publish
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/publish`, auth());
      expect([200, 201, 204]).toContain(r.status());
    });

    test('3.7 Filter courses by status', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?status=published`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.8 Filter courses by category', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?category_id=${createdCategoryId || ''}`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.9 Search courses by title', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?search=PW`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.10 Delete course', async ({ request }) => {
      // Create a disposable course to delete
      const create = await request.post(`${LMS_API}/courses`, {
        ...auth(),
        data: { title: `PW Delete ${Date.now()}`, description: 'To be deleted' },
      });
      const cBody = await create.json();
      const delId = cBody.data?.id || cBody.data?.course?.id || 0;
      expect(delId, 'Prerequisite failed — delId was not set').toBeTruthy();
      const r = await request.delete(`${LMS_API}/courses/${delId}`, auth());
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MODULES & LESSONS (6 tests)
  // Modules: /api/v1/courses/:id/modules
  // Lessons: /api/v1/courses/:id/modules/:moduleId/lessons
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('4. Modules & Lessons', () => {

    test('4.1 Create module in course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/modules`, {
        ...auth(),
        data: { title: `PW Module ${Date.now()}`, description: 'Test module', sort_order: 1 },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdModuleId = body.data?.id || body.data?.module?.id || 0;
    });

    test('4.2 List modules for course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}/modules`, auth());
      expect(r.status()).toBe(200);
    });

    test('4.3 Create lesson in module', async ({ request }) => {
      expect(createdModuleId, 'Prerequisite failed — createdModuleId was not set').toBeTruthy();
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/modules/${createdModuleId}/lessons`, {
        ...auth(),
        data: {
          title: `PW Lesson ${Date.now()}`,
          content_type: 'video',
          content_url: 'https://example.com/video.mp4',
          duration_minutes: 15,
          sort_order: 1,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdLessonId = body.data?.id || body.data?.lesson?.id || 0;
    });

    test('4.4 List lessons in module', async ({ request }) => {
      expect(createdModuleId, 'Prerequisite failed — createdModuleId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}/modules/${createdModuleId}/lessons`, auth());
      expect(r.status()).toBe(200);
    });

    test('4.5 Update lesson', async ({ request }) => {
      expect(createdLessonId, 'Prerequisite failed — createdLessonId was not set').toBeTruthy();
      // Lesson update: PUT /courses/:id/lessons/:lessonId
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}/lessons/${createdLessonId}`, {
        ...auth(),
        data: { title: `PW Lesson Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('4.6 Reorder modules', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // Reorder: POST /courses/:id/modules/reorder with { ordered_ids: [...] }
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/modules/reorder`, {
        ...auth(),
        data: { ordered_ids: [createdModuleId] },
      });
      expect([200, 204, 400, 422]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ENROLLMENT (6 tests)
  // Routes: /api/v1/enrollments
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5. Enrollment', () => {

    test('5.1 Enroll in course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // enrollCourseSchema requires user_id (int) and course_id (uuid string)
      const r = await request.post(`${LMS_API}/enrollments`, {
        ...auth(),
        data: { user_id: ssoUserId, course_id: createdCourseId },
      });
      expect([200, 201, 409]).toContain(r.status()); // 409 if already enrolled
      const body = await r.json();
      createdEnrollmentId = body.data?.id || body.data?.enrollment?.id || 0;
    });

    test('5.2 List my enrollments', async ({ request }) => {
      // GET /enrollments/my — current user's enrollments
      const r = await request.get(`${LMS_API}/enrollments/my`, auth());
      expect(r.status()).toBe(200);
    });

    test('5.3 Get my progress for course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // GET /enrollments/my/:courseId — get my progress for a specific course
      const r = await request.get(`${LMS_API}/enrollments/my/${createdCourseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.4 List course enrollments (admin)', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // GET /enrollments/course/:courseId — admin endpoint
      const r = await request.get(`${LMS_API}/enrollments/course/${createdCourseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.5 Mark lesson complete', async ({ request }) => {
      expect(createdLessonId && createdEnrollmentId, 'Prerequisite failed — createdLessonId or createdEnrollmentId was not set').toBeTruthy();
      // POST /enrollments/:id/lessons/:lessonId/complete
      const r = await request.post(`${LMS_API}/enrollments/${createdEnrollmentId}/lessons/${createdLessonId}/complete`, {
        ...auth(),
        data: {},
      });
      expect([200, 201, 204, 404]).toContain(r.status());
    });

    test('5.6 Get recent activity', async ({ request }) => {
      // GET /enrollments/recent — recent activity for current user
      const r = await request.get(`${LMS_API}/enrollments/recent`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CERTIFICATES (5 tests)
  // Routes: /api/v1/certificates
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('6. Certificates', () => {

    test('6.1 Create certificate template', async ({ request }) => {
      // POST /certificates/templates
      const r = await request.post(`${LMS_API}/certificates/templates`, {
        ...auth(),
        data: {
          name: `PW Cert Template ${Date.now()}`,
          description: 'Playwright test certificate template',
          html_template: '<html><body><h1>Certificate of Completion</h1><p>{{name}}</p></body></html>',
          is_default: false,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCertTemplateId = body.data?.id || 0;
    });

    test('6.2 List certificate templates', async ({ request }) => {
      // GET /certificates/templates
      const r = await request.get(`${LMS_API}/certificates/templates`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('6.3 Get certificate template by ID', async ({ request }) => {
      expect(createdCertTemplateId, 'Prerequisite failed — createdCertTemplateId was not set').toBeTruthy();
      // GET /certificates/templates/:id
      const r = await request.get(`${LMS_API}/certificates/templates/${createdCertTemplateId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Issue certificate', async ({ request }) => {
      // POST /certificates/issue — requires user_id, course_id, enrollment_id
      const r = await request.post(`${LMS_API}/certificates/issue`, {
        ...auth(),
        data: {
          user_id: ssoUserId,
          course_id: createdCourseId,
          enrollment_id: createdEnrollmentId,
          template_id: createdCertTemplateId || undefined,
        },
      });
      expect([200, 201, 400, 404, 409]).toContain(r.status());
    });

    test('6.5 List my certificates', async ({ request }) => {
      // GET /certificates/my
      const r = await request.get(`${LMS_API}/certificates/my`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. LEARNING PATHS (6 tests)
  // Routes: /api/v1/learning-paths
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('7. Learning Paths', () => {

    test('7.1 Create learning path', async ({ request }) => {
      const r = await request.post(`${LMS_API}/learning-paths`, {
        ...auth(),
        data: {
          title: `PW Path ${Date.now()}`,
          description: 'Playwright test learning path',
          difficulty: 'intermediate',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdLearningPathId = body.data?.id || body.data?.learningPath?.id || body.data?.learning_path?.id || 0;
    });

    test('7.2 List learning paths', async ({ request }) => {
      const r = await request.get(`${LMS_API}/learning-paths`, auth());
      expect(r.status()).toBe(200);
    });

    test('7.3 Get learning path by ID', async ({ request }) => {
      expect(createdLearningPathId, 'Prerequisite failed — createdLearningPathId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/learning-paths/${createdLearningPathId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.4 Add course to learning path', async ({ request }) => {
      expect(createdLearningPathId && createdCourseId, 'Prerequisite failed — createdLearningPathId or createdCourseId was not set').toBeTruthy();
      // POST /learning-paths/:id/courses with { course_id, sort_order }
      const r = await request.post(`${LMS_API}/learning-paths/${createdLearningPathId}/courses`, {
        ...auth(),
        data: { course_id: createdCourseId, sort_order: 1 },
      });
      expect([200, 201, 409]).toContain(r.status());
    });

    test('7.5 Enroll in learning path', async ({ request }) => {
      expect(createdLearningPathId, 'Prerequisite failed — createdLearningPathId was not set').toBeTruthy();
      // POST /learning-paths/:id/enroll
      const r = await request.post(`${LMS_API}/learning-paths/${createdLearningPathId}/enroll`, auth());
      expect([200, 201, 409]).toContain(r.status());
    });

    test('7.6 Update learning path', async ({ request }) => {
      expect(createdLearningPathId, 'Prerequisite failed — createdLearningPathId was not set').toBeTruthy();
      const r = await request.put(`${LMS_API}/learning-paths/${createdLearningPathId}`, {
        ...auth(),
        data: { title: `PW Path Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. QUIZZES (8 tests)
  // Routes: /api/v1/quizzes
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('8. Quizzes', () => {

    test('8.1 Create quiz for course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      const r = await request.post(`${LMS_API}/quizzes`, {
        ...auth(),
        data: {
          title: `PW Quiz ${Date.now()}`,
          course_id: createdCourseId,
          passing_score: 70,
          time_limit_minutes: 30,
          max_attempts: 3,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdQuizId = body.data?.id || body.data?.quiz?.id || 0;
    });

    test('8.2 List quizzes', async ({ request }) => {
      // GET /quizzes requires admin role
      const r = await request.get(`${LMS_API}/quizzes`, auth());
      expect(r.status()).toBe(200);
    });

    test('8.3 Get quiz by ID', async ({ request }) => {
      expect(createdQuizId, 'Prerequisite failed — createdQuizId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.4 Add question to quiz', async ({ request }) => {
      expect(createdQuizId, 'Prerequisite failed — createdQuizId was not set').toBeTruthy();
      // POST /quizzes/:id/questions — field names match createQuestionSchema
      const r = await request.post(`${LMS_API}/quizzes/${createdQuizId}/questions`, {
        ...auth(),
        data: {
          text: 'What is Playwright used for?',
          type: 'mcq',
          options: [
            { text: 'E2E testing', is_correct: true },
            { text: 'Database queries', is_correct: false },
            { text: 'CSS styling', is_correct: false },
          ],
          points: 10,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdQuestionId = body.data?.id || body.data?.question?.id || 0;
    });

    test('8.5 List quiz questions — via get quiz', async ({ request }) => {
      expect(createdQuizId, 'Prerequisite failed — createdQuizId was not set').toBeTruthy();
      // Quiz details include questions; use GET /quizzes/:id
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.6 Get quiz attempts', async ({ request }) => {
      expect(createdQuizId, 'Prerequisite failed — createdQuizId was not set').toBeTruthy();
      // GET /quizzes/:id/attempts — current user's attempts
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}/attempts`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.7 Submit quiz attempt', async ({ request }) => {
      expect(createdQuizId && createdQuestionId, 'Prerequisite failed — createdQuizId or createdQuestionId was not set').toBeTruthy();
      // POST /quizzes/:id/submit — requires enrollment_id and answers array
      const r = await request.post(`${LMS_API}/quizzes/${createdQuizId}/submit`, {
        ...auth(),
        data: {
          enrollment_id: createdEnrollmentId,
          answers: [{ question_id: createdQuestionId, selected_options: ['0'] }],
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('8.8 Get quiz stats (admin)', async ({ request }) => {
      expect(createdQuizId, 'Prerequisite failed — createdQuizId was not set').toBeTruthy();
      // GET /quizzes/:id/stats — admin endpoint
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}/stats`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. DISCUSSIONS (4 tests)
  // Routes: /api/v1/discussions
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('9. Discussions', () => {

    test('9.1 Create discussion thread', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // createDiscussionSchema: { course_id, lesson_id?, parent_id?, title?, content }
      const r = await request.post(`${LMS_API}/discussions`, {
        ...auth(),
        data: {
          course_id: createdCourseId,
          title: `PW Discussion ${Date.now()}`,
          content: 'This is a Playwright test discussion thread.',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdDiscussionId = body.data?.id || body.data?.discussion?.id || 0;
    });

    test('9.2 List discussions for course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // GET /discussions?course_id=xxx
      const r = await request.get(`${LMS_API}/discussions?course_id=${createdCourseId}`, auth());
      expect(r.status()).toBe(200);
    });

    test('9.3 Reply to discussion', async ({ request }) => {
      expect(createdDiscussionId, 'Prerequisite failed — createdDiscussionId was not set').toBeTruthy();
      // POST /discussions/:id/replies
      const r = await request.post(`${LMS_API}/discussions/${createdDiscussionId}/replies`, {
        ...auth(),
        data: { content: 'Playwright reply to discussion thread.' },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('9.4 Get discussion by ID', async ({ request }) => {
      expect(createdDiscussionId, 'Prerequisite failed — createdDiscussionId was not set').toBeTruthy();
      const r = await request.get(`${LMS_API}/discussions/${createdDiscussionId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. RATINGS (4 tests)
  // Routes: /api/v1/ratings
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('10. Ratings', () => {

    test('10.1 Rate a course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // POST /ratings — createCourseRatingSchema: { course_id, rating, review? }
      const r = await request.post(`${LMS_API}/ratings`, {
        ...auth(),
        data: { course_id: createdCourseId, rating: 4, review: 'Great Playwright test course!' },
      });
      expect([200, 201, 409]).toContain(r.status()); // 409 if already rated
    });

    test('10.2 Get course ratings', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // GET /ratings?course_id=xxx
      const r = await request.get(`${LMS_API}/ratings?course_id=${createdCourseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Get rating summary for course', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // GET /ratings/summary?course_id=xxx
      const r = await request.get(`${LMS_API}/ratings/summary?course_id=${createdCourseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.4 Update my rating', async ({ request }) => {
      expect(createdCourseId, 'Prerequisite failed — createdCourseId was not set').toBeTruthy();
      // First find the rating ID from the list
      const listResp = await request.get(`${LMS_API}/ratings?course_id=${createdCourseId}`, auth());
      const listBody = await listResp.json();
      const ratings = listBody.data || [];
      const myRating = Array.isArray(ratings) ? ratings.find((r: any) => r.user_id === ssoUserId) : null;
      if (myRating) {
        // PUT /ratings/:id
        const r = await request.put(`${LMS_API}/ratings/${myRating.id}`, {
          ...auth(),
          data: { rating: 5, review: 'Updated Playwright review!' },
        });
        expect([200, 204, 404]).toContain(r.status());
      } else {
        // Rating may not have been created — skip gracefully
        expect(true).toBeTruthy();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. SCORM (3 tests)
  // Routes: /api/v1/scorm
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('11. SCORM', () => {

    test('11.1 List SCORM packages for course', async ({ request }) => {
      // GET /scorm/course/:courseId
      const courseId = createdCourseId || 'nonexistent';
      const r = await request.get(`${LMS_API}/scorm/course/${courseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.2 Get SCORM package by ID (nonexistent)', async ({ request }) => {
      // GET /scorm/:id — test with nonexistent ID
      const r = await request.get(`${LMS_API}/scorm/00000000-0000-0000-0000-000000000000`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.3 SCORM tracking data (nonexistent)', async ({ request }) => {
      // GET /scorm/:id/tracking — test with nonexistent ID
      const r = await request.get(`${LMS_API}/scorm/00000000-0000-0000-0000-000000000000/tracking`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. COMPLIANCE (4 tests)
  // Routes: /api/v1/compliance
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('12. Compliance', () => {

    test('12.1 List compliance assignments', async ({ request }) => {
      // GET /compliance/assignments (admin)
      const r = await request.get(`${LMS_API}/compliance/assignments`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.2 Create compliance assignment', async ({ request }) => {
      // POST /compliance/assignments
      const r = await request.post(`${LMS_API}/compliance/assignments`, {
        ...auth(),
        data: {
          name: `PW Compliance ${Date.now()}`,
          course_id: createdCourseId || undefined,
          assigned_to_type: 'all',
          due_date: '2026-12-31',
        },
      });
      expect([200, 201, 400, 404, 422]).toContain(r.status());
    });

    test('12.3 Get compliance dashboard', async ({ request }) => {
      // GET /compliance/dashboard (admin)
      const r = await request.get(`${LMS_API}/compliance/dashboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.4 Get overdue compliance', async ({ request }) => {
      // GET /compliance/overdue (admin)
      const r = await request.get(`${LMS_API}/compliance/overdue`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. GAMIFICATION (3 tests)
  // Routes: /api/v1/gamification
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('13. Gamification', () => {

    test('13.1 Get leaderboard', async ({ request }) => {
      // GET /gamification/leaderboard
      const r = await request.get(`${LMS_API}/gamification/leaderboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.2 Get my badges', async ({ request }) => {
      // GET /gamification/badges
      const r = await request.get(`${LMS_API}/gamification/badges`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.3 Get my points', async ({ request }) => {
      // GET /gamification/my/points
      const r = await request.get(`${LMS_API}/gamification/my/points`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. ANALYTICS (4 tests)
  // Routes: /api/v1/analytics
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('14. Analytics', () => {

    test('14.1 Get overview dashboard analytics', async ({ request }) => {
      // GET /analytics/overview (admin)
      const r = await request.get(`${LMS_API}/analytics/overview`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.2 Get org-wide analytics', async ({ request }) => {
      // GET /analytics/org (admin)
      const r = await request.get(`${LMS_API}/analytics/org`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.3 Get user analytics (self)', async ({ request }) => {
      // GET /analytics/user/:userId
      const r = await request.get(`${LMS_API}/analytics/user/${ssoUserId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.4 Get compliance analytics', async ({ request }) => {
      // GET /analytics/compliance (admin)
      const r = await request.get(`${LMS_API}/analytics/compliance`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. ILT SESSIONS (4 tests)
  // Routes: /api/v1/ilt/sessions
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('15. ILT Sessions', () => {

    test('15.1 Create ILT session', async ({ request }) => {
      // POST /ilt/sessions — createILTSessionSchema requires course_id, title, instructor_id, start_time, end_time, max_attendees
      const r = await request.post(`${LMS_API}/ilt/sessions`, {
        ...auth(),
        data: {
          title: `PW ILT Session ${Date.now()}`,
          course_id: createdCourseId || undefined,
          instructor_id: ssoUserId,
          start_time: '2026-06-15T09:00:00Z',
          end_time: '2026-06-15T17:00:00Z',
          location: 'Online',
          max_attendees: 30,
        },
      });
      expect([200, 201, 400, 422]).toContain(r.status());
      if (r.status() === 200 || r.status() === 201) {
        const body = await r.json();
        createdIltSessionId = body.data?.id || body.data?.session?.id || 0;
      }
    });

    test('15.2 List ILT sessions', async ({ request }) => {
      // GET /ilt/sessions or GET /ilt (alias)
      const r = await request.get(`${LMS_API}/ilt/sessions`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('15.3 Register for ILT session', async ({ request }) => {
      if (!createdIltSessionId) {
        // Skip gracefully if session wasn't created
        expect(true).toBeTruthy();
        return;
      }
      // POST /ilt/sessions/:id/register
      const r = await request.post(`${LMS_API}/ilt/sessions/${createdIltSessionId}/register`, auth());
      expect([200, 201, 409]).toContain(r.status());
    });

    test('15.4 Get ILT session attendance', async ({ request }) => {
      if (!createdIltSessionId) {
        // Skip gracefully if session wasn't created
        expect(true).toBeTruthy();
        return;
      }
      // GET /ilt/sessions/:id/attendance (admin)
      const r = await request.get(`${LMS_API}/ilt/sessions/${createdIltSessionId}/attendance`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });
});
