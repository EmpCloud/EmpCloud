// =============================================================================
// EMP CLOUD — Attendance Settings (org-level + per-user overrides)
//
// HR / org_admin manages:
//   • which channels (Dashboard / Biometric / App) employees can use to
//     check in/out — at the organisation level
//   • per-employee overrides with a date range, that fall back to the org
//     default when end_date passes
//   • geofence advisory hint (geofences themselves are managed on the
//     existing /attendance — section: geofences — page elsewhere)
//
// The mobile app reads the resolved policy via GET /me/policy; this page
// is the admin face of that policy.
// =============================================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import GeofenceMapPicker from "@/components/maps/GeofenceMapPicker";

type Channel = "dashboard" | "biometric" | "app";
const ALL_CHANNELS: Channel[] = ["dashboard", "biometric", "app"];
const CHANNEL_LABEL: Record<Channel, string> = {
  dashboard: "Dashboard (web)",
  biometric: "Biometric devices",
  app: "EmpCloud mobile app",
};

interface OrgSettings {
  organization_id: number;
  allowed_channels: Channel[];
  geofence_advisory: boolean;
  updated_at: string;
}

interface Geofence {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface UserOverride {
  id: number;
  organization_id: number;
  user_id: number;
  allowed_channels: Channel[] | null;
  geofence_mode: "inherit" | "off" | "custom";
  custom_geofence_id: number | null;
  start_date: string;
  end_date: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  // joined client-side for display
  user?: { id: number; first_name: string; last_name: string; email: string } | null;
}

interface DirectoryEntry {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  designation?: string | null;
}

// ---------------------------------------------------------------------------

export default function AttendanceSettingsPage() {
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["attendance-settings"],
    queryFn: () => api.get("/attendance/settings").then((r) => r.data.data as OrgSettings),
  });

  const fencesQ = useQuery({
    queryKey: ["attendance-geo-fences"],
    queryFn: () => api.get("/attendance/geo-fences").then((r) => r.data.data as Geofence[]),
  });

  const updateSettings = useMutation({
    mutationFn: (patch: Partial<Pick<OrgSettings, "allowed_channels" | "geofence_advisory">>) =>
      api.put("/attendance/settings", patch).then((r) => r.data.data as OrgSettings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-settings"] });
      showToast("success", "Attendance settings updated");
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message ?? "Could not update attendance settings",
      );
    },
  });

  const toggleChannel = (channel: Channel) => {
    const current = settingsQ.data?.allowed_channels ?? [];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    if (next.length === 0) {
      showToast("error", "At least one channel must remain enabled");
      return;
    }
    updateSettings.mutate({ allowed_channels: next });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-brand-600" /> Attendance settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Control how employees can check in and out, and override the rules for individual users
          for a date range.
        </p>
      </header>

      {/* Org-level settings */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Allowed check-in channels</h2>
        <p className="text-sm text-gray-500 mb-4">
          Employees can check in / out only via the channels you enable here. Per-user overrides
          below can grant or revoke channels for specific people.
        </p>

        {settingsQ.isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {ALL_CHANNELS.map((channel) => {
              const enabled = settingsQ.data?.allowed_channels.includes(channel) ?? false;
              return (
                <label
                  key={channel}
                  className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                    enabled
                      ? "border-brand-300 bg-brand-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleChannel(channel)}
                    disabled={updateSettings.isPending}
                    className="mt-0.5 h-4 w-4 text-brand-600"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {CHANNEL_LABEL[channel]}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {channel === "dashboard" && "Manual punch from the web dashboard"}
                      {channel === "biometric" && "Face / fingerprint / QR via biometric devices"}
                      {channel === "app" && "EmpCloud Android / iOS application"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settingsQ.data?.geofence_advisory}
              onChange={(e) => updateSettings.mutate({ geofence_advisory: e.target.checked })}
              disabled={updateSettings.isPending || settingsQ.isLoading}
              className="mt-0.5 h-4 w-4 text-brand-600"
            />
            <div>
              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                Enable geofencing for the mobile app
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Tells the EmpCloud mobile app to validate the user's location against your
                geofences before allowing a punch. The dashboard and biometric devices ignore this
                setting. Manage geofences below.
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* Geofences with inline CRUD */}
      <GeofencesSection geofences={fencesQ.data ?? []} isLoading={fencesQ.isLoading} />


      {/* Per-user overrides */}
      <OverridesSection geofences={fencesQ.data ?? []} />
    </div>
  );
}

// ===========================================================================
// Geofences (org-level, inline CRUD)
// ===========================================================================

function GeofencesSection({ geofences, isLoading }: { geofences: Geofence[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Geofence | null>(null);
  const [creating, setCreating] = useState(false);

  const removeFence = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/geo-fences/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-geo-fences"] });
      showToast("success", "Geofence removed");
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? "Could not remove geofence"),
  });

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Geofences</h2>
          <p className="text-sm text-gray-500">
            {geofences.length} active location{geofences.length === 1 ? "" : "s"}. The mobile app
            receives this list via <code>GET /me/policy</code> and validates the user's GPS
            locally.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"
        >
          <Plus className="h-4 w-4" /> Add geofence
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : geofences.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-6 text-center border border-dashed border-gray-200 rounded-lg">
          No geofences configured. Click <strong>Add geofence</strong> to create one.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {geofences.map((f) => (
            <div
              key={f.id}
              className="border border-gray-200 rounded-lg p-3 flex items-start gap-3"
            >
              <MapPin className="h-4 w-4 text-brand-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{f.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {Number(f.latitude).toFixed(6)}, {Number(f.longitude).toFixed(6)} ·{" "}
                  {f.radius_meters} m radius
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(f)}
                  className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded"
                  aria-label="Edit geofence"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Remove geofence "${f.name}"? Any per-user overrides pinned to it will fall back to inheriting org defaults.`,
                      )
                    ) {
                      removeFence.mutate(f.id);
                    }
                  }}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label="Delete geofence"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <GeofenceModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["attendance-geo-fences"] });
          }}
        />
      )}
      {editing && (
        <GeofenceModal
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["attendance-geo-fences"] });
          }}
        />
      )}
    </section>
  );
}

interface GeofenceModalProps {
  mode: "create" | "edit";
  existing?: Geofence;
  onClose: () => void;
  onSaved: () => void;
}

function GeofenceModal({ mode, existing, onClose, onSaved }: GeofenceModalProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [latitude, setLatitude] = useState<string>(
    existing ? String(existing.latitude) : "",
  );
  const [longitude, setLongitude] = useState<string>(
    existing ? String(existing.longitude) : "",
  );
  const [radius, setRadius] = useState<string>(
    existing ? String(existing.radius_meters) : "200",
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius_meters: Number(radius),
      };
      if (mode === "create") {
        return api.post("/attendance/geo-fences", payload).then((r) => r.data.data);
      }
      return api.put(`/attendance/geo-fences/${existing!.id}`, payload).then((r) => r.data.data);
    },
    onSuccess: () => {
      showToast("success", mode === "create" ? "Geofence created" : "Geofence updated");
      onSaved();
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? "Could not save geofence"),
  });

  const submit = () => {
    if (!name.trim()) return showToast("error", "Name is required");
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rad = Number(radius);
    if (Number.isNaN(lat) || lat < -90 || lat > 90)
      return showToast("error", "Latitude must be between -90 and 90");
    if (Number.isNaN(lng) || lng < -180 || lng > 180)
      return showToast("error", "Longitude must be between -180 and 180");
    if (Number.isNaN(rad) || rad < 10 || rad > 50000)
      return showToast("error", "Radius must be between 10 and 50000 metres");
    save.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "Add geofence" : "Edit geofence"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HQ Bangalore"
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Map picker — click anywhere or drag the marker to set the
              coordinates. Circle overlay shows the current radius. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <GeofenceMapPicker
              latitude={latitude === "" || Number.isNaN(Number(latitude)) ? null : Number(latitude)}
              longitude={
                longitude === "" || Number.isNaN(Number(longitude)) ? null : Number(longitude)
              }
              radiusMeters={Number(radius) || 0}
              onChange={({ latitude: lat, longitude: lng }) => {
                // Round to 7 decimal places (the column precision) so the
                // input doesn't show a 17-digit float after every drag.
                setLatitude(lat.toFixed(7));
                setLongitude(lng.toFixed(7));
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Click anywhere on the map or drag the pin to set the location. The shaded circle
              shows the current radius.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="12.9716"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="77.5946"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Radius (metres)
            </label>
            <input
              type="number"
              min={10}
              max={50000}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Mobile app considers the user "inside" if they're within this distance of the
              coordinates.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Add geofence" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Per-user overrides
// ===========================================================================

interface OverrideRow extends UserOverride {
  user: { id: number; first_name: string; last_name: string; email: string } | null;
}

function OverridesSection({ geofences }: { geofences: Geofence[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OverrideRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Pull all employees once for both the table-side join and the picker in
  // the create modal. The directory endpoint caps per_page at 100, so we
  // walk pages until we've fetched everyone. Orgs in the tens-of-thousands
  // would want a search-on-type picker instead — leave as a follow-up.
  const directoryQ = useQuery({
    queryKey: ["attendance-overrides-directory"],
    queryFn: async () => {
      const all: DirectoryEntry[] = [];
      let page = 1;
      const perPage = 100;
      // Hard ceiling so a misbehaving server can't make us loop forever.
      for (let i = 0; i < 100; i++) {
        const r = await api.get("/employees/directory", { params: { page, per_page: perPage } });
        const rows = (r.data?.data ?? []) as DirectoryEntry[];
        all.push(...rows);
        const total: number | undefined =
          r.data?.meta?.total ?? r.data?.pagination?.total ?? undefined;
        if (rows.length < perPage) break;
        if (typeof total === "number" && all.length >= total) break;
        page += 1;
      }
      return all;
    },
  });

  // Naive: list overrides for every employee that has at least one. We do
  // this by walking the directory and querying overrides per user. Ugly
  // but the per-user endpoint is the only listing surface today; happy to
  // add an org-wide list endpoint in a follow-up if this gets slow.
  const overridesQ = useQuery({
    enabled: !!directoryQ.data,
    queryKey: ["attendance-overrides-all", directoryQ.data?.map((e) => e.id).join(",")],
    queryFn: async () => {
      const employees = directoryQ.data ?? [];
      const results = await Promise.all(
        employees.map((emp) =>
          api
            .get(`/attendance/overrides/users/${emp.id}`)
            .then((r) => (r.data?.data ?? []) as UserOverride[])
            .catch(() => [] as UserOverride[]),
        ),
      );
      const byUser = new Map(employees.map((e) => [e.id, e] as const));
      const flat: OverrideRow[] = [];
      results.forEach((rows) => {
        rows.forEach((row) => {
          flat.push({ ...row, user: byUser.get(row.user_id) ?? null });
        });
      });
      // newest first
      flat.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
      return flat;
    },
  });

  const removeOverride = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/overrides/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-overrides-all"] });
      showToast("success", "Override removed");
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? "Could not remove override"),
  });

  const filtered = useMemo(() => {
    const list = overridesQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((row) => {
      const name = `${row.user?.first_name ?? ""} ${row.user?.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (row.user?.email ?? "").toLowerCase().includes(q);
    });
  }, [overridesQ.data, search]);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Per-user overrides</h2>
          <p className="text-sm text-gray-500">
            Override the org-wide rules for a specific employee for a date range. When the
            end-date passes, the employee falls back to the org default automatically.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"
        >
          <Plus className="h-4 w-4" /> New override
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee name or email…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
      </div>

      {overridesQ.isLoading || directoryQ.isLoading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading overrides…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-6 text-center border border-dashed border-gray-200 rounded-lg">
          {search ? "No overrides match your search." : "No per-user overrides configured."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Channels</th>
                <th className="px-3 py-2">Geofence</th>
                <th className="px-3 py-2">Window</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 w-1" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">
                      {row.user
                        ? `${row.user.first_name} ${row.user.last_name}`
                        : `User #${row.user_id}`}
                    </div>
                    {row.user && (
                      <div className="text-xs text-gray-500">{row.user.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.allowed_channels === null ? (
                      <span className="text-xs text-gray-500 italic">inherit org</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.allowed_channels.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded"
                          >
                            {c === "app" && <Smartphone className="h-3 w-3" />}
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700 text-xs">
                    {row.geofence_mode === "inherit" && (
                      <span className="text-gray-500 italic">inherit org</span>
                    )}
                    {row.geofence_mode === "off" && (
                      <span className="text-amber-700">disabled for this user</span>
                    )}
                    {row.geofence_mode === "custom" && (
                      <span>
                        only:{" "}
                        {geofences.find((f) => f.id === row.custom_geofence_id)?.name ??
                          `#${row.custom_geofence_id}`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                    {row.start_date} → {row.end_date ?? <span className="text-gray-400">open</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-600 max-w-xs truncate" title={row.note ?? ""}>
                    {row.note ?? ""}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(row)}
                        className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded"
                        aria-label="Edit override"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Remove this override? The user will fall back to the org default immediately.")) {
                            removeOverride.mutate(row.id);
                          }
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        aria-label="Delete override"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <OverrideModal
          mode="create"
          geofences={geofences}
          directory={directoryQ.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["attendance-overrides-all"] });
          }}
        />
      )}

      {editing && (
        <OverrideModal
          mode="edit"
          existing={editing}
          geofences={geofences}
          directory={directoryQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["attendance-overrides-all"] });
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Create / edit modal
// ---------------------------------------------------------------------------

interface OverrideModalProps {
  mode: "create" | "edit";
  existing?: OverrideRow;
  geofences: Geofence[];
  directory: DirectoryEntry[];
  onClose: () => void;
  onSaved: () => void;
}

function OverrideModal({ mode, existing, geofences, directory, onClose, onSaved }: OverrideModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [userId, setUserId] = useState<number | null>(existing?.user_id ?? null);
  const [userSearch, setUserSearch] = useState("");
  const [inheritChannels, setInheritChannels] = useState<boolean>(
    existing ? existing.allowed_channels === null : true,
  );
  const [channels, setChannels] = useState<Channel[]>(
    existing?.allowed_channels ?? ["dashboard", "biometric", "app"],
  );
  const [geofenceMode, setGeofenceMode] = useState<"inherit" | "off" | "custom">(
    existing?.geofence_mode ?? "inherit",
  );
  const [customFenceId, setCustomFenceId] = useState<number | null>(
    existing?.custom_geofence_id ?? null,
  );
  const [startDate, setStartDate] = useState(existing?.start_date ?? today);
  const [endDate, setEndDate] = useState<string>(existing?.end_date ?? "");
  const [note, setNote] = useState(existing?.note ?? "");

  const filteredDirectory = useMemo(() => {
    if (!userSearch.trim()) return directory.slice(0, 8);
    const q = userSearch.trim().toLowerCase();
    return directory
      .filter(
        (e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [directory, userSearch]);

  const selectedUser = directory.find((e) => e.id === userId) ?? existing?.user ?? null;

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        allowed_channels: inheritChannels ? null : channels,
        geofence_mode: geofenceMode,
        custom_geofence_id: geofenceMode === "custom" ? customFenceId : null,
        end_date: endDate || null,
        note: note.trim() || null,
      };
      if (mode === "create") {
        payload.start_date = startDate;
        return api.post(`/attendance/overrides/users/${userId}`, payload).then((r) => r.data.data);
      }
      return api.put(`/attendance/overrides/${existing!.id}`, payload).then((r) => r.data.data);
    },
    onSuccess: () => {
      showToast("success", mode === "create" ? "Override created" : "Override updated");
      onSaved();
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? "Could not save override"),
  });

  const submit = () => {
    if (mode === "create" && !userId) {
      showToast("error", "Pick an employee first");
      return;
    }
    if (!inheritChannels && channels.length === 0) {
      showToast("error", "Pick at least one channel or switch to 'inherit org'");
      return;
    }
    if (geofenceMode === "custom" && !customFenceId) {
      showToast("error", "Pick a geofence for the custom mode");
      return;
    }
    if (endDate && endDate < startDate) {
      showToast("error", "End date cannot be before start date");
      return;
    }
    save.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "New attendance override" : "Edit attendance override"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Employee picker (create mode only) */}
          {mode === "create" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              {selectedUser ? (
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {selectedUser.first_name} {selectedUser.last_name}
                    </div>
                    <div className="text-xs text-gray-500">{selectedUser.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setUserId(null);
                      setUserSearch("");
                    }}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {filteredDirectory.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">No matches</div>
                    )}
                    {filteredDirectory.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setUserId(emp.id);
                          setUserSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div className="text-xs text-gray-500">{emp.email}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div className="text-sm font-medium text-gray-900">
                  {existing!.user
                    ? `${existing!.user!.first_name} ${existing!.user!.last_name}`
                    : `User #${existing!.user_id}`}
                </div>
                {existing!.user && (
                  <div className="text-xs text-gray-500">{existing!.user!.email}</div>
                )}
              </div>
            </div>
          )}

          {/* Channels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Allowed channels</label>
              <label className="text-xs text-gray-600 inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={inheritChannels}
                  onChange={(e) => setInheritChannels(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Inherit org default
              </label>
            </div>
            <div className={`grid sm:grid-cols-3 gap-2 ${inheritChannels ? "opacity-50 pointer-events-none" : ""}`}>
              {ALL_CHANNELS.map((c) => (
                <label
                  key={c}
                  className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-sm ${
                    channels.includes(c)
                      ? "border-brand-300 bg-brand-50 text-brand-900"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={(e) => {
                      setChannels((cur) =>
                        e.target.checked ? Array.from(new Set([...cur, c])) : cur.filter((x) => x !== c),
                      );
                    }}
                    className="h-4 w-4"
                  />
                  {CHANNEL_LABEL[c]}
                </label>
              ))}
            </div>
          </div>

          {/* Geofence mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Geofence</label>
            <div className="space-y-2">
              {(["inherit", "off", "custom"] as const).map((mode) => (
                <label key={mode} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="geofence_mode"
                    value={mode}
                    checked={geofenceMode === mode}
                    onChange={() => setGeofenceMode(mode)}
                    className="mt-1 h-4 w-4 text-brand-600"
                  />
                  <div>
                    <div className="text-sm text-gray-900">
                      {mode === "inherit" && "Inherit org geofences"}
                      {mode === "off" && "Disable geofencing for this user"}
                      {mode === "custom" && "Restrict to a single geofence"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {mode === "inherit" && "User sees all org-active geofences in the mobile app."}
                      {mode === "off" && "Mobile app receives an empty geofence list."}
                      {mode === "custom" && "User can only check in from the chosen location."}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {geofenceMode === "custom" && (
              <select
                value={customFenceId ?? ""}
                onChange={(e) => setCustomFenceId(e.target.value ? Number(e.target.value) : null)}
                className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">Select a geofence…</option>
                {geofences.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.radius_meters} m)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dates */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={mode === "edit"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
              />
              {mode === "edit" && (
                <p className="text-xs text-gray-500 mt-1">
                  Start date can't be edited after creation.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank for an open-ended override.
              </p>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={255}
              placeholder="e.g. WFH for 2 weeks, on-site project, leave coverage…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create override" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
