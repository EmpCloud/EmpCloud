import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { PartyPopper, Plus, Trash2, CalendarDays } from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

interface Holiday {
  id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_all_day: boolean;
  status: string;
}

// Holidays were created with their type stuffed into the description as
// "[type:regional]" / "[type:optional]" because there's no dedicated
// holiday_type column on the events table. Parse the tag out so the list
// can render a clean badge instead of leaking the raw bracket notation
// to the user (#1637). Returns the cleaned description (tag removed) and
// the formatted type label.
const TYPE_LABELS: Record<string, string> = {
  regional: "Regional",
  optional: "Optional",
  public: "Public",
  national: "National",
  religious: "Religious",
};
const TYPE_BADGE: Record<string, string> = {
  regional: "bg-blue-100 text-blue-700",
  optional: "bg-amber-100 text-amber-700",
  public: "bg-green-100 text-green-700",
  national: "bg-rose-100 text-rose-700",
  religious: "bg-purple-100 text-purple-700",
};

function parseHolidayType(description: string | null): {
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
    label: TYPE_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1),
    description: cleaned,
  };
}

export default function HolidaysPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = user ? HR_ROLES.includes(user.role) : false;
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", start_date: "", end_date: "" });
  const [addError, setAddError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: () =>
      api
        .get("/events", { params: { event_type: "holiday", per_page: 100 } })
        .then((r) => r.data),
  });

  const holidays: Holiday[] = data?.data || [];

  const createHoliday = useMutation({
    mutationFn: (data: { title: string; description: string; start_date: string; end_date: string }) =>
      api
        .post("/events", {
          title: data.title,
          description: data.description || null,
          event_type: "holiday",
          start_date: data.start_date ? `${data.start_date}T00:00:00` : undefined,
          end_date: data.end_date ? `${data.end_date}T23:59:59` : data.start_date ? `${data.start_date}T23:59:59` : undefined,
          is_all_day: true,
          target_type: "all",
          is_mandatory: false,
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setShowAdd(false);
      setForm({ title: "", description: "", start_date: "", end_date: "" });
      setAddError("");
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message || "Failed to add holiday.");
    },
  });

  const deleteHoliday = useMutation({
    mutationFn: (id: number) => api.delete(`/events/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
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

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Holidays</h1>
          <p className="text-gray-500 mt-1">View company holidays and days off.</p>
        </div>
        {isHR && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Holiday
          </button>
        )}
      </div>

      {/* Add Holiday Form */}
      {showAdd && isHR && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Holiday</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date (optional, for multi-day)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setForm({ title: "", description: "", start_date: "", end_date: "" });
                setAddError("");
              }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createHoliday.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {createHoliday.isPending ? "Adding..." : "Add Holiday"}
            </button>
          </div>
          {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
        </form>
      )}

      {/* Holiday List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-400">Loading holidays...</div>
        ) : sortedHolidays.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <PartyPopper className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>No holidays listed yet.</p>
            {isHR && <p className="text-sm mt-1">Click "Add Holiday" to get started.</p>}
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
                        const parsed = parseHolidayType(h.description);
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
                      {h.end_date && h.end_date !== h.start_date && (
                        <> &mdash; {formatDate(h.end_date)}</>
                      )}
                    </p>
                    {(() => {
                      const cleaned = parseHolidayType(h.description).description;
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
                  {isHR && (
                    <button
                      onClick={() => { if (confirm(`Delete holiday "${h.title}"?`)) deleteHoliday.mutate(h.id); }}
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
    </div>
  );
}
