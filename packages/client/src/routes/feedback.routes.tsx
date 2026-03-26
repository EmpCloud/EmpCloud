import { lazy } from "react";
import { Route } from "react-router-dom";

const SubmitFeedbackPage = lazy(() => import("@/pages/feedback/SubmitFeedbackPage"));
const MyFeedbackPage = lazy(() => import("@/pages/feedback/MyFeedbackPage"));
const FeedbackDashboardPage = lazy(() => import("@/pages/feedback/FeedbackDashboardPage"));
const FeedbackListPage = lazy(() => import("@/pages/feedback/FeedbackListPage"));

export const feedbackRoutes = (
  <>
    <Route path="/feedback/submit" element={<SubmitFeedbackPage />} />
    <Route path="/feedback/my" element={<MyFeedbackPage />} />
    <Route path="/feedback/dashboard" element={<FeedbackDashboardPage />} />
    <Route path="/feedback" element={<FeedbackListPage />} />
  </>
);
