import { lazy } from "react";
import { Route } from "react-router-dom";

const BiometricsDashboardPage = lazy(() => import("@/pages/biometrics/BiometricsDashboardPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/biometrics/FaceEnrollmentPage"));
const QRAttendancePage = lazy(() => import("@/pages/biometrics/QRAttendancePage"));
const DeviceManagementPage = lazy(() => import("@/pages/biometrics/DeviceManagementPage"));
const BiometricSettingsPage = lazy(() => import("@/pages/biometrics/BiometricSettingsPage"));
const BiometricLogsPage = lazy(() => import("@/pages/biometrics/BiometricLogsPage"));

export const biometricRoutes = (
  <>
    <Route path="/biometrics" element={<BiometricsDashboardPage />} />
    <Route path="/biometrics/enrollment" element={<FaceEnrollmentPage />} />
    <Route path="/biometrics/qr" element={<QRAttendancePage />} />
    <Route path="/biometrics/devices" element={<DeviceManagementPage />} />
    <Route path="/biometrics/settings" element={<BiometricSettingsPage />} />
    <Route path="/biometrics/logs" element={<BiometricLogsPage />} />
  </>
);
