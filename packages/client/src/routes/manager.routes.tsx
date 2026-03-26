import { lazy } from "react";
import { Route } from "react-router-dom";

const ManagerDashboardPage = lazy(() => import("@/pages/manager/ManagerDashboardPage"));

export const managerRoutes = (
  <>
    <Route path="/manager" element={<ManagerDashboardPage />} />
  </>
);
