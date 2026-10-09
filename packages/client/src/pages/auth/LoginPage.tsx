import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@empcloud/shared";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useLogin } from "@/api/hooks";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { setAuthPersistence, useAuthStore } from "@/lib/auth-store";
import { getPaymentRestrictionDestination } from "@/lib/organization-access";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useLogin();
  const setAuth = useAuthStore((s) => s.login);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Set by the API client's forceLogout() helper when the session is
  // unrecoverable (refresh token expired/revoked, or 401 with no refresh
  // token). Surface a friendly notice instead of leaving the user staring
  // at a blank form wondering what just happened.
  const [searchParams] = useSearchParams();
  const sessionState = searchParams.get("session");
  const justReset = searchParams.get("reset") === "success";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
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
        // so the backend returns org=null.
        org_id: result.org?.id ?? result.user.organization_id ?? 0,
        org_name: result.org?.name ?? "EMP Cloud Platform",
        payment_restricted: Boolean(result.payment_restricted),
      };
      setAuthPersistence(rememberMe);
      setAuth(authUser, result.tokens);
      navigate(
        authUser.payment_restricted
          ? getPaymentRestrictionDestination(authUser)
          : "/",
      );
    } catch (err: any) {
      // Surface rate-limit 429s explicitly. express-rate-limit sets
      // Retry-After (in seconds) and the middleware returns a message.
      if (err.response?.status === 429) {
        const retryAfterSec = Number(err.response.headers?.["retry-after"]);
        const baseMsg =
          err.response?.data?.error?.message ||
          "Too many login attempts. Please wait and try again.";
        if (retryAfterSec > 0) {
          const mins = Math.ceil(retryAfterSec / 60);
          setError(baseMsg + " (Retry in ~" + mins + " min)");
        } else {
          setError(baseMsg);
        }
        return;
      }

      const apiMsg = err.response?.data?.error?.message;
      const networkMsg = !err.response
        ? "Can't reach the server. Check your connection and try again."
        : null;
      setError(apiMsg || networkMsg || "Login failed. Please try again.");
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-950 lg:grid lg:grid-cols-[60%_40%]">
      <div className="absolute right-5 top-5 z-30 rounded-xl border border-slate-200/80 bg-white/90 px-2 py-1 shadow-sm backdrop-blur-sm sm:right-7 sm:top-6">
        <LanguageSwitcher />
      </div>

      <section
        aria-label={t("auth.heroTitle")}
        className="relative hidden min-h-screen overflow-hidden bg-[#eaf2ff] lg:block"
      >
        <img
          src="/empcloud-login-hero.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-bottom"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/5 to-transparent" />
        <div className="relative z-10 max-w-[860px] px-[7%] pt-[3.5vh]">
          <img
            src="/empcloud-logo.png"
            alt="EMP Cloud"
            className="h-auto w-44 object-contain"
          />

          <h1 className="mt-5 max-w-[790px] text-[clamp(2.65rem,4.15vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-[#08183f]">
            {t("auth.heroTitle")}
            <span className="mt-1 block bg-gradient-to-r from-[#2478f4] to-[#7c35f4] bg-clip-text text-transparent xl:whitespace-nowrap">
              {t("auth.heroAccent")}
            </span>
          </h1>

          <p className="mt-3.5 max-w-[570px] text-balance text-base leading-6 text-[#283e66]">
            {t("auth.heroDescription")}
          </p>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-white to-[#f3f7ff] px-5 py-20 lg:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-180px] left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full bg-[#dbe9ff]/60 blur-3xl"
        />

        <div className="relative z-10 w-full max-w-[372px] rounded-[18px] border border-[#dfe7f3] bg-white/95 p-5 shadow-[0_24px_70px_rgba(50,89,160,0.15)] backdrop-blur-sm sm:p-6">
          <header className="text-center">
            <img
              src="/empcloud-logo.png"
              alt="EMP Cloud"
              className="mx-auto h-auto w-44 object-contain"
            />
            <h2 className="mt-4 text-[1.625rem] font-bold tracking-[-0.025em] text-[#07112d]">
              {t("auth.welcomeBack")}
            </h2>
            <p className="mt-1.5 text-sm text-[#667792]">
              {t("auth.loginSubtitle")}
            </p>
          </header>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
            {sessionState === "expired" && !error && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                Your session has expired. Please sign in again.
              </div>
            )}
            {sessionState === "blocked" && !error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                Login has been disabled for this organization. Contact support.
              </div>
            )}
            {justReset && !error && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                Password updated. Sign in with your new password.
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-medium text-[#263854]"
              >
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#92a5c0]"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "login-email-error" : undefined}
                  className="h-11 w-full rounded-lg border border-[#d9e2ee] bg-white pl-11 pr-4 text-sm text-[#172640] outline-none transition placeholder:text-[#97a4b7] hover:border-[#b8c8dc] focus:border-[#3972f6] focus:ring-4 focus:ring-[#3972f6]/10"
                  placeholder="you@company.com"
                />
              </div>
              {errors.email && (
                <p id="login-email-error" className="mt-1.5 text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-medium text-[#263854]"
              >
                {t("auth.password")}
              </label>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#92a5c0]"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "login-password-error" : undefined}
                  className="h-11 w-full rounded-lg border border-[#d9e2ee] bg-white pl-11 pr-12 text-sm text-[#172640] outline-none transition placeholder:text-[#97a4b7] hover:border-[#b8c8dc] focus:border-[#3972f6] focus:ring-4 focus:ring-[#3972f6]/10"
                  placeholder={t("auth.password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#8ca0ba] outline-none transition hover:bg-slate-100 hover:text-[#4e6483] focus-visible:ring-2 focus-visible:ring-[#3972f6]"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="login-password-error" className="mt-1.5 text-xs text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#52637e]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-[#b8c7da] accent-[#2f66ed] focus:ring-[#2f66ed]"
                />
                <span>{t("auth.rememberMe")}</span>
              </label>
              <Link
                to="/forgot-password"
                className="inline-flex min-h-11 items-center text-right text-sm font-medium text-[#2460e8] outline-none transition hover:text-[#1849b8] hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#3972f6]"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2668ed] to-[#5243ea] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(52,82,225,0.28)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(52,82,225,0.34)] focus-visible:ring-4 focus-visible:ring-[#3972f6]/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? t("auth.signingIn") : t("auth.signIn")}</span>
              {!isSubmitting && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>

            <p className="pt-1 text-center text-sm text-[#687996]">
              {t("auth.noAccount")}{" "}
              <Link
                to="/register"
                className="font-semibold text-[#2460e8] outline-none transition hover:text-[#1849b8] hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#3972f6]"
              >
                {t("auth.registerOrg")}
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
