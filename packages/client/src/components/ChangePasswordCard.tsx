// =============================================================================
// EMP CLOUD — Change Password Card
//
// Self-service password change for any signed-in user (employee, HR, admin).
// Hits POST /api/v1/auth/change-password which already requires the current
// password and applies the same complexity rules the shared
// changePasswordSchema enforces (8+ chars, upper, lower, digit, special).
//
// Used by:
//   - The standalone /change-password page (visible to all roles)
//   - The HR /settings page as an embedded "Security" card
// =============================================================================

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

const PASSWORD_MIN = 8;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function validate(t: TFn, curr: string, next: string, confirm: string): string | null {
  if (!curr) return t("accountSecurity.errors.currentRequired");
  if (next.length < PASSWORD_MIN) return t("accountSecurity.errors.minLength", { min: PASSWORD_MIN });
  if (!/[A-Z]/.test(next)) return t("accountSecurity.errors.upper");
  if (!/[a-z]/.test(next)) return t("accountSecurity.errors.lower");
  if (!/[0-9]/.test(next)) return t("accountSecurity.errors.digit");
  if (!/[^A-Za-z0-9]/.test(next)) return t("accountSecurity.errors.special");
  if (next === curr) return t("accountSecurity.errors.sameAsCurrent");
  if (next !== confirm) return t("accountSecurity.errors.mismatch");
  return null;
}

export default function ChangePasswordCard() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      api
        .post("/auth/change-password", {
          current_password: currentPassword,
          new_password: newPassword,
        })
        .then((r) => r.data),
    onSuccess: () => {
      showToast("success", t("accountSecurity.updated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setError(null);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        t("accountSecurity.errors.updateFailed");
      setError(msg);
    },
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <KeyRound className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <div>
          <h2 className="font-semibold text-foreground">{t("accountSecurity.changePassword")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("accountSecurity.hint")}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = validate(t, currentPassword, newPassword, confirm);
          if (v) {
            setError(v);
            return;
          }
          setError(null);
          change.mutate();
        }}
        className="space-y-4 max-w-md"
      >
        <PasswordField
          label={t("accountSecurity.currentPassword")}
          showLabel={t("accountSecurity.showPassword")}
          hideLabel={t("accountSecurity.hidePassword")}
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((s) => !s)}
          autoComplete="current-password"
        />
        <PasswordField
          label={t("accountSecurity.newPassword")}
          showLabel={t("accountSecurity.showPassword")}
          hideLabel={t("accountSecurity.hidePassword")}
          value={newPassword}
          onChange={setNewPassword}
          show={showNew}
          onToggleShow={() => setShowNew((s) => !s)}
          autoComplete="new-password"
        />
        <PasswordField
          label={t("accountSecurity.confirmPassword")}
          showLabel={t("accountSecurity.showPassword")}
          hideLabel={t("accountSecurity.hidePassword")}
          value={confirm}
          onChange={setConfirm}
          show={showNew}
          onToggleShow={() => setShowNew((s) => !s)}
          autoComplete="new-password"
        />

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>
        )}

        <button
          type="submit"
          disabled={change.isPending}
          className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {change.isPending ? t("accountSecurity.updating") : t("accountSecurity.updatePassword")}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  showLabel,
  hideLabel,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
}: {
  label: string;
  showLabel: string;
  hideLabel: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="bg-card text-foreground w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-muted-foreground"
          aria-label={show ? hideLabel : showLabel}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
