import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { ClipboardList, CheckCircle, Clock, Send } from "lucide-react";

// Survey type badge label — translated under surveyRespond.type.*, with the
// raw value (e.g. an unknown future type) as the defaultValue fallback.
type TFn = (key: string, opts?: Record<string, unknown>) => string;
function surveyTypeLabel(type: string, t: TFn): string {
  return t(`surveyRespond.type.${type}`, { defaultValue: type });
}

export default function SurveyRespondPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);

  const { data: activeSurveys, isLoading } = useQuery({
    queryKey: ["surveys-active"],
    queryFn: () => api.get("/surveys/active").then((r) => r.data.data),
  });

  const { data: myResponses } = useQuery({
    queryKey: ["surveys-my-responses"],
    queryFn: () => api.get("/surveys/my-responses").then((r) => r.data.data),
  });

  const surveys = activeSurveys || [];
  const pendingSurveys = surveys.filter((s: any) => !s.has_responded);
  const completedSurveys = surveys.filter((s: any) => s.has_responded);

  if (selectedSurveyId) {
    return (
      <SurveyFillForm
        surveyId={selectedSurveyId}
        onBack={() => setSelectedSurveyId(null)}
        onSubmitted={() => {
          setSelectedSurveyId(null);
          qc.invalidateQueries({ queryKey: ["surveys-active"] });
          qc.invalidateQueries({ queryKey: ["surveys-my-responses"] });
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("surveyRespond.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("surveyRespond.subtitle")}</p>
      </div>

      {/* Pending Surveys */}
      <div className="mb-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-500" />
          {t("surveyRespond.pending")}
          {pendingSurveys.length > 0 && (
            <span className="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-[11px] font-semibold px-2 py-0.5 rounded-md">
              {pendingSurveys.length}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-16 bg-muted rounded-full" />
                </div>
                <div className="h-5 w-48 bg-muted rounded mb-2" />
                <div className="h-4 w-full bg-muted rounded mb-4" />
                <div className="h-9 w-full bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        ) : pendingSurveys.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium text-muted-foreground mb-1">{t("surveyRespond.noActive")}</p>
            <p className="text-sm text-muted-foreground">{t("surveyRespond.noActiveHint")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSurveys.map((s: any) => (
              <div key={s.id} className="bg-card rounded-lg border border-border p-4 hover:border-brand-400 transition-colors duration-150">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        s.type === "enps" ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" :
                        s.type === "pulse" ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300" :
                        s.type === "engagement" ? "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {surveyTypeLabel(s.type, t)}
                      </span>
                      {s.is_anonymous && (
                        <span className="text-xs text-muted-foreground">{t("surveyRespond.anonymous")}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground">{s.title}</h3>
                    {s.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                    )}
                    {s.end_date && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {t("surveyRespond.dueBy", { date: new Date(s.end_date).toLocaleDateString() })}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSurveyId(s.id)}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
                >
                  <Send className="h-4 w-4" /> {t("surveyRespond.takeSurvey")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Surveys */}
      {completedSurveys.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            {t("surveyRespond.completed")}
          </h2>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {completedSurveys.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-6 py-4 border-b border-border last:border-0">
                <div>
                  <p className="font-medium text-muted-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{surveyTypeLabel(s.type, t)}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5" /> {t("surveyRespond.completedBadge")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Past Responses */}
      {myResponses && myResponses.length > 0 && (
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("surveyRespond.responseHistory")}</h2>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveyRespond.colSurvey")}</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveyRespond.colType")}</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveyRespond.colSubmitted")}</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveyRespond.colAnonymous")}</th>
                </tr>
              </thead>
              <tbody>
                {myResponses.map((r: any) => (
                  <tr key={r.response_id} className="border-b border-border">
                    <td className="px-4 py-2.5 text-muted-foreground">{r.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{surveyTypeLabel(r.type, t)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(r.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.is_anonymous ? t("surveyRespond.yes") : t("surveyRespond.no")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Survey Fill Form
// ---------------------------------------------------------------------------

function SurveyFillForm({
  surveyId,
  onBack,
  onSubmitted,
}: {
  surveyId: number;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<number, { rating_value?: number | null; text_value?: string | null }>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: survey, isLoading } = useQuery({
    queryKey: ["survey-detail", surveyId],
    queryFn: () => api.get(`/surveys/${surveyId}`).then((r) => r.data.data),
  });

  const submitMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/surveys/${surveyId}/respond`, payload),
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => onSubmitted(), 2000);
    },
  });

  const setAnswer = (questionId: number, value: { rating_value?: number | null; text_value?: string | null }) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    const answerArray = Object.entries(answers).map(([qid, val]) => ({
      question_id: parseInt(qid),
      rating_value: val.rating_value ?? null,
      text_value: val.text_value ?? null,
    }));
    submitMutation.mutate({ answers: answerArray });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-muted-foreground">{t("surveyRespond.loadingSurvey")}</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2">{t("surveyRespond.thankYou")}</h2>
        <p className="text-muted-foreground">{t("surveyRespond.submittedSuccess")}</p>
      </div>
    );
  }

  if (!survey) return null;

  const questions = survey.questions || [];

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="text-sm text-brand-600 dark:text-brand-400 hover:underline mb-4"
      >
        &larr; {t("surveyRespond.backToSurveys")}
      </button>

      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
            survey.type === "enps" ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" :
            survey.type === "pulse" ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300" :
            "bg-muted text-muted-foreground"
          }`}>
            {surveyTypeLabel(survey.type, t)}
          </span>
          {survey.is_anonymous && (
            <span className="text-xs text-muted-foreground">{t("surveyRespond.responsesAnonymous")}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{survey.title}</h1>
        {survey.description && (
          <p className="text-muted-foreground mt-2">{survey.description}</p>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q: any, idx: number) => (
          <div key={q.id} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="text-[13px] tabular-nums font-mono text-muted-foreground mt-0.5">{idx + 1}.</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-3">
                  {q.question_text}
                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                </p>
                <QuestionInput
                  question={q}
                  value={answers[q.id]}
                  onChange={(val) => setAnswer(q.id, val)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 mt-6 pb-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[13px] border border-border rounded-md text-muted-foreground hover:bg-muted"
        >
          {t("surveyRespond.cancel")}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {t("surveyRespond.submitResponse")}
        </button>
      </div>

      {submitMutation.isError && (
        <div className="mt-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
          {(submitMutation.error as any)?.response?.data?.error?.message || t("surveyRespond.submitError")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Input Component
// ---------------------------------------------------------------------------

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: any;
  value: { rating_value?: number | null; text_value?: string | null } | undefined;
  onChange: (val: { rating_value?: number | null; text_value?: string | null }) => void;
}) {
  const { t } = useTranslation();
  const { question_type } = question;

  if (question_type === "rating_1_5") {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange({ rating_value: n })}
            className={`h-10 w-10 rounded-full border text-sm font-medium transition-colors ${
              value?.rating_value === n
                ? "bg-brand-600 text-white border-brand-600"
                : "border-border text-muted-foreground hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:border-brand-300 dark:hover:border-brand-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (question_type === "rating_1_10") {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            onClick={() => onChange({ rating_value: n })}
            className={`h-9 w-9 rounded border text-sm font-medium transition-colors ${
              value?.rating_value === n
                ? "bg-brand-600 text-white border-brand-600"
                : "border-border text-muted-foreground hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:border-brand-300 dark:hover:border-brand-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (question_type === "enps_0_10") {
    return (
      <div>
        <div className="flex gap-1.5 flex-wrap">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
            const isSelected = value?.rating_value === n;
            const colorClass = n <= 6
              ? isSelected ? "bg-red-500 text-white border-red-500" : "border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              : n <= 8
              ? isSelected ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-200 dark:border-yellow-900 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950/40"
              : isSelected ? "bg-green-500 text-white border-green-500" : "border-green-200 dark:border-green-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40";
            return (
              <button
                key={n}
                onClick={() => onChange({ rating_value: n })}
                className={`h-9 w-9 rounded border text-sm font-medium transition-colors ${colorClass}`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5 px-1">
          <span>{t("surveyRespond.notAtAllLikely")}</span>
          <span>{t("surveyRespond.extremelyLikely")}</span>
        </div>
      </div>
    );
  }

  if (question_type === "yes_no") {
    return (
      <div className="flex gap-3">
        <button
          onClick={() => onChange({ text_value: "yes" })}
          className={`px-6 py-2 rounded-lg border text-sm font-medium transition-colors ${
            value?.text_value === "yes"
              ? "bg-green-500 text-white border-green-500"
              : "border-border text-muted-foreground hover:bg-green-50 dark:hover:bg-green-950/40 hover:border-green-300 dark:hover:border-green-800"
          }`}
        >
          {t("surveyRespond.yes")}
        </button>
        <button
          onClick={() => onChange({ text_value: "no" })}
          className={`px-6 py-2 rounded-lg border text-sm font-medium transition-colors ${
            value?.text_value === "no"
              ? "bg-red-500 text-white border-red-500"
              : "border-border text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-800"
          }`}
        >
          {t("surveyRespond.no")}
        </button>
      </div>
    );
  }

  if (question_type === "multiple_choice") {
    const options = question.options || [];
    return (
      <div className="space-y-2">
        {options.map((opt: string, i: number) => (
          <button
            key={i}
            onClick={() => onChange({ text_value: opt })}
            className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              value?.text_value === opt
                ? "bg-brand-50 dark:bg-brand-950/40 border-brand-300 dark:border-brand-800 text-brand-700 dark:text-brand-300"
                : "border-border text-muted-foreground hover:bg-muted hover:border-border"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (question_type === "text") {
    return (
      <textarea
        value={value?.text_value || ""}
        onChange={(e) => onChange({ text_value: e.target.value })}
        className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] min-h-[80px]"
        placeholder={t("surveyRespond.textPlaceholder")}
      />
    );
  }

  // scale
  return (
    <div>
      <input
        type="range"
        min="1"
        max="10"
        value={value?.rating_value || 5}
        onChange={(e) => onChange({ rating_value: parseInt(e.target.value) })}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>1</span>
        <span className="font-semibold text-muted-foreground">{value?.rating_value || 5}</span>
        <span>10</span>
      </div>
    </div>
  );
}
