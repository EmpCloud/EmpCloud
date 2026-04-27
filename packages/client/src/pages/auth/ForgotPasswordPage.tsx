import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@empcloud/shared";
import { useForgotPassword } from "@/api/hooks";
import { Building2, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Building2 className="h-12 w-12 text-brand-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.forgotPasswordTitle")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("auth.forgotPasswordDescription")}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5">
          {submitted ? (
            <div className="space-y-5">
              <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
                {t("auth.resetLinkSent")}
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" /> {t("auth.backToLogin")}
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
                  {t("auth.email")}
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="you@company.com"
                  autoFocus
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting
                  ? t("auth.sendingResetLink")
                  : t("auth.sendResetLink")}
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
