import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { lazy, Suspense } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ModulesPage = lazy(() => import("@/pages/modules/ModulesPage"));
const SubscriptionsPage = lazy(() => import("@/pages/subscriptions/SubscriptionsPage"));
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
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
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
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
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
