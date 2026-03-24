import { useState } from "react";
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
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-700" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700" },
];

export default function SubmitReportPage() {
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
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Report Submitted</h2>
          <p className="text-gray-600 mb-6">
            Your report has been submitted successfully. Please save your case number to track the status of your report.
          </p>
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6">
            <p className="text-sm text-gray-500 mb-1">Your Case Number</p>
            <p className="text-3xl font-mono font-bold text-brand-700">{submittedCase}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
            <p className="text-sm text-amber-800 font-medium">Important:</p>
            <ul className="text-sm text-amber-700 mt-1 list-disc list-inside space-y-1">
              <li>Save this case number securely. It is the only way to track your report.</li>
              <li>Your identity is {isAnonymous ? "fully anonymous and cannot be revealed" : "attached to this report"}.</li>
              <li>Use the "Track Report" page to check for updates.</li>
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
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="h-7 w-7 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submit a Whistleblowing Report</h1>
          <p className="text-sm text-gray-500">
            Report misconduct safely and confidentially (EU Directive 2019/1937)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
        {/* Anonymous Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center gap-3">
            {isAnonymous ? (
              <EyeOff className="h-5 w-5 text-green-600" />
            ) : (
              <Eye className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <p className="font-medium text-gray-900">
                {isAnonymous ? "Anonymous Report" : "Identified Report"}
              </p>
              <p className="text-sm text-gray-500">
                {isAnonymous
                  ? "Your identity will not be stored or disclosed to anyone."
                  : "Your identity will be visible to investigators."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(!isAnonymous)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAnonymous ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAnonymous ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Severity <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  severity === s.value
                    ? `${s.color} border-current ring-2 ring-offset-1`
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue"
            maxLength={255}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Provide as much detail as possible: what happened, when, where, who was involved, and any evidence you have."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
            {submitMutation.isPending ? "Submitting..." : "Submit Report"}
          </button>
        </div>

        {submitMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            Failed to submit report. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}
