import { lazy } from "react";
import { Route } from "react-router-dom";

const WBSubmitReportPage = lazy(() => import("@/pages/whistleblowing/SubmitReportPage"));
const WBTrackReportPage = lazy(() => import("@/pages/whistleblowing/TrackReportPage"));
const WBDashboardPage = lazy(() => import("@/pages/whistleblowing/WhistleblowingDashboardPage"));
const WBReportListPage = lazy(() => import("@/pages/whistleblowing/ReportListPage"));
const WBReportDetailPage = lazy(() => import("@/pages/whistleblowing/ReportDetailPage"));

export const whistleblowingRoutes = (
  <>
    <Route path="/whistleblowing/submit" element={<WBSubmitReportPage />} />
    <Route path="/whistleblowing/track" element={<WBTrackReportPage />} />
    <Route path="/whistleblowing/dashboard" element={<WBDashboardPage />} />
    <Route path="/whistleblowing/reports/:id" element={<WBReportDetailPage />} />
    <Route path="/whistleblowing/reports" element={<WBReportListPage />} />
  </>
);
