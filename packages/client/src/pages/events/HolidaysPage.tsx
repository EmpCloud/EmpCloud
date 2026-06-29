import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { PartyPopper, Plus, Trash2, CalendarDays } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

interface Holiday {
  id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_all_day: boolean;
  is_mandatory: boolean | number;
  status: string;
}

// Holidays were created with their type stuffed into the description as
// "[type:regional]" / "[type:optional]" because there's no dedicated
// holiday_type column on the events table. Parse the tag out so the list
// can render a clean badge instead of leaking the raw bracket notation
// to the user (#1637). Returns the cleaned description (tag removed) and
// the formatted type label.
type TFn = (key: string, opts?: Record<string, unknown>) => string;
const TYPE_BADGE: Record<string, string> = {
  regional: "bg-blue-100 text-blue-700",
  optional: "bg-amber-100 text-amber-700",
  public: "bg-green-100 text-green-700",
  national: "bg-rose-100 text-rose-700",
  religious: "bg-purple-100 text-purple-700",
};

function parseHolidayType(description: string | null, t: TFn): {
  type: string | null;
  label: string | null;
  description: string;
} {
  if (!description) return { type: null, label: null, description: "" };
  const match = description.match(/\[type:([a-z_]+)\]/i);
  if (!match) return { type: null, label: null, description };
  const raw = match[1].toLowerCase();
  const cleaned = description.replace(match[0], "").trim();
  return {
    type: raw,
    label: t(`holidays.type.${raw}`, {
      defaultValue: raw.charAt(0).toUpperCase() + raw.slice(1),
    }),
    description: cleaned,
  };
}

