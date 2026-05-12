import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";

const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const ModulesPage = lazy(() => import("@/pages/modules/ModulesPage"));
const ModuleAccessPage = lazy(() => import("@/pages/modules/ModuleAccessPage"));

const HR_ROLES = ["org_admin", "hr_admin", "super_admin"];

// Allow when the user is HR/super_admin OR holds any of the listed
// permissions via a custom role. Mirrors the server-side requirePermission
// middleware that already accepts both, so the client routing matches.
function RequireHRorPermission({
  children,
  permissions,
}: {
  children: React.ReactNode;
  permissions: string[];
}) {
  const user = useAuthStore((s) => s.user);
  const { has } = usePermissions();
  if (!user) return <Navigate to="/" replace />;
  if (HR_ROLES.includes(user.role)) return <>{children}</>;
  if (has(...permissions)) return <>{children}</>;
  return <Navigate to="/" replace />;
}

export const billingRoutes = (
  <>
    <Route path="/modules" element={<ModulesPage />} />
    <Route
      path="/modules/access"
      element={
        <RequireHRorPermission permissions={["modules_access:view", "modules_access:manage"]}>
          <ModuleAccessPage />
        </RequireHRorPermission>
      }
    />
    <Route path="/subscriptions" element={<Navigate to="/billing" replace />} />
    <Route
      path="/billing"
      element={
        <RequireHRorPermission permissions={["billing:view", "billing:manage"]}>
          <BillingPage />
        </RequireHRorPermission>
      }
    />
  </>
);
