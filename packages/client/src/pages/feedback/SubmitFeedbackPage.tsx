import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import api from "@/api/client";
import { MessageSquarePlus, Send, AlertTriangle, CheckCircle } from "lucide-react";

const CATEGORIES = [
  { value: "workplace", label: "Workplace" },
  { value: "management", label: "Management" },
  { value: "process", label: "Process" },
  { value: "culture", label: "Culture" },
  { value: "harassment", label: "Harassment" },
  { value: "safety", label: "Safety" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
];

export default function SubmitFeedbackPage() {
  const { t } = useTranslation();
  const [category, setCategory] = useState("workplace");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (data: object) => api.post("/feedback", data).then((r) => r.data.data),
    onSuccess: () => {
      setSubmitted(true);
      setCategory("workplace");
      setSubject("");
      setMessage("");
      setIsUrgent(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMutation.mutateAsync({ category, subject, message, is_urgent: isUrgent });
  };

  if (submitted) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t("submitFeedback.page.title")}</h1>
        </div>
        <div className="bg-card rounded-xl border border-border p-8 text-center max-w-lg mx-auto">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("submitFeedback.success.title")}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t("submitFeedback.success.description")}
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="bg-brand-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            {t("submitFeedback.success.submitAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t("submitFeedback.page.title")}</h1>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 mb-6 max-w-2xl">
        <div className="flex items-start gap-3">
          <MessageSquarePlus className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t("submitFeedback.anonymousBanner.title")}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {t("submitFeedback.anonymousBanner.description")}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 max-w-2xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t("submitFeedback.field.category")} <span className="text-red-500">*</span></label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(`submitFeedback.category.${c.value}`, { defaultValue: c.label })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t("submitFeedback.field.subject")} <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
            placeholder={t("submitFeedback.field.subjectPlaceholder")}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t("submitFeedback.field.message")} <span className="text-red-500">*</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[160px]"
            placeholder={t("submitFeedback.field.messagePlaceholder")}
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="h-4 w-4 rounded border-border text-red-600 dark:text-red-400 focus:ring-red-500"
            />
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {t("submitFeedback.field.markUrgent")}
            </span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? t("submitFeedback.action.submitting") : t("submitFeedback.action.submit")}
          </button>
        </div>

        {submitMutation.isError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            {t("submitFeedback.error.submitFailed")}
          </p>
        )}
      </form>
    </div>
  );
}
