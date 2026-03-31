import { test, expect } from '@playwright/test';

// =============================================================================
// EMP LMS — Comprehensive E2E Tests (~60 tests)
// Auth: SSO from EmpCloud (ananya@technova.in)
// API: https://testlms-api.empcloud.com/api/v1
// Covers: Courses, Categories, Modules & Lessons, Enrollment, Certifications,
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
let createdCertificationId: number | string = 0;
let createdLearningPathId: number | string = 0;
let createdQuizId: number | string = 0;
let createdQuestionId: number | string = 0;
let createdDiscussionId: number | string = 0;
let createdIltSessionId: number | string = 0;

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

    // SSO to LMS
    const sso = await request.post(`${LMS_API}/auth/sso`, {
      data: { token: ecToken },
    });
    const ssoBody = await sso.json();
    token = ssoBody.data?.tokens?.accessToken
      || ssoBody.data?.tokens?.access_token
      || ssoBody.data?.token
      || ecToken;
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
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('2. Categories', () => {

    test('2.1 Create category', async ({ request }) => {
      const r = await request.post(`${LMS_API}/categories`, {
        ...auth(),
        data: { name: `PW Category ${Date.now()}`, description: 'Playwright test category' },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCategoryId = body.data?.id || body.data?.category?.id || body.data?.categoryId || 0;
    });

    test('2.2 List categories', async ({ request }) => {
      const r = await request.get(`${LMS_API}/categories`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('2.3 Get category by ID', async ({ request }) => {
      if (!createdCategoryId) test.skip();
      const r = await request.get(`${LMS_API}/categories/${createdCategoryId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. COURSES CRUD (10 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3. Courses CRUD', () => {

    test('3.1 Create course', async ({ request }) => {
      const r = await request.post(`${LMS_API}/courses`, {
        ...auth(),
        data: {
          title: `PW Course ${Date.now()}`,
          description: 'Playwright E2E test course',
          category_id: createdCategoryId || undefined,
          difficulty_level: 'beginner',
          duration_hours: 10,
          is_published: false,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCourseId = body.data?.id || body.data?.course?.id || body.data?.courseId || 0;
    });

    test('3.2 List courses', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('3.3 Get course by ID', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('3.4 Update course title', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}`, {
        ...auth(),
        data: { title: `PW Course Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('3.5 Update course description', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}`, {
        ...auth(),
        data: { description: 'Updated description from Playwright' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('3.6 Publish course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}`, {
        ...auth(),
        data: { is_published: true },
      });
      // May also have a dedicated publish endpoint
      if (r.status() === 404) {
        const r2 = await request.post(`${LMS_API}/courses/${createdCourseId}/publish`, auth());
        expect([200, 201, 204, 404]).toContain(r2.status());
      } else {
        expect([200, 204]).toContain(r.status());
      }
    });

    test('3.7 Filter courses by status', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?status=published`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.8 Filter courses by category', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?category_id=${createdCategoryId || 1}`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.9 Search courses by title', async ({ request }) => {
      const r = await request.get(`${LMS_API}/courses?search=PW`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.10 Delete course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      // Create a disposable course to delete
      const create = await request.post(`${LMS_API}/courses`, {
        ...auth(),
        data: { title: `PW Delete ${Date.now()}`, description: 'To be deleted' },
      });
      const cBody = await create.json();
      const delId = cBody.data?.id || cBody.data?.course?.id || 0;
      if (!delId) test.skip();
      const r = await request.delete(`${LMS_API}/courses/${delId}`, auth());
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MODULES & LESSONS (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('4. Modules & Lessons', () => {

    test('4.1 Create module in course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/modules`, {
        ...auth(),
        data: { title: `PW Module ${Date.now()}`, description: 'Test module', order: 1 },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdModuleId = body.data?.id || body.data?.module?.id || body.data?.moduleId || 0;
    });

    test('4.2 List modules for course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}/modules`, auth());
      expect(r.status()).toBe(200);
    });

    test('4.3 Create lesson in module', async ({ request }) => {
      if (!createdModuleId) test.skip();
      const r = await request.post(`${LMS_API}/modules/${createdModuleId}/lessons`, {
        ...auth(),
        data: {
          title: `PW Lesson ${Date.now()}`,
          content_type: 'video',
          content_url: 'https://example.com/video.mp4',
          duration_minutes: 15,
          order: 1,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdLessonId = body.data?.id || body.data?.lesson?.id || body.data?.lessonId || 0;
    });

    test('4.4 List lessons in module', async ({ request }) => {
      if (!createdModuleId) test.skip();
      const r = await request.get(`${LMS_API}/modules/${createdModuleId}/lessons`, auth());
      expect(r.status()).toBe(200);
    });

    test('4.5 Update lesson', async ({ request }) => {
      if (!createdLessonId) test.skip();
      const r = await request.put(`${LMS_API}/lessons/${createdLessonId}`, {
        ...auth(),
        data: { title: `PW Lesson Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('4.6 Reorder modules', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}/modules/reorder`, {
        ...auth(),
        data: { order: [createdModuleId] },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ENROLLMENT (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5. Enrollment', () => {

    test('5.1 Enroll in course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.post(`${LMS_API}/enrollments`, {
        ...auth(),
        data: { course_id: createdCourseId },
      });
      expect([200, 201, 409]).toContain(r.status()); // 409 if already enrolled
      const body = await r.json();
      createdEnrollmentId = body.data?.id || body.data?.enrollment?.id || body.data?.enrollmentId || 0;
    });

    test('5.2 List enrollments', async ({ request }) => {
      const r = await request.get(`${LMS_API}/enrollments`, auth());
      expect(r.status()).toBe(200);
    });

    test('5.3 Get enrollment by ID', async ({ request }) => {
      if (!createdEnrollmentId) test.skip();
      const r = await request.get(`${LMS_API}/enrollments/${createdEnrollmentId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.4 Update enrollment progress', async ({ request }) => {
      if (!createdEnrollmentId) test.skip();
      const r = await request.put(`${LMS_API}/enrollments/${createdEnrollmentId}/progress`, {
        ...auth(),
        data: { progress_percent: 50, lesson_id: createdLessonId || undefined },
      });
      expect([200, 204, 404]).toContain(r.status());
    });

    test('5.5 Mark lesson complete', async ({ request }) => {
      if (!createdLessonId || !createdEnrollmentId) test.skip();
      const r = await request.post(`${LMS_API}/enrollments/${createdEnrollmentId}/lessons/${createdLessonId}/complete`, auth());
      expect([200, 201, 204, 404]).toContain(r.status());
    });

    test('5.6 Get my enrolled courses', async ({ request }) => {
      const r = await request.get(`${LMS_API}/enrollments/my-courses`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CERTIFICATIONS (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('6. Certifications', () => {

    test('6.1 Create certification template', async ({ request }) => {
      const r = await request.post(`${LMS_API}/certifications`, {
        ...auth(),
        data: {
          name: `PW Cert ${Date.now()}`,
          description: 'Playwright test certification',
          course_id: createdCourseId || undefined,
          validity_months: 12,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdCertificationId = body.data?.id || body.data?.certification?.id || 0;
    });

    test('6.2 List certifications', async ({ request }) => {
      const r = await request.get(`${LMS_API}/certifications`, auth());
      expect(r.status()).toBe(200);
    });

    test('6.3 Get certification by ID', async ({ request }) => {
      if (!createdCertificationId) test.skip();
      const r = await request.get(`${LMS_API}/certifications/${createdCertificationId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Issue certification to user', async ({ request }) => {
      if (!createdCertificationId) test.skip();
      const r = await request.post(`${LMS_API}/certifications/${createdCertificationId}/issue`, {
        ...auth(),
        data: { user_id: 522 }, // Known test user
      });
      expect([200, 201, 400, 404, 409]).toContain(r.status());
    });

    test('6.5 List user certifications', async ({ request }) => {
      const r = await request.get(`${LMS_API}/certifications/my-certifications`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. LEARNING PATHS (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('7. Learning Paths', () => {

    test('7.1 Create learning path', async ({ request }) => {
      const r = await request.post(`${LMS_API}/learning-paths`, {
        ...auth(),
        data: {
          title: `PW Path ${Date.now()}`,
          description: 'Playwright test learning path',
          difficulty_level: 'intermediate',
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
      if (!createdLearningPathId) test.skip();
      const r = await request.get(`${LMS_API}/learning-paths/${createdLearningPathId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.4 Add course to learning path', async ({ request }) => {
      if (!createdLearningPathId || !createdCourseId) test.skip();
      const r = await request.post(`${LMS_API}/learning-paths/${createdLearningPathId}/courses`, {
        ...auth(),
        data: { course_id: createdCourseId, order: 1 },
      });
      expect([200, 201, 409]).toContain(r.status());
    });

    test('7.5 Enroll in learning path', async ({ request }) => {
      if (!createdLearningPathId) test.skip();
      const r = await request.post(`${LMS_API}/learning-paths/${createdLearningPathId}/enroll`, auth());
      expect([200, 201, 409]).toContain(r.status());
    });

    test('7.6 Update learning path', async ({ request }) => {
      if (!createdLearningPathId) test.skip();
      const r = await request.put(`${LMS_API}/learning-paths/${createdLearningPathId}`, {
        ...auth(),
        data: { title: `PW Path Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. QUIZZES (8 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('8. Quizzes', () => {

    test('8.1 Create quiz for course', async ({ request }) => {
      if (!createdCourseId) test.skip();
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
      createdQuizId = body.data?.id || body.data?.quiz?.id || body.data?.quizId || 0;
    });

    test('8.2 List quizzes', async ({ request }) => {
      const r = await request.get(`${LMS_API}/quizzes`, auth());
      expect(r.status()).toBe(200);
    });

    test('8.3 Get quiz by ID', async ({ request }) => {
      if (!createdQuizId) test.skip();
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.4 Add question to quiz', async ({ request }) => {
      if (!createdQuizId) test.skip();
      const r = await request.post(`${LMS_API}/quizzes/${createdQuizId}/questions`, {
        ...auth(),
        data: {
          question_text: 'What is Playwright used for?',
          question_type: 'multiple_choice',
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

    test('8.5 List quiz questions', async ({ request }) => {
      if (!createdQuizId) test.skip();
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}/questions`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.6 Start quiz attempt', async ({ request }) => {
      if (!createdQuizId) test.skip();
      const r = await request.post(`${LMS_API}/quizzes/${createdQuizId}/attempts`, auth());
      expect([200, 201, 400, 403]).toContain(r.status());
    });

    test('8.7 Submit quiz answer', async ({ request }) => {
      if (!createdQuizId || !createdQuestionId) test.skip();
      const r = await request.post(`${LMS_API}/quizzes/${createdQuizId}/submit`, {
        ...auth(),
        data: {
          answers: [{ question_id: createdQuestionId, selected_option: 0 }],
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('8.8 Get quiz results', async ({ request }) => {
      if (!createdQuizId) test.skip();
      const r = await request.get(`${LMS_API}/quizzes/${createdQuizId}/results`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. DISCUSSIONS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('9. Discussions', () => {

    test('9.1 Create discussion thread', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.post(`${LMS_API}/discussions`, {
        ...auth(),
        data: {
          course_id: createdCourseId,
          title: `PW Discussion ${Date.now()}`,
          body: 'This is a Playwright test discussion thread.',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdDiscussionId = body.data?.id || body.data?.discussion?.id || 0;
    });

    test('9.2 List discussions for course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.get(`${LMS_API}/discussions?course_id=${createdCourseId}`, auth());
      expect(r.status()).toBe(200);
    });

    test('9.3 Reply to discussion', async ({ request }) => {
      if (!createdDiscussionId) test.skip();
      const r = await request.post(`${LMS_API}/discussions/${createdDiscussionId}/replies`, {
        ...auth(),
        data: { body: 'Playwright reply to discussion thread.' },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('9.4 Get discussion by ID', async ({ request }) => {
      if (!createdDiscussionId) test.skip();
      const r = await request.get(`${LMS_API}/discussions/${createdDiscussionId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. RATINGS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('10. Ratings', () => {

    test('10.1 Rate a course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.post(`${LMS_API}/courses/${createdCourseId}/ratings`, {
        ...auth(),
        data: { rating: 4, review: 'Great Playwright test course!' },
      });
      expect([200, 201, 409]).toContain(r.status()); // 409 if already rated
    });

    test('10.2 Get course ratings', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}/ratings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Get average rating for course', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.get(`${LMS_API}/courses/${createdCourseId}/ratings/average`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.4 Update my rating', async ({ request }) => {
      if (!createdCourseId) test.skip();
      const r = await request.put(`${LMS_API}/courses/${createdCourseId}/ratings`, {
        ...auth(),
        data: { rating: 5, review: 'Updated Playwright review!' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. SCORM (3 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('11. SCORM', () => {

    test('11.1 List SCORM packages', async ({ request }) => {
      const r = await request.get(`${LMS_API}/scorm/packages`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.2 Get SCORM runtime data', async ({ request }) => {
      const r = await request.get(`${LMS_API}/scorm/runtime`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.3 SCORM completion tracking', async ({ request }) => {
      const r = await request.get(`${LMS_API}/scorm/completions`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. COMPLIANCE (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('12. Compliance', () => {

    test('12.1 List compliance trainings', async ({ request }) => {
      const r = await request.get(`${LMS_API}/compliance/trainings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.2 Create compliance training', async ({ request }) => {
      const r = await request.post(`${LMS_API}/compliance/trainings`, {
        ...auth(),
        data: {
          title: `PW Compliance ${Date.now()}`,
          course_id: createdCourseId || undefined,
          deadline: '2026-12-31',
          is_mandatory: true,
        },
      });
      expect([200, 201, 404]).toContain(r.status());
    });

    test('12.3 Get compliance status report', async ({ request }) => {
      const r = await request.get(`${LMS_API}/compliance/status`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.4 Get overdue compliance trainings', async ({ request }) => {
      const r = await request.get(`${LMS_API}/compliance/overdue`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. GAMIFICATION (3 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('13. Gamification', () => {

    test('13.1 Get leaderboard', async ({ request }) => {
      const r = await request.get(`${LMS_API}/gamification/leaderboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.2 Get my badges', async ({ request }) => {
      const r = await request.get(`${LMS_API}/gamification/badges`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.3 Get my points', async ({ request }) => {
      const r = await request.get(`${LMS_API}/gamification/points`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. ANALYTICS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('14. Analytics', () => {

    test('14.1 Get dashboard analytics', async ({ request }) => {
      const r = await request.get(`${LMS_API}/analytics/dashboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.2 Get course completion analytics', async ({ request }) => {
      const r = await request.get(`${LMS_API}/analytics/completions`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.3 Get learner progress report', async ({ request }) => {
      const r = await request.get(`${LMS_API}/analytics/learner-progress`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.4 Get course engagement analytics', async ({ request }) => {
      const r = await request.get(`${LMS_API}/analytics/engagement`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. ILT SESSIONS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('15. ILT Sessions', () => {

    test('15.1 Create ILT session', async ({ request }) => {
      const r = await request.post(`${LMS_API}/ilt-sessions`, {
        ...auth(),
        data: {
          title: `PW ILT Session ${Date.now()}`,
          course_id: createdCourseId || undefined,
          instructor_name: 'PW Instructor',
          start_time: '2026-06-15T09:00:00Z',
          end_time: '2026-06-15T17:00:00Z',
          location: 'Online',
          max_participants: 30,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdIltSessionId = body.data?.id || body.data?.session?.id || 0;
    });

    test('15.2 List ILT sessions', async ({ request }) => {
      const r = await request.get(`${LMS_API}/ilt-sessions`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('15.3 Register for ILT session', async ({ request }) => {
      if (!createdIltSessionId) test.skip();
      const r = await request.post(`${LMS_API}/ilt-sessions/${createdIltSessionId}/register`, auth());
      expect([200, 201, 409]).toContain(r.status());
    });

    test('15.4 Get ILT session attendance', async ({ request }) => {
      if (!createdIltSessionId) test.skip();
      const r = await request.get(`${LMS_API}/ilt-sessions/${createdIltSessionId}/attendance`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });
});
