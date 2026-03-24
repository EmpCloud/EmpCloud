import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
        <h1 className="text-2xl font-bold text-gray-900">My Events</h1>
        <p className="text-gray-500 mt-1">Events you have RSVPd to attend.</p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading your events...
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-2">You haven't RSVPd to any events yet.</p>
            <Link
              to="/events"
              className="text-sm text-brand-600 hover:underline"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          events.map((event: any) => {
            const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;

            return (
              <div
                key={event.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      {event.rsvp_status === "attending" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-50 text-green-600">
                          <CheckCircle className="h-3 w-3" /> Attending
                        </span>
                      )}
                      {event.rsvp_status === "maybe" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                          <HelpCircle className="h-3 w-3" /> Maybe
                        </span>
                      )}
                      {event.is_mandatory && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-50 text-red-600">
                          <Star className="h-3 w-3" /> Mandatory
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/events/${event.id}`}
                      className="text-base font-semibold text-gray-900 hover:text-brand-600"
                    >
                      {event.title}
                    </Link>

                    {event.description && (
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                        {event.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-4 flex-wrap text-xs text-gray-500">
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
                          className="flex items-center gap-1 text-brand-600 hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join Online
                        </a>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {event.attending_count || 0} attending
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
                      className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel RSVP
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
