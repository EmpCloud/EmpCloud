import { lazy } from "react";
import { Route } from "react-router-dom";

const AssistantPage = lazy(() => import("@/pages/assistant/AssistantPage"));

export const assistantRoutes = (
  <>
    <Route path="/assistant" element={<AssistantPage />} />
  </>
);
