import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Link } from "react-router-dom";
import {
  Calendar,
  Plus,
  Users,
  TrendingUp,
  MapPin,
  Video,
  Clock,
  CalendarDays,
  Trash2,
  Loader2,
} from "lucide-react";

const EVENT_TYPES = [
  "meeting",
  "training",
  "celebration",
  "team_building",
  "town_hall",
  "holiday",
  "workshop",
  "social",
  "other",
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: "Meeting",
  training: "Training",
  celebration: "Celebration",
  team_building: "Team Building",
  town_hall: "Town Hall",
  holiday: "Holiday",
  workshop: "Workshop",
  social: "Social",
  other: "Other",
};

export default function EventDashboardPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("other");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [virtualLink, setVirtualLink] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [targetIds, setTargetIds] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["events-dashboard"],
    queryFn: () => api.get("/events/dashboard").then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/events", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      resetForm();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (eventId: number) => api.post(`/events/${eventId}/cancel`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (eventId: number) => api.delete(`/events/${eventId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete event"),
  });

  function resetForm() {
    setTitle("");
    setDescription("");
    setEventType("other");
    setStartDate("");
    setEndDate("");
    setIsAllDay(false);
    setLocation("");
    setVirtualLink("");
    setTargetType("all");
    setTargetIds("");
    setMaxAttendees("");
    setIsMandatory(false);
    setShowForm(false);
  }

  const [dateError, setDateError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateError("");

    if (endDate && startDate && new Date(endDate) < new Date(startDate)) {
      setDateError("End date cannot be before start date.");
      return;
    }

    await createMutation.mutateAsync({
      title,
      description: description || null,
      event_type: eventType,
      start_date: startDate,
      end_date: endDate || null,
      is_all_day: isAllDay,
      location: location || null,
      virtual_link: virtualLink || null,
      target_type: targetType,
      target_ids: targetIds || null,
      max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      is_mandatory: isMandatory,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage company events and track attendance.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Create Event
        </button>
      </div>

      {/* Stats Cards */}
      {!isLoading && dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Upcoming Events</p>
                <p className="text-xl font-bold text-gray-900">{dashboard.upcoming_count}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">This Month</p>
                <p className="text-xl font-bold text-gray-900">{dashboard.month_count}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Total RSVPs</p>
                <p className="text-xl font-bold text-gray-900">{dashboard.total_attendees}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Event Types</p>
                <p className="text-xl font-bold text-gray-900">
                  {dashboard.type_breakdown?.length || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Type Breakdown */}
      {dashboard?.type_breakdown?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Event Type Breakdown</h2>
          <div className="flex flex-wrap gap-3">
            {dashboard.type_breakdown.map((t: any) => (
              <div
                key={t.event_type}
                className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg"
              >
                <span className="text-sm font-medium text-gray-700">
                  {EVENT_TYPE_LABELS[t.event_type] || t.event_type}
                </span>
                <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Event Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Event</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Event title"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px]"
                placeholder="Event description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="rounded border-gray-300"
                />
                All Day Event
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Mandatory
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setDateError(""); }}
                min={startDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Office, Room 101, etc."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Virtual Link</label>
              <div className="relative">
                <Video className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="url"
                  value={virtualLink}
                  onChange={(e) => setVirtualLink(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="https://meet.google.com/..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Employees</option>
                <option value="department">Department</option>
                <option value="role">Role</option>
              </select>
            </div>

            {targetType !== "all" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target IDs (JSON)</label>
                <input
                  type="text"
                  value={targetIds}
                  onChange={(e) => setTargetIds(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder='["1","2"]'
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Attendees</label>
              <div className="relative">
                <Users className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={maxAttendees}
                  onChange={(e) => setMaxAttendees(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Unlimited"
                  min="1"
                />
              </div>
            </div>
          </div>

          {dateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {dateError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Calendar className="h-4 w-4" /> Create Event
            </button>
          </div>
        </form>
      )}

      {/* Upcoming Events */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Upcoming Events</h2>
          <Link to="/events" className="text-xs text-brand-600 hover:underline">
            View All
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : !dashboard?.upcoming_events?.length ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No upcoming events. Create one above!
            </div>
          ) : (
            dashboard.upcoming_events.map((event: any) => (
              <div key={event.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/events/${event.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-brand-600"
                  >
                    {event.title}
                  </Link>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.start_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {event.attending_count || 0} attending
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <Link
                    to={`/events/${event.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    View
                  </Link>
                  {event.status !== "cancelled" && (
                    <button
                      onClick={() => cancelMutation.mutate(event.id)}
                      disabled={cancelMutation.isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDeleteTarget({ id: event.id, title: event.title });
                      setDeleteError(null);
                    }}
                    className="text-xs text-gray-400 hover:text-red-600"
                    title="Delete event"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
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
                    <span className="font-medium text-gray-700">{deleteTarget.title}</span>?
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
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
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
