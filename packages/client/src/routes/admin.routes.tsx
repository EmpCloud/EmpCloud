import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";

const SuperAdminDashboard = lazy(() => import("@/pages/admin/SuperAdminDashboard"));
const OrgListPage = lazy(() => import("@/pages/admin/OrgListPage"));
const OrgDetailPage = lazy(() => import("@/pages/admin/OrgDetailPage"));
const ModuleAnalyticsPage = lazy(() => import("@/pages/admin/ModuleAnalyticsPage"));
const RevenueAnalyticsPage = lazy(() => import("@/pages/admin/RevenueAnalyticsPage"));
const SubscriptionMetricsPage = lazy(() => import("@/pages/admin/SubscriptionMetricsPage"));
const AIConfigPage = lazy(() => import("@/pages/admin/AIConfigPage"));
const LogDashboardPage = lazy(() => import("@/pages/admin/LogDashboardPage"));
const PlatformSettingsPage = lazy(() => import("@/pages/admin/PlatformSettingsPage"));
const HealthDashboardPage = lazy(() => import("@/pages/admin/HealthDashboardPage"));
const DataSanityPage = lazy(() => import("@/pages/admin/DataSanityPage"));
const SystemNotificationsPage = lazy(() => import("@/pages/admin/SystemNotificationsPage"));
const AuditPage = lazy(() => import("@/pages/audit/AuditPage"));
const UsersPage = lazy(() => import("@/pages/users/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));

const HR_ROLES = ["org_admin", "hr_admin"];

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export const adminRoutes = (
  <>
    <Route path="/users" element={<RequireRole roles={[...HR_ROLES, "super_admin"]}><UsersPage /></RequireRole>} />
    <Route path="/settings" element={<RequireRole roles={[...HR_ROLES, "super_admin"]}><SettingsPage /></RequireRole>} />
    <Route path="/audit" element={<RequireRole roles={[...HR_ROLES, "super_admin"]}><AuditPage /></RequireRole>} />
    <Route path="/admin" element={<RequireRole roles={["super_admin"]}><SuperAdminDashboard /></RequireRole>} />
    <Route path="/admin/organizations" element={<RequireRole roles={["super_admin"]}><OrgListPage /></RequireRole>} />
    <Route path="/admin/organizations/:id" element={<RequireRole roles={["super_admin"]}><OrgDetailPage /></RequireRole>} />
    <Route path="/admin/modules" element={<RequireRole roles={["super_admin"]}><ModuleAnalyticsPage /></RequireRole>} />
    <Route path="/admin/revenue" element={<RequireRole roles={["super_admin"]}><RevenueAnalyticsPage /></RequireRole>} />
    <Route path="/admin/subscriptions" element={<RequireRole roles={["super_admin"]}><SubscriptionMetricsPage /></RequireRole>} />
    <Route path="/admin/ai-config" element={<RequireRole roles={["super_admin"]}><AIConfigPage /></RequireRole>} />
    <Route path="/admin/logs" element={<RequireRole roles={["super_admin"]}><LogDashboardPage /></RequireRole>} />
    <Route path="/admin/health" element={<RequireRole roles={["super_admin"]}><HealthDashboardPage /></RequireRole>} />
    <Route path="/admin/data-sanity" element={<RequireRole roles={["super_admin"]}><DataSanityPage /></RequireRole>} />
    <Route path="/admin/notifications" element={<RequireRole roles={["super_admin"]}><SystemNotificationsPage /></RequireRole>} />
    <Route path="/admin/settings" element={<RequireRole roles={["super_admin"]}><PlatformSettingsPage /></RequireRole>} />
    <Route path="/admin/audit" element={<RequireRole roles={["super_admin"]}><AuditPage /></RequireRole>} />
  </>
);
