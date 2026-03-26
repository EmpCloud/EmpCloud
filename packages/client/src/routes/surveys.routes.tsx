import { lazy } from "react";
import { Route } from "react-router-dom";

const SurveyDashboardPage = lazy(() => import("@/pages/surveys/SurveyDashboardPage"));
const SurveyListPage = lazy(() => import("@/pages/surveys/SurveyListPage"));
const SurveyBuilderPage = lazy(() => import("@/pages/surveys/SurveyBuilderPage"));
const SurveyRespondPage = lazy(() => import("@/pages/surveys/SurveyRespondPage"));
const SurveyResultsPage = lazy(() => import("@/pages/surveys/SurveyResultsPage"));

export const surveyRoutes = (
  <>
    <Route path="/surveys/dashboard" element={<SurveyDashboardPage />} />
    <Route path="/surveys/list" element={<SurveyListPage />} />
    <Route path="/surveys/builder" element={<SurveyBuilderPage />} />
    <Route path="/surveys/respond" element={<SurveyRespondPage />} />
    <Route path="/surveys/:id/results" element={<SurveyResultsPage />} />
  </>
);
