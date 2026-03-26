import { lazy } from "react";
import { Route } from "react-router-dom";

const CustomFieldsSettingsPage = lazy(() => import("@/pages/custom-fields/CustomFieldsSettingsPage"));

export const customFieldRoutes = (
  <>
    <Route path="/custom-fields" element={<CustomFieldsSettingsPage />} />
  </>
);
