import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@empcloud/shared";
import { useLogin } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { Eye, EyeOff } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getPaymentRestrictionDestination } from "@/lib/organization-access";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useLogin();
  const setAuth = useAuthStore((s) => s.login);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Set by the API client's forceLogout() helper when the session is
  // unrecoverable (refresh token expired/revoked, or 401 with no refresh
  // token). Surface a friendly notice instead of leaving the user staring
  // at a blank form wondering what just happened.
  const [searchParams] = useSearchParams();
  const sessionState = searchParams.get("session"); // "expired" or null
  const justReset = searchParams.get("reset") === "success";

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setError("");
    try {
      const result = await login.mutateAsync(data);
      const authUser = {
          id: result.user.id,
          email: result.user.email,
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          role: result.user.role,
          // Super admins live at sentinel org_id=0 with no real org row,
          // so the backend returns org=null. Fall back to the user's
          // organization_id (0) + a known display name -- otherwise
          // result.org.id throws and the catch shows "Can't reach the
          // server" for a successful login.
          org_id: result.org?.id ?? result.user.organization_id ?? 0,
          org_name: result.org?.name ?? "EMP Cloud Platform",
          payment_restricted: Boolean(result.payment_restricted),
        };
      setAuth(
        authUser,
        result.tokens
      );
      navigate(
        authUser.payment_restricted
          ? getPaymentRestrictionDestination(authUser)
          : "/",
      );
    } catch (err: any) {
      // #1648 — surface rate-limit 429s explicitly. express-rate-limit sets
      // Retry-After (in seconds) and our middleware also returns a structured
      // message. Always show *something* even if the response is empty so the
      // button click never appears to do nothing.
      if (err.response?.status === 429) {
        const retryAfterSec = Number(err.response.headers?.["retry-after"]);
        const baseMsg = err.response?.data?.error?.message
          || "Too many login attempts. Please wait and try again.";
        if (retryAfterSec > 0) {
          const mins = Math.ceil(retryAfterSec / 60);
          setError(`${baseMsg} (Retry in ~${mins} min)`);
        } else {
          setError(baseMsg);
        }
        return;
      }
      // Network errors (no response) and unstructured errors fall through
      // to a clear default. Never leave the form blank.
      const apiMsg = err.response?.data?.error?.message;
      const networkMsg = !err.response ? "Can't reach the server. Check your connection and try again." : null;
      setError(apiMsg || networkMsg || "Login failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/empcloud-logo.png"
            alt="EmpCloud"
            className="h-20 w-auto mx-auto mb-6 object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">{t('auth.signIn')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('auth.enterprisePlatform')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-card rounded-xl shadow-sm border border-border p-8 space-y-5">
          {sessionState === "expired" && !error && (
            <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-sm px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-900">
              Your session has expired. Please sign in again.
            </div>
          )}
          {sessionState === "blocked" && !error && (
            <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg border border-red-200 dark:border-red-900">
              Login has been disabled for this organization. Contact support.
            </div>
          )}
          {justReset && !error && (
            <div className="bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 text-sm px-4 py-3 rounded-lg border border-green-200 dark:border-green-900">
              Password updated. Sign in with your new password.
            </div>
          )}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('auth.email')}</label>
            <input
              type="email"
              {...register("email")}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="you@company.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('auth.password')}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                {...register("password")}
                className="bg-card text-foreground w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder={t('auth.password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{" "}
            <Link to="/register" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium">
              {t('auth.registerOrg')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
