import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@empcloud/shared";
import { useResetPassword } from "@/api/hooks";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

interface FormValues {
  password: string;
  confirmPassword: string;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const reset = useResetPassword();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      resetPasswordSchema
        .pick({ password: true })
        .extend({ confirmPassword: resetPasswordSchema.shape.password }),
    ),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const password = watch("password");

  const onSubmit = async (data: FormValues) => {
    setError("");
    if (data.password !== data.confirmPassword) {
      setError(t("auth.passwordsDontMatch"));
      return;
    }
    if (!token) {
      setError(t("auth.missingResetToken"));
      return;
    }
    try {
      const payload: ResetPasswordInput = { token, password: data.password };
      await reset.mutateAsync(payload);
      // Bounce back to login with a query flag the LoginPage could
      // optionally read; even without that, the toast on LoginPage from
      // a fresh mount is enough.
      navigate("/login?reset=success", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Reset failed");
    }
  };

  return (
    <AuthPageShell
      title={t("auth.resetPasswordTitle")}
      description={t("auth.resetPasswordDescription")}
    >
          {!token ? (
            <div className="space-y-4">
              <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {t("auth.missingResetToken")}
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-brand-600 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:bg-brand-950/40"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t("auth.forgotPasswordTitle")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {error && (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="reset-password" className="mb-1.5 block text-[13px] font-medium text-foreground">
                  {t("auth.newPassword")}
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("password")}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "reset-password-error" : undefined}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 pr-11 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    placeholder={t("auth.newPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Eye aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="reset-password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className="mb-1.5 block text-[13px] font-medium text-foreground">
                  {t("auth.confirmPassword")}
                </label>
                <input
                  id="reset-password-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                  aria-invalid={Boolean(errors.confirmPassword) || Boolean(password && watch("confirmPassword") && password !== watch("confirmPassword"))}
                  aria-describedby={errors.confirmPassword ? "reset-password-confirm-error" : undefined}
                  className="h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder={t("auth.confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p id="reset-password-confirm-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.confirmPassword.message}
                  </p>
                )}
                {password &&
                  watch("confirmPassword") &&
                  password !== watch("confirmPassword") && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {t("auth.passwordsDontMatch")}
                    </p>
                  )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-10 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? t("auth.resettingPassword")
                  : t("auth.resetPassword")}
              </button>

              <Link
                to="/login"
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t("auth.backToLogin")}
              </Link>
            </form>
          )}
    </AuthPageShell>
  );
}
