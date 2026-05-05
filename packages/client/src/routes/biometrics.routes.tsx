import { lazy } from "react";
import { Route } from "react-router-dom";

// Biometrics dashboard / enrollment / QR / devices / logs / settings pages
// were removed — only the self-service Kiosk PIN page is kept. Biometric
// attendance is driven by the v3 legacy kiosk stack at /api/v3/biometric/*.
const KioskBiometricPage = lazy(() => import("@/pages/biometrics/KioskBiometricPage"));

export const biometricRoutes = (
  <>
    <Route path="/biometrics/kiosk-pin" element={<KioskBiometricPage />} />
  </>
);
