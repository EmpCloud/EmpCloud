import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@empcloud/shared";
import { useForgotPassword } from "@/api/hooks";
import { ArrowLeft } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setError("");
    try {
      await forgot.mutateAsync(data);
      setSubmitted(true);
    } catch (err: any) {
      // The backend deliberately returns 200 even for unknown emails so
      // we don't leak account existence — only network/validation errors
      // should reach this branch.
      setError(err.response?.data?.error?.message || "Request failed");
    }
  };

  return (
    <AuthPageShell
      title={t("auth.forgotPasswordTitle")}
      description={t("auth.forgotPasswordDescription")}
    >
          {submitted ? (
            <div className="space-y-5">
              <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300">
                {t("auth.resetLinkSent")}
              </div>
              <Link
                to="/login"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-brand-600 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:bg-brand-950/40"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t("auth.backToLogin")}
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
                <label htmlFor="forgot-password-email" className="mb-1.5 block text-[13px] font-medium text-foreground">
                  {t("auth.email")}
                </label>
                <input
                  id="forgot-password-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  {...register("email")}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "forgot-password-email-error" : undefined}
                  className="h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="you@company.com"
                />
                {errors.email && (
                  <p id="forgot-password-email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-10 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? t("auth.sendingResetLink")
                  : t("auth.sendResetLink")}
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
