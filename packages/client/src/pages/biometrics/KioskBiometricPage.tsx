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
      if (!isSixDigits(pin)) throw new Error(t("kioskPin.errSixDigits"));
      if (mode !== "disable" && pin !== confirmPin) throw new Error(t("kioskPin.errMismatch"));

      if (mode === "enable") {
        const { data } = await v3.post<LegacyResponse>("/enable-biometric", {
          secretKey: pin,
          status: 1,
        });
        if (data.code !== 200) throw new Error(data.message || t("kioskPin.errEnable"));
        return;
      }
      if (mode === "disable") {
        const { data } = await v3.post<LegacyResponse>("/enable-biometric", {
          secretKey: pin,
          status: 0,
        });
        if (data.code !== 200) throw new Error(data.message || t("kioskPin.errDisable"));
        return;
      }
      // change
      const { data } = await v3.post<LegacyResponse>("/set-password", {
        secretKey: pin,
      });
      if (data.code !== 200) throw new Error(data.message || t("kioskPin.errUpdate"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biometric-kiosk-status"] });
      reset();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || t("kioskPin.errGeneric"));
    },
  });

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={() => navigate("/biometrics")}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("kioskPin.backToBiometrics")}
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("kioskPin.title")}</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {t("kioskPin.subtitle")}
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
              status ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"
            }`}
          >
            <Fingerprint className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-muted-foreground">{t("kioskPin.status")}</p>
            <p className="text-lg font-semibold text-foreground">
              {isLoading ? t("kioskPin.loading") : status ? t("kioskPin.enabled") : t("kioskPin.disabled")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
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
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
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
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <KeyRound className="h-4 w-4" /> {t("kioskPin.changePin")}
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setMode("disable");
                }}
                className="inline-flex items-center gap-2 rounded-md border border-red-300 dark:border-red-900 bg-card px-4 py-2 text-[13px] font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
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
        <div className="mt-6 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "enable" && t("kioskPin.panelEnableTitle")}
            {mode === "change" && t("kioskPin.panelChangeTitle")}
            {mode === "disable" && t("kioskPin.panelDisableTitle")}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
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
              <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                {t("kioskPin.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium text-white shadow-sm disabled:opacity-50 ${
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
  const { t } = useTranslation();
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
      if (data.code !== 200) throw new Error(data.message || t("kioskPin.errSaveLiveness"));
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
      setError(err?.response?.data?.message || err?.message || t("kioskPin.errSaveLiveness"));
    },
  });

  const dirty =
    !!baseline && (baseline.enabled !== enabled || baseline.level !== level);

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
          <Eye className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("kioskPin.livenessTitle")}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("kioskPin.livenessDesc")}
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="mt-5 flex items-center justify-between rounded-md border border-border bg-muted px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">{t("kioskPin.enableLiveness")}</p>
          <p className="text-[11px] text-muted-foreground">
            {isLoading ? t("kioskPin.loading") : enabled ? t("kioskPin.livenessOnHint") : t("kioskPin.livenessOffHint")}
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
          <span className="relative h-6 w-11 rounded-full bg-muted transition peer-checked:bg-brand-600 peer-disabled:opacity-50">
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
        </label>
      </div>

      {/* Level slider — only shown when enabled. Three discrete stops
          (Low / Moderate / High) on a native range input so it works
          on touch devices without an extra component. */}
      {enabled && <LivenessLevelSlider level={level} onChange={setLevel} disabled={isLoading || saveMutation.isPending} />}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>
      )}
      {saved && (
        <div className="mt-3 rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-[13px] text-green-700 dark:text-green-300">
          {t("kioskPin.livenessSaved")}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || isLoading || saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("kioskPin.save")}
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
const LIVENESS_LEVELS: Array<{ value: LivenessLevel; labelKey: string; descKey: string; cls: string }> = [
  { value: "low", labelKey: "kioskPin.levelLow", descKey: "kioskPin.levelLowDesc", cls: "text-green-700 dark:text-green-300" },
  { value: "moderate", labelKey: "kioskPin.levelModerate", descKey: "kioskPin.levelModerateDesc", cls: "text-amber-700 dark:text-amber-300" },
  { value: "high", labelKey: "kioskPin.levelHigh", descKey: "kioskPin.levelHighDesc", cls: "text-red-700 dark:text-red-300" },
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
  const { t } = useTranslation();
  const idx = Math.max(0, LIVENESS_LEVELS.findIndex((l) => l.value === level));
  const current = LIVENESS_LEVELS[idx] || LIVENESS_LEVELS[1];
  return (
    <div className="mt-3 rounded-md border border-border bg-card px-4 py-4">
      <div className="flex items-baseline justify-between">
        <label className="block text-[13px] font-medium text-foreground" htmlFor="liveness-level-slider">
          {t("kioskPin.sensitivityLevel")}
        </label>
        <span className={`text-[13px] font-semibold ${current.cls}`}>{t(current.labelKey)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t(current.descKey)}</p>

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
                i === idx ? `font-semibold ${l.cls}` : "text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {t(l.labelKey)}
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
  const { t } = useTranslation();
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
      if (data.code !== 200) throw new Error(data.message || t("kioskPin.errAddOrg"));
    },
    onSuccess: () => {
      setNewEmail("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["biometric-linked-orgs"] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || t("kioskPin.errAddOrg"));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data } = await v3.delete<LegacyResponse>(`/linked-organizations/${encodeURIComponent(email)}`);
      if (data.code !== 200) throw new Error(data.message || t("kioskPin.errRemoveOrg"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biometric-linked-orgs"] }),
  });

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
          <Link2 className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("kioskPin.linkedOrgsTitle")}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("kioskPin.linkedOrgsDesc")}
          </p>
        </div>
      </div>

      {/* Existing links */}
      <div className="mt-5 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("kioskPin.loading")}
          </div>
        ) : linked.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("kioskPin.noOrgsLinked")}</p>
        ) : (
          linked.map((row) => (
            <div
              key={row.email}
              className="flex items-center justify-between rounded-md border border-border bg-muted px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{row.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {row.organization_name
                      ? row.organization_name
                      : row.organization_id == null
                        ? t("kioskPin.userGone")
                        : t("kioskPin.organizationN", { id: row.organization_id })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeMutation.mutate(row.email)}
                disabled={removeMutation.isPending}
                className="text-muted-foreground hover:text-red-600 p-1 rounded disabled:opacity-50"
                aria-label={t("kioskPin.unlinkAria", { email: row.email })}
                title={t("kioskPin.unlink")}
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
            setError(t("kioskPin.errEnterEmail"));
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
          className="flex-1 rounded-md border border-border bg-card text-foreground px-3 py-2 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("kioskPin.linkOrganization")}
        </button>
      </form>
      {error && (
        <div className="mt-2 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>
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
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
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
        className="w-40 rounded-md border border-border px-3 py-2 text-center text-xl tracking-[0.5em] text-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
