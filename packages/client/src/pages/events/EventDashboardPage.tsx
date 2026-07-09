import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
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
  Pencil,
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
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  // When set, the form is editing an existing event (PUT) rather than creating one (POST).
  const [editingId, setEditingId] = useState<number | null>(null);
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
      showToast("success", t("eventDashboard.toast.created"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/events/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      resetForm();
      showToast("success", t("eventDashboard.toast.updated"));
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
      setDeleteError(err?.response?.data?.error?.message || t("eventDashboard.deleteModal.error")),
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
    setDateError("");
    setEditingId(null);
    setShowForm(false);
  }

  // `<input type="datetime-local">` expects "YYYY-MM-DDTHH:mm" in LOCAL time. The
  // API returns an ISO/UTC timestamp, so convert to a local wall-clock string
  // (subtracting the tz offset) before binding, else the value shows blank.
  function toLocalInput(value?: string | null): string {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  const startEdit = (event: any) => {
    setEditingId(event.id);
    setTitle(event.title || "");
    setDescription(event.description || "");
    setEventType(event.event_type || "other");
    setStartDate(toLocalInput(event.start_date));
    setEndDate(toLocalInput(event.end_date));
    setIsAllDay(!!event.is_all_day);
    setLocation(event.location || "");
    setVirtualLink(event.virtual_link || "");
    setTargetType(event.target_type || "all");
    setTargetIds(
      event.target_ids == null
        ? ""
        : typeof event.target_ids === "string"
          ? event.target_ids
          : JSON.stringify(event.target_ids),
    );
    setMaxAttendees(event.max_attendees != null ? String(event.max_attendees) : "");
    setIsMandatory(!!event.is_mandatory);
    setDateError("");
    setShowForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [dateError, setDateError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateError("");

    if (endDate && startDate && new Date(endDate) < new Date(startDate)) {
      setDateError(t("eventDashboard.form.errors.endBeforeStart"));
      return;
    }

    const payload = {
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
    };

    const isEditing = editingId != null;
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (err: any) {
      // Keep the form open with the user's input intact so they can retry.
      showToast(
        "error",
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isEditing ? t("eventDashboard.toast.updateFailed") : t("eventDashboard.toast.createFailed")),
      );
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("eventDashboard.header.title")}</h1>
          <p className="text-gray-500 mt-1">{t("eventDashboard.header.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            // Toggling the header button always starts a fresh CREATE, even if
            // the form was previously opened in edit mode.
            if (showForm) {
              resetForm();
            } else {
              setEditingId(null);
              setShowForm(true);
            }
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("eventDashboard.header.createEvent")}
        </button>
      </div>

      {/* Stats Cards */}
      {!isLoading && dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {([
            { label: t("eventDashboard.stats.upcomingEvents"), value: dashboard.upcoming_count, icon: Calendar, iconBg: "bg-blue-50", iconColor: "text-blue-600", href: "/events" },
            { label: t("eventDashboard.stats.thisMonth"), value: dashboard.month_count, icon: CalendarDays, iconBg: "bg-green-50", iconColor: "text-green-600", href: "/events" },
            { label: t("eventDashboard.stats.totalRsvps"), value: dashboard.total_attendees, icon: Users, iconBg: "bg-purple-50", iconColor: "text-purple-600", href: "/events/my" },
            { label: t("eventDashboard.stats.eventTypes"), value: dashboard.type_breakdown?.length || 0, icon: TrendingUp, iconBg: "bg-amber-50", iconColor: "text-amber-600", anchorId: "type-breakdown" },
          ] as const).map((card) => {
            const Icon = card.icon;
            const content = (
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{card.label}</p>
                  <p className="text-xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            );
            const sharedClass =
              "block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
            if ("href" in card) {
              return (
                <Link key={card.label} to={card.href} className={sharedClass}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => {
                  document.getElementById(card.anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={sharedClass}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {/* Type Breakdown */}
      {dashboard?.type_breakdown?.length > 0 && (
        <div id="type-breakdown" className="bg-white rounded-xl border border-gray-200 p-6 mb-6 scroll-mt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("eventDashboard.typeBreakdown.title")}</h2>
          <div className="flex flex-wrap gap-3">
            {dashboard.type_breakdown.map((tb: any) => (
              <div
                key={tb.event_type}
                className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg"
              >
                <span className="text-sm font-medium text-gray-700">
                  {t(`eventDashboard.eventType.${tb.event_type}`, {
                    defaultValue: EVENT_TYPE_LABELS[tb.event_type] || tb.event_type,
                  })}
                </span>
                <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                  {tb.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Event Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId != null ? t("eventDashboard.form.editTitle") : t("eventDashboard.form.title")}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.title")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={t("eventDashboard.form.placeholders.title")}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px]"
                placeholder={t("eventDashboard.form.placeholders.description")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.eventType")}</label>
              <select
                value={eventType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setEventType(nextType);
                  if (nextType === "holiday") setVirtualLink("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`eventDashboard.eventType.${type}`, { defaultValue: EVENT_TYPE_LABELS[type] })}
                  </option>
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
                {t("eventDashboard.form.fields.allDay")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t("eventDashboard.form.fields.mandatory")}
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.startDate")}</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.endDate")}</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setDateError(""); }}
                min={startDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.location")}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder={t("eventDashboard.form.placeholders.location")}
                />
              </div>
            </div>

            {eventType !== "holiday" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.virtualLink")}</label>
                <div className="relative">
                  <Video className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="url"
                    value={virtualLink}
                    onChange={(e) => setVirtualLink(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder={t("eventDashboard.form.placeholders.virtualLink")}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.targetAudience")}</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">{t("eventDashboard.form.targetType.all")}</option>
                <option value="department">{t("eventDashboard.form.targetType.department")}</option>
                <option value="role">{t("eventDashboard.form.targetType.role")}</option>
              </select>
            </div>

            {targetType !== "all" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.targetIds")}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("eventDashboard.form.fields.maxAttendees")}</label>
              <div className="relative">
                <Users className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={maxAttendees}
                  onChange={(e) => setMaxAttendees(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder={t("eventDashboard.form.placeholders.maxAttendees")}
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
              {t("eventDashboard.form.cancel")}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Calendar className="h-4 w-4" />{" "}
              {editingId != null ? t("eventDashboard.form.updateSubmit") : t("eventDashboard.form.submit")}
            </button>
          </div>
        </form>
      )}

      {/* Upcoming Events */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{t("eventDashboard.upcoming.title")}</h2>
          <Link to="/events" className="text-xs text-brand-600 hover:underline">
            {t("eventDashboard.upcoming.viewAll")}
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">{t("eventDashboard.upcoming.loading")}</div>
          ) : !dashboard?.upcoming_events?.length ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              {t("eventDashboard.upcoming.empty")}
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
                      {t("eventDashboard.upcoming.attending", { count: event.attending_count || 0 })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <Link
                    to={`/events/${event.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {t("eventDashboard.upcoming.view")}
                  </Link>
                  {event.status !== "cancelled" && (
                    <button
                      onClick={() => startEdit(event)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600"
                      title={t("eventDashboard.upcoming.editTitle")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("eventDashboard.upcoming.edit")}
                    </button>
                  )}
                  {event.status !== "cancelled" && (
                    <button
                      onClick={() => cancelMutation.mutate(event.id)}
                      disabled={cancelMutation.isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      {t("eventDashboard.upcoming.cancel")}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDeleteTarget({ id: event.id, title: event.title });
                      setDeleteError(null);
                    }}
                    className="text-xs text-gray-400 hover:text-red-600"
                    title={t("eventDashboard.upcoming.deleteTitle")}
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
                  <h3 className="text-lg font-semibold text-gray-900">{t("eventDashboard.deleteModal.title")}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t("eventDashboard.deleteModal.body", { name: deleteTarget.title })}
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
                {t("eventDashboard.deleteModal.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("eventDashboard.deleteModal.deleting")}
                  </>
                ) : (
                  t("eventDashboard.deleteModal.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
