import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface ShiftForm {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes_late: number;
  grace_minutes_early: number;
  is_night_shift: boolean;
  is_default: boolean;
}

const emptyForm: ShiftForm = {
  name: "",
  start_time: "09:00",
  end_time: "18:00",
  break_minutes: 60,
  grace_minutes_late: 15,
  grace_minutes_early: 15,
  is_night_shift: false,
  is_default: false,
};

export default function ShiftsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ShiftForm>(emptyForm);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get("/attendance/shifts").then((r) => r.data.data),
  });

  const createShift = useMutation({
    mutationFn: (data: ShiftForm) => api.post("/attendance/shifts", data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); resetForm(); },
  });

  const updateShift = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ShiftForm> }) =>
      api.put(`/attendance/shifts/${id}`, data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); resetForm(); },
  });

  const deleteShift = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const handleEdit = (shift: any) => {
    setEditId(shift.id);
    setForm({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes,
      grace_minutes_late: shift.grace_minutes_late,
      grace_minutes_early: shift.grace_minutes_early,
      is_night_shift: shift.is_night_shift,
      is_default: shift.is_default,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      updateShift.mutate({ id: editId, data: form });
    } else {
      createShift.mutate(form);
    }
  };

  const set = (key: keyof ShiftForm, value: any) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-gray-500 mt-1">Manage work shifts for your organization.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Add Shift
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{editId ? "Edit Shift" : "Create Shift"}</h3>
            <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Break (min)</label>
              <input type="number" value={form.break_minutes} onChange={(e) => set("break_minutes", Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grace Late (min)</label>
              <input type="number" value={form.grace_minutes_late} onChange={(e) => set("grace_minutes_late", Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grace Early (min)</label>
              <input type="number" value={form.grace_minutes_early} onChange={(e) => set("grace_minutes_early", Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min={0} />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_night_shift} onChange={(e) => set("is_night_shift", e.target.checked)} className="rounded" />
              Night Shift
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} className="rounded" />
              Default Shift
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={createShift.isPending || updateShift.isPending} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {editId ? "Update" : "Create"}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Shifts Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Start</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">End</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Break</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Grace Late</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : shifts.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No shifts configured</td></tr>
            ) : (
              shifts.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    {s.is_default && <span className="ml-2 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">Default</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.start_time}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.end_time}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.break_minutes}m</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.grace_minutes_late}m</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.is_night_shift ? "bg-indigo-50 text-indigo-700" : "bg-yellow-50 text-yellow-700"}`}>
                      {s.is_night_shift ? "Night" : "Day"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(s)} className="text-gray-400 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { if (confirm("Deactivate this shift?")) deleteShift.mutate(s.id); }} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