export default function HolidaysPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = user ? HR_ROLES.includes(user.role) : false;
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    is_mandatory: false,
  });
  const [addError, setAddError] = useState("");
  // ID of the row currently saving its mandatory toggle, to disable repeat
  // clicks and show a subtle spinner. Indexed by event id so toggling row A
  // doesn't grey out row B.
  const [savingMandatoryId, setSavingMandatoryId] = useState<number | null>(null);
  // Confirm-delete dialog state (replaces window.confirm). Holds the holiday
  // awaiting confirmation so the dialog can show its title.
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: () =>
      api
        .get("/events", { params: { event_type: "holiday", per_page: 100 } })
        .then((r) => r.data),
  });

  const holidays: Holiday[] = data?.data || [];

  const createHoliday = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      start_date: string;
      end_date: string;
      is_mandatory: boolean;
    }) =>
      api
        .post("/events", {
          title: data.title,
          description: data.description || null,
          event_type: "holiday",
          // Store both ends at T00:00:00 so the calendar day is preserved
          // regardless of how the server normalises to UTC. Sending
          // T23:59:59 caused single-day holidays to display as a 2-day
          // range in IST (23:59 UTC = 05:29 IST next day).
          start_date: data.start_date ? `${data.start_date}T00:00:00` : undefined,
          end_date: data.end_date
            ? `${data.end_date}T00:00:00`
            : data.start_date
              ? `${data.start_date}T00:00:00`
              : undefined,
          is_all_day: true,
          target_type: "all",
          is_mandatory: data.is_mandatory,
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setShowAdd(false);
      setForm({ title: "", description: "", start_date: "", end_date: "", is_mandatory: false });
      setAddError("");
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message || t("holidays.addError"));
    },
  });

  // Per-row mandatory toggle. HR clicks the badge to flip is_mandatory on
  // a single holiday — used for restricted/optional holidays (Bakrid, Holi,
  // Onam) where the office stays open and a present employee should remain
  // P, not auto-classify to HOT.
  const updateMandatory = useMutation({
    mutationFn: ({ id, is_mandatory }: { id: number; is_mandatory: boolean }) =>
      api.put(`/events/${id}`, { is_mandatory }).then((r) => r.data.data),
    onMutate: ({ id }) => setSavingMandatoryId(id),
    onSettled: () => setSavingMandatoryId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });

  const deleteHoliday = useMutation({
    mutationFn: (id: number) => api.delete(`/events/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!form.title.trim() || !form.start_date) return;
    createHoliday.mutate(form);
  };

  // Sort holidays by date
  const sortedHolidays = [...holidays].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  };

  // True if start and end land on different CALENDAR days in the user's
  // local timezone. The previous string-equality check was wrong for two
  // reasons: (1) the form was sending T23:59:59 for end_date, so even a
  // single-day holiday had different start/end strings, and (2) any
  // server-side timezone normalisation makes raw ISO strings unsafe to
  // compare. Compare displayed days instead — that's what the user sees.
  const isDateRange = (start: string, end: string | null | undefined) => {
    if (!end) return false;
    const s = new Date(start);
    const e = new Date(end);
    return s.toDateString() !== e.toDateString();
  };

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("holidays.title")}</h1>
          <p className="text-gray-500 mt-1">{t("holidays.subtitle")}</p>
        </div>
        {isHR && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("holidays.addHoliday")}
          </button>
        )}
      </div>

      {/* Add Holiday Form */}
      {showAdd && isHR && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("holidays.addHoliday")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("holidays.holidayName")}</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("holidays.date")}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("holidays.endDate")}</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("holidays.description")}</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={t("holidays.optional")}
              />
            </div>
          </div>
          {/* Mandatory toggle. Drives the auto-HOT rule in the attendance
              grid: a present employee on a MANDATORY holiday auto-shifts to
              HOT (Holiday OT); on an OPTIONAL holiday (Bakrid, Holi, Onam)
              they stay Present, since the office is open and they chose to
              work. Defaults to optional so a new holiday doesn't silently
              flip everyone's attendance. */}
          <div className="mt-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_mandatory}
                onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="font-medium">{t("holidays.mandatoryHoliday")}</span>
                <span className="text-gray-500 ml-1">
                  {t("holidays.mandatoryNote")}
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setForm({ title: "", description: "", start_date: "", end_date: "", is_mandatory: false });
                setAddError("");
              }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t("holidays.cancel")}
            </button>
            <button
              type="submit"
              disabled={createHoliday.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {createHoliday.isPending ? t("holidays.adding") : t("holidays.addHoliday")}
            </button>
          </div>
          {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
        </form>
      )}

      {/* Holiday List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-400">{t("holidays.loading")}</div>
        ) : sortedHolidays.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <PartyPopper className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>{t("holidays.empty")}</p>
            {isHR && <p className="text-sm mt-1">{t("holidays.emptyHint")}</p>}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedHolidays.map((h) => (
              <li
                key={h.id}
                className={`flex items-center justify-between px-6 py-4 ${isPast(h.start_date) ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{h.title}</p>
                      {(() => {
                        const parsed = parseHolidayType(h.description, t);
                        if (!parsed.label || !parsed.type) return null;
                        return (
                          <span
                            className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded ${
                              TYPE_BADGE[parsed.type] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {parsed.label}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDate(h.start_date)}
                      {isDateRange(h.start_date, h.end_date) && (
                        <> &mdash; {formatDate(h.end_date!)}</>
                      )}
                    </p>
                    {(() => {
                      const cleaned = parseHolidayType(h.description, t).description;
                      return cleaned ? (
                        <p className="text-xs text-gray-400 mt-0.5">{cleaned}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isPast(h.start_date) && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Past</span>
                  )}
                  {(() => {
                    const mandatory = !!Number(h.is_mandatory);
                    const saving = savingMandatoryId === h.id;
                    // HR can click to toggle. Non-HR sees a plain badge.
                    const baseCls =
                      "text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border";
                    const colorCls = mandatory
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50 text-amber-700 border-amber-200";
                    const label = mandatory ? "Mandatory" : "Optional";
                    if (!isHR) {
                      return <span className={`${baseCls} ${colorCls}`}>{label}</span>;
                    }
                    return (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          updateMandatory.mutate({ id: h.id, is_mandatory: !mandatory })
                        }
                        className={`${baseCls} ${colorCls} hover:opacity-80 disabled:opacity-50 cursor-pointer`}
                        title={
                          mandatory
                            ? "Mandatory holiday — present employees auto-marked HOT. Click to make optional."
                            : "Optional holiday — present employees stay P. Click to make mandatory."
                        }
                      >
                        {saving ? "..." : label}
                      </button>
                    );
                  })()}
                  {isHR && (
                    <button
                      onClick={() => setDeleteTarget({ id: h.id, title: h.title })}
                      className="text-gray-400 hover:text-red-500 p-1"
                      title="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete holiday "${deleteTarget.title}"?` : "Delete holiday?"}
        confirmText="Delete"
        variant="danger"
        loading={deleteHoliday.isPending}
        onConfirm={() => deleteTarget && deleteHoliday.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
