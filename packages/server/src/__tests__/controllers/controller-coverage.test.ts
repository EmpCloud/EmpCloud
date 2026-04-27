// =============================================================================
// EMP CLOUD — Controller/Route Handler Unit Tests
// Tests request param extraction, response formatting, error handling, and
// auth context usage for ALL route handlers (inline controllers).
// =============================================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock ALL service modules BEFORE importing routes
// ---------------------------------------------------------------------------

// Auth services
vi.mock("../../services/auth/auth.service.js", () => ({
  register: vi.fn().mockResolvedValue({ org: { id: 5 }, user: { id: 100 }, accessToken: "tok" }),
  login: vi.fn().mockResolvedValue({ org: { id: 5 }, user: { id: 100 }, accessToken: "tok" }),
  changePassword: vi.fn().mockResolvedValue(undefined),
  forgotPassword: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue(undefined),
}));

// Leave services
vi.mock("../../services/leave/leave-type.service.js", () => ({
  listLeaveTypes: vi.fn().mockResolvedValue([{ id: 1, name: "CL" }]),
  getLeaveType: vi.fn().mockResolvedValue({ id: 1, name: "CL" }),
  createLeaveType: vi.fn().mockResolvedValue({ id: 1, name: "CL" }),
  updateLeaveType: vi.fn().mockResolvedValue({ id: 1, name: "CL-Updated" }),
  deleteLeaveType: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/leave/leave-policy.service.js", () => ({
  listLeavePolicies: vi.fn().mockResolvedValue([{ id: 1 }]),
  getLeavePolicy: vi.fn().mockResolvedValue({ id: 1 }),
  createLeavePolicy: vi.fn().mockResolvedValue({ id: 1 }),
  updateLeavePolicy: vi.fn().mockResolvedValue({ id: 1 }),
  deleteLeavePolicy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/leave/leave-balance.service.js", () => ({
  getBalances: vi.fn().mockResolvedValue([{ leave_type_id: 1, balance: 10 }]),
  initializeBalances: vi.fn().mockResolvedValue(5),
}));

vi.mock("../../services/leave/leave-application.service.js", () => ({
  listApplications: vi.fn().mockResolvedValue({ applications: [{ id: 1 }], total: 1 }),
  getApplication: vi.fn().mockResolvedValue({ id: 1 }),
  applyLeave: vi.fn().mockResolvedValue({ id: 1 }),
  approveLeave: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  rejectLeave: vi.fn().mockResolvedValue({ id: 1, status: "rejected" }),
  cancelLeave: vi.fn().mockResolvedValue({ id: 1, status: "cancelled" }),
  getLeaveCalendar: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/leave/comp-off.service.js", () => ({
  listCompOffs: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
  requestCompOff: vi.fn().mockResolvedValue({ id: 1 }),
  approveCompOff: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  rejectCompOff: vi.fn().mockResolvedValue({ id: 1, status: "rejected" }),
}));

