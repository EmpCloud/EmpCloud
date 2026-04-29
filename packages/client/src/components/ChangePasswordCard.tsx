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
import { useMutation } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

const PASSWORD_MIN = 8;

function validate(curr: string, next: string, confirm: string): string | null {
  if (!curr) return "Enter your current password.";
  if (next.length < PASSWORD_MIN) return `New password must be at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Z]/.test(next)) return "New password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(next)) return "New password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(next)) return "New password must contain at least one digit.";
  if (!/[^A-Za-z0-9]/.test(next)) return "New password must contain at least one special character.";
  if (next === curr) return "New password must be different from the current password.";
  if (next !== confirm) return "Passwords do not match.";
  return null;
}

export default function ChangePasswordCard() {
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
      showToast("success", "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setError(null);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        "Could not update password.";
      setError(msg);
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <KeyRound className="h-5 w-5 text-brand-600" />
        <div>
          <h2 className="font-semibold text-gray-900">Change Password</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Use a password you don't reuse anywhere else. Must be 8+ characters with upper, lower, digit, and a special character.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = validate(currentPassword, newPassword, confirm);
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
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((s) => !s)}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          show={showNew}
          onToggleShow={() => setShowNew((s) => !s)}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={showNew}
          onToggleShow={() => setShowNew((s) => !s)}
          autoComplete="new-password"
        />

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
        )}

        <button
          type="submit"
          disabled={change.isPending}
          className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {change.isPending ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
