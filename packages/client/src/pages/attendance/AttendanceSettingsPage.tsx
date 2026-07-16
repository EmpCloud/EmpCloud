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
import { useTranslation, Trans } from "react-i18next";
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
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
  const { t } = useTranslation();
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
      showToast("success", t("attendanceSettings.updated"));
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message ?? t("attendanceSettings.updateError"),
      );
    },
  });

  const toggleChannel = (channel: Channel) => {
    const current = settingsQ.data?.allowed_channels ?? [];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    if (next.length === 0) {
      showToast("error", t("attendanceSettings.atLeastOneChannel"));
      return;
    }
    updateSettings.mutate({ allowed_channels: next });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-brand-600 dark:text-brand-400" /> {t("attendanceSettings.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("attendanceSettings.subtitle")}
        </p>
      </header>

      {/* Org-level settings */}
      <section className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">{t("attendanceSettings.allowedChannels")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("attendanceSettings.allowedChannelsDesc")}
        </p>

        {settingsQ.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("attendanceSettings.loading")}
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
                      ? "border-brand-300 bg-brand-50 dark:bg-brand-950/40"
                      : "border-border bg-card hover:border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleChannel(channel)}
                    disabled={updateSettings.isPending}
                    className="mt-0.5 h-4 w-4 text-brand-600 dark:text-brand-400"
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t(`attendanceSettings.channel.${channel}`, { defaultValue: CHANNEL_LABEL[channel] })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {channel === "dashboard" && t("attendanceSettings.channelDesc.dashboard")}
                      {channel === "biometric" && t("attendanceSettings.channelDesc.biometric")}
                      {channel === "app" && t("attendanceSettings.channelDesc.app")}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-border">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settingsQ.data?.geofence_advisory}
              onChange={(e) => updateSettings.mutate({ geofence_advisory: e.target.checked })}
              disabled={updateSettings.isPending || settingsQ.isLoading}
              className="mt-0.5 h-4 w-4 text-brand-600 dark:text-brand-400"
            />
            <div>
              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {t("attendanceSettings.enableGeofencing")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("attendanceSettings.enableGeofencingDesc")}
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Geofence | null>(null);
  const [creating, setCreating] = useState(false);
  // Pending deletion target. The trash icon sets this; ConfirmDialog (rendered
  // at the bottom of the section) reads it. Replaces window.confirm() which
  // surfaces an unstyled browser alert.
  const [pendingDelete, setPendingDelete] = useState<Geofence | null>(null);

  const removeFence = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/geo-fences/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-geo-fences"] });
      showToast("success", t("attendanceSettings.geofenceRemoved"));
      setPendingDelete(null);
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendanceSettings.removeGeofenceError")),
  });

  return (
    <section className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("attendanceSettings.geofences")}</h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="attendanceSettings.geofencesDesc"
              count={geofences.length}
              values={{ count: geofences.length }}
              components={{ code: <code /> }}
            />
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"
        >
          <Plus className="h-4 w-4" /> {t("attendanceSettings.addGeofence")}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("attendanceSettings.loading")}
        </div>
      ) : geofences.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
          <Trans i18nKey="attendanceSettings.noGeofences" components={{ strong: <strong /> }} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {geofences.map((f) => (
            <div
              key={f.id}
              className="border border-border rounded-lg p-3 flex items-start gap-3"
            >
              <MapPin className="h-4 w-4 text-brand-600 dark:text-brand-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Number(f.latitude).toFixed(6)}, {Number(f.longitude).toFixed(6)} ·{" "}
                  {t("attendanceSettings.mRadius", { radius: f.radius_meters })}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(f)}
                  className="p-1.5 text-muted-foreground hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 rounded"
                  aria-label={t("attendanceSettings.editGeofence")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPendingDelete(f)}
                  className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                  aria-label={t("attendanceSettings.deleteGeofence")}
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("attendanceSettings.removeGeofenceTitle")}
        description={
          pendingDelete
            ? t("attendanceSettings.removeGeofenceDesc", { name: pendingDelete.name })
            : ""
        }
        confirmText={t("attendanceSettings.remove")}
        cancelText={t("attendanceSettings.cancel")}
        variant="danger"
        loading={removeFence.isPending}
        onConfirm={() => {
          if (pendingDelete) removeFence.mutate(pendingDelete.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
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
  const { t } = useTranslation();
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
  // Field-level validation errors. The toast at the bottom-right is easy to
  // miss for inline form mistakes (especially on the geofence dialog where
  // the user is focused on the map). Render the message right under the
  // offending field instead — keyed by field name so each input can show
  // / clear its own error independently.
  const [errors, setErrors] = useState<{
    name?: string;
    latitude?: string;
    longitude?: string;
    radius?: string;
  }>({});

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
      showToast("success", mode === "create" ? t("attendanceSettings.geofenceCreated") : t("attendanceSettings.geofenceUpdated"));
      onSaved();
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendanceSettings.saveGeofenceError")),
  });

  const submit = () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rad = Number(radius);
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("attendanceSettings.errNameRequired");
    if (Number.isNaN(lat) || lat < -90 || lat > 90) next.latitude = t("attendanceSettings.errLatitude");
    if (Number.isNaN(lng) || lng < -180 || lng > 180) next.longitude = t("attendanceSettings.errLongitude");
    if (Number.isNaN(rad) || rad < 10 || rad > 50000) next.radius = t("attendanceSettings.errRadius");
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h3 className="text-lg font-semibold text-foreground">
            {mode === "create" ? t("attendanceSettings.addGeofence") : t("attendanceSettings.editGeofence")}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-muted-foreground rounded hover:bg-muted"
            aria-label={t("attendanceSettings.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.nameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder={t("attendanceSettings.namePlaceholder")}
              maxLength={100}
              aria-invalid={!!errors.name}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
                errors.name
                  ? "border-red-300 focus:ring-red-300 focus:border-red-400"
                  : "border-border focus:ring-brand-500 focus:border-brand-500"
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Map picker — click anywhere or drag the marker to set the
              coordinates. Circle overlay shows the current radius. */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.locationLabel")}</label>
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
            <p className="text-xs text-muted-foreground mt-1">
              {t("attendanceSettings.mapHint")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.latitudeLabel")}</label>
              <input
                type="number"
                step="0.0000001"
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  if (errors.latitude) setErrors((p) => ({ ...p, latitude: undefined }));
                }}
                placeholder="12.9716"
                aria-invalid={!!errors.latitude}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
                  errors.latitude
                    ? "border-red-300 focus:ring-red-300 focus:border-red-400"
                    : "border-border focus:ring-brand-500 focus:border-brand-500"
                }`}
              />
              {errors.latitude && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.latitude}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.longitudeLabel")}</label>
              <input
                type="number"
                step="0.0000001"
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  if (errors.longitude) setErrors((p) => ({ ...p, longitude: undefined }));
                }}
                placeholder="77.5946"
                aria-invalid={!!errors.longitude}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
                  errors.longitude
                    ? "border-red-300 focus:ring-red-300 focus:border-red-400"
                    : "border-border focus:ring-brand-500 focus:border-brand-500"
                }`}
              />
              {errors.longitude && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.longitude}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("attendanceSettings.radiusLabel")}
            </label>
            <input
              type="number"
              min={10}
              max={50000}
              value={radius}
              onChange={(e) => {
                setRadius(e.target.value);
                if (errors.radius) setErrors((p) => ({ ...p, radius: undefined }));
              }}
              aria-invalid={!!errors.radius}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
                errors.radius
                  ? "border-red-300 focus:ring-red-300 focus:border-red-400"
                  : "border-border focus:ring-brand-500 focus:border-brand-500"
              }`}
            />
            {errors.radius ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.radius}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {t("attendanceSettings.radiusHint")}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-muted">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg"
          >
            {t("attendanceSettings.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? t("attendanceSettings.addGeofence") : t("attendanceSettings.saveChanges")}
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
  const { t } = useTranslation();
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

  // Pending deletion target for the override list. See GeofencesSection for
  // the same pattern — ConfirmDialog at the bottom reads this.
  const [pendingDelete, setPendingDelete] = useState<OverrideRow | null>(null);

  const removeOverride = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/overrides/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-overrides-all"] });
      showToast("success", t("attendanceSettings.overrideRemoved"));
      setPendingDelete(null);
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendanceSettings.removeOverrideError")),
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
    <section className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("attendanceSettings.overrides")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("attendanceSettings.overridesDesc")}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"
        >
          <Plus className="h-4 w-4" /> {t("attendanceSettings.newOverride")}
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("attendanceSettings.searchEmployee")}
          className="bg-card text-foreground w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
      </div>

      {overridesQ.isLoading || directoryQ.isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("attendanceSettings.loadingOverrides")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
          {search ? t("attendanceSettings.noOverridesMatch") : t("attendanceSettings.noOverrides")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase border-b border-border">
                <th className="px-3 py-2">{t("attendanceSettings.colEmployee")}</th>
                <th className="px-3 py-2">{t("attendanceSettings.colChannels")}</th>
                <th className="px-3 py-2">{t("attendanceSettings.colGeofence")}</th>
                <th className="px-3 py-2">{t("attendanceSettings.colWindow")}</th>
                <th className="px-3 py-2">{t("attendanceSettings.colNote")}</th>
                <th className="px-3 py-2 w-1" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/60">
                  <td className="px-3 py-3">
                    <div className="font-medium text-foreground">
                      {row.user
                        ? `${row.user.first_name} ${row.user.last_name}`
                        : t("attendanceSettings.userN", { id: row.user_id })}
                    </div>
                    {row.user && (
                      <div className="text-xs text-muted-foreground">{row.user.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.allowed_channels === null ? (
                      <span className="text-xs text-muted-foreground italic">{t("attendanceSettings.inheritOrg")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.allowed_channels.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 text-xs bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded"
                          >
                            {c === "app" && <Smartphone className="h-3 w-3" />}
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {row.geofence_mode === "inherit" && (
                      <span className="text-muted-foreground italic">{t("attendanceSettings.inheritOrg")}</span>
                    )}
                    {row.geofence_mode === "off" && (
                      <span className="text-amber-700 dark:text-amber-300">{t("attendanceSettings.disabledForUser")}</span>
                    )}
                    {row.geofence_mode === "custom" && (
                      <span>
                        {t("attendanceSettings.only")}{" "}
                        {geofences.find((f) => f.id === row.custom_geofence_id)?.name ??
                          `#${row.custom_geofence_id}`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {row.start_date} → {row.end_date ?? <span className="text-muted-foreground">{t("attendanceSettings.open")}</span>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground max-w-xs truncate" title={row.note ?? ""}>
                    {row.note ?? ""}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(row)}
                        className="p-1.5 text-muted-foreground hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 rounded"
                        aria-label={t("attendanceSettings.editOverride")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(row)}
                        className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                        aria-label={t("attendanceSettings.deleteOverride")}
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("attendanceSettings.removeOverrideTitle")}
        description={
          pendingDelete
            ? t("attendanceSettings.removeOverrideDesc", { name: pendingDelete.user?.first_name ?? t("attendanceSettings.thisUser") })
            : ""
        }
        confirmText={t("attendanceSettings.remove")}
        cancelText={t("attendanceSettings.cancel")}
        variant="danger"
        loading={removeOverride.isPending}
        onConfirm={() => {
          if (pendingDelete) removeOverride.mutate(pendingDelete.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
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
  const { t } = useTranslation();
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
      showToast("success", mode === "create" ? t("attendanceSettings.overrideCreated") : t("attendanceSettings.overrideUpdated"));
      onSaved();
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendanceSettings.saveOverrideError")),
  });

  const submit = () => {
    if (mode === "create" && !userId) {
      showToast("error", t("attendanceSettings.errPickEmployee"));
      return;
    }
    if (!inheritChannels && channels.length === 0) {
      showToast("error", t("attendanceSettings.errPickChannel"));
      return;
    }
    if (geofenceMode === "custom" && !customFenceId) {
      showToast("error", t("attendanceSettings.errPickGeofence"));
      return;
    }
    if (endDate && endDate < startDate) {
      showToast("error", t("attendanceSettings.errEndBeforeStart"));
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
        className="bg-card rounded-xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h3 className="text-lg font-semibold text-foreground">
            {mode === "create" ? t("attendanceSettings.newOverrideTitle") : t("attendanceSettings.editOverrideTitle")}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-muted-foreground rounded hover:bg-muted"
            aria-label={t("attendanceSettings.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Employee picker (create mode only) */}
          {mode === "create" ? (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.colEmployee")}</label>
              {selectedUser ? (
                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedUser.first_name} {selectedUser.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setUserId(null);
                      setUserSearch("");
                    }}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {t("attendanceSettings.change")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder={t("attendanceSettings.searchNameEmail")}
                      className="bg-card text-foreground w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                    {filteredDirectory.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">{t("attendanceSettings.noMatches")}</div>
                    )}
                    {filteredDirectory.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setUserId(emp.id);
                          setUserSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                      >
                        <div className="text-sm font-medium text-foreground">
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.colEmployee")}</label>
              <div className="p-3 border border-border rounded-lg bg-muted">
                <div className="text-sm font-medium text-foreground">
                  {existing!.user
                    ? `${existing!.user!.first_name} ${existing!.user!.last_name}`
                    : t("attendanceSettings.userN", { id: existing!.user_id })}
                </div>
                {existing!.user && (
                  <div className="text-xs text-muted-foreground">{existing!.user!.email}</div>
                )}
              </div>
            </div>
          )}

          {/* Channels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-muted-foreground">{t("attendanceSettings.allowedChannelsShort")}</label>
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={inheritChannels}
                  onChange={(e) => setInheritChannels(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                {t("attendanceSettings.inheritOrgDefault")}
              </label>
            </div>
            <div className={`grid sm:grid-cols-3 gap-2 ${inheritChannels ? "opacity-50 pointer-events-none" : ""}`}>
              {ALL_CHANNELS.map((c) => (
                <label
                  key={c}
                  className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-sm ${
                    channels.includes(c)
                      ? "border-brand-300 bg-brand-50 dark:bg-brand-950/40 text-brand-900"
                      : "border-border"
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
                  {t(`attendanceSettings.channel.${c}`, { defaultValue: CHANNEL_LABEL[c] })}
                </label>
              ))}
            </div>
          </div>

          {/* Geofence mode */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">{t("attendanceSettings.colGeofence")}</label>
            <div className="space-y-2">
              {(["inherit", "off", "custom"] as const).map((mode) => (
                <label key={mode} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="geofence_mode"
                    value={mode}
                    checked={geofenceMode === mode}
                    onChange={() => setGeofenceMode(mode)}
                    className="mt-1 h-4 w-4 text-brand-600 dark:text-brand-400"
                  />
                  <div>
                    <div className="text-sm text-foreground">
                      {mode === "inherit" && t("attendanceSettings.geoModeInherit")}
                      {mode === "off" && t("attendanceSettings.geoModeOff")}
                      {mode === "custom" && t("attendanceSettings.geoModeCustom")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mode === "inherit" && t("attendanceSettings.geoModeInheritDesc")}
                      {mode === "off" && t("attendanceSettings.geoModeOffDesc")}
                      {mode === "custom" && t("attendanceSettings.geoModeCustomDesc")}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {geofenceMode === "custom" && (
              <select
                value={customFenceId ?? ""}
                onChange={(e) => setCustomFenceId(e.target.value ? Number(e.target.value) : null)}
                className="bg-card text-foreground mt-3 w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">{t("attendanceSettings.selectGeofence")}</option>
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("attendanceSettings.startDate")}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={mode === "edit"}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-muted disabled:text-muted-foreground"
              />
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("attendanceSettings.startDateLocked")}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {t("attendanceSettings.endDate")} <span className="text-muted-foreground font-normal">{t("attendanceSettings.optional")}</span>
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("attendanceSettings.endDateHint")}
              </p>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("attendanceSettings.colNote")} <span className="text-muted-foreground font-normal">{t("attendanceSettings.optional")}</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={255}
              placeholder={t("attendanceSettings.notePlaceholder")}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-muted">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg"
          >
            {t("attendanceSettings.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? t("attendanceSettings.createOverride") : t("attendanceSettings.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