// Attendance services
vi.mock("../../services/attendance/shift.service.js", () => ({
  listShifts: vi.fn().mockResolvedValue([{ id: 1, name: "Morning" }]),
  getShift: vi.fn().mockResolvedValue({ id: 1, name: "Morning" }),
  createShift: vi.fn().mockResolvedValue({ id: 1, name: "Morning" }),
  updateShift: vi.fn().mockResolvedValue({ id: 1, name: "Evening" }),
  deleteShift: vi.fn().mockResolvedValue(undefined),
  assignShift: vi.fn().mockResolvedValue({ id: 1 }),
  listShiftAssignments: vi.fn().mockResolvedValue([]),
  bulkAssignShifts: vi.fn().mockResolvedValue({ assigned: 3 }),
  getSchedule: vi.fn().mockResolvedValue([]),
  getMySchedule: vi.fn().mockResolvedValue([]),
  createSwapRequest: vi.fn().mockResolvedValue({ id: 1 }),
  listSwapRequests: vi.fn().mockResolvedValue([]),
  approveSwapRequest: vi.fn().mockResolvedValue({ id: 1 }),
  rejectSwapRequest: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("../../services/attendance/attendance.service.js", () => ({
  checkIn: vi.fn().mockResolvedValue({ id: 1 }),
  checkOut: vi.fn().mockResolvedValue({ id: 1 }),
  getMyToday: vi.fn().mockResolvedValue({ id: 1 }),
  getMyHistory: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  listRecords: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  getDashboard: vi.fn().mockResolvedValue({ present: 10, absent: 2 }),
  getMonthlyReport: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/attendance/geo-fence.service.js", () => ({
  listGeoFences: vi.fn().mockResolvedValue([]),
  createGeoFence: vi.fn().mockResolvedValue({ id: 1 }),
  updateGeoFence: vi.fn().mockResolvedValue({ id: 1 }),
  deleteGeoFence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/attendance/regularization.service.js", () => ({
  submitRegularization: vi.fn().mockResolvedValue({ id: 1 }),
  listRegularizations: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  getMyRegularizations: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  approveRegularization: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  rejectRegularization: vi.fn().mockResolvedValue({ id: 1, status: "rejected" }),
}));

// Employee services
vi.mock("../../services/employee/employee-profile.service.js", () => ({
  getDirectory: vi.fn().mockResolvedValue({ users: [{ id: 1 }], total: 1 }),
  getProfile: vi.fn().mockResolvedValue({ id: 1 }),
  upsertProfile: vi.fn().mockResolvedValue({ id: 1 }),
  getBirthdays: vi.fn().mockResolvedValue([]),
  getAnniversaries: vi.fn().mockResolvedValue([]),
  getHeadcount: vi.fn().mockResolvedValue({ total: 50 }),
}));

vi.mock("../../services/employee/employee-detail.service.js", () => ({
  getAddresses: vi.fn().mockResolvedValue([]),
  createAddress: vi.fn().mockResolvedValue({ id: 1 }),
  updateAddress: vi.fn().mockResolvedValue({ id: 1 }),
  deleteAddress: vi.fn().mockResolvedValue(undefined),
  getEducation: vi.fn().mockResolvedValue([]),
  createEducation: vi.fn().mockResolvedValue({ id: 1 }),
  updateEducation: vi.fn().mockResolvedValue({ id: 1 }),
  deleteEducation: vi.fn().mockResolvedValue(undefined),
  getExperience: vi.fn().mockResolvedValue([]),
  createExperience: vi.fn().mockResolvedValue({ id: 1 }),
  updateExperience: vi.fn().mockResolvedValue({ id: 1 }),
  deleteExperience: vi.fn().mockResolvedValue(undefined),
  getDependents: vi.fn().mockResolvedValue([]),
  createDependent: vi.fn().mockResolvedValue({ id: 1 }),
  updateDependent: vi.fn().mockResolvedValue({ id: 1 }),
  deleteDependent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/employee/probation.service.js", () => ({
  getEmployeesOnProbation: vi.fn().mockResolvedValue([]),
  getProbationDashboard: vi.fn().mockResolvedValue({ total: 0 }),
  getUpcomingConfirmations: vi.fn().mockResolvedValue([]),
  confirmProbation: vi.fn().mockResolvedValue({ id: 1 }),
  extendProbation: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("../../services/employee/salary.service.js", () => ({
  getSalaryStructure: vi.fn().mockResolvedValue({ ctc: 1200000 }),
  upsertSalaryStructure: vi.fn().mockResolvedValue({ ctc: 1200000 }),
}));

// User services
vi.mock("../../services/user/user.service.js", () => ({
  listUsers: vi.fn().mockResolvedValue({ users: [{ id: 1, first_name: "A", last_name: "B", email: "a@b.com", role: "employee" }], total: 1 }),
  getUser: vi.fn().mockResolvedValue({ id: 1, first_name: "A", last_name: "B", email: "a@b.com", role: "employee" }),
  createUser: vi.fn().mockResolvedValue({ id: 2, first_name: "New", email: "new@test.com" }),
  updateUser: vi.fn().mockResolvedValue({ id: 1 }),
  deactivateUser: vi.fn().mockResolvedValue(undefined),
  inviteUser: vi.fn().mockResolvedValue({ invitation_id: 1 }),
  listInvitations: vi.fn().mockResolvedValue([]),
  acceptInvitation: vi.fn().mockResolvedValue({ id: 3 }),
  getOrgChart: vi.fn().mockResolvedValue([]),
}));

// Org services
vi.mock("../../services/org/org.service.js", () => ({
  getOrg: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
  updateOrg: vi.fn().mockResolvedValue({ id: 5, name: "Updated" }),
  getOrgStats: vi.fn().mockResolvedValue({ users: 50 }),
  listDepartments: vi.fn().mockResolvedValue([{ id: 1, name: "Engineering" }]),
  getDepartment: vi.fn().mockResolvedValue({ id: 1, name: "Engineering" }),
  createDepartment: vi.fn().mockResolvedValue({ id: 2, name: "HR" }),
  updateDepartment: vi.fn().mockResolvedValue({ id: 1, name: "Eng" }),
  deleteDepartment: vi.fn().mockResolvedValue(undefined),
  listLocations: vi.fn().mockResolvedValue([]),
  getLocation: vi.fn().mockResolvedValue({ id: 1 }),
  createLocation: vi.fn().mockResolvedValue({ id: 1 }),
  updateLocation: vi.fn().mockResolvedValue({ id: 1 }),
  deleteLocation: vi.fn().mockResolvedValue(undefined),
}));

// Announcement services
vi.mock("../../services/announcement/announcement.service.js", () => ({
  listAnnouncements: vi.fn().mockResolvedValue({ announcements: [], total: 0 }),
  getAnnouncement: vi.fn().mockResolvedValue({ id: 1, title: "Test" }),
  createAnnouncement: vi.fn().mockResolvedValue({ id: 1, title: "Test" }),
  updateAnnouncement: vi.fn().mockResolvedValue({ id: 1 }),
  deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
  markAsRead: vi.fn().mockResolvedValue(undefined),
  getUnreadCount: vi.fn().mockResolvedValue(3),
}));

// Policy services
vi.mock("../../services/policy/policy.service.js", () => ({
  listPolicies: vi.fn().mockResolvedValue({ policies: [], total: 0 }),
  getPolicy: vi.fn().mockResolvedValue({ id: 1, title: "POSH" }),
  createPolicy: vi.fn().mockResolvedValue({ id: 1 }),
  updatePolicy: vi.fn().mockResolvedValue({ id: 1 }),
  deletePolicy: vi.fn().mockResolvedValue(undefined),
  acknowledgePolicy: vi.fn().mockResolvedValue({ acknowledged: true }),
  getAcknowledgments: vi.fn().mockResolvedValue([]),
  getPendingAcknowledgments: vi.fn().mockResolvedValue([]),
}));

// Document services
vi.mock("../../services/document/document.service.js", () => ({
  listCategories: vi.fn().mockResolvedValue([]),
  createCategory: vi.fn().mockResolvedValue({ id: 1 }),
  updateCategory: vi.fn().mockResolvedValue({ id: 1 }),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
  getDocument: vi.fn().mockResolvedValue({ id: 1 }),
  uploadDocument: vi.fn().mockResolvedValue({ id: 1 }),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  verifyDocument: vi.fn().mockResolvedValue({ id: 1 }),
  rejectDocument: vi.fn().mockResolvedValue({ id: 1 }),
  getMyDocuments: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
  getExpiryAlerts: vi.fn().mockResolvedValue([]),
  getMandatoryTracking: vi.fn().mockResolvedValue({ total: 0 }),
  getDocumentForDownload: vi.fn().mockResolvedValue({ id: 1, file_path: "uploads/test.pdf", name: "test", mime_type: "application/pdf" }),
}));

// Module services
vi.mock("../../services/module/module.service.js", () => ({
  listModules: vi.fn().mockResolvedValue([{ id: 1, name: "Payroll", slug: "payroll" }]),
  getModule: vi.fn().mockResolvedValue({ id: 1, name: "Payroll" }),
  getModuleFeatures: vi.fn().mockResolvedValue([]),
  createModule: vi.fn().mockResolvedValue({ id: 2 }),
  updateModule: vi.fn().mockResolvedValue({ id: 1 }),
}));

// Subscription services
vi.mock("../../services/subscription/subscription.service.js", () => ({
  listSubscriptions: vi.fn().mockResolvedValue([{ id: 1 }]),
  getSubscription: vi.fn().mockResolvedValue({ id: 1, module_id: 1 }),
  createSubscription: vi.fn().mockResolvedValue({ id: 1 }),
  updateSubscription: vi.fn().mockResolvedValue({ id: 1 }),
  cancelSubscription: vi.fn().mockResolvedValue({ id: 1 }),
  listSeats: vi.fn().mockResolvedValue([]),
  assignSeat: vi.fn().mockResolvedValue({ id: 1 }),
  revokeSeat: vi.fn().mockResolvedValue(undefined),
  checkModuleAccess: vi.fn().mockResolvedValue({ has_access: true }),
  getBillingStatus: vi.fn().mockResolvedValue({ status: "active" }),
}));

vi.mock("../../services/billing/billing-integration.service.js", () => ({
  getLocalBillingSummary: vi.fn().mockResolvedValue({ total: 0 }),
  onSubscriptionCreated: vi.fn().mockResolvedValue(undefined),
  onSubscriptionUpdated: vi.fn().mockResolvedValue(undefined),
  onSubscriptionCancelled: vi.fn().mockResolvedValue(undefined),
}));

// Notification services
vi.mock("../../services/notification/notification.service.js", () => ({
  listNotifications: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
  getUnreadCount: vi.fn().mockResolvedValue(5),
  markAsRead: vi.fn().mockResolvedValue(undefined),
  markAllAsRead: vi.fn().mockResolvedValue({ updated: 5 }),
}));

// Helpdesk services
vi.mock("../../services/helpdesk/helpdesk.service.js", () => ({
  createTicket: vi.fn().mockResolvedValue({ id: 1 }),
  getMyTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
  listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
  getTicket: vi.fn().mockResolvedValue({ id: 1 }),
  updateTicket: vi.fn().mockResolvedValue({ id: 1 }),
  assignTicket: vi.fn().mockResolvedValue({ id: 1 }),
  addComment: vi.fn().mockResolvedValue({ id: 1 }),
  resolveTicket: vi.fn().mockResolvedValue({ id: 1 }),
  closeTicket: vi.fn().mockResolvedValue({ id: 1 }),
  reopenTicket: vi.fn().mockResolvedValue({ id: 1 }),
  rateTicket: vi.fn().mockResolvedValue({ id: 1 }),
  listArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
  getArticle: vi.fn().mockResolvedValue({ id: 1 }),
  createArticle: vi.fn().mockResolvedValue({ id: 1 }),
  updateArticle: vi.fn().mockResolvedValue({ id: 1 }),
  deleteArticle: vi.fn().mockResolvedValue(undefined),
  rateArticle: vi.fn().mockResolvedValue({ id: 1 }),
  getHelpdeskDashboard: vi.fn().mockResolvedValue({ open: 5 }),
}));

// Survey services
vi.mock("../../services/survey/survey.service.js", () => ({
  getActiveSurveys: vi.fn().mockResolvedValue([]),
  getSurveyDashboard: vi.fn().mockResolvedValue({ total: 0 }),
  getMyResponses: vi.fn().mockResolvedValue([]),
  listSurveys: vi.fn().mockResolvedValue({ surveys: [], total: 0 }),
  getSurvey: vi.fn().mockResolvedValue({ id: 1, status: "active" }),
  createSurvey: vi.fn().mockResolvedValue({ id: 1 }),
  updateSurvey: vi.fn().mockResolvedValue({ id: 1 }),
  publishSurvey: vi.fn().mockResolvedValue({ id: 1 }),
  closeSurvey: vi.fn().mockResolvedValue({ id: 1 }),
  deleteSurvey: vi.fn().mockResolvedValue(undefined),
  submitResponse: vi.fn().mockResolvedValue({ response_id: 1 }),
  getSurveyResults: vi.fn().mockResolvedValue({ questions: [] }),
}));

// Dashboard services
vi.mock("../../services/dashboard/widget.service.js", () => ({
  getModuleWidgets: vi.fn().mockResolvedValue([]),
}));

// Audit service (all routes use this)
vi.mock("../../services/audit/audit.service.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

// Import service
vi.mock("../../services/import/import.service.js", () => ({
  parseCSV: vi.fn().mockReturnValue([{ first_name: "Test", last_name: "User", email: "test@t.com" }]),
  validateImportData: vi.fn().mockResolvedValue({ valid: [{ first_name: "Test" }], invalid: [] }),
  executeImport: vi.fn().mockResolvedValue({ count: 1 }),
}));

// OAuth/JWT service
vi.mock("../../services/oauth/jwt.service.js", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ sub: 100, org_id: 5, role: "hr_admin" }),
  signAccessToken: vi.fn().mockReturnValue("sso-tok-123"),
}));

// Database connection mock
vi.mock("../../db/connection.js", () => {
  const mockQuery: any = vi.fn().mockReturnThis();
  mockQuery.where = vi.fn().mockReturnThis();
  mockQuery.select = vi.fn().mockReturnThis();
  mockQuery.first = vi.fn().mockResolvedValue({ id: 100, department_id: 1, organization_id: 5, photo_path: null });
  mockQuery.update = vi.fn().mockResolvedValue(1);
  const mockDB = vi.fn().mockReturnValue(mockQuery);
  (mockDB as any).schema = { hasTable: vi.fn().mockResolvedValue(false) };
  return { getDB: vi.fn().mockReturnValue(mockDB) };
});

// Upload middleware mock
vi.mock("../../api/middleware/upload.middleware.js", () => ({
  upload: {
    single: () => (_req: any, _res: any, next: any) => next(),
    array: () => (_req: any, _res: any, next: any) => next(),
  },
}));

// ---------------------------------------------------------------------------
// Mock authenticate middleware to inject user into req
// ---------------------------------------------------------------------------
vi.mock("../../api/middleware/auth.middleware.js", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = req.headers["x-test-user"]
      ? JSON.parse(req.headers["x-test-user"] as string)
      : {
          sub: 100,
          email: "hr@test.com",
          first_name: "HR",
          last_name: "Admin",
          role: "hr_admin",
          org_id: 5,
          org_name: "TestOrg",
          scope: "openid profile",
          client_id: "empcloud",
          jti: "test-jti",
        };
    next();
  },
}));

// Mock RBAC middleware to passthrough (we test RBAC logic separately)
vi.mock("../../api/middleware/rbac.middleware.js", () => ({
  requireHR: (_req: any, _res: any, next: any) => next(),
  requireOrgAdmin: (_req: any, _res: any, next: any) => next(),
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireSelfOrHR: () => (_req: any, _res: any, next: any) => next(),
}));

