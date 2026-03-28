import { lazy } from "react";
import { Route } from "react-router-dom";

const EmployeeDirectoryPage = lazy(() => import("@/pages/employees/EmployeeDirectoryPage"));
const EmployeeProfilePage = lazy(() => import("@/pages/employees/EmployeeProfilePage"));
const OrgChartPage = lazy(() => import("@/pages/employees/OrgChartPage"));
const ImportEmployeesPage = lazy(() => import("@/pages/employees/ImportEmployeesPage"));
const AttendanceDashboardPage = lazy(() => import("@/pages/attendance/AttendanceDashboardPage"));
const AttendancePage = lazy(() => import("@/pages/attendance/AttendancePage"));
const ShiftsPage = lazy(() => import("@/pages/attendance/ShiftsPage"));
const ShiftSchedulePage = lazy(() => import("@/pages/attendance/ShiftSchedulePage"));
const RegularizationsPage = lazy(() => import("@/pages/attendance/RegularizationsPage"));
const LeaveDashboardPage = lazy(() => import("@/pages/leave/LeaveDashboardPage"));
const LeaveApplicationsPage = lazy(() => import("@/pages/leave/LeaveApplicationsPage"));
const LeaveCalendarPage = lazy(() => import("@/pages/leave/LeaveCalendarPage"));
const LeaveTypesPage = lazy(() => import("@/pages/leave/LeaveTypesPage"));
const CompOffPage = lazy(() => import("@/pages/leave/CompOffPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/DocumentsPage"));
const DocumentCategoriesPage = lazy(() => import("@/pages/documents/DocumentCategoriesPage"));
const MyDocumentsPage = lazy(() => import("@/pages/documents/MyDocumentsPage"));
const AnnouncementsPage = lazy(() => import("@/pages/announcements/AnnouncementsPage"));
const PoliciesPage = lazy(() => import("@/pages/policies/PoliciesPage"));
const SelfServiceDashboardPage = lazy(() => import("@/pages/self-service/SelfServiceDashboardPage"));
const ProbationPage = lazy(() => import("@/pages/employees/ProbationPage"));

export const hrmsRoutes = (
  <>
    <Route path="/self-service" element={<SelfServiceDashboardPage />} />
    <Route path="/employees" element={<EmployeeDirectoryPage />} />
    <Route path="/employees/probation" element={<ProbationPage />} />
    <Route path="/employees/:id" element={<EmployeeProfilePage />} />
    <Route path="/employees/import" element={<ImportEmployeesPage />} />
    <Route path="/org-chart" element={<OrgChartPage />} />
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
    <Route path="/documents" element={<DocumentsPage />} />
    <Route path="/documents/my" element={<MyDocumentsPage />} />
    <Route path="/documents/categories" element={<DocumentCategoriesPage />} />
    <Route path="/announcements" element={<AnnouncementsPage />} />
    <Route path="/policies" element={<PoliciesPage />} />
  </>
);
