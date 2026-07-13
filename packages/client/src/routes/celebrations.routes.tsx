import { lazy } from "react";
import { Route } from "react-router-dom";

const CelebrationsPage = lazy(() => import("@/pages/celebrations/CelebrationsPage"));

export const celebrationRoutes = (
  <>
    <Route path="/celebrations" element={<CelebrationsPage />} />
  </>
);