// ---------------------------------------------------------------------------
// Import route modules (after all mocks are set up)
// ---------------------------------------------------------------------------
import leaveRouter from "../../api/routes/leave.routes.js";
import attendanceRouter from "../../api/routes/attendance.routes.js";
import employeeRouter from "../../api/routes/employee.routes.js";
import authRouter from "../../api/routes/auth.routes.js";
import userRouter from "../../api/routes/user.routes.js";
import orgRouter from "../../api/routes/org.routes.js";
import announcementRouter from "../../api/routes/announcement.routes.js";
import policyRouter from "../../api/routes/policy.routes.js";
import documentRouter from "../../api/routes/document.routes.js";
import moduleRouter from "../../api/routes/module.routes.js";
import subscriptionRouter from "../../api/routes/subscription.routes.js";
import notificationRouter from "../../api/routes/notification.routes.js";
import helpdeskRouter from "../../api/routes/helpdesk.routes.js";
import surveyRouter from "../../api/routes/survey.routes.js";
import dashboardRouter from "../../api/routes/dashboard.routes.js";

// Import mocked services for assertions
import * as leaveTypeService from "../../services/leave/leave-type.service.js";
import * as leavePolicyService from "../../services/leave/leave-policy.service.js";
import * as leaveBalanceService from "../../services/leave/leave-balance.service.js";
import * as leaveApplicationService from "../../services/leave/leave-application.service.js";
import * as compOffService from "../../services/leave/comp-off.service.js";
import * as shiftService from "../../services/attendance/shift.service.js";
import * as attendanceService from "../../services/attendance/attendance.service.js";
import * as geoFenceService from "../../services/attendance/geo-fence.service.js";
import * as regularizationService from "../../services/attendance/regularization.service.js";
import * as profileService from "../../services/employee/employee-profile.service.js";
import * as detailService from "../../services/employee/employee-detail.service.js";
import * as probationService from "../../services/employee/probation.service.js";
import * as salaryService from "../../services/employee/salary.service.js";
import * as userService from "../../services/user/user.service.js";
import * as orgService from "../../services/org/org.service.js";
import * as announcementService from "../../services/announcement/announcement.service.js";
import * as policyService from "../../services/policy/policy.service.js";
import * as documentService from "../../services/document/document.service.js";
import * as moduleService from "../../services/module/module.service.js";
import * as subService from "../../services/subscription/subscription.service.js";
import * as notificationService from "../../services/notification/notification.service.js";
import * as helpdeskService from "../../services/helpdesk/helpdesk.service.js";
import * as surveyService from "../../services/survey/survey.service.js";
import { getModuleWidgets } from "../../services/dashboard/widget.service.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { register, login, changePassword, forgotPassword, resetPassword } from "../../services/auth/auth.service.js";

// ---------------------------------------------------------------------------
// Create Express test app with all routers
// ---------------------------------------------------------------------------
function createApp() {
  const app = express();
  app.use(express.json());

  app.use("/api/v1/leave", leaveRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/employees", employeeRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", userRouter);
  app.use("/api/v1/organizations", orgRouter);
  app.use("/api/v1/announcements", announcementRouter);
  app.use("/api/v1/policies", policyRouter);
  app.use("/api/v1/documents", documentRouter);
  app.use("/api/v1/modules", moduleRouter);
  app.use("/api/v1/subscriptions", subscriptionRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/helpdesk", helpdeskRouter);
  app.use("/api/v1/surveys", surveyRouter);
  app.use("/api/v1/dashboard", dashboardRouter);

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: { code: err.code || "INTERNAL_ERROR", message: err.message },
    });
  });

  return app;
}

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Default HR user header for supertest
const HR_USER = JSON.stringify({
  sub: 100, email: "hr@test.com", first_name: "HR", last_name: "Admin",
  role: "hr_admin", org_id: 5, org_name: "TestOrg", scope: "openid profile",
  client_id: "empcloud", jti: "test-jti",
});

const EMPLOYEE_USER = JSON.stringify({
  sub: 200, email: "emp@test.com", first_name: "Emp", last_name: "User",
  role: "employee", org_id: 5, org_name: "TestOrg", scope: "openid profile",
  client_id: "empcloud", jti: "test-jti-2",
});

const ORG_ADMIN_USER = JSON.stringify({
  sub: 100, email: "admin@test.com", first_name: "Org", last_name: "Admin",
  role: "org_admin", org_id: 5, org_name: "TestOrg", scope: "openid profile",
  client_id: "empcloud", jti: "test-jti-3",
});

const SUPER_ADMIN_USER = JSON.stringify({
  sub: 1, email: "super@test.com", first_name: "Super", last_name: "Admin",
  role: "super_admin", org_id: 0, org_name: "Platform", scope: "openid profile",
  client_id: "empcloud", jti: "test-jti-4",
});

// =============================================================================
// LEAVE ROUTES
// =============================================================================
describe("Leave Routes — Controller Coverage", () => {
  // --- Leave Types ---
  describe("Leave Types", () => {
    it("GET /types — calls listLeaveTypes with org_id", async () => {
      const res = await request(app).get("/api/v1/leave/types").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(leaveTypeService.listLeaveTypes).toHaveBeenCalledWith(5);
    });

    it("GET /types/:id — extracts paramInt", async () => {
      const res = await request(app).get("/api/v1/leave/types/3").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveTypeService.getLeaveType).toHaveBeenCalledWith(5, 3);
    });

    it("POST /types — parses body and returns 201", async () => {
      const res = await request(app)
        .post("/api/v1/leave/types")
        .set("x-test-user", HR_USER)
        // #1614 — annual_quota now required so the server can auto-create
        // a default policy alongside the type.
        .send({ name: "Sick Leave", code: "SL", is_paid: true, is_carry_forward: false, annual_quota: 6 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(leaveTypeService.createLeaveType).toHaveBeenCalledWith(5, expect.objectContaining({ name: "Sick Leave" }));
      expect(logAudit).toHaveBeenCalled();
    });

    it("PUT /types/:id — updates with parsed body and paramInt", async () => {
      const res = await request(app)
        .put("/api/v1/leave/types/3")
        .set("x-test-user", HR_USER)
        .send({ name: "Updated Leave" });
      expect(res.status).toBe(200);
      expect(leaveTypeService.updateLeaveType).toHaveBeenCalledWith(5, 3, expect.objectContaining({ name: "Updated Leave" }));
    });

    it("DELETE /types/:id — deactivates", async () => {
      const res = await request(app).delete("/api/v1/leave/types/3").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveTypeService.deleteLeaveType).toHaveBeenCalledWith(5, 3);
    });
  });

  // --- Leave Policies ---
  describe("Leave Policies", () => {
    it("GET /policies — lists", async () => {
      const res = await request(app).get("/api/v1/leave/policies").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leavePolicyService.listLeavePolicies).toHaveBeenCalledWith(5);
    });

    it("POST /policies — creates with 201", async () => {
      const res = await request(app)
        .post("/api/v1/leave/policies")
        .set("x-test-user", HR_USER)
        .send({ name: "Default Policy", leave_type_id: 1, annual_quota: 20 });
      expect(res.status).toBe(201);
    });

    it("DELETE /policies/:id — deactivates", async () => {
      const res = await request(app).delete("/api/v1/leave/policies/1").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leavePolicyService.deleteLeavePolicy).toHaveBeenCalledWith(5, 1);
    });
  });

  // --- Leave Balances ---
  describe("Leave Balances", () => {
    it("GET /balances — returns own balances", async () => {
      const res = await request(app).get("/api/v1/leave/balances").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveBalanceService.getBalances).toHaveBeenCalledWith(5, 100, undefined);
    });

    it("GET /balances?user_id=200 — HR can view other users", async () => {
      const res = await request(app).get("/api/v1/leave/balances?user_id=200").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveBalanceService.getBalances).toHaveBeenCalledWith(5, 200, undefined);
    });

    it("GET /balances?user_id=200 — employee gets 403 viewing others", async () => {
      const res = await request(app).get("/api/v1/leave/balances?user_id=201").set("x-test-user", EMPLOYEE_USER);
      expect(res.status).toBe(403);
    });

    it("GET /balances/me — shortcut for own balances", async () => {
      const res = await request(app).get("/api/v1/leave/balances/me").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveBalanceService.getBalances).toHaveBeenCalledWith(5, 100, undefined);
    });

    it("POST /balances/initialize — returns 201", async () => {
      const res = await request(app)
        .post("/api/v1/leave/balances/initialize")
        .set("x-test-user", HR_USER)
        .send({ year: 2026 });
      expect(res.status).toBe(201);
      expect(leaveBalanceService.initializeBalances).toHaveBeenCalledWith(5, 2026);
    });
  });

  // --- Leave Applications ---
  describe("Leave Applications", () => {
    it("GET /applications/me — uses req.user.sub", async () => {
      const res = await request(app).get("/api/v1/leave/applications/me").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveApplicationService.listApplications).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ userId: 100 })
      );
    });

    it("GET /applications — HR sees all", async () => {
      const res = await request(app).get("/api/v1/leave/applications").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("GET /applications — employee sees only own", async () => {
      const res = await request(app).get("/api/v1/leave/applications").set("x-test-user", EMPLOYEE_USER);
      expect(res.status).toBe(200);
      expect(leaveApplicationService.listApplications).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ userId: 200 })
      );
    });

    it("GET /applications/:id — extracts id param", async () => {
      const res = await request(app).get("/api/v1/leave/applications/42").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveApplicationService.getApplication).toHaveBeenCalledWith(5, 42);
    });

    it("POST /applications — creates and audits", async () => {
      const res = await request(app)
        .post("/api/v1/leave/applications")
        .set("x-test-user", HR_USER)
        .send({ leave_type_id: 1, start_date: "2026-05-01", end_date: "2026-05-02", days_count: 2, reason: "Personal" });
      expect(res.status).toBe(201);
      expect(leaveApplicationService.applyLeave).toHaveBeenCalledWith(5, 100, expect.objectContaining({ leave_type_id: 1 }));
      expect(logAudit).toHaveBeenCalled();
    });

    it("PUT /applications/:id — cancel only", async () => {
      const res = await request(app)
        .put("/api/v1/leave/applications/10")
        .set("x-test-user", HR_USER)
        .send({ status: "cancelled" });
      expect(res.status).toBe(200);
      expect(leaveApplicationService.cancelLeave).toHaveBeenCalledWith(5, 100, 10);
    });

    it("PUT /applications/:id — rejects non-cancel status", async () => {
      const res = await request(app)
        .put("/api/v1/leave/applications/10")
        .set("x-test-user", HR_USER)
        .send({ status: "approved" });
      expect(res.status).toBe(400);
    });

    it("PUT /applications/:id/approve — approves and audits", async () => {
      const res = await request(app)
        .put("/api/v1/leave/applications/10/approve")
        .set("x-test-user", HR_USER)
        .send({});
      expect(res.status).toBe(200);
      expect(leaveApplicationService.approveLeave).toHaveBeenCalledWith(5, 100, 10, undefined);
    });

    it("PUT /applications/:id/reject — rejects and audits", async () => {
      const res = await request(app)
        .put("/api/v1/leave/applications/10/reject")
        .set("x-test-user", HR_USER)
        .send({ remarks: "Not enough leave" });
      expect(res.status).toBe(200);
      expect(leaveApplicationService.rejectLeave).toHaveBeenCalledWith(5, 100, 10, "Not enough leave");
    });

    it("PUT /applications/:id/cancel — dedicated cancel endpoint", async () => {
      const res = await request(app)
        .put("/api/v1/leave/applications/10/cancel")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveApplicationService.cancelLeave).toHaveBeenCalledWith(5, 100, 10);
    });

    it("GET /calendar — extracts month/year", async () => {
      const res = await request(app)
        .get("/api/v1/leave/calendar?month=6&year=2026")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(leaveApplicationService.getLeaveCalendar).toHaveBeenCalledWith(5, 6, 2026);
    });
  });

  // --- Comp-Off ---
  describe("Comp-Off", () => {
    it("GET /comp-off/my — uses req.user.sub", async () => {
      const res = await request(app).get("/api/v1/leave/comp-off/my").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(compOffService.listCompOffs).toHaveBeenCalledWith(5, expect.objectContaining({ userId: 100 }));
    });

    it("POST /comp-off — creates comp-off request", async () => {
      const res = await request(app)
        .post("/api/v1/leave/comp-off")
        .set("x-test-user", HR_USER)
        .send({ worked_date: "2026-04-05", expires_on: "2026-05-05", reason: "Weekend work", days: 1 });
      expect(res.status).toBe(201);
      expect(compOffService.requestCompOff).toHaveBeenCalledWith(5, 100, expect.objectContaining({ worked_date: "2026-04-05" }));
    });

    it("PUT /comp-off/:id/approve — approves", async () => {
      const res = await request(app)
        .put("/api/v1/leave/comp-off/7/approve")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(compOffService.approveCompOff).toHaveBeenCalledWith(5, 100, 7);
    });

    it("PUT /comp-off/:id/reject — rejects with reason", async () => {
      const res = await request(app)
        .put("/api/v1/leave/comp-off/7/reject")
        .set("x-test-user", HR_USER)
        .send({ reason: "Not eligible" });
      expect(res.status).toBe(200);
      expect(compOffService.rejectCompOff).toHaveBeenCalledWith(5, 100, 7, "Not eligible");
    });
  });
});

