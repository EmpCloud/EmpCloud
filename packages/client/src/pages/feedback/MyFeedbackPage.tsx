import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { MessageSquare, Clock, CheckCircle, AlertTriangle, Eye, Archive, Search } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700", icon: Clock },
  acknowledged: { label: "Acknowledged", color: "bg-yellow-100 text-yellow-700", icon: Eye },
  under_review: { label: "Under Review", color: "bg-purple-100 text-purple-700", icon: Search },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive },
};

const CATEGORY_COLORS: Record<string, string> = {
  workplace: "bg-blue-50 text-blue-700",
  management: "bg-indigo-50 text-indigo-700",
  process: "bg-cyan-50 text-cyan-700",
  culture: "bg-pink-50 text-pink-700",
  harassment: "bg-red-50 text-red-700",
  safety: "bg-orange-50 text-orange-700",
  suggestion: "bg-green-50 text-green-700",
  other: "bg-gray-50 text-gray-600",
};

export default function MyFeedbackPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["my-feedback", page],
    queryFn: () => api.get("/feedback/my", { params: { page } }).then((r) => r.data),
  });

  const feedbackList = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Feedback</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        View the status of your anonymously submitted feedback and any responses from HR.
      </p>

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading your feedback...
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>You haven't submitted any feedback yet.</p>
          </div>
        ) : (
          feedbackList.map((f: any) => {
            const statusCfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.new;
            const StatusIcon = statusCfg.icon;
            const catColor = CATEGORY_COLORS[f.category] || CATEGORY_COLORS.other;

            return (
              <div
                key={f.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>
                      {f.category}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusCfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
                    </span>
                    {f.is_urgent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        Urgent
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(f.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-gray-900 mb-1">{f.subject}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{f.message}</p>

                {f.admin_response && (
                  <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-brand-700 mb-1">HR Response</p>
                    <p className="text-sm text-brand-800">{f.admin_response}</p>
                    {f.responded_at && (
                      <p className="text-xs text-brand-500 mt-2">
                        Responded on{" "}
                        {new Date(f.responded_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
