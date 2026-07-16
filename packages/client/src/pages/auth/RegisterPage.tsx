import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@empcloud/shared";
import { useRegister } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { Eye, EyeOff } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <img src="/empcloud-logo.png" alt="EmpCloud" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">{t("registerPage.header.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("registerPage.header.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-card rounded-xl shadow-sm border border-border p-8 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("registerPage.section.organization")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.companyName.label")}</label>
              <input {...register("org_name")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder={t("registerPage.field.companyName.placeholder")} />
              {errors.org_name && <p className="text-red-500 text-xs mt-1">{errors.org_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.country.label")}</label>
              <input {...register("org_country")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="IN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.state.label")}</label>
              <input {...register("org_state")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="Karnataka" />
            </div>
          </div>

          <hr className="border-border" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("registerPage.section.adminAccount")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.firstName.label")}</label>
              <input {...register("first_name")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.lastName.label")}</label>
              <input {...register("last_name")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.email.label")}</label>
              <input type="email" {...register("email")} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder={t("registerPage.field.email.placeholder")} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("registerPage.field.password.label")}</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className="bg-card text-foreground w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder={t("registerPage.field.password.placeholder")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-muted-foreground"
                  aria-label={showPassword ? t("registerPage.password.hideAriaLabel") : t("registerPage.password.showAriaLabel")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? t("registerPage.submit.creating") : t("registerPage.submit.default")}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {t("registerPage.footer.alreadyHaveAccount")}{" "}
            <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium">{t("registerPage.footer.signIn")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
