import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/api/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, GripVertical, Save, Play, ArrowLeft } from "lucide-react";

interface Question {
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

const QUESTION_TYPES = [
  { value: "rating_1_5", label: "Rating (1-5)" },
  { value: "rating_1_10", label: "Rating (1-10)" },
  { value: "enps_0_10", label: "eNPS (0-10)" },
  { value: "yes_no", label: "Yes / No" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "text", label: "Free Text" },
  { value: "scale", label: "Scale" },
];

const SURVEY_TYPES = [
  { value: "pulse", label: "Pulse Survey" },
  { value: "enps", label: "eNPS Survey" },
  { value: "engagement", label: "Engagement Survey" },
  { value: "custom", label: "Custom Survey" },
  { value: "onboarding", label: "Onboarding Survey" },
  { value: "exit_survey", label: "Exit Survey" },
];

export default function SurveyBuilderPage() {
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
    { question_text: "", question_type: "rating_1_5", options: null, is_required: true, sort_order: 0 },
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
      questions: validQuestions.map((q, idx) => ({
        ...q,
        sort_order: idx,
        options: q.options && q.options.length > 0 ? q.options : null,
      })),
    };
  };

  const handleSaveDraft = () => {
    const payload = buildPayload();
    if (editId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handlePublish = () => {
    const payload = buildPayload();
    publishMutation.mutate(payload);
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/surveys/list")} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? "Edit Survey" : "Create Survey"}
          </h1>
          <p className="text-gray-500 mt-0.5">Design your survey and add questions.</p>
        </div>
      </div>

      {/* Survey Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Survey Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g., Q1 2026 Employee Pulse Survey"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px]"
              placeholder="Brief description of the survey purpose..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {SURVEY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Employees</option>
                <option value="department">By Department</option>
                <option value="role">By Role</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="none">One-time</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
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
              <span className="text-sm font-medium text-gray-700">Anonymous</span>
            </div>
          </div>
        </div>
      </div>

      {/* Questions Builder */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
          <button
            onClick={addQuestion}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Question
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-2">
                  <button
                    onClick={() => moveQuestion(idx, "up")}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move up"
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
                      placeholder="Enter question text..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select
                        value={q.question_type}
                        onChange={(e) => updateQuestion(idx, "question_type", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <option key={qt.value} value={qt.value}>{qt.label}</option>
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
                        Required
                      </label>
                    </div>
                  </div>

                  {/* Options for multiple choice */}
                  {q.question_type === "multiple_choice" && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Options (one per line)
                      </label>
                      <textarea
                        value={(q.options || []).join("\n")}
                        onChange={(e) => {
                          const opts = e.target.value.split("\n").filter((o) => o.trim());
                          updateQuestion(idx, "options", opts.length > 0 ? opts : null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[60px]"
                        placeholder={"Option A\nOption B\nOption C"}
                      />
                    </div>
                  )}

                  {/* Preview */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-2">Preview</p>
                    <QuestionPreview question={q} />
                  </div>
                </div>

                <button
                  onClick={() => removeQuestion(idx)}
                  disabled={questions.length <= 1}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 disabled:opacity-30"
                  title="Remove question"
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
          Cancel
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={isPending || !title.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Save as Draft
        </button>
        <button
          onClick={handlePublish}
          disabled={isPending || !title.trim() || questions.every((q) => !q.question_text.trim())}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Save & Publish
        </button>
      </div>
    </div>
  );
}

function QuestionPreview({ question }: { question: Question }) {
  const { question_type, question_text } = question;

  if (!question_text) {
    return <p className="text-xs text-gray-300 italic">Type a question to see preview</p>;
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
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      </div>
    );
  }

  if (question_type === "yes_no") {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-2">{question_text}</p>
        <div className="flex gap-3">
          <button className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-green-50 hover:border-green-300">Yes</button>
          <button className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-red-50 hover:border-red-300">No</button>
        </div>
      </div>
    );
  }

  if (question_type === "multiple_choice") {
    const opts = question.options || ["Option A", "Option B", "Option C"];
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
          placeholder="Employee will type their answer here..."
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
