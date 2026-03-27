import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  ShieldAlert, ArrowLeft, Clock, User, AlertTriangle,
  CheckCircle, ArrowUpRight, MessageSquare,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700" },
  under_investigation: { label: "Under Investigation", color: "bg-yellow-100 text-yellow-700" },
  escalated: { label: "Escalated", color: "bg-orange-100 text-orange-700" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700" },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-600" },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-500" },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUSES = ["submitted", "under_investigation", "escalated", "resolved", "dismissed", "closed"];

export default function ReportDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();

  // Assign investigator
  const [investigatorId, setInvestigatorId] = useState("");
  // Add update
  const [updateContent, setUpdateContent] = useState("");
  const [updateType, setUpdateType] = useState("note");
  const [visibleToReporter, setVisibleToReporter] = useState(false);
  // Status change
  const [newStatus, setNewStatus] = useState("");
  const [resolution, setResolution] = useState("");
  // Escalate
  const [escalateTo, setEscalateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["whistleblowing-report", id],
    queryFn: () => api.get(`/whistleblowing/reports/${id}`).then((r) => r.data.data),
  });

  // Fetch users for investigator dropdown
  const { data: usersData, isLoading: usersLoading, isError: usersError } = useQuery({
    queryKey: ["users-for-investigator"],
    queryFn: () => api.get("/users", { params: { per_page: 100 } }).then((r) => {
      const users = r.data.data;
      return Array.isArray(users) ? users : [];
    }),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post(`/whistleblowing/reports/${id}/assign`, {
        investigator_id: parseInt(investigatorId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblowing-report", id] });
      setInvestigatorId("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.post(`/whistleblowing/reports/${id}/update`, {
        content: updateContent,
        update_type: updateType,
        is_visible_to_reporter: visibleToReporter,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblowing-report", id] });
      setUpdateContent("");
      setVisibleToReporter(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      api.put(`/whistleblowing/reports/${id}/status`, {
        status: newStatus,
        ...(resolution ? { resolution } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblowing-report", id] });
      setNewStatus("");
      setResolution("");
    },
  });

  const escalateMutation = useMutation({
    mutationFn: () =>
      api.post(`/whistleblowing/reports/${id}/escalate`, {
        escalated_to: escalateTo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblowing-report", id] });
      setEscalateTo("");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const statusCfg = STATUS_CONFIG[data.status] || { label: data.status, color: "bg-gray-100 text-gray-600" };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/whistleblowing/reports" className="p-1 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <ShieldAlert className="h-6 w-6 text-brand-600" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{data.case_number}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[data.severity] || ""}`}>
              {data.severity}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Info */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{data.subject}</h2>
            <div className="flex gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-500">Category:</span>{" "}
                <span className="font-medium capitalize">{data.category?.replace(/_/g, " ")}</span>
              </div>
              <div>
                <span className="text-gray-500">Anonymous:</span>{" "}
                <span className={`font-medium ${data.is_anonymous ? "text-green-600" : "text-gray-700"}`}>
                  {data.is_anonymous ? "Yes" : "No"}
                </span>
              </div>
              {!data.is_anonymous && data.reporter_name && (
                <div>
                  <span className="text-gray-500">Reporter:</span>{" "}
                  <span className="font-medium">{data.reporter_name}</span>
                </div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {data.description}
            </div>
            {data.evidence_paths && data.evidence_paths.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Evidence Files:</p>
                <div className="flex flex-wrap gap-2">
                  {data.evidence_paths.map((path: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">
                      {path.split("/").pop()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Investigation Timeline */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">Investigation Timeline</h3>
            {data.updates && data.updates.length > 0 ? (
              <div className="space-y-4">
                {data.updates.map((u: any) => (
                  <div key={u.id} className="flex gap-3 border-l-2 border-gray-200 pl-4 pb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
                          {u.update_type.replace(/_/g, " ")}
                        </span>
                        {u.is_visible_to_reporter && (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                            Visible to Reporter
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{u.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {u.created_by_name || "System"} &middot; {new Date(u.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No updates yet</p>
            )}
          </div>

          {/* Add Update */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">Add Update</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <select
                  value={updateType}
                  onChange={(e) => setUpdateType(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="note">Internal Note</option>
                  <option value="response_to_reporter">Response to Reporter</option>
                  <option value="status_change">Status Change Note</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={visibleToReporter}
                    onChange={(e) => setVisibleToReporter(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Visible to reporter
                </label>
              </div>
              <textarea
                value={updateContent}
                onChange={(e) => setUpdateContent(e.target.value)}
                rows={3}
                placeholder="Write an update or note..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!updateContent.trim() || updateMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                {updateMutation.isPending ? "Sending..." : "Add Update"}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          {/* Info Card */}
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Submitted:</span>
              <span className="text-gray-900">{new Date(data.created_at).toLocaleDateString()}</span>
            </div>
            {data.investigator_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Investigator:</span>
                <span className="text-gray-900">{data.investigator_name}</span>
              </div>
            )}
            {data.escalated_to && (
              <div className="flex items-center gap-2 text-sm">
                <ArrowUpRight className="h-4 w-4 text-orange-500" />
                <span className="text-gray-500">Escalated to:</span>
                <span className="text-gray-900">{data.escalated_to}</span>
              </div>
            )}
            {data.resolved_at && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-gray-500">Resolved:</span>
                <span className="text-gray-900">{new Date(data.resolved_at).toLocaleDateString()}</span>
              </div>
            )}
            {data.resolution && (
              <div className="mt-2 p-3 bg-green-50 rounded-lg text-sm text-green-800">
                <p className="font-medium mb-1">Resolution:</p>
                <p>{data.resolution}</p>
              </div>
            )}
          </div>

          {/* Assign Investigator */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Assign Investigator</h4>
            {usersError && (
              <p className="text-xs text-red-600 mb-2">Failed to load users. Please refresh the page.</p>
            )}
            <div className="flex gap-2">
              <select
                value={investigatorId}
                onChange={(e) => setInvestigatorId(e.target.value)}
                disabled={usersLoading || !!usersError}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">
                  {usersLoading
                    ? "Loading users..."
                    : usersError
                    ? "Error loading users"
                    : "Select investigator..."}
                </option>
                {(usersData || []).map((u: any) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.first_name} {u.last_name} ({u.email})
                  </option>
                ))}
              </select>
              <button
                onClick={() => assignMutation.mutate()}
                disabled={!investigatorId || assignMutation.isPending}
                className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition"
              >
                <User className="h-4 w-4" />
              </button>
            </div>
            {assignMutation.isError && (
              <p className="text-xs text-red-600 mt-2">
                {(assignMutation.error as any)?.response?.data?.error?.message || "Failed to assign investigator. Please try again."}
              </p>
            )}
            {assignMutation.isSuccess && (
              <p className="text-xs text-green-600 mt-2">Investigator assigned successfully.</p>
            )}
          </div>

          {/* Change Status */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Change Status</h4>
            <div className="space-y-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select status...</option>
                {STATUSES.filter((s) => s !== data.status).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              {(newStatus === "resolved" || newStatus === "dismissed" || newStatus === "closed") && (
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={2}
                  placeholder="Resolution notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              )}
              <button
                onClick={() => statusMutation.mutate()}
                disabled={!newStatus || statusMutation.isPending}
                className="w-full px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {statusMutation.isPending ? "Updating..." : "Update Status"}
              </button>
            </div>
          </div>

          {/* Escalate */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Escalate Externally
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                value={escalateTo}
                onChange={(e) => setEscalateTo(e.target.value)}
                placeholder="External body or authority"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => escalateMutation.mutate()}
                disabled={!escalateTo.trim() || escalateMutation.isPending}
                className="w-full px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                <ArrowUpRight className="h-4 w-4" />
                {escalateMutation.isPending ? "Escalating..." : "Escalate Report"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
