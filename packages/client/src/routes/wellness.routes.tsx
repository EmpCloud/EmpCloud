import { lazy } from "react";
import { Route } from "react-router-dom";

const WellnessPage = lazy(() => import("@/pages/wellness/WellnessPage"));
const WellnessDashboardPage = lazy(() => import("@/pages/wellness/WellnessDashboardPage"));
const MyWellnessPage = lazy(() => import("@/pages/wellness/MyWellnessPage"));
const DailyCheckInPage = lazy(() => import("@/pages/wellness/DailyCheckInPage"));

export const wellnessRoutes = (
  <>
    <Route path="/wellness" element={<WellnessPage />} />
    <Route path="/wellness/dashboard" element={<WellnessDashboardPage />} />
    <Route path="/wellness/my" element={<MyWellnessPage />} />
    <Route path="/wellness/check-in" element={<DailyCheckInPage />} />
  </>
);
