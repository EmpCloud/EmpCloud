import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  ShieldAlert, ArrowLeft, Clock, User, AlertTriangle,
  CheckCircle, ArrowUpRight, MessageSquare,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string }> = {
  submitted: { color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" },
  under_investigation: { color: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300" },
  escalated: { color: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300" },
  resolved: { color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" },
  dismissed: { color: "bg-muted text-muted-foreground" },
  closed: { color: "bg-muted text-muted-foreground" },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  medium: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  critical: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const STATUSES = ["submitted", "under_investigation", "escalated", "resolved", "dismissed", "closed"];

export default function ReportDetailPage() {
  const { t } = useTranslation();
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

  const statusCfg = STATUS_CONFIG[data.status] || { color: "bg-muted text-muted-foreground" };
  const statusLabel = t(`reportDetail.status.${data.status}`, { defaultValue: data.status });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/whistleblowing/reports" className="p-1 hover:bg-muted/50 rounded-md transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <ShieldAlert className="h-6 w-6 text-brand-600 dark:text-brand-400" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground font-mono tabular-nums">{data.case_number}</h1>
            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium ${statusCfg.color}`}>
              {statusLabel}
            </span>
            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium ${SEVERITY_BADGE[data.severity] || ""}`}>
              {t(`reportDetail.severity.${data.severity}`, { defaultValue: data.severity })}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Info */}
          <div className="bg-card rounded-lg shadow-sm border p-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">{data.subject}</h2>
            <div className="flex gap-4 mb-4 text-[13px]">
              <div>
                <span className="text-muted-foreground">{t("reportDetail.reportInfo.categoryLabel")}</span>{" "}
                <span className="font-medium capitalize">{data.category?.replace(/_/g, " ")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("reportDetail.reportInfo.anonymousLabel")}</span>{" "}
                <span className={`font-medium ${data.is_anonymous ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {data.is_anonymous ? t("reportDetail.reportInfo.anonymousYes") : t("reportDetail.reportInfo.anonymousNo")}
                </span>
              </div>
              {!data.is_anonymous && data.reporter_name && (
                <div>
                  <span className="text-muted-foreground">{t("reportDetail.reportInfo.reporterLabel")}</span>{" "}
                  <span className="font-medium">{data.reporter_name}</span>
                </div>
              )}
            </div>
            <div className="bg-muted rounded-md p-4 text-[13px] text-muted-foreground whitespace-pre-wrap">
              {data.description}
            </div>
            {data.evidence_paths && data.evidence_paths.length > 0 && (
              <div className="mt-4">
                <p className="text-[13px] font-medium text-muted-foreground mb-2">{t("reportDetail.reportInfo.evidenceFilesLabel")}</p>
                <div className="flex flex-wrap gap-2">
                  {data.evidence_paths.map((path: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-muted rounded-md text-[13px] text-muted-foreground">
                      {path.split("/").pop()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Investigation Timeline */}
          <div className="bg-card rounded-lg shadow-sm border p-4">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("reportDetail.timeline.heading")}</h3>
            {data.updates && data.updates.length > 0 ? (
              <div className="space-y-4">
                {data.updates.map((u: any) => (
                  <div key={u.id} className="flex gap-3 border-l-2 border-border pl-4 pb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                          {u.update_type.replace(/_/g, " ")}
                        </span>
                        {u.is_visible_to_reporter && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300">
                            {t("reportDetail.timeline.visibleToReporterBadge")}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-foreground">{u.content}</p>
                      <p className="text-[11px] tabular-nums text-muted-foreground mt-1">
                        {u.created_by_name || t("reportDetail.timeline.systemAuthor")} &middot; {new Date(u.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("reportDetail.timeline.empty")}</p>
            )}
          </div>

          {/* Add Update */}
          <div className="bg-card rounded-lg shadow-sm border p-4">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("reportDetail.addUpdate.heading")}</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <select
                  value={updateType}
                  onChange={(e) => setUpdateType(e.target.value)}
                  className="border border-border rounded-md px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="note">{t("reportDetail.addUpdate.typeNote")}</option>
                  <option value="response_to_reporter">{t("reportDetail.addUpdate.typeResponseToReporter")}</option>
                  <option value="status_change">{t("reportDetail.addUpdate.typeStatusChange")}</option>
                </select>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={visibleToReporter}
                    onChange={(e) => setVisibleToReporter(e.target.checked)}
                    className="rounded border-border"
                  />
                  {t("reportDetail.addUpdate.visibleToReporterCheckbox")}
                </label>
              </div>
              <textarea
                value={updateContent}
                onChange={(e) => setUpdateContent(e.target.value)}
                rows={3}
                placeholder={t("reportDetail.addUpdate.contentPlaceholder")}
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] bg-card text-foreground"
              />
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!updateContent.trim() || updateMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white rounded-md text-[13px] hover:bg-brand-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                {updateMutation.isPending ? t("reportDetail.addUpdate.submitSending") : t("reportDetail.addUpdate.submit")}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          {/* Info Card */}
          <div className="bg-card rounded-lg shadow-sm border p-5 space-y-3">
            <div className="flex items-center gap-2 text-[13px]">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("reportDetail.info.submittedLabel")}</span>
              <span className="text-foreground">{new Date(data.created_at).toLocaleDateString()}</span>
            </div>
            {data.investigator_name && (
              <div className="flex items-center gap-2 text-[13px]">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t("reportDetail.info.investigatorLabel")}</span>
                <span className="text-foreground">{data.investigator_name}</span>
              </div>
            )}
            {data.escalated_to && (
              <div className="flex items-center gap-2 text-[13px]">
                <ArrowUpRight className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">{t("reportDetail.info.escalatedToLabel")}</span>
                <span className="text-foreground">{data.escalated_to}</span>
              </div>
            )}
            {data.resolved_at && (
              <div className="flex items-center gap-2 text-[13px]">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">{t("reportDetail.info.resolvedLabel")}</span>
                <span className="text-foreground">{new Date(data.resolved_at).toLocaleDateString()}</span>
              </div>
            )}
            {data.resolution && (
              <div className="mt-2 p-3 bg-green-50 dark:bg-green-950/40 rounded-md text-[13px] text-green-800 dark:text-green-200">
                <p className="font-medium mb-1">{t("reportDetail.info.resolutionLabel")}</p>
                <p>{data.resolution}</p>
              </div>
            )}
          </div>

          {/* Assign Investigator */}
          <div className="bg-card rounded-lg shadow-sm border p-5">
            <h4 className="text-[13px] font-semibold text-muted-foreground mb-3">{t("reportDetail.assign.heading")}</h4>
            {usersError && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mb-2">{t("reportDetail.assign.loadUsersError")}</p>
            )}
            <div className="flex items-center gap-2">
              <select
                value={investigatorId}
                onChange={(e) => setInvestigatorId(e.target.value)}
                disabled={usersLoading || !!usersError}
                className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-[13px] disabled:opacity-50 bg-card text-foreground"
              >
                <option value="">
                  {usersLoading
                    ? t("reportDetail.assign.optionLoading")
                    : usersError
                    ? t("reportDetail.assign.optionError")
                    : t("reportDetail.assign.optionSelect")}
                </option>
                {(usersData || []).map((u: any) => (
                  <option key={u.id} value={String(u.id)}>
                    {t("reportDetail.assign.userOption", {
                      firstName: u.first_name,
                      lastName: u.last_name,
                      email: u.email,
                    })}
                  </option>
                ))}
              </select>
              <button
                onClick={() => assignMutation.mutate()}
                disabled={!investigatorId || assignMutation.isPending}
                className="shrink-0 px-3 py-2 bg-brand-600 text-white rounded-md text-[13px] hover:bg-brand-700 disabled:opacity-50 transition"
              >
                <User className="h-4 w-4" />
              </button>
            </div>
            {assignMutation.isError && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">
                {(assignMutation.error as any)?.response?.data?.error?.message || t("reportDetail.assign.error")}
              </p>
            )}
            {assignMutation.isSuccess && (
              <p className="text-[11px] text-green-600 dark:text-green-400 mt-2">{t("reportDetail.assign.success")}</p>
            )}
          </div>

          {/* Change Status */}
          <div className="bg-card rounded-lg shadow-sm border p-5">
            <h4 className="text-[13px] font-semibold text-muted-foreground mb-3">{t("reportDetail.changeStatus.heading")}</h4>
            <div className="space-y-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] bg-card text-foreground"
              >
                <option value="">{t("reportDetail.changeStatus.optionSelect")}</option>
                {STATUSES.filter((s) => s !== data.status).map((s) => (
                  <option key={s} value={s}>{t(`reportDetail.status.${s}`, { defaultValue: s.replace(/_/g, " ") })}</option>
                ))}
              </select>
              {(newStatus === "resolved" || newStatus === "dismissed" || newStatus === "closed") && (
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={2}
                  placeholder={t("reportDetail.changeStatus.resolutionPlaceholder")}
                  className="w-full border border-border rounded-md px-3 py-2 text-[13px] bg-card text-foreground"
                />
              )}
              <button
                onClick={() => statusMutation.mutate()}
                disabled={!newStatus || statusMutation.isPending}
                className="w-full px-3 py-2 bg-brand-600 text-white rounded-md text-[13px] hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {statusMutation.isPending ? t("reportDetail.changeStatus.submitUpdating") : t("reportDetail.changeStatus.submit")}
              </button>
            </div>
          </div>

          {/* Escalate */}
          <div className="bg-card rounded-lg shadow-sm border p-5">
            <h4 className="text-[13px] font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              {t("reportDetail.escalate.heading")}
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                value={escalateTo}
                onChange={(e) => setEscalateTo(e.target.value)}
                placeholder={t("reportDetail.escalate.placeholder")}
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] bg-card text-foreground"
              />
              <button
                onClick={() => escalateMutation.mutate()}
                disabled={!escalateTo.trim() || escalateMutation.isPending}
                className="w-full px-3 py-2 bg-orange-500 text-white rounded-md text-[13px] hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                <ArrowUpRight className="h-4 w-4" />
                {escalateMutation.isPending ? t("reportDetail.escalate.submitEscalating") : t("reportDetail.escalate.submit")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
