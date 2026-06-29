// =============================================================================
// EMP CLOUD — Self-service Biometric Kiosk PIN
//
// Lets a logged-in user enable / disable their personal biometric kiosk
// access and set / change their 6-digit secret PIN. Talks to the
// emp-monitor-parity routes at /api/v3/biometric/* (NOT the modern
// /api/v1/biometrics/* HR endpoints, which manage org-wide devices).
// =============================================================================
import { useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, ShieldCheck, ShieldOff, KeyRound, ArrowLeft, Loader2, Link2, Trash2, Plus, Building2, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";

// Standalone axios instance — the shared `@/api/client` is pinned to
// /api/v1, but these endpoints live under /api/v3/biometric and respond
// in the legacy { code, message, error, data } shape with HTTP always 200.
function useV3Biometric() {
  const token = useAuthStore((s) => s.accessToken);
  return axios.create({
    baseURL: "/api/v3/biometric",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

interface LegacyResponse<T = unknown> {
  code: number;
  message: string;
  error: unknown;
  data: T;
}

type Mode = "enable" | "change" | "disable";

function isSixDigits(s: string): boolean {
  return /^\d{6}$/.test(s);
}

export default function KioskBiometricPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const v3 = useV3Biometric();

  const [mode, setMode] = useState<Mode | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["biometric-kiosk-status"],
    queryFn: async () => {
      const { data } = await v3.get<LegacyResponse<{ status: "true" | "false" }>>("/status");
      return data.data?.status === "true";
    },
  });

  const reset = () => {
    setMode(null);
    setPin("");
    setConfirmPin("");
    setError(null);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!mode) return;
      // For enable + change we require both fields to match. Disable just
      // takes the current PIN once (backend doesn't actually verify it on
      // disable today, but asking for it is the safer UX and forward-compat).
      if (!isSixDigits(pin)) throw new Error("PIN must be exactly 6 digits");
      if (mode !== "disable" && pin !== confirmPin) throw new Error("PINs do not match");

      if (mode === "enable") {
        const { data } = await v3.post<LegacyResponse>("/enable-biometric", {
          secretKey: pin,
          status: 1,
        });
        if (data.code !== 200) throw new Error(data.message || "Failed to enable biometric");
        return;
      }
      if (mode === "disable") {
        const { data } = await v3.post<LegacyResponse>("/enable-biometric", {
          secretKey: pin,
          status: 0,
        });
        if (data.code !== 200) throw new Error(data.message || "Failed to disable biometric");
        return;
      }
      // change
      const { data } = await v3.post<LegacyResponse>("/set-password", {
        secretKey: pin,
      });
      if (data.code !== 200) throw new Error(data.message || "Failed to update PIN");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biometric-kiosk-status"] });
      reset();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || "Something went wrong");
    },
  });

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={() => navigate("/biometrics")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> {t("kioskPin.backToBiometrics")}
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("kioskPin.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("kioskPin.subtitle")}
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
              status ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            <Fingerprint className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">{t("kioskPin.status")}</p>
            <p className="text-lg font-semibold text-gray-900">
              {isLoading ? t("kioskPin.loading") : status ? t("kioskPin.enabled") : t("kioskPin.disabled")}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {status
                ? t("kioskPin.statusOnHint")
                : t("kioskPin.statusOffHint")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!status && (
            <button
              type="button"
              onClick={() => {
                reset();
                setMode("enable");
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" /> {t("kioskPin.enableBiometric")}
            </button>
          )}
          {status && (
            <>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setMode("change");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <KeyRound className="h-4 w-4" /> {t("kioskPin.changePin")}
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setMode("disable");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <ShieldOff className="h-4 w-4" /> {t("kioskPin.disableBiometric")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Liveness detection — anti-spoof check at kiosk auth. When enabled,
          the device runs blink / micro-movement detection on each face
          capture before issuing the kiosk JWT. "Moderate" tolerates
          ambient variance; "High" rejects on subtler signals (better
          security, more legitimate retries). Backwards-compat default:
          OFF, so existing kiosks see no behaviour change. */}
      <LivenessSettingsCard />

      {/* Linked organisations (#1936) — only meaningful once biometric is
          enabled, since the resolver runs at kiosk login. We still show the
          card when disabled so HR can see the section exists. */}
      <LinkedOrganizationsCard />

      {/* Inline modal-ish panel — kept on-page (no Dialog) so the PIN entry
          stays close to the status card and the page remains keyboard-only
          friendly. */}
      {mode && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === "enable" && t("kioskPin.panelEnableTitle")}
            {mode === "change" && t("kioskPin.panelChangeTitle")}
            {mode === "disable" && t("kioskPin.panelDisableTitle")}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {mode === "disable"
              ? t("kioskPin.panelDisableHint")
              : t("kioskPin.panelSetHint")}
          </p>

          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              submitMutation.mutate();
            }}
          >
            <PinField label={mode === "disable" ? t("kioskPin.currentPin") : t("kioskPin.pin")} value={pin} onChange={setPin} autoFocus />
            {mode !== "disable" && (
              <PinField
                label={t("kioskPin.confirmPin")}
                value={confirmPin}
                onChange={setConfirmPin}
              />
            )}
            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("kioskPin.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 ${
                  mode === "disable" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "enable" && t("kioskPin.enable")}
                {mode === "change" && t("kioskPin.updatePin")}
                {mode === "disable" && t("kioskPin.disable")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Liveness settings card — toggle on/off + level dropdown + save.
// Backed by GET/PUT /api/v3/biometric/liveness-settings (migration 065
// added the columns to biometric_legacy_credentials). Defaults pulled
// from server: { enabled: false, level: "moderate" } when the row is
// new. Save button is disabled until something actually changes from
// the loaded baseline so accidental clicks don't fire empty PUTs.
type LivenessLevel = "low" | "moderate" | "high";
interface LivenessResp {
  enabled: boolean;
  level: LivenessLevel;
}

// Whitelist incoming server values so a stale or unexpected level
// doesn't crash the dropdown's controlled <select>.
function normaliseLevel(input: unknown): LivenessLevel {
  const s = String(input ?? "").toLowerCase();
  if (s === "low" || s === "moderate" || s === "high") return s;
  return "moderate";
}

function LivenessSettingsCard() {
  const v3 = useV3Biometric();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [level, setLevel] = useState<LivenessLevel>("moderate");
  const [baseline, setBaseline] = useState<LivenessResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["biometric-liveness-settings"],
    queryFn: async () => {
      const { data } = await v3.get<LegacyResponse<LivenessResp>>("/liveness-settings");
      const settings = data.data || { enabled: false, level: "moderate" as LivenessLevel };
      const lvl = normaliseLevel(settings.level);
      setEnabled(!!settings.enabled);
      setLevel(lvl);
      setBaseline({ enabled: !!settings.enabled, level: lvl });
      return settings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await v3.put<LegacyResponse<LivenessResp>>("/liveness-settings", {
        enabled,
        // When disabling we still send the level the user had selected --
        // server keeps the column populated so toggling back ON later
        // restores the previous sensitivity choice.
        level,
      });
      if (data.code !== 200) throw new Error(data.message || "Failed to save liveness settings");
      return data.data;
    },
    onSuccess: (data) => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (data) {
        setBaseline({ enabled: !!data.enabled, level: data.level === "high" ? "high" : "moderate" });
      }
      qc.invalidateQueries({ queryKey: ["biometric-liveness-settings"] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || "Failed to save liveness settings");
    },
  });

  const dirty =
    !!baseline && (baseline.enabled !== enabled || baseline.level !== level);

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Eye className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">Liveness Detection</h2>
          <p className="mt-1 text-xs text-gray-500">
            Run an anti-spoof check on each kiosk face capture (blink / micro-movement
            detection) before issuing the sign-in token. Defaults to off; turn on once
            your devices and lighting support reliable detection.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="mt-5 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Enable Liveness</p>
          <p className="text-xs text-gray-500">
            {isLoading ? "Loading…" : enabled ? "Liveness checks ARE running on kiosk auth." : "Liveness checks are off — face capture is accepted as-is."}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={enabled}
            disabled={isLoading || saveMutation.isPending}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              // Mirror the server rule (see updateLivenessSettings):
              // turning OFF resets level to "low" so the next enable
              // starts from the most permissive setting. The slider
              // immediately reflects this so what HR sees == what
              // they're about to save.
              if (!next) setLevel("low");
            }}
          />
          <span className="relative h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-brand-600 peer-disabled:opacity-50">
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
        </label>
      </div>

      {/* Level slider — only shown when enabled. Three discrete stops
          (Low / Moderate / High) on a native range input so it works
          on touch devices without an extra component. */}
      {enabled && <LivenessLevelSlider level={level} onChange={setLevel} disabled={isLoading || saveMutation.isPending} />}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Liveness settings saved.
        </div>
      )}

      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || isLoading || saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

