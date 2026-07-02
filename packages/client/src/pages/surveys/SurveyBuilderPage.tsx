import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, GripVertical, Save, Play, ArrowLeft } from "lucide-react";
import { showToast } from "@/components/ui/Toast";

interface Question {
  _key: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

let _questionKeyCounter = 0;
function nextQuestionKey() {
  return `q-${++_questionKeyCounter}-${Date.now()}`;
}

const QUESTION_TYPES = [
  { value: "rating_1_5", labelKey: "questionType.rating_1_5", labelDefault: "Rating (1-5)" },
  { value: "rating_1_10", labelKey: "questionType.rating_1_10", labelDefault: "Rating (1-10)" },
  { value: "enps_0_10", labelKey: "questionType.enps_0_10", labelDefault: "eNPS (0-10)" },
  { value: "yes_no", labelKey: "questionType.yes_no", labelDefault: "Yes / No" },
  { value: "multiple_choice", labelKey: "questionType.multiple_choice", labelDefault: "Multiple Choice" },
  { value: "text", labelKey: "questionType.text", labelDefault: "Free Text" },
  { value: "scale", labelKey: "questionType.scale", labelDefault: "Scale" },
];

const SURVEY_TYPES = [
  { value: "pulse", labelKey: "surveyType.pulse", labelDefault: "Pulse Survey" },
  { value: "enps", labelKey: "surveyType.enps", labelDefault: "eNPS Survey" },
  { value: "engagement", labelKey: "surveyType.engagement", labelDefault: "Engagement Survey" },
  { value: "custom", labelKey: "surveyType.custom", labelDefault: "Custom Survey" },
  { value: "onboarding", labelKey: "surveyType.onboarding", labelDefault: "Onboarding Survey" },
  { value: "exit_survey", labelKey: "surveyType.exit_survey", labelDefault: "Exit Survey" },
];

export default function SurveyBuilderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("pulse");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [targetType, setTargetType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [questions, setQuestions] = useState<Question[]>([
    { _key: nextQuestionKey(), question_text: "", question_type: "rating_1_5", options: null, is_required: true, sort_order: 0 },
  ]);

  // Load existing survey for editing
  const { data: existingSurvey } = useQuery({
    queryKey: ["survey", editId],
    queryFn: () => api.get(`/surveys/${editId}`).then((r) => r.data.data),
    enabled: !!editId,
  });

  useEffect(() => {
    if (existingSurvey) {
      setTitle(existingSurvey.title || "");
      setDescription(existingSurvey.description || "");
      setType(existingSurvey.type || "pulse");
      setIsAnonymous(existingSurvey.is_anonymous ?? true);
      setTargetType(existingSurvey.target_type || "all");
      setStartDate(existingSurvey.start_date ? existingSurvey.start_date.substring(0, 16) : "");
      setEndDate(existingSurvey.end_date ? existingSurvey.end_date.substring(0, 16) : "");
      setRecurrence(existingSurvey.recurrence || "none");
      if (existingSurvey.questions && existingSurvey.questions.length > 0) {
        setQuestions(
          existingSurvey.questions.map((q: any, idx: number) => ({
            _key: nextQuestionKey(),
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options || null,
            is_required: q.is_required ?? true,
            sort_order: idx,
          }))
        );
      }
    }
  }, [existingSurvey]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/surveys", data).then((r) => r.data.data),
    onSuccess: () => {
      navigate("/surveys/list");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/surveys/${editId}`, data).then((r) => r.data.data),
    onSuccess: () => {
      navigate("/surveys/list");
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (data: any) => {
      let surveyId = editId;
      if (!surveyId) {
        const created = await api.post("/surveys", data).then((r) => r.data.data);
        surveyId = created.id;
      } else {
        await api.put(`/surveys/${editId}`, data);
      }
      await api.post(`/surveys/${surveyId}/publish`);
      return surveyId;
    },
    onSuccess: () => {
      navigate("/surveys/list");
    },
  });

  const buildPayload = () => {
    // Filter out questions with empty text to avoid Zod validation failures
    const validQuestions = questions.filter((q) => q.question_text.trim().length > 0);
    return {
      title,
      description: description || null,
      type,
      is_anonymous: isAnonymous,
      target_type: targetType,
      start_date: startDate || null,
      end_date: endDate || null,
      recurrence,
      questions: validQuestions.map((q, idx) => {
        const { _key, ...rest } = q;
        return {
          ...rest,
          sort_order: idx,
          options: q.options && q.options.filter((o) => o.trim()).length > 0 ? q.options.filter((o) => o.trim()) : null,
        };
      }),
    };
  };

  const validateDates = () => {
    if (startDate && endDate && endDate < startDate) {
      showToast("error", t("surveyBuilder.toast.endBeforeStart"));
      return false;
    }
    return true;
  };

  const handleSaveDraft = () => {
    if (!validateDates()) return;
    const payload = buildPayload();
    if (editId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handlePublish = () => {
    if (!validateDates()) return;
    const payload = buildPayload();
    publishMutation.mutate(payload);
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        _key: nextQuestionKey(),
        question_text: "",
        question_type: "rating_1_5",
        options: null,
        is_required: true,
        sort_order: questions.length,
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: string, value: any) => {
    const updated = [...questions];
    (updated[idx] as any)[field] = value;
    setQuestions(updated);
  };

  const moveQuestion = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === questions.length - 1) return;
    const updated = [...questions];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    setQuestions(updated);
  };

  const isPending = createMutation.isPending || updateMutation.isPending || publishMutation.isPending;

  // Reset stale mutation states when the user modifies form fields,
  // so buttons become clickable again after a previous save/error
  useEffect(() => {
    if (createMutation.isError) createMutation.reset();
    if (updateMutation.isError) updateMutation.reset();
    if (publishMutation.isError) publishMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, questions, type, isAnonymous, targetType, startDate, endDate, recurrence]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/surveys/list")} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? t("surveyBuilder.header.editTitle") : t("surveyBuilder.header.createTitle")}
          </h1>
          <p className="text-gray-500 mt-0.5">{t("surveyBuilder.header.subtitle")}</p>
        </div>
      </div>

      {/* Survey Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("surveyBuilder.details.heading")}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.titleLabel")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={t("surveyBuilder.details.titlePlaceholder")}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.descriptionLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px]"
              placeholder={t("surveyBuilder.details.descriptionPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.typeLabel")}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {SURVEY_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>{t(`surveyBuilder.${st.labelKey}`, { defaultValue: st.labelDefault })}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.targetAudienceLabel")}</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">{t("surveyBuilder.target.all")}</option>
                <option value="department">{t("surveyBuilder.target.department")}</option>
                <option value="role">{t("surveyBuilder.target.role")}</option>
                <option value="custom">{t("surveyBuilder.target.custom")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.recurrenceLabel")}</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="none">{t("surveyBuilder.recurrence.none")}</option>
                <option value="weekly">{t("surveyBuilder.recurrence.weekly")}</option>
                <option value="monthly">{t("surveyBuilder.recurrence.monthly")}</option>
                <option value="quarterly">{t("surveyBuilder.recurrence.quarterly")}</option>
              </select>
            </div>

            {/* #1541 — These inputs are type="datetime-local", so the browser's
                native picker opens a date calendar AND a time selector side by
                side. Previously the labels said "Start Date" / "End Date" only,
                which made users think the time-picker popover was a bug. The
                labels now say "Start Date & Time" and there's a helper line
                under each input making the expectation explicit. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.startDateLabel")}</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">{t("surveyBuilder.details.dateTimeHelper")}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("surveyBuilder.details.endDateLabel")}</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">{t("surveyBuilder.details.dateTimeHelper")}</p>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm font-medium text-gray-700">{t("surveyBuilder.details.anonymousLabel")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Questions Builder */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("surveyBuilder.questions.heading")}</h2>
          <button
            onClick={addQuestion}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("surveyBuilder.questions.addButton")}
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q._key} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-2">
                  <button
                    onClick={() => moveQuestion(idx, "up")}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title={t("surveyBuilder.questions.moveUpTitle")}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <input
                      type="text"
                      value={q.question_text}
                      onChange={(e) => updateQuestion(idx, "question_text", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder={t("surveyBuilder.questions.textPlaceholder")}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t("surveyBuilder.questions.typeLabel")}</label>
                      <select
                        value={q.question_type}
                        onChange={(e) => updateQuestion(idx, "question_type", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <option key={qt.value} value={qt.value}>{t(`surveyBuilder.${qt.labelKey}`, { defaultValue: qt.labelDefault })}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={q.is_required}
                          onChange={(e) => updateQuestion(idx, "is_required", e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        {t("surveyBuilder.questions.requiredLabel")}
                      </label>
                    </div>
                  </div>

                  {/* Options for multiple choice */}
                  {q.question_type === "multiple_choice" && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {t("surveyBuilder.questions.optionsLabel")}
                      </label>
                      <textarea
                        value={(q.options || []).join("\n")}
                        onChange={(e) => {
                          const opts = e.target.value.split("\n");
                          updateQuestion(idx, "options", opts.length > 0 ? opts : null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[60px]"
                        placeholder={t("surveyBuilder.questions.optionsPlaceholder")}
                      />
                    </div>
                  )}

                  {/* Preview */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-2">{t("surveyBuilder.questions.previewLabel")}</p>
                    <QuestionPreview question={q} />
                  </div>
                </div>

                <button
                  onClick={() => removeQuestion(idx)}
                  disabled={questions.length <= 1}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 disabled:opacity-30"
                  title={t("surveyBuilder.questions.removeTitle")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={() => navigate("/surveys/list")}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          {t("surveyBuilder.actions.cancel")}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={isPending || !title.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {t("surveyBuilder.actions.saveDraft")}
        </button>
        <button
          onClick={handlePublish}
          disabled={isPending || !title.trim() || questions.every((q) => !q.question_text.trim())}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> {t("surveyBuilder.actions.savePublish")}
        </button>
      </div>
    </div>
  );
}

function QuestionPreview({ question }: { question: Question }) {
  const { t } = useTranslation();
  const { question_type, question_text } = question;

  if (!question_text) {
    return <p className="text-xs text-gray-300 italic">{t("surveyBuilder.preview.emptyHint")}</p>;
  }

  if (question_type === "rating_1_5") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className="h-8 w-8 rounded-full border border-gray-300 text-xs text-gray-500 hover:bg-brand-50 hover:border-brand-300">
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question_type === "rating_1_10") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} className="h-7 w-7 rounded border border-gray-300 text-xs text-gray-500 hover:bg-brand-50 hover:border-brand-300">
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question_type === "enps_0_10") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              className={`h-7 w-7 rounded border text-xs ${
                n <= 6 ? "border-red-200 text-red-500" : n <= 8 ? "border-yellow-200 text-yellow-600" : "border-green-200 text-green-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
          <span>{t("surveyBuilder.preview.enpsNotLikely")}</span>
          <span>{t("surveyBuilder.preview.enpsVeryLikely")}</span>
        </div>
      </div>
    );
  }

  if (question_type === "yes_no") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="flex gap-3">
          <button className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-green-50 hover:border-green-300">{t("surveyBuilder.preview.yes")}</button>
          <button className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-red-50 hover:border-red-300">{t("surveyBuilder.preview.no")}</button>
        </div>
      </div>
    );
  }

  if (question_type === "multiple_choice") {
    const opts = question.options || [
      t("surveyBuilder.preview.optionA"),
      t("surveyBuilder.preview.optionB"),
      t("surveyBuilder.preview.optionC"),
    ];
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="space-y-1.5">
          {opts.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-gray-600">
              <input type="radio" name={`preview-${question_text}`} className="rounded-full border-gray-300" disabled />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (question_type === "text") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <textarea
          disabled
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white min-h-[60px]"
          placeholder={t("surveyBuilder.preview.textPlaceholder")}
        />
      </div>
    );
  }

  // scale
  return (
    <div>
      <p className="text-sm text-gray-700 mb-2">{question_text}</p>
      <input type="range" min="1" max="10" disabled className="w-full" />
    </div>
  );
}
