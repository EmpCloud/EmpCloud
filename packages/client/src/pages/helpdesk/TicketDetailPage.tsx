import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
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

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  awaiting_response: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  reopened: "bg-red-100 text-red-700",
};

export default function TicketDetailPage() {
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

  const resolveMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/resolve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] }),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/close`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] }),
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/helpdesk/tickets/${id}/reopen`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket", id] }),
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
        <div className="text-gray-400">Loading ticket...</div>
      </div>
    );
  }

  if (!ticket) return null;

  const isOwner = user?.id === ticket.raised_by;
  const canReply = isOwner || isHR;
  const isResolvable = isHR && !["resolved", "closed"].includes(ticket.status);
  const isClosable = (isOwner || isHR) && ticket.status !== "closed";
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
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to tickets
      </Link>

      {/* Ticket Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm text-gray-400 font-mono">#{ticket.id}</span>
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${
                  PRIORITY_COLORS[ticket.priority] || ""
                }`}
              >
                {ticket.priority}
              </span>
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded ${
                  STATUS_COLORS[ticket.status] || ""
                }`}
              >
                {ticket.status.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-0.5 rounded">
                {ticket.category}
              </span>
              {isOverdue && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> SLA Breached
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
              {ticket.description}
            </p>
            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
              <span>Raised by: <strong>{ticket.raised_by_name}</strong></span>
              <span>
                Created:{" "}
                {new Date(ticket.created_at).toLocaleString()}
              </span>
              {ticket.assigned_to_name && (
                <span>Assigned to: <strong>{ticket.assigned_to_name}</strong></span>
              )}
            </div>
          </div>

          {/* SLA info */}
          <div className="shrink-0 bg-gray-50 rounded-lg p-4 min-w-[200px]">
            <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> SLA Deadlines
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-gray-500">First Response:</span>
                <p className={`font-medium ${ticket.first_response_at ? "text-green-600" : now > respDue ? "text-red-600" : "text-gray-700"}`}>
                  {ticket.first_response_at
                    ? `Responded ${new Date(ticket.first_response_at).toLocaleString()}`
                    : `Due ${new Date(ticket.sla_response_due).toLocaleString()}`}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Resolution:</span>
                <p className={`font-medium ${ticket.resolved_at ? "text-green-600" : isOverdue ? "text-red-600" : "text-gray-700"}`}>
                  {ticket.resolved_at
                    ? `Resolved ${new Date(ticket.resolved_at).toLocaleString()}`
                    : `Due ${new Date(ticket.sla_resolution_due).toLocaleString()}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          {isHR && (
            <button
              onClick={() => setShowAssignForm(!showAssignForm)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <UserPlus className="h-3.5 w-3.5" /> Assign
            </button>
          )}
          {isResolvable && (
            <button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </button>
          )}
          {isClosable && (
            <button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Close
            </button>
          )}
          {isReopenable && (
            <button
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </button>
          )}
          {canRate && (
            <button
              onClick={() => setShowRatingForm(!showRatingForm)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-yellow-200 text-yellow-700 hover:bg-yellow-50"
            >
              <Star className="h-3.5 w-3.5" /> Rate Service
            </button>
          )}
        </div>

        {/* Assign Form */}
        {showAssignForm && isHR && (
          <form onSubmit={handleAssign} className="mt-3 flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select a user to assign...</option>
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
              Assign
            </button>
          </form>
        )}

        {/* Rating Form */}
        {showRatingForm && canRate && (
          <form onSubmit={handleRate} className="mt-3 p-4 bg-yellow-50 rounded-lg border border-yellow-100">
            <p className="text-sm font-medium text-gray-700 mb-2">
              How satisfied are you with the resolution?
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
                        : "text-gray-300 hover:text-yellow-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Additional feedback (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[60px] mb-3"
            />
            <button
              type="submit"
              disabled={rating < 1 || rateMutation.isPending}
              className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50"
            >
              Submit Rating
            </button>
          </form>
        )}

        {/* Existing satisfaction rating */}
        {ticket.satisfaction_rating && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Satisfaction:</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= ticket.satisfaction_rating
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              {ticket.satisfaction_comment && (
                <span className="text-xs text-gray-500 ml-2">
                  "{ticket.satisfaction_comment}"
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Conversation Thread */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Conversation</h3>

        {ticket.comments && ticket.comments.length > 0 ? (
          <div className="space-y-4">
            {ticket.comments.map((c: any) => {
              const isSelf = c.user_id === user?.id;
              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-lg ${
                    c.is_internal
                      ? "bg-amber-50 border border-amber-200"
                      : isSelf
                      ? "bg-brand-50 border border-brand-100"
                      : "bg-gray-50 border border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                      {c.first_name?.[0]}
                      {c.last_name?.[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {c.first_name} {c.last_name}
                    </span>
                    {c.is_internal && (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        <Lock className="h-3 w-3" /> Internal Note
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {c.comment}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            No comments yet. Start the conversation below.
          </p>
        )}
      </div>

      {/* Reply Input */}
      {canReply && ticket.status !== "closed" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleComment}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a reply..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px] mb-3"
              required
            />
            <div className="flex items-center justify-between">
              <div>
                {isHR && (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                    Internal note (not visible to employee)
                  </label>
                )}
              </div>
              <button
                type="submit"
                disabled={addCommentMutation.isPending || !comment.trim()}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {addCommentMutation.isPending ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