// =============================================================================
// ATTENDANCE ROUTES
// =============================================================================
describe("Attendance Routes — Controller Coverage", () => {
  describe("Shifts", () => {
    it("GET /shifts — lists", async () => {
      const res = await request(app).get("/api/v1/attendance/shifts").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(shiftService.listShifts).toHaveBeenCalledWith(5);
    });

    it("POST /shifts — creates with 201", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/shifts")
        .set("x-test-user", HR_USER)
        .send({ name: "Morning", start_time: "09:00", end_time: "18:00" });
      expect(res.status).toBe(201);
      expect(shiftService.createShift).toHaveBeenCalledWith(5, expect.objectContaining({ name: "Morning" }));
    });

    it("PUT /shifts/:id — updates", async () => {
      const res = await request(app)
        .put("/api/v1/attendance/shifts/1")
        .set("x-test-user", HR_USER)
        .send({ name: "Evening" });
      expect(res.status).toBe(200);
      expect(shiftService.updateShift).toHaveBeenCalledWith(5, 1, expect.objectContaining({ name: "Evening" }));
    });

    it("DELETE /shifts/:id — deactivates", async () => {
      const res = await request(app).delete("/api/v1/attendance/shifts/1").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(shiftService.deleteShift).toHaveBeenCalledWith(5, 1);
    });

    it("GET /shifts/:id — gets single", async () => {
      const res = await request(app).get("/api/v1/attendance/shifts/1").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(shiftService.getShift).toHaveBeenCalledWith(5, 1);
    });

    it("POST /shifts/assign — assigns shift", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/shifts/assign")
        .set("x-test-user", HR_USER)
        .send({ user_id: 200, shift_id: 1, effective_from: "2026-04-01" });
      expect(res.status).toBe(201);
      expect(shiftService.assignShift).toHaveBeenCalledWith(5, expect.any(Object), 100);
    });

    it("GET /shifts/assignments — queries filter params", async () => {
      const res = await request(app)
        .get("/api/v1/attendance/shifts/assignments?user_id=200&shift_id=1")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(shiftService.listShiftAssignments).toHaveBeenCalledWith(5, { user_id: 200, shift_id: 1 });
    });

    it("GET /shifts/my-schedule — uses req.user.sub", async () => {
      const res = await request(app).get("/api/v1/attendance/shifts/my-schedule").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(shiftService.getMySchedule).toHaveBeenCalledWith(5, 100);
    });

    it("POST /shifts/swap-request — creates and audits", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/shifts/swap-request")
        .set("x-test-user", HR_USER)
        .send({ target_employee_id: 200, shift_assignment_id: 1, target_shift_assignment_id: 2, date: "2026-04-10", reason: "Personal" });
      expect(res.status).toBe(201);
      expect(shiftService.createSwapRequest).toHaveBeenCalledWith(5, 100, expect.any(Object));
      expect(logAudit).toHaveBeenCalled();
    });
  });

  describe("Geo-Fences", () => {
    it("GET /geo-fences — lists", async () => {
      const res = await request(app).get("/api/v1/attendance/geo-fences").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(geoFenceService.listGeoFences).toHaveBeenCalledWith(5);
    });

    it("POST /geo-fences — creates with 201", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/geo-fences")
        .set("x-test-user", HR_USER)
        .send({ name: "Office", latitude: 12.97, longitude: 77.59, radius_meters: 100 });
      expect(res.status).toBe(201);
      expect(geoFenceService.createGeoFence).toHaveBeenCalledWith(5, expect.objectContaining({ name: "Office" }));
    });

    it("DELETE /geo-fences/:id — deactivates", async () => {
      const res = await request(app).delete("/api/v1/attendance/geo-fences/1").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(geoFenceService.deleteGeoFence).toHaveBeenCalledWith(5, 1);
    });
  });

  describe("Attendance Records", () => {
    it("POST /check-in — creates and audits", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/check-in")
        .set("x-test-user", HR_USER)
        .send({});
      expect(res.status).toBe(201);
      expect(attendanceService.checkIn).toHaveBeenCalledWith(5, 100, expect.any(Object));
      expect(logAudit).toHaveBeenCalled();
    });

    it("POST /check-out — updates and audits", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/check-out")
        .set("x-test-user", HR_USER)
        .send({});
      expect(res.status).toBe(200);
      expect(attendanceService.checkOut).toHaveBeenCalledWith(5, 100, expect.any(Object));
    });

    it("GET /me/today — uses sub", async () => {
      const res = await request(app).get("/api/v1/attendance/me/today").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.getMyToday).toHaveBeenCalledWith(5, 100);
    });

    it("GET /me/history — paginates", async () => {
      const res = await request(app)
        .get("/api/v1/attendance/me/history?page=2&per_page=10")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.getMyHistory).toHaveBeenCalledWith(5, 100, expect.objectContaining({ page: 2, perPage: 10 }));
    });

    it("GET /records — HR sees all", async () => {
      const res = await request(app).get("/api/v1/attendance/records").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.listRecords).toHaveBeenCalledWith(5, expect.any(Object));
    });

    it("GET /records — employee sees only own", async () => {
      const res = await request(app).get("/api/v1/attendance/records").set("x-test-user", EMPLOYEE_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.listRecords).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ user_id: 200 })
      );
    });

    it("GET /dashboard — returns stats", async () => {
      const res = await request(app).get("/api/v1/attendance/dashboard").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.getDashboard).toHaveBeenCalledWith(5);
    });

    it("GET /monthly-report — extracts month/year/user_id", async () => {
      const res = await request(app)
        .get("/api/v1/attendance/monthly-report?month=3&year=2026&user_id=200")
        .set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(attendanceService.getMonthlyReport).toHaveBeenCalledWith(5, { month: 3, year: 2026, user_id: 200 });
    });
  });

  describe("Regularizations", () => {
    it("POST /regularizations — submits and returns 201", async () => {
      const res = await request(app)
        .post("/api/v1/attendance/regularizations")
        .set("x-test-user", HR_USER)
        .send({ date: "2026-04-01", check_in: "09:00", check_out: "18:00", reason: "Forgot" });
      expect(res.status).toBe(201);
      expect(regularizationService.submitRegularization).toHaveBeenCalledWith(5, 100, expect.any(Object));
    });

    it("GET /regularizations — paginated list", async () => {
      const res = await request(app).get("/api/v1/attendance/regularizations").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("GET /regularizations/me — own regularizations", async () => {
      const res = await request(app).get("/api/v1/attendance/regularizations/me").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(regularizationService.getMyRegularizations).toHaveBeenCalledWith(5, 100, expect.any(Object));
    });

    it("PUT /regularizations/:id/approve — approves", async () => {
      const res = await request(app)
        .put("/api/v1/attendance/regularizations/5/approve")
        .set("x-test-user", HR_USER)
        .send({ status: "approved" });
      expect(res.status).toBe(200);
      expect(regularizationService.approveRegularization).toHaveBeenCalledWith(5, 5, 100);
    });

    it("PUT /regularizations/:id/approve — rejects with reason", async () => {
      const res = await request(app)
        .put("/api/v1/attendance/regularizations/5/approve")
        .set("x-test-user", HR_USER)
        .send({ status: "rejected", rejection_reason: "Not valid" });
      expect(res.status).toBe(200);
      expect(regularizationService.rejectRegularization).toHaveBeenCalledWith(5, 5, 100, "Not valid");
    });
  });
});

