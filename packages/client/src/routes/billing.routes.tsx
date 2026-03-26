import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const ModulesPage = lazy(() => import("@/pages/modules/ModulesPage"));

export const billingRoutes = (
  <>
    <Route path="/modules" element={<ModulesPage />} />
    <Route path="/subscriptions" element={<Navigate to="/billing" replace />} />
    <Route path="/billing" element={<BillingPage />} />
  </>
);
