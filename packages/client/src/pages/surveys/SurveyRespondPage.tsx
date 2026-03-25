import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { ClipboardList, CheckCircle, Clock, Send } from "lucide-react";

export default function SurveyRespondPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
        <p className="text-gray-500 mt-1">Complete active surveys and view your past responses.</p>
      </div>

      {/* Pending Surveys */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-500" />
          Pending Surveys
          {pendingSurveys.length > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {pendingSurveys.length}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-full bg-gray-200 rounded mb-4" />
                <div className="h-9 w-full bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : pendingSurveys.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500 mb-1">No active surveys</p>
            <p className="text-sm text-gray-400">Check back later for new surveys to complete.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSurveys.map((s: any) => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.type === "enps" ? "bg-indigo-100 text-indigo-700" :
                        s.type === "pulse" ? "bg-purple-100 text-purple-700" :
                        s.type === "engagement" ? "bg-teal-100 text-teal-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {s.type}
                      </span>
                      {s.is_anonymous && (
                        <span className="text-xs text-gray-400">Anonymous</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{s.title}</h3>
                    {s.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                    )}
                    {s.end_date && (
                      <p className="text-xs text-gray-400 mt-2">
                        Due by {new Date(s.end_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSurveyId(s.id)}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
                >
                  <Send className="h-4 w-4" /> Take Survey
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Surveys */}
      {completedSurveys.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Completed
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {completedSurveys.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-700">{s.title}</p>
                  <p className="text-xs text-gray-400">{s.type}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" /> Completed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Past Responses */}
      {myResponses && myResponses.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Response History</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Survey</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Submitted</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Anonymous</th>
                </tr>
              </thead>
              <tbody>
                {myResponses.map((r: any) => (
                  <tr key={r.response_id} className="border-b border-gray-50">
                    <td className="px-6 py-3 text-gray-700">{r.title}</td>
                    <td className="px-6 py-3 text-gray-500 capitalize">{r.type}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {new Date(r.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {r.is_anonymous ? "Yes" : "No"}
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
        <div className="text-gray-400">Loading survey...</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
        <p className="text-gray-500">Your response has been submitted successfully.</p>
      </div>
    );
  }

  if (!survey) return null;

  const questions = survey.questions || [];

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="text-sm text-brand-600 hover:underline mb-4"
      >
        &larr; Back to surveys
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            survey.type === "enps" ? "bg-indigo-100 text-indigo-700" :
            survey.type === "pulse" ? "bg-purple-100 text-purple-700" :
            "bg-gray-100 text-gray-700"
          }`}>
            {survey.type}
          </span>
          {survey.is_anonymous && (
            <span className="text-xs text-gray-400">Your responses are anonymous</span>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{survey.title}</h1>
        {survey.description && (
          <p className="text-gray-500 mt-2">{survey.description}</p>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q: any, idx: number) => (
          <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-3">
              <span className="text-sm font-mono text-gray-400 mt-0.5">{idx + 1}.</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 mb-3">
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
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Submit Response
        </button>
      </div>

      {submitMutation.isError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {(submitMutation.error as any)?.response?.data?.error?.message || "Failed to submit response. Please try again."}
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
                : "border-gray-300 text-gray-600 hover:bg-brand-50 hover:border-brand-300"
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
                : "border-gray-300 text-gray-600 hover:bg-brand-50 hover:border-brand-300"
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
              ? isSelected ? "bg-red-500 text-white border-red-500" : "border-red-200 text-red-600 hover:bg-red-50"
              : n <= 8
              ? isSelected ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-200 text-yellow-600 hover:bg-yellow-50"
              : isSelected ? "bg-green-500 text-white border-green-500" : "border-green-200 text-green-600 hover:bg-green-50";
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
        <div className="flex justify-between text-xs text-gray-400 mt-1.5 px-1">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
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
              : "border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300"
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onChange({ text_value: "no" })}
          className={`px-6 py-2 rounded-lg border text-sm font-medium transition-colors ${
            value?.text_value === "no"
              ? "bg-red-500 text-white border-red-500"
              : "border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300"
          }`}
        >
          No
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
                ? "bg-brand-50 border-brand-300 text-brand-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px]"
        placeholder="Type your answer here..."
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
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>1</span>
        <span className="font-semibold text-gray-600">{value?.rating_value || 5}</span>
        <span>10</span>
      </div>
    </div>
  );
}