// =============================================================================
// EMPLOYEE ROUTES
// =============================================================================
describe("Employee Routes — Controller Coverage", () => {
  it("GET / — directory alias", async () => {
    const res = await request(app).get("/api/v1/employees").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(profileService.getDirectory).toHaveBeenCalledWith(5, expect.any(Object));
  });

  it("GET /directory — directory", async () => {
    const res = await request(app).get("/api/v1/employees/directory").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET /birthdays", async () => {
    const res = await request(app).get("/api/v1/employees/birthdays").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(profileService.getBirthdays).toHaveBeenCalledWith(5);
  });

  it("GET /anniversaries", async () => {
    const res = await request(app).get("/api/v1/employees/anniversaries").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(profileService.getAnniversaries).toHaveBeenCalledWith(5);
  });

  it("GET /headcount", async () => {
    const res = await request(app).get("/api/v1/employees/headcount").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(profileService.getHeadcount).toHaveBeenCalledWith(5);
  });

  describe("Probation", () => {
    it("GET /probation — list", async () => {
      const res = await request(app).get("/api/v1/employees/probation").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(probationService.getEmployeesOnProbation).toHaveBeenCalledWith(5);
    });

    it("GET /probation/dashboard — stats", async () => {
      const res = await request(app).get("/api/v1/employees/probation/dashboard").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("GET /probation/upcoming?days=60", async () => {
      const res = await request(app).get("/api/v1/employees/probation/upcoming?days=60").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(probationService.getUpcomingConfirmations).toHaveBeenCalledWith(5, 60);
    });

    it("PUT /:id/probation/confirm — confirms and audits", async () => {
      const res = await request(app).put("/api/v1/employees/50/probation/confirm").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(probationService.confirmProbation).toHaveBeenCalledWith(5, 50, 100);
      expect(logAudit).toHaveBeenCalled();
    });

    it("PUT /:id/probation/extend — extends", async () => {
      const res = await request(app)
        .put("/api/v1/employees/50/probation/extend")
        .set("x-test-user", HR_USER)
        .send({ new_end_date: "2026-06-30", reason: "Performance review pending" });
      expect(res.status).toBe(200);
      expect(probationService.extendProbation).toHaveBeenCalledWith(5, 50, "2026-06-30", "Performance review pending");
    });

    it("PUT /:id/probation/extend — rejects missing new_end_date", async () => {
      const res = await request(app)
        .put("/api/v1/employees/50/probation/extend")
        .set("x-test-user", HR_USER)
        .send({ reason: "test" });
      expect(res.status).toBe(400);
    });
  });

  describe("Profile", () => {
    it("GET /:id — gets user via userService", async () => {
      const res = await request(app).get("/api/v1/employees/200").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(userService.getUser).toHaveBeenCalledWith(5, 200);
    });

    it("GET /:id/profile", async () => {
      const res = await request(app).get("/api/v1/employees/200/profile").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(profileService.getProfile).toHaveBeenCalledWith(5, 200);
    });

    it("PUT /:id/profile — upserts and audits", async () => {
      const res = await request(app)
        .put("/api/v1/employees/200/profile")
        .set("x-test-user", HR_USER)
        .send({ date_of_birth: "1990-01-15", gender: "male" });
      expect(res.status).toBe(200);
      expect(profileService.upsertProfile).toHaveBeenCalledWith(5, 200, expect.any(Object));
      expect(logAudit).toHaveBeenCalled();
    });
  });

  describe("Salary", () => {
    it("GET /:id/salary", async () => {
      const res = await request(app).get("/api/v1/employees/200/salary").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(salaryService.getSalaryStructure).toHaveBeenCalledWith(5, 200);
    });

    it("PUT /:id/salary — upserts all fields", async () => {
      const salaryData = {
        ctc: 1200000, basic: 500000, hra: 200000, da: 100000,
        special_allowance: 150000, gross: 950000, employer_pf: 21600,
        employer_esi: 15000, gratuity: 25000,
      };
      const res = await request(app)
        .put("/api/v1/employees/200/salary")
        .set("x-test-user", HR_USER)
        .send(salaryData);
      expect(res.status).toBe(200);
      expect(salaryService.upsertSalaryStructure).toHaveBeenCalledWith(5, 200, expect.objectContaining({ ctc: 1200000 }));
    });

    it("PUT /:id/salary — rejects missing fields", async () => {
      const res = await request(app)
        .put("/api/v1/employees/200/salary")
        .set("x-test-user", HR_USER)
        .send({ ctc: 1200000 });
      expect(res.status).toBe(400);
    });
  });

  describe("Addresses", () => {
    it("GET /:id/addresses", async () => {
      const res = await request(app).get("/api/v1/employees/200/addresses").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(detailService.getAddresses).toHaveBeenCalledWith(5, 200);
    });

    it("POST /:id/addresses — 201", async () => {
      const res = await request(app)
        .post("/api/v1/employees/200/addresses")
        .set("x-test-user", HR_USER)
        .send({ type: "permanent", line1: "123 Main", city: "Delhi", state: "DL", country: "IN", zipcode: "110001" });
      expect(res.status).toBe(201);
      expect(detailService.createAddress).toHaveBeenCalledWith(5, 200, expect.any(Object));
    });

    it("DELETE /:id/addresses/:addressId", async () => {
      const res = await request(app).delete("/api/v1/employees/200/addresses/3").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(detailService.deleteAddress).toHaveBeenCalledWith(5, 200, 3);
    });
  });

  describe("Education", () => {
    it("GET /:id/education", async () => {
      const res = await request(app).get("/api/v1/employees/200/education").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("POST /:id/education — 201", async () => {
      const res = await request(app)
        .post("/api/v1/employees/200/education")
        .set("x-test-user", HR_USER)
        .send({ degree: "B.Tech", institution: "IIT", year_of_passing: 2020 });
      expect(res.status).toBe(201);
    });
  });

  describe("Experience", () => {
    it("GET /:id/experience", async () => {
      const res = await request(app).get("/api/v1/employees/200/experience").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("POST /:id/experience — 201", async () => {
      const res = await request(app)
        .post("/api/v1/employees/200/experience")
        .set("x-test-user", HR_USER)
        .send({ company_name: "Acme", designation: "SDE", start_date: "2020-01-01", description: "Worked on X" });
      expect(res.status).toBe(201);
    });
  });

  describe("Dependents", () => {
    it("GET /:id/dependents", async () => {
      const res = await request(app).get("/api/v1/employees/200/dependents").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("POST /:id/dependents — 201", async () => {
      const res = await request(app)
        .post("/api/v1/employees/200/dependents")
        .set("x-test-user", HR_USER)
        .send({ name: "Spouse", relationship: "spouse", date_of_birth: "1992-05-15" });
      expect(res.status).toBe(201);
    });
  });
});

// =============================================================================
// AUTH ROUTES
// =============================================================================
describe("Auth Routes — Controller Coverage", () => {
  it("POST /register — creates org+user, audits, returns 201", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        org_name: "NewCo", org_legal_name: "NewCo Pvt Ltd",
        org_country: "India", org_state: "KA", org_timezone: "Asia/Kolkata",
        org_email: "admin@newco.com",
        first_name: "Admin", last_name: "User",
        email: "admin@newco.com", password: "StrongPass123!",
      });
    expect(res.status).toBe(201);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ orgName: "NewCo" }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("POST /login — authenticates and audits", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@test.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ email: "admin@test.com" }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("POST /login — audits failed login", async () => {
    vi.mocked(login).mockRejectedValueOnce(Object.assign(new Error("Invalid"), { statusCode: 401 }));
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "bad@test.com", password: "wrong" });
    expect(res.status).toBe(401);
    // logAudit is called for failed login
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "login_failed" }));
  });

  it("POST /change-password — uses req.user.sub", async () => {
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("x-test-user", HR_USER)
      .send({ current_password: "OldPass123!", new_password: "NewPass456!" });
    expect(res.status).toBe(200);
    expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ userId: 100 }));
  });

  it("POST /forgot-password — always returns success", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "user@test.com" });
    expect(res.status).toBe(200);
    expect(forgotPassword).toHaveBeenCalledWith("user@test.com");
  });

  it("POST /reset-password — resets and audits", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "reset-tok-123", password: "NewPass789!" });
    expect(res.status).toBe(200);
    expect(resetPassword).toHaveBeenCalledWith(expect.objectContaining({ token: "reset-tok-123" }));
  });

  it("GET /me — returns user profile", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("POST /sso/validate — validates token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/validate")
      .send({ token: "some-jwt" });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });

  it("POST /sso/validate — rejects missing token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/validate")
      .send({});
    expect(res.status).toBe(400);
  });

  it("POST /sso/token — generates SSO token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/token")
      .set("x-test-user", HR_USER)
      .send({ module_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe("sso-tok-123");
    expect(res.body.data.module_id).toBe(1);
  });
});

