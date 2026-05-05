import { lazy } from "react";
import { Route } from "react-router-dom";

const RolesPage = lazy(() => import("@/pages/roles/RolesPage"));

export const rolesRoutes = (
  <>
    <Route path="/roles" element={<RolesPage />} />
  </>
);
