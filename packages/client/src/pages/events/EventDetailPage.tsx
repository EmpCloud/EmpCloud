import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  Calendar,
  MapPin,
  Video,
  Users,
  ArrowLeft,
  CheckCircle,
  HelpCircle,
  XCircle,
  Star,
  User,
  Trash2,
  Loader2,
} from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  meeting: { label: "Meeting", color: "bg-blue-100 text-blue-700" },
  training: { label: "Training", color: "bg-purple-100 text-purple-700" },
  celebration: { label: "Celebration", color: "bg-pink-100 text-pink-700" },
  team_building: { label: "Team Building", color: "bg-green-100 text-green-700" },
  town_hall: { label: "Town Hall", color: "bg-amber-100 text-amber-700" },
  holiday: { label: "Holiday", color: "bg-red-100 text-red-700" },
  workshop: { label: "Workshop", color: "bg-indigo-100 text-indigo-700" },
  social: { label: "Social", color: "bg-teal-100 text-teal-700" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "bg-blue-100 text-blue-700" },
  ongoing: { label: "Ongoing", color: "bg-green-100 text-green-700" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EventDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isHR = user && HR_ROLES.includes(user.role);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get(`/events/${id}`).then((r) => r.data.data),
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: string) =>
      api.post(`/events/${id}/rsvp`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/events/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      navigate("/events");
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete event"),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        Loading event...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        Event not found.
      </div>
    );
  }

  const event = data;
  const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[event.status] || STATUS_CONFIG.upcoming;
  const myRsvp = event.rsvps?.find((r: any) => r.user_id === user?.id);
  const attendingRsvps = event.rsvps?.filter((r: any) => r.status === "attending") || [];
  const maybeRsvps = event.rsvps?.filter((r: any) => r.status === "maybe") || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Events
        </Link>
        {isHR && (
          <button
            onClick={() => {
              setShowDelete(true);
              setDeleteError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {event.is_mandatory && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-50 text-red-600">
                <Star className="h-3 w-3" /> Mandatory
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>

          {event.description && (
            <p className="mt-3 text-gray-600 leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          )}
        </div>

        {/* Details */}
        <div className="p-6 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Date</p>
              <p className="text-sm font-medium text-gray-900">
                {event.is_all_day
                  ? new Date(event.start_date).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }) + " (All Day)"
                  : formatDateTime(event.start_date)}
              </p>
              {event.end_date && !event.is_all_day && (
                <p className="text-xs text-gray-500">
                  to {formatDateTime(event.end_date)}
                </p>
              )}
            </div>
          </div>

          {event.location && (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Location</p>
                <p className="text-sm font-medium text-gray-900">{event.location}</p>
              </div>
            </div>
          )}

          {event.virtual_link && (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Video className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Virtual Meeting</p>
                <a
                  href={event.virtual_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Join Online
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Attendees</p>
              <p className="text-sm font-medium text-gray-900">
                {event.attending_count || 0} attending
                {event.maybe_count > 0 && `, ${event.maybe_count} maybe`}
                {event.max_attendees ? ` / ${event.max_attendees} max` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* RSVP Section */}
        {event.status !== "cancelled" && event.status !== "completed" && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Your RSVP
              {myRsvp && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  (Currently: {myRsvp.status})
                </span>
              )}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => rsvpMutation.mutate("attending")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "attending"
                    ? "bg-green-50 border-green-300 text-green-700"
                    : "border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700"
                }`}
              >
                <CheckCircle className="h-4 w-4" /> Attending
              </button>
              <button
                onClick={() => rsvpMutation.mutate("maybe")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "maybe"
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                }`}
              >
                <HelpCircle className="h-4 w-4" /> Maybe
              </button>
              <button
                onClick={() => rsvpMutation.mutate("declined")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "declined"
                    ? "bg-red-50 border-red-300 text-red-700"
                    : "border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                }`}
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {/* Attendee List */}
        {(attendingRsvps.length > 0 || maybeRsvps.length > 0) && (
          <div className="p-6">
            {attendingRsvps.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Attending ({attendingRsvps.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {attendingRsvps.map((r: any) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full"
                    >
                      <User className="h-3 w-3" />
                      {r.first_name} {r.last_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {maybeRsvps.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Maybe ({maybeRsvps.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {maybeRsvps.map((r: any) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full"
                    >
                      <User className="h-3 w-3" />
                      {r.first_name} {r.last_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setShowDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete event?</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Delete{" "}
                    <span className="font-medium text-gray-700">{event.title}</span>?
                    This permanently removes the event and its RSVPs. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
