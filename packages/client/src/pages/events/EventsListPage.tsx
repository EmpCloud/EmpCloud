import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Video,
  Users,
  Clock,
  Plus,
  CheckCircle,
  HelpCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "bg-blue-100 text-blue-700" },
  ongoing: { label: "Ongoing", color: "bg-green-100 text-green-700" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

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

export default function EventsListPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["events", page, typeFilter, statusFilter],
    queryFn: () =>
      api
        .get("/events", {
          params: {
            page,
            per_page: 20,
            ...(typeFilter ? { event_type: typeFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
          },
        })
        .then((r) => r.data),
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) =>
      api.post(`/events/${eventId}/rsvp`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const events = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Events</h1>
          <p className="text-gray-500 mt-1">Browse and RSVP to company events.</p>
        </div>
        {isHR && (
          <Link
            to="/events/dashboard"
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Manage Events
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Types</option>
            {Object.entries(EVENT_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Event Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No events found.
          </div>
        ) : (
          events.map((event: any) => {
            const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
            const statusConfig = STATUS_CONFIG[event.status] || STATUS_CONFIG.upcoming;

            return (
              <div
                key={event.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
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

                    {/* Title */}
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

                    {/* Meta */}
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
                      {event.is_all_day && (
                        <span className="text-xs text-gray-400">All Day</span>
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
                        {event.max_attendees ? ` / ${event.max_attendees} max` : ""}
                      </span>
                    </div>
                  </div>

                  {/* RSVP Buttons */}
                  {event.status !== "cancelled" && event.status !== "completed" && (
                    <div className="flex-shrink-0 flex gap-1.5">
                      <button
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "attending" })}
                        disabled={rsvpMutation.isPending}
                        className="flex items-center gap-1 text-xs font-medium border border-green-200 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50"
                        title="Attending"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Yes
                      </button>
                      <button
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "maybe" })}
                        disabled={rsvpMutation.isPending}
                        className="flex items-center gap-1 text-xs font-medium border border-amber-200 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                        title="Maybe"
                      >
                        <HelpCircle className="h-3.5 w-3.5" /> Maybe
                      </button>
                      <button
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "declined" })}
                        disabled={rsvpMutation.isPending}
                        className="flex items-center gap-1 text-xs font-medium border border-red-200 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        title="Decline"
                      >
                        <XCircle className="h-3.5 w-3.5" /> No
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
