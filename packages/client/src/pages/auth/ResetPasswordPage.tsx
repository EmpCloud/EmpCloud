import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@empcloud/shared";
import { useResetPassword } from "@/api/hooks";
import { Building2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Building2 className="h-12 w-12 text-brand-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.resetPasswordTitle")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("auth.resetPasswordDescription")}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5">
          {!token ? (
            <div className="space-y-4">
              <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg">
                {t("auth.missingResetToken")}
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" /> {t("auth.forgotPasswordTitle")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("auth.newPassword")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    placeholder={t("auth.newPassword")}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("auth.confirmPassword")}
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  {...register("confirmPassword")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder={t("auth.confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
                {password &&
                  watch("confirmPassword") &&
                  password !== watch("confirmPassword") && (
                    <p className="text-red-500 text-xs mt-1">
                      {t("auth.passwordsDontMatch")}
                    </p>
                  )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting
                  ? t("auth.resettingPassword")
                  : t("auth.resetPassword")}
              </button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" /> {t("auth.backToLogin")}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
