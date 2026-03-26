import { lazy } from "react";
import { Route } from "react-router-dom";

const PositionDashboardPage = lazy(() => import("@/pages/positions/PositionDashboardPage"));
const PositionListPage = lazy(() => import("@/pages/positions/PositionListPage"));
const PositionDetailPage = lazy(() => import("@/pages/positions/PositionDetailPage"));
const VacanciesPage = lazy(() => import("@/pages/positions/VacanciesPage"));
const HeadcountPlanPage = lazy(() => import("@/pages/positions/HeadcountPlanPage"));

export const positionRoutes = (
  <>
    <Route path="/positions" element={<PositionDashboardPage />} />
    <Route path="/positions/list" element={<PositionListPage />} />
    <Route path="/positions/vacancies" element={<VacanciesPage />} />
    <Route path="/positions/headcount-plans" element={<HeadcountPlanPage />} />
    <Route path="/positions/:id" element={<PositionDetailPage />} />
  </>
);