// =============================================================================
// USER ROUTES
// =============================================================================
describe("User Routes — Controller Coverage", () => {
  it("GET / — lists users", async () => {
    const res = await request(app).get("/api/v1/users").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(userService.listUsers).toHaveBeenCalledWith(5, expect.any(Object));
  });

  it("GET / — employee only sees safe fields", async () => {
    vi.mocked(userService.listUsers).mockResolvedValueOnce({
      users: [{ id: 1, first_name: "A", last_name: "B", email: "a@b.com", role: "employee", phone: "123" }],
      total: 1,
    } as any);
    const res = await request(app).get("/api/v1/users").set("x-test-user", EMPLOYEE_USER);
    expect(res.status).toBe(200);
    // phone should be stripped for employee
    const users = res.body.data;
    if (users.length > 0) {
      expect(users[0]).not.toHaveProperty("phone");
    }
  });

  it("GET /invitations — lists", async () => {
    const res = await request(app).get("/api/v1/users/invitations").set("x-test-user", ORG_ADMIN_USER);
    expect(res.status).toBe(200);
    expect(userService.listInvitations).toHaveBeenCalledWith(5, "pending");
  });

  it("GET /org-chart", async () => {
    const res = await request(app).get("/api/v1/users/org-chart").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(userService.getOrgChart).toHaveBeenCalledWith(5);
  });

  it("GET /:id — gets user detail", async () => {
    const res = await request(app).get("/api/v1/users/200").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(userService.getUser).toHaveBeenCalledWith(5, 200);
  });

  it("POST / — creates user", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ first_name: "New", last_name: "User", email: "new@test.com", password: "Pass123!", role: "employee" });
    expect(res.status).toBe(201);
    expect(userService.createUser).toHaveBeenCalledWith(5, expect.objectContaining({ email: "new@test.com" }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("PUT /:id — updates user", async () => {
    const res = await request(app)
      .put("/api/v1/users/200")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ first_name: "Updated" });
    expect(res.status).toBe(200);
    expect(userService.updateUser).toHaveBeenCalledWith(5, 200, expect.objectContaining({ first_name: "Updated" }));
  });

  it("DELETE /:id — deactivates", async () => {
    const res = await request(app).delete("/api/v1/users/200").set("x-test-user", ORG_ADMIN_USER);
    expect(res.status).toBe(200);
    expect(userService.deactivateUser).toHaveBeenCalledWith(5, 200);
  });

  it("POST /invite — invites user", async () => {
    const res = await request(app)
      .post("/api/v1/users/invite")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ email: "newuser@test.com", role: "employee" });
    expect(res.status).toBe(201);
    expect(userService.inviteUser).toHaveBeenCalledWith(5, 100, expect.objectContaining({ email: "newuser@test.com" }));
  });

  it("POST /accept-invitation — accepts", async () => {
    const res = await request(app)
      .post("/api/v1/users/accept-invitation")
      .send({ token: "inv-tok", first_name: "New", last_name: "User", password: "Pass123!" });
    expect(res.status).toBe(201);
    expect(userService.acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ token: "inv-tok" }));
  });
});

// =============================================================================
// ORGANIZATION ROUTES
// =============================================================================
describe("Organization Routes — Controller Coverage", () => {
  it("GET /me — gets org", async () => {
    const res = await request(app).get("/api/v1/organizations/me").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(orgService.getOrg).toHaveBeenCalledWith(5);
  });

  it("PUT /me — updates org", async () => {
    const res = await request(app)
      .put("/api/v1/organizations/me")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ name: "Updated Org" });
    expect(res.status).toBe(200);
    expect(orgService.updateOrg).toHaveBeenCalledWith(5, expect.objectContaining({ name: "Updated Org" }));
  });

  it("GET /me/stats", async () => {
    const res = await request(app).get("/api/v1/organizations/me/stats").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(orgService.getOrgStats).toHaveBeenCalledWith(5);
  });

  describe("Departments", () => {
    it("GET /me/departments", async () => {
      const res = await request(app).get("/api/v1/organizations/me/departments").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(orgService.listDepartments).toHaveBeenCalledWith(5);
    });

    it("POST /me/departments — 201", async () => {
      const res = await request(app)
        .post("/api/v1/organizations/me/departments")
        .set("x-test-user", ORG_ADMIN_USER)
        .send({ name: "Sales" });
      expect(res.status).toBe(201);
      expect(orgService.createDepartment).toHaveBeenCalledWith(5, "Sales");
    });

    it("GET /me/departments/:id", async () => {
      const res = await request(app).get("/api/v1/organizations/me/departments/1").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
      expect(orgService.getDepartment).toHaveBeenCalledWith(5, 1);
    });

    it("PUT /me/departments/:id", async () => {
      const res = await request(app)
        .put("/api/v1/organizations/me/departments/1")
        .set("x-test-user", ORG_ADMIN_USER)
        .send({ name: "Engineering v2" });
      expect(res.status).toBe(200);
    });

    it("DELETE /me/departments/:id", async () => {
      const res = await request(app).delete("/api/v1/organizations/me/departments/1").set("x-test-user", ORG_ADMIN_USER);
      expect(res.status).toBe(200);
      expect(orgService.deleteDepartment).toHaveBeenCalledWith(5, 1);
    });
  });

  describe("Locations", () => {
    it("GET /me/locations", async () => {
      const res = await request(app).get("/api/v1/organizations/me/locations").set("x-test-user", HR_USER);
      expect(res.status).toBe(200);
    });

    it("POST /me/locations — 201", async () => {
      const res = await request(app)
        .post("/api/v1/organizations/me/locations")
        .set("x-test-user", ORG_ADMIN_USER)
        .send({ name: "HQ", city: "Bangalore", country: "India" });
      expect(res.status).toBe(201);
    });

    it("DELETE /me/locations/:id", async () => {
      const res = await request(app).delete("/api/v1/organizations/me/locations/1").set("x-test-user", ORG_ADMIN_USER);
      expect(res.status).toBe(200);
      expect(orgService.deleteLocation).toHaveBeenCalledWith(5, 1);
    });
  });
});