// 3-stop slider for Low / Moderate / High. Native <input type="range">
// with discrete steps + clickable labels underneath so HR can also tap
// the label name to jump straight to it. Values map: 0=low, 1=moderate,
// 2=high. The track is colour-graded green→amber→red so the
// "consequence" is visible without reading the label.
const LIVENESS_LEVELS: Array<{ value: LivenessLevel; label: string; description: string; cls: string }> = [
  { value: "low", label: "Low", description: "Lenient — more retries succeed; less anti-spoof protection.", cls: "text-green-700" },
  { value: "moderate", label: "Moderate", description: "Balanced (recommended) — catches obvious spoofs.", cls: "text-amber-700" },
  { value: "high", label: "High", description: "Strict — best for shared kiosks; rejects on subtler signals.", cls: "text-red-700" },
];
function LivenessLevelSlider({
  level,
  onChange,
  disabled,
}: {
  level: LivenessLevel;
  onChange: (v: LivenessLevel) => void;
  disabled?: boolean;
}) {
  const idx = Math.max(0, LIVENESS_LEVELS.findIndex((l) => l.value === level));
  const current = LIVENESS_LEVELS[idx] || LIVENESS_LEVELS[1];
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-4">
      <div className="flex items-baseline justify-between">
        <label className="block text-sm font-medium text-gray-900" htmlFor="liveness-level-slider">
          Sensitivity Level
        </label>
        <span className={`text-sm font-semibold ${current.cls}`}>{current.label}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{current.description}</p>

      <div className="mt-4">
        <input
          id="liveness-level-slider"
          type="range"
          min={0}
          max={LIVENESS_LEVELS.length - 1}
          step={1}
          value={idx}
          disabled={disabled}
          onChange={(e) => onChange(LIVENESS_LEVELS[Number(e.target.value)].value)}
          // The accent-* token + a custom track gradient give the slider
          // a green→amber→red ramp so the "intensity" is colour-coded.
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-green-300 via-amber-300 to-red-400 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {/* Tick labels — clickable so the slider doubles as a discrete
            picker. The active tick is bolded + coloured to match. */}
        <div className="mt-2 flex items-start justify-between text-[11px]">
          {LIVENESS_LEVELS.map((l, i) => (
            <button
              key={l.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(l.value)}
              className={`flex flex-col items-${i === 0 ? "start" : i === LIVENESS_LEVELS.length - 1 ? "end" : "center"} disabled:cursor-not-allowed ${
                i === idx ? `font-semibold ${l.cls}` : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Linked organisations panel — lets the kiosk-credential owner attach
// admin emails from sister orgs so the kiosk can serve employees from
// every linked org under a single login. Hits /api/v3/biometric/linked-
// organizations (admin JWT, NOT the kiosk JWT). Backend-side, this just
// updates the linked_emails JSON column on biometric_legacy_credentials;
// resolution happens at kiosk login (/auth) so the JWT then carries
// organization_ids: [primary, ...linked].
interface LinkedOrgRow {
  email: string;
  organization_id: number | null;
  organization_name: string | null;
}

function LinkedOrganizationsCard() {
  const v3 = useV3Biometric();
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: linked = [], isLoading } = useQuery({
    queryKey: ["biometric-linked-orgs"],
    queryFn: async () => {
      const { data } = await v3.get<LegacyResponse<LinkedOrgRow[]>>("/linked-organizations");
      return data.data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data } = await v3.post<LegacyResponse>("/linked-organizations", { email });
      if (data.code !== 200) throw new Error(data.message || "Failed to add linked organization");
    },
    onSuccess: () => {
      setNewEmail("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["biometric-linked-orgs"] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || "Failed to add linked organization");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data } = await v3.delete<LegacyResponse>(`/linked-organizations/${encodeURIComponent(email)}`);
      if (data.code !== 200) throw new Error(data.message || "Failed to remove linked organization");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biometric-linked-orgs"] }),
  });

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
          <Link2 className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">Linked Organizations</h2>
          <p className="mt-1 text-xs text-gray-500">
            Share your biometric kiosk with employees from sister organizations.
            Add an admin email from each linked org — after their next kiosk
            login, employees from all linked orgs can punch in/out on the
            same device. Each company&rsquo;s payroll stays separate.
          </p>
        </div>
      </div>

      {/* Existing links */}
      <div className="mt-5 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : linked.length === 0 ? (
          <p className="text-sm text-gray-500">No organizations linked yet.</p>
        ) : (
          linked.map((row) => (
            <div
              key={row.email}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{row.email}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {row.organization_name
                      ? row.organization_name
                      : row.organization_id == null
                        ? "User no longer exists — remove this entry"
                        : `Organization #${row.organization_id}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeMutation.mutate(row.email)}
                disabled={removeMutation.isPending}
                className="text-gray-400 hover:text-red-600 p-1 rounded disabled:opacity-50"
                aria-label={`Unlink ${row.email}`}
                title="Unlink"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add new */}
      <form
        className="mt-4 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!newEmail.trim()) {
            setError("Enter an email to link");
            return;
          }
          addMutation.mutate(newEmail.trim());
        }}
      >
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="admin@othercompany.com"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Link organization
        </button>
      </form>
      {error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

// 6-digit PIN entry: numeric, masked, length-locked, mobile-friendly keypad.
function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={6}
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-center text-xl tracking-[0.5em] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
