// =============================================================================
// EMP CLOUD — Self-service Biometric Kiosk PIN
//
// Lets a logged-in user enable / disable their personal biometric kiosk
// access and set / change their 6-digit secret PIN. Talks to the
// emp-monitor-parity routes at /api/v3/biometric/* (NOT the modern
// /api/v1/biometrics/* HR endpoints, which manage org-wide devices).
// =============================================================================
import { useState } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, ShieldCheck, ShieldOff, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
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
        <ArrowLeft className="h-4 w-4" /> Back to Biometrics
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Biometric Kiosk Access</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your personal 6-digit PIN used to sign in at biometric kiosk devices.
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
            <p className="text-sm font-medium text-gray-500">Status</p>
            <p className="text-lg font-semibold text-gray-900">
              {isLoading ? "Loading…" : status ? "Enabled" : "Disabled"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {status
                ? "You can sign in at any kiosk using your email and 6-digit PIN."
                : "Set a 6-digit PIN to enable biometric kiosk sign-in."}
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
              <ShieldCheck className="h-4 w-4" /> Enable Biometric
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
                <KeyRound className="h-4 w-4" /> Change PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setMode("disable");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <ShieldOff className="h-4 w-4" /> Disable Biometric
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline modal-ish panel — kept on-page (no Dialog) so the PIN entry
          stays close to the status card and the page remains keyboard-only
          friendly. */}
      {mode && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === "enable" && "Set a 6-digit PIN"}
            {mode === "change" && "Choose a new 6-digit PIN"}
            {mode === "disable" && "Confirm with your current PIN"}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {mode === "disable"
              ? "Type your existing 6-digit PIN to disable biometric kiosk sign-in."
              : "Use exactly 6 digits. Avoid easy-to-guess sequences (e.g. 123456)."}
          </p>

          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              submitMutation.mutate();
            }}
          >
            <PinField label={mode === "disable" ? "Current PIN" : "PIN"} value={pin} onChange={setPin} autoFocus />
            {mode !== "disable" && (
              <PinField
                label="Confirm PIN"
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 ${
                  mode === "disable" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "enable" && "Enable"}
                {mode === "change" && "Update PIN"}
                {mode === "disable" && "Disable"}
              </button>
            </div>
          </form>
        </div>
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
