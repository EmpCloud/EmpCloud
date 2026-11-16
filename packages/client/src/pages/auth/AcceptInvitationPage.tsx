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
import { useTranslation } from "react-i18next";
import axios from "axios";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
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
  const { t } = useTranslation();
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
          setError(t("acceptInvitation.errors.invalidToken"));
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
    if (!firstName.trim()) return t("acceptInvitation.validation.firstNameRequired");
    if (!lastName.trim()) return t("acceptInvitation.validation.lastNameRequired");
    if (password.length < PASSWORD_MIN) {
      return t("acceptInvitation.validation.passwordTooShort", { count: PASSWORD_MIN });
    }
    if (password !== confirm) return t("acceptInvitation.validation.passwordsDoNotMatch");
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
      showToast("success", t("acceptInvitation.toast.success"));
      navigate("/login", { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error?.message || err?.message;
      // The backend returns NotFoundError with 'Invitation' or 'Invitation
      // has expired' messages. Translate those into something a user can act on.
      if (status === 404 || /invitation/i.test(msg || "")) {
        setError(t("acceptInvitation.errors.invalidToken"));
      } else {
        setError(msg || t("acceptInvitation.errors.genericFailure"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageShell
      title={t("acceptInvitation.heading")}
      description={t("acceptInvitation.subheading")}
    >
        <form
          onSubmit={onSubmit}
          className="space-y-5"
          aria-busy={submitting || infoLoading}
        >
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>
          )}

          {infoLoading && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> {t("acceptInvitation.loadingInvitation")}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="invitation-first-name" className="mb-1.5 block text-[13px] font-medium text-foreground">{t("acceptInvitation.form.firstNameLabel")}</label>
              <input
                id="invitation-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                disabled={namesLocked}
                className="h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                placeholder={t("acceptInvitation.form.firstNamePlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="invitation-last-name" className="mb-1.5 block text-[13px] font-medium text-foreground">{t("acceptInvitation.form.lastNameLabel")}</label>
              <input
                id="invitation-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                disabled={lastNameLocked}
                className="h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
          </div>
          {namesLocked && (
            <p className="text-xs text-muted-foreground">
              {t("acceptInvitation.form.namesLockedNote", {
                org: info?.org_name || t("acceptInvitation.form.orgFallback"),
              })}
            </p>
          )}

          <div>
            <label htmlFor="invitation-password" className="mb-1.5 block text-[13px] font-medium text-foreground">{t("acceptInvitation.form.passwordLabel")}</label>
            <div className="relative">
              <input
                id="invitation-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10 w-full rounded-md border border-border bg-card px-3 pr-11 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder={t("acceptInvitation.form.passwordPlaceholder", { count: PASSWORD_MIN })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={showPassword ? t("acceptInvitation.form.hidePasswordAria") : t("acceptInvitation.form.showPasswordAria")}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="invitation-password-confirm" className="mb-1.5 block text-[13px] font-medium text-foreground">{t("acceptInvitation.form.confirmPasswordLabel")}</label>
            <input
              id="invitation-password-confirm"
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder={t("acceptInvitation.form.confirmPasswordPlaceholder")}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {submitting ? t("acceptInvitation.form.submitting") : t("acceptInvitation.form.submit")}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            {t("acceptInvitation.form.alreadyHaveAccount")} <Link to="/login" className="rounded-sm font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400">{t("acceptInvitation.form.signInLink")}</Link>
          </p>
        </form>
    </AuthPageShell>
  );
}
