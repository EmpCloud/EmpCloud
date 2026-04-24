import { lazy } from "react";
import { Route } from "react-router-dom";

const BiometricsDashboardPage = lazy(() => import("@/pages/biometrics/BiometricsDashboardPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/biometrics/FaceEnrollmentPage"));
const QRAttendancePage = lazy(() => import("@/pages/biometrics/QRAttendancePage"));
const DeviceManagementPage = lazy(() => import("@/pages/biometrics/DeviceManagementPage"));
const BiometricSettingsPage = lazy(() => import("@/pages/biometrics/BiometricSettingsPage"));
const BiometricLogsPage = lazy(() => import("@/pages/biometrics/BiometricLogsPage"));
const KioskBiometricPage = lazy(() => import("@/pages/biometrics/KioskBiometricPage"));

export const biometricRoutes = (
  <>
    <Route path="/biometrics" element={<BiometricsDashboardPage />} />
    <Route path="/biometrics/enrollment" element={<FaceEnrollmentPage />} />
    <Route path="/biometrics/qr" element={<QRAttendancePage />} />
    <Route path="/biometrics/devices" element={<DeviceManagementPage />} />
    <Route path="/biometrics/settings" element={<BiometricSettingsPage />} />
    <Route path="/biometrics/logs" element={<BiometricLogsPage />} />
    {/* Self-service: per-user 6-digit kiosk PIN — talks to /api/v3/biometric/* */}
    <Route path="/biometrics/kiosk-pin" element={<KioskBiometricPage />} />
  </>
);
