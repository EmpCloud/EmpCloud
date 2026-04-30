// =============================================================================
// EMP CLOUD — Accept Invitation
//
// Lands here from the invitation email (?token=...). Shows a small form for
// the user to choose their first name, last name, and password, then POSTs
// to /api/v1/users/accept-invitation. On success, redirects to /login with
// a success toast so they can sign in with the credentials they just set.
//
// Public route — does NOT require authentication. Errors are surfaced
// inline; an expired/used token shows a clear "expired or already used"
// message instead of the generic axios fallback.
// =============================================================================

import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { showToast } from "@/components/ui/Toast";

const PASSWORD_MIN = 8;

interface InvitationInfo {
  email: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  is_existing_user: boolean;
}

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill state — fetched once on mount from the read-only invitation
  // info endpoint. info.is_existing_user differentiates the re-invite
  // path (lock the name inputs, name lives on the user record) from
  // greenfield invites (let the user type their name themselves).
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    axios
      .get("/api/v1/users/invitation-info", { params: { token }, signal: ctrl.signal })
      .then((r) => r.data?.data as InvitationInfo)
      .then((data) => {
        if (!data) return;
        setInfo(data);
        // Prefill if we have anything; user can still edit unless this
        // is the re-invite case where we lock the inputs below.
        if (data.first_name) setFirstName(data.first_name);
        if (data.last_name) setLastName(data.last_name);
      })
      .catch((err) => {
        // Surface the same "invalid / expired / used" message the submit
        // path uses. Network errors during prefill stay silent — the
        // submit will retry server-side validation.
        const status = err?.response?.status;
        const msg = err?.response?.data?.error?.message || "";
        if (status === 404 || /invitation/i.test(msg)) {
          setError(
            "This invitation link is invalid, has already been used, or has expired. Please ask your administrator to resend the invitation.",
          );
        }
      })
      .finally(() => setInfoLoading(false));
    return () => ctrl.abort();
  }, [token]);

  // Token must be present in the URL — without it there's nothing to accept.
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const namesLocked = !!info?.is_existing_user;
  // Only lock the last-name input when the system actually has a value
  // to lock. Otherwise (re-invite of a user with no last name on file)
  // the input would stay disabled AND validation would still demand a
  // value, making submit impossible.
  const lastNameLocked = !!info?.is_existing_user && !!info.last_name;

  function validate(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (password.length < PASSWORD_MIN) {
      return `Password must be at least ${PASSWORD_MIN} characters.`;
    }
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Public endpoint — no auth header. baseURL covers /api/v1 prefix
      // already used elsewhere; calling axios directly here keeps the
      // request out of the auth interceptor that would try to refresh a
      // missing access token.
      // Server destructures snake_case (route handler reads
      // { first_name, last_name }) — camelCase keys would be silently
      // dropped, falling back to the invitation's stored names which
      // are NULL when the admin invited by email only.
      await axios.post("/api/v1/users/accept-invitation", {
        token,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
      });
      showToast("success", "Invitation accepted. You can now sign in.");
      navigate("/login", { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error?.message || err?.message;
      // The backend returns NotFoundError with 'Invitation' or 'Invitation
      // has expired' messages. Translate those into something a user can act on.
      if (status === 404 || /invitation/i.test(msg || "")) {
        setError(
          "This invitation link is invalid, has already been used, or has expired. Please ask your administrator to resend the invitation.",
        );
      } else {
        setError(msg || "Could not accept invitation. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/empcloud-logo.png" alt="EmpCloud" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Accept your invitation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set your name and password to activate your EMP Cloud account.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5"
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          {infoLoading && (
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading invitation…
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                autoFocus={!namesLocked}
                disabled={namesLocked}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                placeholder="Ada"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                disabled={lastNameLocked}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          {namesLocked && (
            <p className="text-xs text-gray-500">
              Your name is on file with {info?.org_name || "your organization"}. Contact your HR admin if it needs to change.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder={`At least ${PASSWORD_MIN} characters`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="Type the same password again"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Activating account..." : "Accept invitation & sign in"}
          </button>

          <p className="text-xs text-gray-500 text-center">
            Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
