import { useState } from "react";
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
          <h1 className="text-2xl font-bold text-gray-900">Submit Feedback</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-lg mx-auto">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Feedback Submitted</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your feedback has been submitted anonymously. Your identity is not stored or visible to anyone.
            You can check the status of your feedback on the "My Feedback" page.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="bg-brand-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Submit Feedback</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-2xl">
        <div className="flex items-start gap-3">
          <MessageSquarePlus className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Your feedback is completely anonymous</p>
            <p className="text-xs text-amber-600 mt-1">
              Your identity is hashed and cannot be traced back to you. HR will see the feedback content but never your name or email.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Brief summary of your feedback"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message <span className="text-red-500">*</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[160px]"
            placeholder="Describe your feedback in detail..."
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Mark as urgent
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
            {submitMutation.isPending ? "Submitting..." : "Submit Anonymously"}
          </button>
        </div>

        {submitMutation.isError && (
          <p className="text-sm text-red-600 mt-2">
            Failed to submit feedback. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
