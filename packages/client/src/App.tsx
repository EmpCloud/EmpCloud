import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { lazy, Suspense, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import api from "@/api/client";
import ToastContainer from "@/components/ui/Toast";

// Route config imports
import { hrmsRoutes } from "./routes/hrms.routes";
import { helpdeskRoutes } from "./routes/helpdesk.routes";
import { surveyRoutes } from "./routes/surveys.routes";
import { assetRoutes } from "./routes/assets.routes";
import { positionRoutes } from "./routes/positions.routes";
import { feedbackRoutes } from "./routes/feedback.routes";
import { eventRoutes } from "./routes/events.routes";
import { wellnessRoutes } from "./routes/wellness.routes";
import { forumRoutes } from "./routes/forum.routes";
import { whistleblowingRoutes } from "./routes/whistleblowing.routes";
import { biometricRoutes } from "./routes/biometrics.routes";
import { adminRoutes } from "./routes/admin.routes";
import { billingRoutes } from "./routes/billing.routes";
import { chatbotRoutes } from "./routes/chatbot.routes";
import { managerRoutes } from "./routes/manager.routes";
import { customFieldRoutes } from "./routes/custom-fields.routes";

// Lazy-loaded pages (kept in App for public/top-level routes)
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const AcceptInvitationPage = lazy(() => import("@/pages/auth/AcceptInvitationPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const OnboardingWizard = lazy(() => import("@/pages/onboarding/OnboardingWizard"));
const SelfServiceDashboardPage = lazy(() => import("@/pages/self-service/SelfServiceDashboardPage"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Skip onboarding for super_admin — they manage the platform, not a company
    if (user?.role === "super_admin") {
      setChecking(false);
      return;
    }
    async function checkOnboarding() {
      try {
        const { data } = await api.get("/onboarding/status");
        if (mounted && data.data && !data.data.completed) {
          setNeedsOnboarding(true);
        }
      } catch {
        // If endpoint fails, skip onboarding check
      } finally {
        if (mounted) setChecking(false);
      }
    }
    checkOnboarding();
    return () => { mounted = false; };
  }, [user?.role]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Super admin goes straight to Platform Admin dashboard
  if (user?.role === "super_admin") return <Navigate to="/admin" replace />;

  const isAdmin = user?.role === "org_admin" || user?.role === "hr_admin";
  if (isAdmin) return <DashboardPage />;
  return <SelfServiceDashboardPage />;
}

function MyProfileRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/employees/${user.id}`} replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="h-7 w-7 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ToastContainer />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        {/* Reset link from the email lands here as /reset-password?token=... */}
        <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
        {/* Accept-invitation flow: lands here from the invitation email
            (?token=...). Wrapped in PublicRoute so already-authenticated
            users get bounced to the dashboard instead of accidentally
            accepting an invite for a different account. */}
        <Route path="/accept-invitation" element={<PublicRoute><AcceptInvitationPage /></PublicRoute>} />

        {/* Onboarding (protected but no dashboard layout) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingWizard />
            </ProtectedRoute>
          }
        />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<RootRedirect />} />
          <Route path="/my-profile" element={<MyProfileRedirect />} />
          {/* Legacy / commonly-shared URLs that don't match a real route — keep deep links working
              instead of falling through to the catch-all root redirect. */}
          <Route path="/attendance/shift-settings" element={<Navigate to="/attendance/shifts" replace />} />
          <Route path="/leave/holidays" element={<Navigate to="/holidays" replace />} />
          <Route path="/probation" element={<Navigate to="/employees/probation" replace />} />
          {hrmsRoutes}
          {helpdeskRoutes}
          {surveyRoutes}
          {assetRoutes}
          {positionRoutes}
          {feedbackRoutes}
          {eventRoutes}
          {wellnessRoutes}
          {forumRoutes}
          {whistleblowingRoutes}
          {biometricRoutes}
          {adminRoutes}
          {billingRoutes}
          {chatbotRoutes}
          {managerRoutes}
          {customFieldRoutes}
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