// =============================================================================
// ANNOUNCEMENT ROUTES
// =============================================================================
describe("Announcement Routes — Controller Coverage", () => {
  it("GET / — lists with pagination", async () => {
    const res = await request(app).get("/api/v1/announcements").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(announcementService.listAnnouncements).toHaveBeenCalledWith(5, 100, expect.any(Object));
  });

  it("GET /unread-count", async () => {
    const res = await request(app).get("/api/v1/announcements/unread-count").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it("GET /:id — gets single", async () => {
    const res = await request(app).get("/api/v1/announcements/5").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(announcementService.getAnnouncement).toHaveBeenCalledWith(5, 5, 100);
  });

  it("POST / — creates and audits", async () => {
    const res = await request(app)
      .post("/api/v1/announcements")
      .set("x-test-user", HR_USER)
      .send({ title: "Announcement", content: "<p>Test</p>", priority: "normal" });
    expect(res.status).toBe(201);
    expect(announcementService.createAnnouncement).toHaveBeenCalledWith(5, 100, expect.objectContaining({ title: "Announcement" }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("PUT /:id — updates", async () => {
    const res = await request(app)
      .put("/api/v1/announcements/5")
      .set("x-test-user", HR_USER)
      .send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(announcementService.updateAnnouncement).toHaveBeenCalledWith(5, 5, expect.objectContaining({ title: "Updated" }));
  });

  it("DELETE /:id", async () => {
    const res = await request(app).delete("/api/v1/announcements/5").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(announcementService.deleteAnnouncement).toHaveBeenCalledWith(5, 5);
  });

  it("POST /:id/read — marks as read", async () => {
    const res = await request(app).post("/api/v1/announcements/5/read").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(announcementService.markAsRead).toHaveBeenCalledWith(5, 100, 5);
  });
});

// =============================================================================
// POLICY ROUTES
// =============================================================================
describe("Policy Routes — Controller Coverage", () => {
  it("GET /pending", async () => {
    const res = await request(app).get("/api/v1/policies/pending").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(policyService.getPendingAcknowledgments).toHaveBeenCalledWith(5, 100);
  });

  it("GET / — paginated list", async () => {
    const res = await request(app).get("/api/v1/policies?category=hr").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET /:id", async () => {
    const res = await request(app).get("/api/v1/policies/10").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(policyService.getPolicy).toHaveBeenCalledWith(5, 10);
  });

  it("POST / — creates and audits", async () => {
    const res = await request(app)
      .post("/api/v1/policies")
      .set("x-test-user", HR_USER)
      .send({ title: "Leave Policy", content: "<p>Policy</p>", category: "hr", requires_acknowledgment: true });
    expect(res.status).toBe(201);
    expect(policyService.createPolicy).toHaveBeenCalledWith(5, 100, expect.objectContaining({ title: "Leave Policy" }));
  });

  it("PUT /:id — updates and audits", async () => {
    const res = await request(app)
      .put("/api/v1/policies/10")
      .set("x-test-user", HR_USER)
      .send({ title: "Updated Policy" });
    expect(res.status).toBe(200);
    expect(policyService.updatePolicy).toHaveBeenCalledWith(5, 10, expect.objectContaining({ title: "Updated Policy" }));
  });

  it("DELETE /:id", async () => {
    const res = await request(app).delete("/api/v1/policies/10").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(policyService.deletePolicy).toHaveBeenCalledWith(5, 10);
  });

  it("POST /:id/acknowledge", async () => {
    const res = await request(app).post("/api/v1/policies/10/acknowledge").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(policyService.acknowledgePolicy).toHaveBeenCalledWith(10, 100, 5);
    expect(logAudit).toHaveBeenCalled();
  });

  it("GET /:id/acknowledgments", async () => {
    const res = await request(app).get("/api/v1/policies/10/acknowledgments").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(policyService.getAcknowledgments).toHaveBeenCalledWith(5, 10);
  });
});

// =============================================================================
// DOCUMENT ROUTES
// =============================================================================
describe("Document Routes — Controller Coverage", () => {
  it("GET /categories", async () => {
    const res = await request(app).get("/api/v1/documents/categories").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(documentService.listCategories).toHaveBeenCalledWith(5);
  });

  it("POST /categories — 201", async () => {
    const res = await request(app)
      .post("/api/v1/documents/categories")
      .set("x-test-user", HR_USER)
      .send({ name: "ID Proofs", is_mandatory: true });
    expect(res.status).toBe(201);
  });

  it("GET / — HR sees all, paginated", async () => {
    const res = await request(app).get("/api/v1/documents?page=1&per_page=10").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET / — employee sees only own", async () => {
    const res = await request(app).get("/api/v1/documents").set("x-test-user", EMPLOYEE_USER);
    expect(res.status).toBe(200);
    expect(documentService.listDocuments).toHaveBeenCalledWith(5, expect.objectContaining({ user_id: 200 }));
  });

  it("GET /my — self-service docs", async () => {
    const res = await request(app).get("/api/v1/documents/my").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(documentService.getMyDocuments).toHaveBeenCalledWith(5, 100, expect.any(Object));
  });

  it("GET /expiring — with days param", async () => {
    const res = await request(app).get("/api/v1/documents/expiring?days=60").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(documentService.getExpiryAlerts).toHaveBeenCalledWith(5, 60);
  });

  it("GET /mandatory-status", async () => {
    const res = await request(app).get("/api/v1/documents/mandatory-status").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET /:id", async () => {
    const res = await request(app).get("/api/v1/documents/7").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(documentService.getDocument).toHaveBeenCalledWith(5, 7, 100, "hr_admin");
  });

  it("DELETE /:id", async () => {
    const res = await request(app).delete("/api/v1/documents/7").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(documentService.deleteDocument).toHaveBeenCalledWith(5, 7);
  });

  it("PUT /:id/verify — verifies and audits", async () => {
    const res = await request(app)
      .put("/api/v1/documents/7/verify")
      .set("x-test-user", HR_USER)
      .send({ is_verified: true, verification_remarks: "Looks good" });
    expect(res.status).toBe(200);
    expect(documentService.verifyDocument).toHaveBeenCalledWith(5, 7, 100, expect.any(Object));
    expect(logAudit).toHaveBeenCalled();
  });

  it("POST /:id/reject — rejects and audits", async () => {
    const res = await request(app)
      .post("/api/v1/documents/7/reject")
      .set("x-test-user", HR_USER)
      .send({ rejection_reason: "Blurry scan" });
    expect(res.status).toBe(200);
    expect(documentService.rejectDocument).toHaveBeenCalledWith(5, 7, 100, "Blurry scan");
    expect(logAudit).toHaveBeenCalled();
  });
});

// =============================================================================
// MODULE ROUTES
// =============================================================================
describe("Module Routes — Controller Coverage", () => {
  it("GET / — lists modules", async () => {
    const res = await request(app).get("/api/v1/modules").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(moduleService.listModules).toHaveBeenCalled();
  });

  it("GET /:id", async () => {
    const res = await request(app).get("/api/v1/modules/1").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(moduleService.getModule).toHaveBeenCalledWith(1);
  });

  it("GET /:id/features", async () => {
    const res = await request(app).get("/api/v1/modules/1/features").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(moduleService.getModuleFeatures).toHaveBeenCalledWith(1);
  });

  it("POST / — creates module (super admin)", async () => {
    const res = await request(app)
      .post("/api/v1/modules")
      .set("x-test-user", SUPER_ADMIN_USER)
      .send({ name: "New Module", slug: "new-module", description: "A new module", base_url: "http://localhost:9999", icon: "star" });
    expect(res.status).toBe(201);
  });

  it("PUT /:id — updates module", async () => {
    const res = await request(app)
      .put("/api/v1/modules/1")
      .set("x-test-user", SUPER_ADMIN_USER)
      .send({ name: "Updated Module" });
    expect(res.status).toBe(200);
    expect(moduleService.updateModule).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Updated Module" }));
  });
});

// =============================================================================
// SUBSCRIPTION ROUTES
// =============================================================================
describe("Subscription Routes — Controller Coverage", () => {
  it("GET / — lists subscriptions", async () => {
    const res = await request(app).get("/api/v1/subscriptions").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(subService.listSubscriptions).toHaveBeenCalledWith(5);
  });

  it("GET /billing-summary", async () => {
    const res = await request(app).get("/api/v1/subscriptions/billing-summary").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET /billing-status", async () => {
    const res = await request(app).get("/api/v1/subscriptions/billing-status").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(subService.getBillingStatus).toHaveBeenCalledWith(5);
  });

  it("GET /:id", async () => {
    const res = await request(app).get("/api/v1/subscriptions/1").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(subService.getSubscription).toHaveBeenCalledWith(5, 1);
  });

  it("POST / — creates subscription and audits", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ module_id: 1, plan_tier: "basic", total_seats: 10 });
    expect(res.status).toBe(201);
    expect(subService.createSubscription).toHaveBeenCalledWith(5, expect.objectContaining({ module_id: 1 }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("PUT /:id — updates", async () => {
    const res = await request(app)
      .put("/api/v1/subscriptions/1")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ total_seats: 20 });
    expect(res.status).toBe(200);
  });

  it("DELETE /:id — cancels", async () => {
    const res = await request(app).delete("/api/v1/subscriptions/1").set("x-test-user", ORG_ADMIN_USER);
    expect(res.status).toBe(200);
    expect(subService.cancelSubscription).toHaveBeenCalledWith(5, 1);
  });

  it("GET /:id/seats", async () => {
    const res = await request(app).get("/api/v1/subscriptions/1/seats").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("POST /assign-seat", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/assign-seat")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ module_id: 1, user_id: 200 });
    expect(res.status).toBe(201);
    expect(subService.assignSeat).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 5, moduleId: 1, userId: 200, assignedBy: 100,
    }));
  });

  it("POST /revoke-seat", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/revoke-seat")
      .set("x-test-user", ORG_ADMIN_USER)
      .send({ module_id: 1, user_id: 200 });
    expect(res.status).toBe(200);
    expect(subService.revokeSeat).toHaveBeenCalledWith(5, 1, 200);
  });

  it("POST /check-access", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/check-access")
      .set("x-test-user", HR_USER)
      .send({ user_id: 200, module_slug: "payroll" });
    expect(res.status).toBe(200);
    expect(subService.checkModuleAccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: 200, moduleSlug: "payroll",
    }));
  });
});

// =============================================================================
// NOTIFICATION ROUTES
// =============================================================================
describe("Notification Routes — Controller Coverage", () => {
  it("GET / — paginated", async () => {
    const res = await request(app).get("/api/v1/notifications?page=1&per_page=20").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(notificationService.listNotifications).toHaveBeenCalledWith(5, 100, expect.any(Object));
  });

  it("GET /unread-count", async () => {
    const res = await request(app).get("/api/v1/notifications/unread-count").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(5);
  });

  it("PUT /:id/read", async () => {
    const res = await request(app).put("/api/v1/notifications/3/read").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(notificationService.markAsRead).toHaveBeenCalledWith(5, 3, 100);
  });

  it("PUT /read-all", async () => {
    const res = await request(app).put("/api/v1/notifications/read-all").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(notificationService.markAllAsRead).toHaveBeenCalledWith(5, 100);
  });
});

