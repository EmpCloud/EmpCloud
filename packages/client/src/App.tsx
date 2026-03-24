import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { lazy, Suspense, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import api from "@/api/client";

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
const RegularizationsPage = lazy(() => import("@/pages/attendance/RegularizationsPage"));
const LeaveDashboardPage = lazy(() => import("@/pages/leave/LeaveDashboardPage"));
const LeaveApplicationsPage = lazy(() => import("@/pages/leave/LeaveApplicationsPage"));
const LeaveCalendarPage = lazy(() => import("@/pages/leave/LeaveCalendarPage"));
const LeaveTypesPage = lazy(() => import("@/pages/leave/LeaveTypesPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/DocumentsPage"));
const DocumentCategoriesPage = lazy(() => import("@/pages/documents/DocumentCategoriesPage"));
const AnnouncementsPage = lazy(() => import("@/pages/announcements/AnnouncementsPage"));
const PoliciesPage = lazy(() => import("@/pages/policies/PoliciesPage"));
const OrgChartPage = lazy(() => import("@/pages/employees/OrgChartPage"));
const ImportEmployeesPage = lazy(() => import("@/pages/employees/ImportEmployeesPage"));
const SelfServiceDashboardPage = lazy(() => import("@/pages/self-service/SelfServiceDashboardPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const OnboardingWizard = lazy(() => import("@/pages/onboarding/OnboardingWizard"));
// Biometrics pages
const BiometricsDashboardPage = lazy(() => import("@/pages/biometrics/BiometricsDashboardPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/biometrics/FaceEnrollmentPage"));
const QRAttendancePage = lazy(() => import("@/pages/biometrics/QRAttendancePage"));
const DeviceManagementPage = lazy(() => import("@/pages/biometrics/DeviceManagementPage"));
const BiometricSettingsPage = lazy(() => import("@/pages/biometrics/BiometricSettingsPage"));
const BiometricLogsPage = lazy(() => import("@/pages/biometrics/BiometricLogsPage"));
// Super Admin pages
const SuperAdminDashboard = lazy(() => import("@/pages/admin/SuperAdminDashboard"));
const OrgListPage = lazy(() => import("@/pages/admin/OrgListPage"));
const OrgDetailPage = lazy(() => import("@/pages/admin/OrgDetailPage"));
const ModuleAnalyticsPage = lazy(() => import("@/pages/admin/ModuleAnalyticsPage"));
const RevenueAnalyticsPage = lazy(() => import("@/pages/admin/RevenueAnalyticsPage"));
const SubscriptionMetricsPage = lazy(() => import("@/pages/admin/SubscriptionMetricsPage"));

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
    async function checkOnboarding() {
      try {
        const { data } = await api.get("/onboarding/status");
        if (data.data && !data.data.completed) {
          setNeedsOnboarding(true);
        }
      } catch {
        // If endpoint fails, skip onboarding check
      } finally {
        setChecking(false);
      }
    }
    checkOnboarding();
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  const isAdmin = user?.role === "org_admin" || user?.role === "super_admin" || user?.role === "hr_admin" || user?.role === "hr_manager";
  if (isAdmin) return <DashboardPage />;
  return <SelfServiceDashboardPage />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="text-gray-400">Loading...</div>
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
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
          <Route path="/attendance/regularizations" element={<RegularizationsPage />} />
          <Route path="/leave" element={<LeaveDashboardPage />} />
          <Route path="/leave/applications" element={<LeaveApplicationsPage />} />
          <Route path="/leave/calendar" element={<LeaveCalendarPage />} />
          <Route path="/leave/settings" element={<LeaveTypesPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/categories" element={<DocumentCategoriesPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/org-chart" element={<OrgChartPage />} />
          <Route path="/employees/import" element={<ImportEmployeesPage />} />
          {/* Biometrics routes */}
          <Route path="/biometrics" element={<BiometricsDashboardPage />} />
          <Route path="/biometrics/enrollment" element={<FaceEnrollmentPage />} />
          <Route path="/biometrics/qr" element={<QRAttendancePage />} />
          <Route path="/biometrics/devices" element={<DeviceManagementPage />} />
          <Route path="/biometrics/settings" element={<BiometricSettingsPage />} />
          <Route path="/biometrics/logs" element={<BiometricLogsPage />} />
          {/* Super Admin routes */}
          <Route path="/admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/organizations" element={<OrgListPage />} />
          <Route path="/admin/organizations/:id" element={<OrgDetailPage />} />
          <Route path="/admin/modules" element={<ModuleAnalyticsPage />} />
          <Route path="/admin/revenue" element={<RevenueAnalyticsPage />} />
          <Route path="/admin/subscriptions" element={<SubscriptionMetricsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
