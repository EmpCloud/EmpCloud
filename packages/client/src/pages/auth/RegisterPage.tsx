import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@empcloud/shared";
import { useRegister } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { Eye, EyeOff } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

const fieldClassName =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "mb-1.5 block text-[13px] font-medium text-foreground";

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const setAuth = useAuthStore((s) => s.login);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { org_country: "IN" },
  });

  const onSubmit = async (data: RegisterInput) => {
    setError("");
    try {
      const result = await registerMutation.mutateAsync(data);
      setAuth(
        {
          id: result.user.id,
          email: result.user.email,
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          role: result.user.role,
          org_id: result.org.id,
          org_name: result.org.name,
        },
        result.tokens
      );
      navigate("/onboarding");
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t("registerPage.error.registrationFailed"));
    }
  };

  return (
    <AuthPageShell
      title={t("registerPage.header.title")}
      description={t("registerPage.header.subtitle")}
      maxWidth="lg"
    >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>
          )}

          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("registerPage.section.organization")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="register-org-name" className={labelClassName}>{t("registerPage.field.companyName.label")}</label>
              <input
                id="register-org-name"
                autoComplete="organization"
                {...register("org_name")}
                aria-invalid={Boolean(errors.org_name)}
                aria-describedby={errors.org_name ? "register-org-name-error" : undefined}
                className={fieldClassName}
                placeholder={t("registerPage.field.companyName.placeholder")}
              />
              {errors.org_name && <p id="register-org-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.org_name.message}</p>}
            </div>
            <div>
              <label htmlFor="register-org-country" className={labelClassName}>{t("registerPage.field.country.label")}</label>
              <input id="register-org-country" autoComplete="country" {...register("org_country")} className={fieldClassName} placeholder="IN" />
            </div>
            <div>
              <label htmlFor="register-org-state" className={labelClassName}>{t("registerPage.field.state.label")}</label>
              <input id="register-org-state" autoComplete="address-level1" {...register("org_state")} className={fieldClassName} placeholder="Karnataka" />
            </div>
          </div>

          <hr className="border-border" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("registerPage.section.adminAccount")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="register-first-name" className={labelClassName}>{t("registerPage.field.firstName.label")}</label>
              <input id="register-first-name" autoComplete="given-name" {...register("first_name")} aria-invalid={Boolean(errors.first_name)} aria-describedby={errors.first_name ? "register-first-name-error" : undefined} className={fieldClassName} />
              {errors.first_name && <p id="register-first-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.first_name.message}</p>}
            </div>
            <div>
              <label htmlFor="register-last-name" className={labelClassName}>{t("registerPage.field.lastName.label")}</label>
              <input id="register-last-name" autoComplete="family-name" {...register("last_name")} aria-invalid={Boolean(errors.last_name)} aria-describedby={errors.last_name ? "register-last-name-error" : undefined} className={fieldClassName} />
              {errors.last_name && <p id="register-last-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.last_name.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="register-email" className={labelClassName}>{t("registerPage.field.email.label")}</label>
              <input id="register-email" type="email" autoComplete="email" spellCheck={false} {...register("email")} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "register-email-error" : undefined} className={fieldClassName} placeholder={t("registerPage.field.email.placeholder")} />
              {errors.email && <p id="register-email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="register-password" className={labelClassName}>{t("registerPage.field.password.label")}</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  {...register("password")}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "register-password-error" : undefined}
                  className={`${fieldClassName} pr-11`}
                  placeholder={t("registerPage.field.password.placeholder")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={showPassword ? t("registerPage.password.hideAriaLabel") : t("registerPage.password.showAriaLabel")}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p id="register-password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="flex h-10 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? t("registerPage.submit.creating") : t("registerPage.submit.default")}
          </button>

          <p className="text-center text-[13px] text-muted-foreground">
            {t("registerPage.footer.alreadyHaveAccount")}{" "}
            <Link to="/login" className="rounded-sm font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400">{t("registerPage.footer.signIn")}</Link>
          </p>
        </form>
    </AuthPageShell>
  );
}
