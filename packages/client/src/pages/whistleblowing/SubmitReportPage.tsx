import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import api from "@/api/client";
import { ShieldAlert, Eye, EyeOff, CheckCircle } from "lucide-react";

const CATEGORIES = [
  { value: "fraud", label: "Fraud" },
  { value: "corruption", label: "Corruption" },
  { value: "harassment", label: "Harassment" },
  { value: "discrimination", label: "Discrimination" },
  { value: "safety_violation", label: "Safety Violation" },
  { value: "data_breach", label: "Data Breach" },
  { value: "financial_misconduct", label: "Financial Misconduct" },
  { value: "environmental", label: "Environmental" },
  { value: "retaliation", label: "Retaliation" },
  { value: "other", label: "Other" },
];

const SEVERITIES = [
  { value: "low", label: "Low", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300" },
  { value: "high", label: "High", color: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300" },
  { value: "critical", label: "Critical", color: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300" },
];

export default function SubmitReportPage() {
  const { t } = useTranslation();
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submittedCase, setSubmittedCase] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: (data: {
      category: string;
      severity: string;
      subject: string;
      description: string;
      is_anonymous: boolean;
    }) => api.post("/whistleblowing/reports", data).then((r) => r.data),
    onSuccess: (data) => {
      setSubmittedCase(data.data.case_number);
    },
  });

  if (submittedCase) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("submitReport.success.title")}</h2>
          <p className="text-muted-foreground mb-6">
            {t("submitReport.success.description")}
          </p>
          <div className="bg-muted border-2 border-dashed border-border rounded-lg p-6 mb-6">
            <p className="text-sm text-muted-foreground mb-1">{t("submitReport.success.caseNumberLabel")}</p>
            <p className="text-3xl font-mono font-bold text-brand-700 dark:text-brand-300">{submittedCase}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-left">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">{t("submitReport.success.importantLabel")}</p>
            <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 list-disc list-inside space-y-1">
              <li>{t("submitReport.success.saveCaseNumber")}</li>
              <li>{isAnonymous ? t("submitReport.success.identityAnonymous") : t("submitReport.success.identityAttached")}</li>
              <li>{t("submitReport.success.trackReportHint")}</li>
            </ul>
          </div>
          <button
            onClick={() => {
              setSubmittedCase(null);
              setCategory("");
              setSeverity("medium");
              setSubject("");
              setDescription("");
            }}
            className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
          >
            {t("submitReport.success.submitAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="h-7 w-7 text-brand-600 dark:text-brand-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("submitReport.header.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("submitReport.header.subtitle")}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border p-6 space-y-6">
        {/* Anonymous Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg border">
          <div className="flex items-center gap-3">
            {isAnonymous ? (
              <EyeOff className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            )}
            <div>
              <p className="font-medium text-foreground">
                {isAnonymous ? t("submitReport.anonymous.anonymousTitle") : t("submitReport.anonymous.identifiedTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {isAnonymous
                  ? t("submitReport.anonymous.anonymousDescription")
                  : t("submitReport.anonymous.identifiedDescription")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(!isAnonymous)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAnonymous ? "bg-green-500" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
                isAnonymous ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            {t("submitReport.form.categoryLabel")} <span className="text-red-500">{t("submitReport.form.required")}</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-card text-foreground"
          >
            <option value="">{t("submitReport.form.categoryPlaceholder")}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(`submitReport.category.${c.value}`, { defaultValue: c.label })}
              </option>
            ))}
          </select>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            {t("submitReport.form.severityLabel")} <span className="text-red-500">{t("submitReport.form.required")}</span>
          </label>
          <div className="flex gap-3">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  severity === s.value
                    ? `${s.color} border-current ring-2 ring-offset-1 ring-offset-card`
                    : "bg-muted text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {t(`submitReport.severity.${s.value}`, { defaultValue: s.label })}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            {t("submitReport.form.subjectLabel")} <span className="text-red-500">{t("submitReport.form.required")}</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("submitReport.form.subjectPlaceholder")}
            maxLength={255}
            className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-card text-foreground"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            {t("submitReport.form.descriptionLabel")} <span className="text-red-500">{t("submitReport.form.required")}</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder={t("submitReport.form.descriptionPlaceholder")}
            className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-card text-foreground"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={() =>
              submitMutation.mutate({
                category,
                severity,
                subject,
                description,
                is_anonymous: isAnonymous,
              })
            }
            disabled={!category || !subject || !description || submitMutation.isPending}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {submitMutation.isPending ? t("submitReport.actions.submitting") : t("submitReport.actions.submit")}
          </button>
        </div>

        {submitMutation.isError && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {t("submitReport.error.submitFailed")}
          </div>
        )}
      </div>
    </div>
  );
}
