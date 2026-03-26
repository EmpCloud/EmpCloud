import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { lazy, Suspense, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import api from "@/api/client";
import ToastContainer from "@/components/ui/Toast";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ModulesPage = lazy(() => import("@/pages/modules/ModulesPage"));
const UsersPage = lazy(() => import("@/pages/users/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const AuditPage = lazy(() => import("@/pages/audit/AuditPage"));
// HRMS pages
const EmployeeDirectoryPage = lazy(() => import("@/pages/employees/EmployeeDirectoryPage"));
const EmployeeProfilePage = lazy(() => import("@/pages/employees/EmployeeProfilePage"));
const AttendanceDashboardPage = lazy(() => import("@/pages/attendance/AttendanceDashboardPage"));
const AttendancePage = lazy(() => import("@/pages/attendance/AttendancePage"));
const ShiftsPage = lazy(() => import("@/pages/attendance/ShiftsPage"));
const ShiftSchedulePage = lazy(() => import("@/pages/attendance/ShiftSchedulePage"));
const RegularizationsPage = lazy(() => import("@/pages/attendance/RegularizationsPage"));
const LeaveDashboardPage = lazy(() => import("@/pages/leave/LeaveDashboardPage"));
const LeaveApplicationsPage = lazy(() => import("@/pages/leave/LeaveApplicationsPage"));
const LeaveCalendarPage = lazy(() => import("@/pages/leave/LeaveCalendarPage"));
const LeaveTypesPage = lazy(() => import("@/pages/leave/LeaveTypesPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/DocumentsPage"));
const DocumentCategoriesPage = lazy(() => import("@/pages/documents/DocumentCategoriesPage"));
const MyDocumentsPage = lazy(() => import("@/pages/documents/MyDocumentsPage"));
const AnnouncementsPage = lazy(() => import("@/pages/announcements/AnnouncementsPage"));
const PoliciesPage = lazy(() => import("@/pages/policies/PoliciesPage"));
const OrgChartPage = lazy(() => import("@/pages/employees/OrgChartPage"));
const ImportEmployeesPage = lazy(() => import("@/pages/employees/ImportEmployeesPage"));
const SelfServiceDashboardPage = lazy(() => import("@/pages/self-service/SelfServiceDashboardPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const OnboardingWizard = lazy(() => import("@/pages/onboarding/OnboardingWizard"));
// Manager pages
const ManagerDashboardPage = lazy(() => import("@/pages/manager/ManagerDashboardPage"));
// Comp-Off page
const CompOffPage = lazy(() => import("@/pages/leave/CompOffPage"));
// Helpdesk pages
const HelpdeskDashboardPage = lazy(() => import("@/pages/helpdesk/HelpdeskDashboardPage"));
const TicketListPage = lazy(() => import("@/pages/helpdesk/TicketListPage"));
const MyTicketsPage = lazy(() => import("@/pages/helpdesk/MyTicketsPage"));
const TicketDetailPage = lazy(() => import("@/pages/helpdesk/TicketDetailPage"));
const KnowledgeBasePage = lazy(() => import("@/pages/helpdesk/KnowledgeBasePage"));
// Survey pages
const SurveyDashboardPage = lazy(() => import("@/pages/surveys/SurveyDashboardPage"));
const SurveyListPage = lazy(() => import("@/pages/surveys/SurveyListPage"));
const SurveyBuilderPage = lazy(() => import("@/pages/surveys/SurveyBuilderPage"));
const SurveyRespondPage = lazy(() => import("@/pages/surveys/SurveyRespondPage"));
const SurveyResultsPage = lazy(() => import("@/pages/surveys/SurveyResultsPage"));
// Biometrics pages
const BiometricsDashboardPage = lazy(() => import("@/pages/biometrics/BiometricsDashboardPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/biometrics/FaceEnrollmentPage"));
const QRAttendancePage = lazy(() => import("@/pages/biometrics/QRAttendancePage"));
const DeviceManagementPage = lazy(() => import("@/pages/biometrics/DeviceManagementPage"));
const BiometricSettingsPage = lazy(() => import("@/pages/biometrics/BiometricSettingsPage"));
const BiometricLogsPage = lazy(() => import("@/pages/biometrics/BiometricLogsPage"));
// Asset Management pages
const AssetDashboardPage = lazy(() => import("@/pages/assets/AssetDashboardPage"));
const AssetListPage = lazy(() => import("@/pages/assets/AssetListPage"));
const AssetDetailPage = lazy(() => import("@/pages/assets/AssetDetailPage"));
const MyAssetsPage = lazy(() => import("@/pages/assets/MyAssetsPage"));
const AssetCategoriesPage = lazy(() => import("@/pages/assets/AssetCategoriesPage"));
// Anonymous Feedback pages
const SubmitFeedbackPage = lazy(() => import("@/pages/feedback/SubmitFeedbackPage"));
const MyFeedbackPage = lazy(() => import("@/pages/feedback/MyFeedbackPage"));
const FeedbackDashboardPage = lazy(() => import("@/pages/feedback/FeedbackDashboardPage"));
const FeedbackListPage = lazy(() => import("@/pages/feedback/FeedbackListPage"));
// Position Management pages
const PositionDashboardPage = lazy(() => import("@/pages/positions/PositionDashboardPage"));
const PositionListPage = lazy(() => import("@/pages/positions/PositionListPage"));
const PositionDetailPage = lazy(() => import("@/pages/positions/PositionDetailPage"));
const VacanciesPage = lazy(() => import("@/pages/positions/VacanciesPage"));
const HeadcountPlanPage = lazy(() => import("@/pages/positions/HeadcountPlanPage"));
// Event pages
const EventsListPage = lazy(() => import("@/pages/events/EventsListPage"));
const EventDetailPage = lazy(() => import("@/pages/events/EventDetailPage"));
const EventDashboardPage = lazy(() => import("@/pages/events/EventDashboardPage"));
const MyEventsPage = lazy(() => import("@/pages/events/MyEventsPage"));
// Forum / Social Intranet pages
const ForumPage = lazy(() => import("@/pages/forum/ForumPage"));
const CategoryPostsPage = lazy(() => import("@/pages/forum/CategoryPostsPage"));
const PostDetailPage = lazy(() => import("@/pages/forum/PostDetailPage"));
const CreatePostPage = lazy(() => import("@/pages/forum/CreatePostPage"));
const ForumDashboardPage = lazy(() => import("@/pages/forum/ForumDashboardPage"));
// Wellness pages
const WellnessPage = lazy(() => import("@/pages/wellness/WellnessPage"));
const WellnessDashboardPage = lazy(() => import("@/pages/wellness/WellnessDashboardPage"));
const MyWellnessPage = lazy(() => import("@/pages/wellness/MyWellnessPage"));
const DailyCheckInPage = lazy(() => import("@/pages/wellness/DailyCheckInPage"));
// Whistleblowing pages
// Chatbot page
const ChatbotPage = lazy(() => import("@/pages/chatbot/ChatbotPage"));
const WBSubmitReportPage = lazy(() => import("@/pages/whistleblowing/SubmitReportPage"));
const WBTrackReportPage = lazy(() => import("@/pages/whistleblowing/TrackReportPage"));
const WBDashboardPage = lazy(() => import("@/pages/whistleblowing/WhistleblowingDashboardPage"));
const WBReportListPage = lazy(() => import("@/pages/whistleblowing/ReportListPage"));
const WBReportDetailPage = lazy(() => import("@/pages/whistleblowing/ReportDetailPage"));
// Custom Fields pages
const CustomFieldsSettingsPage = lazy(() => import("@/pages/custom-fields/CustomFieldsSettingsPage"));
// Super Admin pages
const SuperAdminDashboard = lazy(() => import("@/pages/admin/SuperAdminDashboard"));
const OrgListPage = lazy(() => import("@/pages/admin/OrgListPage"));
const OrgDetailPage = lazy(() => import("@/pages/admin/OrgDetailPage"));
const ModuleAnalyticsPage = lazy(() => import("@/pages/admin/ModuleAnalyticsPage"));
const RevenueAnalyticsPage = lazy(() => import("@/pages/admin/RevenueAnalyticsPage"));
const SubscriptionMetricsPage = lazy(() => import("@/pages/admin/SubscriptionMetricsPage"));
const AIConfigPage = lazy(() => import("@/pages/admin/AIConfigPage"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Skip onboarding for super_admin — they manage the platform, not a company
    if (user?.role === "super_admin") {
      setChecking(false);
      return;
    }
    async function checkOnboarding() {
      try {
        const { data } = await api.get("/onboarding/status");
        if (mounted && data.data && !data.data.completed) {
          setNeedsOnboarding(true);
        }
      } catch {
        // If endpoint fails, skip onboarding check
      } finally {
        if (mounted) setChecking(false);
      }
    }
    checkOnboarding();
    return () => { mounted = false; };
  }, [user?.role]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Super admin goes straight to Platform Admin dashboard
  if (user?.role === "super_admin") return <Navigate to="/admin/super" replace />;

  const isAdmin = user?.role === "org_admin" || user?.role === "hr_admin" || user?.role === "hr_manager";
  if (isAdmin) return <DashboardPage />;
  return <SelfServiceDashboardPage />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="h-7 w-7 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ToastContainer />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Onboarding (protected but no dashboard layout) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingWizard />
            </ProtectedRoute>
          }
        />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<RootRedirect />} />
          <Route path="/self-service" element={<SelfServiceDashboardPage />} />
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/subscriptions" element={<Navigate to="/billing" replace />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          {/* HRMS routes */}
          <Route path="/employees" element={<EmployeeDirectoryPage />} />
          <Route path="/employees/:id" element={<EmployeeProfilePage />} />
          <Route path="/attendance" element={<AttendanceDashboardPage />} />
          <Route path="/attendance/my" element={<AttendancePage />} />
          <Route path="/attendance/shifts" element={<ShiftsPage />} />
          <Route path="/attendance/shift-schedule" element={<ShiftSchedulePage />} />
          <Route path="/attendance/regularizations" element={<RegularizationsPage />} />
          <Route path="/leave" element={<LeaveDashboardPage />} />
          <Route path="/leave/applications" element={<LeaveApplicationsPage />} />
          <Route path="/leave/calendar" element={<LeaveCalendarPage />} />
          <Route path="/leave/comp-off" element={<CompOffPage />} />
          <Route path="/leave/settings" element={<LeaveTypesPage />} />
          <Route path="/manager" element={<ManagerDashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/my" element={<MyDocumentsPage />} />
          <Route path="/documents/categories" element={<DocumentCategoriesPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
          <Route path="/org-chart" element={<OrgChartPage />} />
          <Route path="/employees/import" element={<ImportEmployeesPage />} />
          {/* Anonymous Feedback routes */}
          <Route path="/feedback/submit" element={<SubmitFeedbackPage />} />
          <Route path="/feedback/my" element={<MyFeedbackPage />} />
          <Route path="/feedback/dashboard" element={<FeedbackDashboardPage />} />
          <Route path="/feedback" element={<FeedbackListPage />} />
          {/* Position Management routes */}
          <Route path="/positions" element={<PositionDashboardPage />} />
          <Route path="/positions/list" element={<PositionListPage />} />
          <Route path="/positions/vacancies" element={<VacanciesPage />} />
          <Route path="/positions/headcount-plans" element={<HeadcountPlanPage />} />
          <Route path="/positions/:id" element={<PositionDetailPage />} />
          {/* Helpdesk routes */}
          <Route path="/helpdesk/dashboard" element={<HelpdeskDashboardPage />} />
          <Route path="/helpdesk/tickets" element={<TicketListPage />} />
          <Route path="/helpdesk/my-tickets" element={<MyTicketsPage />} />
          <Route path="/helpdesk/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/helpdesk/kb" element={<KnowledgeBasePage />} />
          {/* Survey routes */}
          <Route path="/surveys/dashboard" element={<SurveyDashboardPage />} />
          <Route path="/surveys/list" element={<SurveyListPage />} />
          <Route path="/surveys/builder" element={<SurveyBuilderPage />} />
          <Route path="/surveys/respond" element={<SurveyRespondPage />} />
          <Route path="/surveys/:id/results" element={<SurveyResultsPage />} />
          {/* Biometrics routes */}
          <Route path="/biometrics" element={<BiometricsDashboardPage />} />
          <Route path="/biometrics/enrollment" element={<FaceEnrollmentPage />} />
          <Route path="/biometrics/qr" element={<QRAttendancePage />} />
          <Route path="/biometrics/devices" element={<DeviceManagementPage />} />
          <Route path="/biometrics/settings" element={<BiometricSettingsPage />} />
          <Route path="/biometrics/logs" element={<BiometricLogsPage />} />
          {/* Asset Management routes */}
          <Route path="/assets/dashboard" element={<AssetDashboardPage />} />
          <Route path="/assets/my" element={<MyAssetsPage />} />
          <Route path="/assets/categories" element={<AssetCategoriesPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="/assets" element={<AssetListPage />} />
          {/* Event routes */}
          <Route path="/events" element={<EventsListPage />} />
          <Route path="/events/my" element={<MyEventsPage />} />
          <Route path="/events/dashboard" element={<EventDashboardPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          {/* Forum / Social Intranet routes */}
          <Route path="/forum" element={<ForumPage />} />
          <Route path="/forum/new" element={<CreatePostPage />} />
          <Route path="/forum/dashboard" element={<ForumDashboardPage />} />
          <Route path="/forum/category/:id" element={<CategoryPostsPage />} />
          <Route path="/forum/post/:id" element={<PostDetailPage />} />
          {/* Wellness routes */}
          <Route path="/wellness" element={<WellnessPage />} />
          <Route path="/wellness/dashboard" element={<WellnessDashboardPage />} />
          <Route path="/wellness/my" element={<MyWellnessPage />} />
          <Route path="/wellness/check-in" element={<DailyCheckInPage />} />
          {/* Whistleblowing routes */}
          <Route path="/whistleblowing/submit" element={<WBSubmitReportPage />} />
          <Route path="/whistleblowing/track" element={<WBTrackReportPage />} />
          <Route path="/whistleblowing/dashboard" element={<WBDashboardPage />} />
          <Route path="/whistleblowing/reports/:id" element={<WBReportDetailPage />} />
          <Route path="/whistleblowing/reports" element={<WBReportListPage />} />
          {/* Custom Fields routes */}
          <Route path="/custom-fields" element={<CustomFieldsSettingsPage />} />
          {/* Super Admin routes */}
          <Route path="/admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/organizations" element={<OrgListPage />} />
          <Route path="/admin/organizations/:id" element={<OrgDetailPage />} />
          <Route path="/admin/modules" element={<ModuleAnalyticsPage />} />
          <Route path="/admin/revenue" element={<RevenueAnalyticsPage />} />
          <Route path="/admin/subscriptions" element={<SubscriptionMetricsPage />} />
          <Route path="/admin/ai-config" element={<AIConfigPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
