import { lazy } from "react";
import { Route } from "react-router-dom";

const SuperAdminDashboard = lazy(() => import("@/pages/admin/SuperAdminDashboard"));
const OrgListPage = lazy(() => import("@/pages/admin/OrgListPage"));
const OrgDetailPage = lazy(() => import("@/pages/admin/OrgDetailPage"));
const ModuleAnalyticsPage = lazy(() => import("@/pages/admin/ModuleAnalyticsPage"));
const RevenueAnalyticsPage = lazy(() => import("@/pages/admin/RevenueAnalyticsPage"));
const SubscriptionMetricsPage = lazy(() => import("@/pages/admin/SubscriptionMetricsPage"));
const AIConfigPage = lazy(() => import("@/pages/admin/AIConfigPage"));
const LogDashboardPage = lazy(() => import("@/pages/admin/LogDashboardPage"));
const AuditPage = lazy(() => import("@/pages/audit/AuditPage"));
const UsersPage = lazy(() => import("@/pages/users/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));

export const adminRoutes = (
  <>
    <Route path="/users" element={<UsersPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/audit" element={<AuditPage />} />
    <Route path="/admin" element={<SuperAdminDashboard />} />
    <Route path="/admin/organizations" element={<OrgListPage />} />
    <Route path="/admin/organizations/:id" element={<OrgDetailPage />} />
    <Route path="/admin/modules" element={<ModuleAnalyticsPage />} />
    <Route path="/admin/revenue" element={<RevenueAnalyticsPage />} />
    <Route path="/admin/subscriptions" element={<SubscriptionMetricsPage />} />
    <Route path="/admin/ai-config" element={<AIConfigPage />} />
    <Route path="/admin/logs" element={<LogDashboardPage />} />
  </>
);
