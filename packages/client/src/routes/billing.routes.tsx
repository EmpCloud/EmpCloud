import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";

const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const ModulesPage = lazy(() => import("@/pages/modules/ModulesPage"));

const HR_ROLES = ["org_admin", "hr_admin", "hr_manager", "super_admin"];

function RequireHR({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !HR_ROLES.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export const billingRoutes = (
  <>
    <Route path="/modules" element={<ModulesPage />} />
    <Route path="/subscriptions" element={<Navigate to="/billing" replace />} />
    <Route path="/billing" element={<RequireHR><BillingPage /></RequireHR>} />
  </>
);
