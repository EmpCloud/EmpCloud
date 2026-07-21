import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";
import {
  ArrowLeft,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Star,
  UserPlus,
  Lock,
  AlertTriangle,
} from "lucide-react";

// Ticket descriptions are now rich-text (HTML, sanitized server-side). New tickets
// store HTML; older ones are plain text — keep whitespace-pre-wrap only for the latter.
const isHtmlContent = (s?: string | null): boolean => !!s && /<[a-z][\s\S]*>/i.test(s);

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  urgent: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  in_progress: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  awaiting_response: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
  reopened: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

export default function TicketDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["helpdesk-ticket", id],
    queryFn: () => api.get(`/helpdesk/tickets/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  // Fetch HR users for assignment dropdown
  const { data: usersData } = useQuery({
    queryKey: ["users-for-assign"],
    queryFn: () => api.get("/users", { params: { per_page: 100 } }).then((r) => r.data.data),
    enabled: !!isHR,
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: object) =>
      api.post(`/helpdesk/tickets/${id}/comment`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
      setComment("");
      setIsInternal(false);
    },
  });

  const assignMutation = useMutation({
    mutationFn: (assignedTo: number) =>
      api.post(`/helpdesk/tickets/${id}/assign`, { assigned_to: assignedTo }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
      setShowAssignForm(false);
      setAssignUserId("");
    },
  });

  // #1452 — Surface mutation errors via toast so buttons don't appear to do
  // nothing when the server rejects the transition. Also invalidate the list /
  // dashboard queries so the ticket's new status is reflected on other pages.
  const invalidateTicketQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    queryClient.invalidateQueries({ queryKey: ["helpdesk-tickets"] });
    queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    queryClient.invalidateQueries({ queryKey: ["helpdesk-dashboard"] });
  };

  const extractErrorMessage = (err: any, fallback: string): string =>
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    fallback;

  const resolveMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/resolve`).then((r) => r.data),
    onSuccess: () => {
      invalidateTicketQueries();
      showToast("success", t("ticketDetail.toast.resolveSuccess"));
    },
    onError: (err: any) => {
      showToast("error", extractErrorMessage(err, t("ticketDetail.toast.resolveError")));
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/close`).then((r) => r.data),
    onSuccess: () => {
      invalidateTicketQueries();
      showToast("success", t("ticketDetail.toast.closeSuccess"));
    },
    onError: (err: any) => {
      showToast("error", extractErrorMessage(err, t("ticketDetail.toast.closeError")));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/reopen`).then((r) => r.data),
    onSuccess: () => {
      invalidateTicketQueries();
      showToast("success", t("ticketDetail.toast.reopenSuccess"));
    },
    onError: (err: any) => {
      showToast("error", extractErrorMessage(err, t("ticketDetail.toast.reopenError")));
    },
  });

  const rateMutation = useMutation({
    mutationFn: (data: { rating: number; comment?: string }) =>
      api.post(`/helpdesk/tickets/${id}/rate`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
      setShowRatingForm(false);
    },
  });

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutate({ comment, is_internal: isInternal });
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId) return;
    assignMutation.mutate(parseInt(assignUserId, 10));
  };

  const handleRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;
    rateMutation.mutate({ rating, comment: ratingComment || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("ticketDetail.loading")}</div>
      </div>
    );
  }

  if (!ticket) return null;

  const isOwner = user?.id === ticket.raised_by;
  const canReply = isOwner || isHR;
  const isResolvable = isHR && !["resolved", "closed"].includes(ticket.status);
  // #1452 — The server only allows closing tickets that are already resolved
  // (see helpdesk.service closeTicket). Gate the button on that to prevent
  // silent failures when users click Close on an open ticket.
  const isClosable = (isOwner || isHR) && ticket.status === "resolved";
  const isReopenable = isOwner && ["resolved", "closed"].includes(ticket.status);
  const canRate =
    isOwner &&
    ["resolved", "closed"].includes(ticket.status) &&
    !ticket.satisfaction_rating;

  // SLA status
  const now = new Date();
  const resDue = new Date(ticket.sla_resolution_due);
  const respDue = new Date(ticket.sla_response_due);
  const isOverdue = !["resolved", "closed"].includes(ticket.status) && now > resDue;

  return (
    <div>
      <Link
        to={isHR ? "/helpdesk/tickets" : "/helpdesk/my-tickets"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> {t("ticketDetail.backToTickets")}
      </Link>

      {/* Ticket Header */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm text-muted-foreground font-mono">#{ticket.id}</span>
              <span
                className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border capitalize ${
                  PRIORITY_COLORS[ticket.priority] || ""
                }`}
              >
                {t(`ticketDetail.priority.${ticket.priority}`, {
                  defaultValue: ticket.priority,
                })}
              </span>
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded ${
                  STATUS_COLORS[ticket.status] || ""
                }`}
              >
                {t(`ticketDetail.status.${ticket.status}`, {
                  defaultValue: ticket.status.replace(/_/g, " "),
                })}
              </span>
              <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                {t(`ticketDetail.category.${ticket.category}`, {
                  defaultValue: ticket.category,
                })}
              </span>
              {isOverdue && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {t("ticketDetail.slaBreached")}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{ticket.subject}</h1>
            <div
              className={`rich-text text-sm text-muted-foreground mt-2 dark:[&]:text-slate-300 dark:[&_h1]:text-slate-100 dark:[&_h2]:text-slate-100 ${isHtmlContent(ticket.description) ? "" : "whitespace-pre-wrap"}`}
              dangerouslySetInnerHTML={{ __html: ticket.description || "" }}
            />
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span>{t("ticketDetail.raisedBy", { name: ticket.raised_by_name })}</span>
              <span>
                {t("ticketDetail.created", {
                  date: new Date(ticket.created_at).toLocaleString(),
                })}
              </span>
              {ticket.assigned_to_name && (
                <span>{t("ticketDetail.assignedTo", { name: ticket.assigned_to_name })}</span>
              )}
            </div>
          </div>

          {/* SLA info */}
          <div className="shrink-0 bg-muted rounded-md p-4 min-w-[200px]">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {t("ticketDetail.slaDeadlines")}
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">{t("ticketDetail.firstResponse")}</span>
                <p className={`font-medium ${ticket.first_response_at ? "text-green-600 dark:text-green-400" : now > respDue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  {ticket.first_response_at
                    ? t("ticketDetail.responded", {
                        date: new Date(ticket.first_response_at).toLocaleString(),
                      })
                    : t("ticketDetail.due", {
                        date: new Date(ticket.sla_response_due).toLocaleString(),
                      })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("ticketDetail.resolution")}</span>
                <p className={`font-medium ${ticket.resolved_at ? "text-green-600 dark:text-green-400" : isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  {ticket.resolved_at
                    ? t("ticketDetail.resolved", {
                        date: new Date(ticket.resolved_at).toLocaleString(),
                      })
                    : t("ticketDetail.due", {
                        date: new Date(ticket.sla_resolution_due).toLocaleString(),
                      })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          {isHR && (
            <button
              onClick={() => setShowAssignForm(!showAssignForm)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted"
            >
              <UserPlus className="h-3.5 w-3.5" /> {t("ticketDetail.action.assign")}
            </button>
          )}
          {isResolvable && (
            <button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("ticketDetail.action.resolve")}
            </button>
          )}
          {isClosable && (
            <button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> {t("ticketDetail.action.close")}
            </button>
          )}
          {isReopenable && (
            <button
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("ticketDetail.action.reopen")}
            </button>
          )}
          {canRate && (
            <button
              onClick={() => setShowRatingForm(!showRatingForm)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-yellow-200 dark:border-yellow-900 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-950/40"
            >
              <Star className="h-3.5 w-3.5" /> {t("ticketDetail.action.rateService")}
            </button>
          )}
        </div>

        {/* Assign Form */}
        {showAssignForm && isHR && (
          <form onSubmit={handleAssign} className="mt-3 flex items-center gap-2 p-3 bg-muted rounded-md">
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="bg-card text-foreground flex-1 px-3 py-2 border border-border rounded-md text-[13px]"
            >
              <option value="">{t("ticketDetail.assign.selectUser")}</option>
              {(usersData || [])
                .filter((u: any) => HR_ROLES.includes(u.role))
                .map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.role})
                  </option>
                ))}
            </select>
            <button
              type="submit"
              disabled={!assignUserId || assignMutation.isPending}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {t("ticketDetail.action.assign")}
            </button>
          </form>
        )}

        {/* Rating Form */}
        {showRatingForm && canRate && (
          <form onSubmit={handleRate} className="mt-3 p-4 bg-yellow-50 dark:bg-yellow-950/40 rounded-lg border border-yellow-100 dark:border-yellow-900">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              {t("ticketDetail.rating.prompt")}
            </p>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-0.5"
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      star <= rating
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground/50 hover:text-yellow-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder={t("ticketDetail.rating.feedbackPlaceholder")}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] min-h-[60px] mb-3"
            />
            <button
              type="submit"
              disabled={rating < 1 || rateMutation.isPending}
              className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50"
            >
              {t("ticketDetail.rating.submit")}
            </button>
          </form>
        )}

        {/* Existing satisfaction rating */}
        {ticket.satisfaction_rating && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-100 dark:border-green-900">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{t("ticketDetail.satisfaction")}</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= ticket.satisfaction_rating
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground/50"
                    }`}
                  />
                ))}
              </div>
              {ticket.satisfaction_comment && (
                <span className="text-xs text-muted-foreground ml-2">
                  "{ticket.satisfaction_comment}"
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Conversation Thread */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">{t("ticketDetail.conversation")}</h3>

        {ticket.comments && ticket.comments.length > 0 ? (
          <div className="space-y-4">
            {ticket.comments.map((c: any) => {
              const isSelf = c.user_id === user?.id;
              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-md ${
                    c.is_internal
                      ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900"
                      : isSelf
                      ? "bg-brand-50 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900"
                      : "bg-muted border border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {c.first_name?.[0]}
                      {c.last_name?.[0]}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {c.first_name} {c.last_name}
                    </span>
                    {c.is_internal && (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                        <Lock className="h-3 w-3" /> {t("ticketDetail.internalNote")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {c.comment}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("ticketDetail.noComments")}
          </p>
        )}
      </div>

      {/* Reply Input */}
      {canReply && ticket.status !== "closed" && (
        <div className="bg-card rounded-lg border border-border p-4">
          <form onSubmit={handleComment}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("ticketDetail.replyPlaceholder")}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] min-h-[80px] mb-3"
              required
            />
            <div className="flex items-center justify-between">
              <div>
                {isHR && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    {t("ticketDetail.internalNoteToggle")}
                  </label>
                )}
              </div>
              <button
                type="submit"
                disabled={addCommentMutation.isPending || !comment.trim()}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {addCommentMutation.isPending ? t("ticketDetail.sending") : t("ticketDetail.sendReply")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
