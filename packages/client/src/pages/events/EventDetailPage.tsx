import { useState } from "react";
import { useTranslation } from "react-i18next";
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

const EVENT_TYPE_CONFIG: Record<string, { labelKey: string; color: string }> = {
  meeting: { labelKey: "meeting", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" },
  training: { labelKey: "training", color: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300" },
  celebration: { labelKey: "celebration", color: "bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300" },
  team_building: { labelKey: "team_building", color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" },
  town_hall: { labelKey: "town_hall", color: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" },
  holiday: { labelKey: "holiday", color: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300" },
  workshop: { labelKey: "workshop", color: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" },
  social: { labelKey: "social", color: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300" },
  other: { labelKey: "other", color: "bg-muted text-muted-foreground" },
};

const STATUS_CONFIG: Record<string, { labelKey: string; color: string }> = {
  upcoming: { labelKey: "upcoming", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" },
  ongoing: { labelKey: "ongoing", color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" },
  completed: { labelKey: "completed", color: "bg-muted text-muted-foreground" },
  cancelled: { labelKey: "cancelled", color: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300" },
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
  const { t } = useTranslation();
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
      setDeleteError(err?.response?.data?.error?.message || t("eventDetail.delete.error")),
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
        {t("eventDetail.state.loading")}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
        {t("eventDetail.state.notFound")}
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
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("eventDetail.header.backToEvents")}
        </Link>
        {isHR && (
          <button
            onClick={() => {
              setShowDelete(true);
              setDeleteError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("eventDetail.header.delete")}
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeConfig.color}`}>
              {t(`eventDetail.type.${typeConfig.labelKey}`)}
            </span>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${statusConfig.color}`}>
              {t(`eventDetail.status.${statusConfig.labelKey}`)}
            </span>
            {event.is_mandatory && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <Star className="h-3 w-3" /> {t("eventDetail.badge.mandatory")}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>

          {event.description && (
            <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          )}
        </div>

        {/* Details */}
        <div className="p-6 border-b border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("eventDetail.details.dateLabel")}</p>
              <p className="text-sm font-medium text-foreground">
                {event.is_all_day
                  ? new Date(event.start_date).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }) + t("eventDetail.details.allDaySuffix")
                  : formatDateTime(event.start_date)}
              </p>
              {event.end_date && !event.is_all_day && (
                <p className="text-xs text-muted-foreground">
                  {t("eventDetail.details.dateRange", { date: formatDateTime(event.end_date) })}
                </p>
              )}
            </div>
          </div>

          {event.location && (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("eventDetail.details.locationLabel")}</p>
                <p className="text-sm font-medium text-foreground">{event.location}</p>
              </div>
            </div>
          )}

          {event.virtual_link && (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
                <Video className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("eventDetail.details.virtualLabel")}</p>
                <a
                  href={event.virtual_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {t("eventDetail.details.joinOnline")}
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("eventDetail.details.attendeesLabel")}</p>
              <p className="text-sm font-medium text-foreground">
                {t("eventDetail.details.attendingCount", { count: event.attending_count || 0 })}
                {event.maybe_count > 0 &&
                  t("eventDetail.details.maybeSuffix", { count: event.maybe_count })}
                {event.max_attendees
                  ? t("eventDetail.details.maxSuffix", { count: event.max_attendees })
                  : ""}
              </p>
            </div>
          </div>
        </div>

        {/* RSVP Section */}
        {event.status !== "cancelled" && event.status !== "completed" && (
          <div className="p-6 border-b border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              {t("eventDetail.rsvp.heading")}
              {myRsvp && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("eventDetail.rsvp.currently", { status: myRsvp.status })}
                </span>
              )}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => rsvpMutation.mutate("attending")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "attending"
                    ? "bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300"
                    : "border-border text-muted-foreground hover:bg-green-50 dark:hover:bg-green-950/40 hover:border-green-300 dark:hover:border-green-800 hover:text-green-700 dark:hover:text-green-300"
                }`}
              >
                <CheckCircle className="h-4 w-4" /> {t("eventDetail.rsvp.attending")}
              </button>
              <button
                onClick={() => rsvpMutation.mutate("maybe")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "maybe"
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                    : "border-border text-muted-foreground hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 dark:hover:border-amber-800 hover:text-amber-700 dark:hover:text-amber-300"
                }`}
              >
                <HelpCircle className="h-4 w-4" /> {t("eventDetail.rsvp.maybe")}
              </button>
              <button
                onClick={() => rsvpMutation.mutate("declined")}
                disabled={rsvpMutation.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  myRsvp?.status === "declined"
                    ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
                    : "border-border text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-300"
                }`}
              >
                <XCircle className="h-4 w-4" /> {t("eventDetail.rsvp.decline")}
              </button>
            </div>
          </div>
        )}

        {/* Attendee List */}
        {(attendingRsvps.length > 0 || maybeRsvps.length > 0) && (
          <div className="p-6">
            {attendingRsvps.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  {t("eventDetail.attendees.attendingHeading", { count: attendingRsvps.length })}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {attendingRsvps.map((r: any) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-full"
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
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  {t("eventDetail.attendees.maybeHeading", { count: maybeRsvps.length })}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {maybeRsvps.map((r: any) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full"
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
            className="w-full max-w-md rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{t("eventDetail.delete.title")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("eventDetail.delete.confirm", { name: event.title })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
              >
                {t("eventDetail.delete.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("eventDetail.delete.deleting")}
                  </>
                ) : (
                  t("eventDetail.delete.confirmButton")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