// =============================================================================
// HELPDESK ROUTES
// =============================================================================
describe("Helpdesk Routes — Controller Coverage", () => {
  it("POST /tickets — creates ticket and audits", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/tickets")
      .set("x-test-user", HR_USER)
      .send({ subject: "Issue", description: "Test issue", category: "general", priority: "medium" });
    expect(res.status).toBe(201);
    expect(helpdeskService.createTicket).toHaveBeenCalledWith(5, 100, expect.objectContaining({ subject: "Issue" }));
    expect(logAudit).toHaveBeenCalled();
  });

  it("GET /tickets/my", async () => {
    const res = await request(app).get("/api/v1/helpdesk/tickets/my").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.getMyTickets).toHaveBeenCalledWith(5, 100, expect.any(Object));
  });

  it("GET /tickets — HR sees all", async () => {
    const res = await request(app).get("/api/v1/helpdesk/tickets").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.listTickets).toHaveBeenCalledWith(5, expect.any(Object));
  });

  it("GET /tickets — employee sees own only", async () => {
    const res = await request(app).get("/api/v1/helpdesk/tickets").set("x-test-user", EMPLOYEE_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.getMyTickets).toHaveBeenCalled();
  });

  it("GET /tickets/:id", async () => {
    const res = await request(app).get("/api/v1/helpdesk/tickets/5").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.getTicket).toHaveBeenCalledWith(5, 5, 100, true);
  });

  it("PUT /tickets/:id — updates", async () => {
    const res = await request(app)
      .put("/api/v1/helpdesk/tickets/5")
      .set("x-test-user", HR_USER)
      .send({ status: "in_progress" });
    expect(res.status).toBe(200);
  });

  it("POST /tickets/:id/assign — assigns", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/tickets/5/assign")
      .set("x-test-user", HR_USER)
      .send({ assigned_to: 300 });
    expect(res.status).toBe(200);
    expect(helpdeskService.assignTicket).toHaveBeenCalledWith(5, 5, 300);
  });

  it("POST /tickets/:id/comment — adds comment", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/tickets/5/comment")
      .set("x-test-user", HR_USER)
      .send({ comment: "Looking into it" });
    expect(res.status).toBe(201);
    expect(helpdeskService.addComment).toHaveBeenCalledWith(5, 5, 100, "Looking into it", false, undefined);
  });

  it("POST /tickets/:id/resolve", async () => {
    const res = await request(app).post("/api/v1/helpdesk/tickets/5/resolve").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.resolveTicket).toHaveBeenCalledWith(5, 5, 100);
  });

  it("POST /tickets/:id/close", async () => {
    const res = await request(app).post("/api/v1/helpdesk/tickets/5/close").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    // #1452 — route now forwards user context for RBAC ("HR or ticket owner")
    expect(helpdeskService.closeTicket).toHaveBeenCalledWith(5, 5, 100, true);
  });

  it("POST /tickets/:id/reopen", async () => {
    const res = await request(app).post("/api/v1/helpdesk/tickets/5/reopen").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.reopenTicket).toHaveBeenCalledWith(5, 5);
  });

  it("POST /tickets/:id/rate", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/tickets/5/rate")
      .set("x-test-user", HR_USER)
      .send({ rating: 5, comment: "Great" });
    expect(res.status).toBe(200);
    expect(helpdeskService.rateTicket).toHaveBeenCalledWith(5, 5, 5, "Great");
  });

  it("GET /kb — lists articles", async () => {
    const res = await request(app).get("/api/v1/helpdesk/kb").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("POST /kb — creates article", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/kb")
      .set("x-test-user", HR_USER)
      .send({ title: "How to", content: "Step 1...", category: "general" });
    expect(res.status).toBe(201);
    expect(helpdeskService.createArticle).toHaveBeenCalledWith(5, 100, expect.any(Object));
  });

  it("DELETE /kb/:id — unpublishes", async () => {
    const res = await request(app).delete("/api/v1/helpdesk/kb/3").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.deleteArticle).toHaveBeenCalledWith(5, 3);
  });

  it("POST /kb/:id/helpful — rates article", async () => {
    const res = await request(app)
      .post("/api/v1/helpdesk/kb/3/helpful")
      .set("x-test-user", HR_USER)
      .send({ helpful: true });
    expect(res.status).toBe(200);
    expect(helpdeskService.rateArticle).toHaveBeenCalledWith(5, 3, true, 100);
  });

  it("GET /dashboard — helpdesk stats", async () => {
    const res = await request(app).get("/api/v1/helpdesk/dashboard").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(helpdeskService.getHelpdeskDashboard).toHaveBeenCalledWith(5);
  });
});

// =============================================================================
// SURVEY ROUTES
// =============================================================================
describe("Survey Routes — Controller Coverage", () => {
  it("GET /active — active surveys for user", async () => {
    const res = await request(app).get("/api/v1/surveys/active").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.getActiveSurveys).toHaveBeenCalledWith(5, 100);
  });

  it("GET /dashboard — survey analytics", async () => {
    const res = await request(app).get("/api/v1/surveys/dashboard").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.getSurveyDashboard).toHaveBeenCalledWith(5);
  });

  it("GET /my-responses", async () => {
    const res = await request(app).get("/api/v1/surveys/my-responses").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.getMyResponses).toHaveBeenCalledWith(5, 100);
  });

  it("GET / — lists surveys", async () => {
    const res = await request(app).get("/api/v1/surveys").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
  });

  it("GET /:id — gets survey detail", async () => {
    const res = await request(app).get("/api/v1/surveys/10").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.getSurvey).toHaveBeenCalledWith(5, 10);
  });

  it("POST / — creates survey", async () => {
    const res = await request(app)
      .post("/api/v1/surveys")
      .set("x-test-user", HR_USER)
      .send({ title: "Engagement Survey", description: "Annual survey", type: "pulse", questions: [{ question_text: "How are you?", question_type: "rating_1_5" }] });
    expect(res.status).toBe(201);
    expect(surveyService.createSurvey).toHaveBeenCalledWith(5, 100, expect.objectContaining({ title: "Engagement Survey" }));
  });

  it("PUT /:id — updates survey", async () => {
    const res = await request(app)
      .put("/api/v1/surveys/10")
      .set("x-test-user", HR_USER)
      .send({ title: "Updated Survey" });
    expect(res.status).toBe(200);
    expect(surveyService.updateSurvey).toHaveBeenCalledWith(5, 10, expect.objectContaining({ title: "Updated Survey" }));
  });

  it("PUT /:id — rejects status change via PUT", async () => {
    const res = await request(app)
      .put("/api/v1/surveys/10")
      .set("x-test-user", HR_USER)
      .send({ status: "active" });
    expect(res.status).toBe(400);
  });

  it("POST /:id/publish — publishes", async () => {
    const res = await request(app).post("/api/v1/surveys/10/publish").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.publishSurvey).toHaveBeenCalledWith(5, 10);
    expect(logAudit).toHaveBeenCalled();
  });

  it("POST /:id/close — closes", async () => {
    const res = await request(app).post("/api/v1/surveys/10/close").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.closeSurvey).toHaveBeenCalledWith(5, 10);
  });

  it("DELETE /:id — deletes", async () => {
    const res = await request(app).delete("/api/v1/surveys/10").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.deleteSurvey).toHaveBeenCalledWith(5, 10);
  });

  it("POST /:id/respond — submits response", async () => {
    const res = await request(app)
      .post("/api/v1/surveys/10/respond")
      .set("x-test-user", HR_USER)
      .send({ answers: [{ question_id: 1, answer: "5" }] });
    expect(res.status).toBe(201);
    expect(surveyService.submitResponse).toHaveBeenCalledWith(5, 10, 100, expect.any(Array));
  });

  it("GET /:id/results — gets results", async () => {
    const res = await request(app).get("/api/v1/surveys/10/results").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(surveyService.getSurveyResults).toHaveBeenCalledWith(5, 10, "hr_admin");
  });
});

// =============================================================================
// DASHBOARD ROUTES
// =============================================================================
describe("Dashboard Routes — Controller Coverage", () => {
  it("GET /widgets — returns widget data", async () => {
    const res = await request(app).get("/api/v1/dashboard/widgets").set("x-test-user", HR_USER);
    expect(res.status).toBe(200);
    expect(getModuleWidgets).toHaveBeenCalledWith(5, 100);
  });
});

// =============================================================================
// ERROR HANDLING (cross-cutting)
// =============================================================================
describe("Error Handling — Controller Coverage", () => {
  it("service error propagates through next(err)", async () => {
    const err = new Error("DB connection failed");
    (err as any).statusCode = 500;
    (err as any).code = "INTERNAL_ERROR";
    vi.mocked(leaveTypeService.listLeaveTypes).mockRejectedValueOnce(err);

    const res = await request(app).get("/api/v1/leave/types").set("x-test-user", HR_USER);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe("DB connection failed");
  });

  it("NotFoundError propagates as 404", async () => {
    const err = new Error("Leave type not found");
    (err as any).statusCode = 404;
    (err as any).code = "NOT_FOUND";
    vi.mocked(leaveTypeService.getLeaveType).mockRejectedValueOnce(err);

    const res = await request(app).get("/api/v1/leave/types/999").set("x-test-user", HR_USER);
    expect(res.status).toBe(404);
  });

  it("ValidationError propagates as 400", async () => {
    const err = new Error("Invalid input");
    (err as any).statusCode = 400;
    (err as any).code = "VALIDATION_ERROR";
    vi.mocked(attendanceService.checkIn).mockRejectedValueOnce(err);

    const res = await request(app)
      .post("/api/v1/attendance/check-in")
      .set("x-test-user", HR_USER)
      .send({});
    expect(res.status).toBe(400);
  });
});
