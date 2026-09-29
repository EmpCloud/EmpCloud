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
import {
  ArrowLeft,
  Ban,
  Building2,
  Clock3,
  Eye,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  MoreVertical,
  PlayCircle,
  Plus,
  RotateCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
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

const RECENT_ACCESS_ACTIVITY = [
  { initials: "PP", name: "Priya Patel", location: "Kiosk Lobby - HQ", time: "Today, 10:24 AM", success: true, tone: "bg-sky-50 text-sky-600" },
  { initials: "AG", name: "Aman Gupta", location: "Factory Gate", time: "Today, 09:18 AM", success: true, tone: "bg-violet-50 text-violet-600" },
  { initials: "RS", name: "Rahul Sharma", location: "Warehouse", time: "Yesterday, 06:42 PM", success: false, tone: "bg-indigo-50 text-indigo-600" },
  { initials: "JS", name: "Jane Smith", location: "Office Floor 2", time: "Yesterday, 05:11 PM", success: true, tone: "bg-blue-50 text-blue-600" },
];

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
    <div className="mx-auto w-full max-w-[1680px]">
      <button
        type="button"
        onClick={() => navigate("/biometrics")}
        className="mb-4 inline-flex items-center gap-2 text-[13px] font-semibold text-slate-800 transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-slate-100"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4 text-brand-600" />
        {t("kioskPin.backToBiometrics")}
      </button>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-bold leading-tight tracking-tight text-slate-950 dark:text-white">{t("kioskPin.title")}</h1>
          <p className="mt-1 text-[14px] text-slate-600 dark:text-slate-300">{t("kioskPin.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById("pin-security-guidelines")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-slate-200"
        >
          <PlayCircle aria-hidden="true" className="h-4 w-4 text-brand-600" />
          {t("kioskPin.howItWorks", { defaultValue: "View How It Works" })}
        </button>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
            <span aria-hidden="true" className="absolute -right-8 top-20 h-36 w-52 rotate-[-12deg] rounded-[50%] bg-emerald-50 dark:bg-emerald-950/20" />
            <div className="relative flex items-start gap-5">
              <span className="inline-flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Fingerprint aria-hidden="true" className="h-10 w-10" />
              </span>
              <div className="min-w-0 flex-1 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-[18px] font-bold text-slate-950 dark:text-white">{t("kioskPin.title")}</h2>
                  <span className={status
                    ? "inline-flex rounded-full bg-emerald-50 px-4 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "inline-flex rounded-full bg-slate-100 px-4 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"}
                  >
                    {isLoading ? t("kioskPin.loading") : status ? t("kioskPin.enabled") : t("kioskPin.disabled")}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {status ? t("kioskPin.statusOnHint") : t("kioskPin.statusOffHint")}
                </p>
              </div>
            </div>

            <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {status ? (
                <>
                  <button
                    type="button"
                    onClick={() => { reset(); setMode("change"); }}
                    className="inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-card px-4 text-[13px] font-semibold text-slate-900 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:border-slate-700 dark:text-slate-100"
                  >
                    <KeyRound aria-hidden="true" className="h-5 w-5" />
                    {t("kioskPin.changePin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { reset(); setMode("disable"); }}
                    className="inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-rose-300 bg-card px-4 text-[13px] font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 dark:border-rose-900 dark:hover:bg-rose-950/30"
                  >
                    <ShieldOff aria-hidden="true" className="h-5 w-5" />
                    {t("kioskPin.disableBiometric")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { reset(); setMode("enable"); }}
                  disabled={isLoading}
                  className="inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:opacity-50 sm:col-span-2"
                >
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                  {t("kioskPin.enableBiometric")}
                </button>
              )}
            </div>

            <div id="pin-security-guidelines" className="relative mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <h3 className="flex items-center gap-3 text-[13px] font-bold text-slate-900 dark:text-slate-100">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-brand-600 dark:bg-blue-900/40">
                  <Shield aria-hidden="true" className="h-4 w-4" />
                </span>
                {t("kioskPin.securityGuidelines", { defaultValue: "PIN Security Guidelines" })}
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { Icon: LockKeyhole, title: "6-digit PIN", text: "Use a secure 6-digit PIN" },
                  { Icon: Ban, title: "Keep it private", text: "Do not share your PIN with anyone" },
                  { Icon: RotateCw, title: "Change regularly", text: "Update your PIN periodically" },
                ].map(({ Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100/80 text-brand-600 dark:bg-blue-900/40">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[12px] font-bold text-slate-900 dark:text-slate-100">{title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex h-12 items-center justify-between border-b border-border px-5">
              <h2 className="flex items-center gap-3 text-[15px] font-bold text-slate-950 dark:text-white">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-brand-600 dark:bg-blue-950/40">
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                </span>
                {t("kioskPin.recentActivity", { defaultValue: "Recent Access Activity" })}
              </h2>
              <button type="button" className="h-9 rounded-lg border border-border px-4 text-[11px] font-semibold text-slate-700 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-slate-200">
                {t("kioskPin.viewAll", { defaultValue: "View All" })}
              </button>
            </div>
            <ul className="divide-y divide-border px-5">
              {RECENT_ACCESS_ACTIVITY.map((activity) => (
                <li key={`${activity.name}-${activity.time}`} className="grid min-h-[51px] grid-cols-[minmax(0,1fr)_145px_90px_24px] items-center gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${activity.tone}`}>{activity.initials}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">{activity.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{activity.location}</p>
                    </div>
                  </div>
                  <time className="text-[11px] text-slate-500">{activity.time}</time>
                  <span className={activity.success
                    ? "inline-flex justify-center rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "inline-flex justify-center rounded-full bg-rose-50 px-3 py-1 text-[10px] font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"}
                  >
                    {activity.success ? "Success" : "Failed"}
                  </span>
                  <button type="button" aria-label={`More options for ${activity.name}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
                    <MoreVertical aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-5">
          <LivenessSettingsCard />
          <LinkedOrganizationsCard />
        </div>
      </div>

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && reset()}>
          <section role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 id="pin-dialog-title" className="text-lg font-bold text-foreground">
              {mode === "enable" && t("kioskPin.panelEnableTitle")}
              {mode === "change" && t("kioskPin.panelChangeTitle")}
              {mode === "disable" && t("kioskPin.panelDisableTitle")}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">{mode === "disable" ? t("kioskPin.panelDisableHint") : t("kioskPin.panelSetHint")}</p>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => { event.preventDefault(); setError(null); submitMutation.mutate(); }}
            >
              <PinField label={mode === "disable" ? t("kioskPin.currentPin") : t("kioskPin.pin")} value={pin} onChange={setPin} autoFocus />
              {mode !== "disable" && <PinField label={t("kioskPin.confirmPin")} value={confirmPin} onChange={setConfirmPin} />}
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={reset} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted">{t("kioskPin.cancel")}</button>
                <button type="submit" disabled={submitMutation.isPending} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50 ${mode === "disable" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"}`}>
                  {submitMutation.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                  {mode === "enable" && t("kioskPin.enable")}
                  {mode === "change" && t("kioskPin.updatePin")}
                  {mode === "disable" && t("kioskPin.disable")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

// Liveness settings card — the reference design uses a single immediate-save
// toggle. The API level is retained behind the scenes so existing settings are
// not lost when the control is switched off and back on.
// Backed by GET/PUT /api/v3/biometric/liveness-settings (migration 065
// added the columns to biometric_legacy_credentials). Defaults pulled
// from server: { enabled: false, level: "moderate" } when the row is
// new.
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
      return settings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (next: LivenessResp) => {
      const { data } = await v3.put<LegacyResponse<LivenessResp>>("/liveness-settings", {
        enabled: next.enabled,
        level: next.level,
      });
      if (data.code !== 200) throw new Error(data.message || t("kioskPin.errSaveLiveness"));
      return data.data;
    },
    onSuccess: (data) => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (data) {
        setEnabled(!!data.enabled);
        setLevel(normaliseLevel(data.level));
      }
      qc.invalidateQueries({ queryKey: ["biometric-liveness-settings"] });
    },
    onError: (err: any, attempted) => {
      setEnabled(!attempted.enabled);
      setError(err?.response?.data?.message || err?.message || t("kioskPin.errSaveLiveness"));
      qc.invalidateQueries({ queryKey: ["biometric-liveness-settings"] });
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-5">
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
          <Eye aria-hidden="true" className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold text-slate-950 dark:text-white">{t("kioskPin.livenessTitle")}</h2>
          <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{t("kioskPin.livenessDesc")}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center pt-2">
          <span className="sr-only">{t("kioskPin.enableLiveness")}</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={enabled}
            disabled={isLoading || saveMutation.isPending}
            onChange={(event) => {
              const nextEnabled = event.target.checked;
              const nextLevel = nextEnabled && level === "low" ? "moderate" : level;
              setEnabled(nextEnabled);
              setLevel(nextLevel);
              setError(null);
              saveMutation.mutate({ enabled: nextEnabled, level: nextLevel });
            }}
          />
          <span className="relative h-8 w-14 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:bg-slate-700">
            <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition ${enabled ? "translate-x-6" : "translate-x-0"}`} />
          </span>
        </label>
      </div>

      <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-4">
          <Shield aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h3 className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{t("kioskPin.whatItDoes", { defaultValue: "What it does" })}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              <li>{t("kioskPin.livenessBenefitOne", { defaultValue: "Detects real vs. fake face using blink and movement detection" })}</li>
              <li>{t("kioskPin.livenessBenefitTwo", { defaultValue: "Helps prevent photo or video spoofing" })}</li>
              <li>{t("kioskPin.livenessBenefitThree", { defaultValue: "Recommended for high-security environments" })}</li>
            </ul>
          </div>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {saved && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{t("kioskPin.livenessSaved")}</div>}
    </section>
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
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-5">
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <Link2 aria-hidden="true" className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold text-slate-950 dark:text-white">{t("kioskPin.linkedOrgsTitle")}</h2>
          <p className="mt-1 max-w-[590px] text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{t("kioskPin.linkedOrgsDesc")}</p>
        </div>
      </div>

      <form
        className="mt-5 rounded-xl border border-border bg-slate-50/60 p-4 dark:bg-slate-900/30"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (!newEmail.trim()) {
            setError(t("kioskPin.errEnterEmail"));
            return;
          }
          addMutation.mutate(newEmail.trim());
        }}
      >
        <label htmlFor="linked-organization-email" className="mb-2 block text-[12px] font-semibold text-slate-900 dark:text-slate-100">
          {t("kioskPin.addOrganization", { defaultValue: "Add an organization" })}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="linked-organization-email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="admin@othercompany.com"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:opacity-50"
          >
            {addMutation.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            {t("kioskPin.linkOrganization")}
          </button>
        </div>
        {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      </form>

      <div className="mt-4 min-h-[130px] rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <h3 className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
          {t("kioskPin.linkedOrgsTitle")} ({linked.length})
        </h3>
        {isLoading ? (
          <div className="flex min-h-[86px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("kioskPin.loading")}
          </div>
        ) : linked.length === 0 ? (
          <div className="flex min-h-[86px] flex-col items-center justify-center text-center">
            <Users aria-hidden="true" className="h-6 w-6 text-slate-500" />
            <p className="mt-2 text-[11px] font-semibold text-slate-900 dark:text-slate-100">{t("kioskPin.noOrgsLinked")}</p>
            <p className="mt-1 text-[10px] text-slate-500">{t("kioskPin.noOrgsLinkedHint", { defaultValue: "Add an organization to allow their employees to sign in at your kiosk devices." })}</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {linked.map((row) => (
              <li key={row.email} className="flex items-center justify-between rounded-lg border border-border bg-slate-50/70 px-3 py-2 dark:bg-slate-900/30">
                <div className="flex min-w-0 items-center gap-3">
                  <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-foreground">{row.email}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {row.organization_name || (row.organization_id == null ? t("kioskPin.userGone") : t("kioskPin.organizationN", { id: row.organization_id }))}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(row.email)}
                  disabled={removeMutation.isPending}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:opacity-50"
                  aria-label={t("kioskPin.unlinkAria", { email: row.email })}
                  title={t("kioskPin.unlink")}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
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
