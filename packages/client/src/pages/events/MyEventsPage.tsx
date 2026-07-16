import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Video,
  Users,
  Clock,
  CheckCircle,
  HelpCircle,
  Star,
} from "lucide-react";

// Event type → colour. The label text comes from i18n
// (events.list.type.*), reused from the events list.
const EVENT_TYPE_COLOR: Record<string, string> = {
  meeting: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  training: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  celebration: "bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300",
  team_building: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  town_hall: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  holiday: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  workshop: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  social: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300",
  other: "bg-muted text-muted-foreground",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyEventsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api.get("/events/my").then((r) => r.data.data),
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) =>
      api.post(`/events/${eventId}/rsvp`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
    },
  });

  const events = data || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t("events.my.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("events.my.subtitle")}</p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
            {t("events.my.loading")}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-2">{t("events.my.empty")}</p>
            <Link
              to="/events"
              className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              {t("events.my.browse")}
            </Link>
          </div>
        ) : (
          events.map((event: any) => {
            const typeColor = EVENT_TYPE_COLOR[event.event_type] || EVENT_TYPE_COLOR.other;

            return (
              <div
                key={event.id}
                className="bg-card rounded-xl border border-border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeColor}`}>
                        {t(`events.list.type.${event.event_type}`, { defaultValue: event.event_type })}
                      </span>
                      {event.rsvp_status === "attending" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" /> {t("events.list.titleAttending")}
                        </span>
                      )}
                      {event.rsvp_status === "maybe" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                          <HelpCircle className="h-3 w-3" /> {t("events.list.titleMaybe")}
                        </span>
                      )}
                      {event.is_mandatory && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                          <Star className="h-3 w-3" /> {t("events.list.mandatory")}
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/events/${event.id}`}
                      className="text-base font-semibold text-foreground hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {event.title}
                    </Link>

                    {event.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {event.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(event.start_date)}
                      </span>
                      {!event.is_all_day && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(event.start_date)}
                          {event.end_date && ` - ${formatTime(event.end_date)}`}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {event.location}
                        </span>
                      )}
                      {event.virtual_link && (
                        <a
                          href={event.virtual_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" />
                          {t("events.list.joinOnline")}
                        </a>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {t("events.list.attending", { count: event.attending_count || 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Change RSVP */}
                  {event.status !== "cancelled" && event.status !== "completed" && (
                    <button
                      onClick={() =>
                        rsvpMutation.mutate({
                          eventId: event.id,
                          status: "declined",
                        })
                      }
                      disabled={rsvpMutation.isPending}
                      className="flex-shrink-0 text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-200 dark:border-red-900 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                    >
                      {t("events.my.cancelRsvp")}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
