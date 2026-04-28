// =============================================================================
// EMP CLOUD — API Client (Axios)
// =============================================================================

import axios from "axios";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mutex for token refresh — prevents concurrent 401s from triggering multiple refreshes
let refreshPromise: Promise<string> | null = null;

// Cascade guard: when many in-flight requests all 401 at once because the
// access token just expired, we only want to log out / show one toast / do
// one redirect — not N. Reset whenever a real login happens.
let forceLogoutInFlight = false;

/**
 * Hard logout used when the session is no longer recoverable (no refresh
 * token, refresh attempt failed, or auth interceptor decided the user is
 * gone). Clears auth state, surfaces a one-shot toast, and redirects to
 * the login page with `?session=expired` so LoginPage can render a
 * friendly explanation instead of a blank form.
 *
 * Idempotent within one tab: subsequent calls during the same expiry
 * cascade are no-ops. The full page reload via window.location.replace()
 * resets every in-flight axios request and react-query cache — exactly
 * what we want for a forced logout (no chance of leaking stale data
 * into the next session).
 */
function forceLogout() {
  if (forceLogoutInFlight) return;
  forceLogoutInFlight = true;

  try {
    useAuthStore.getState().logout();
  } catch {
    /* logout failure shouldn't block the redirect */
  }

  // Suppress the toast + redirect when the user is already on /login or
  // a public auth route — they don't need either.
  const path = window.location.pathname;
  const onAuthRoute =
    path === "/login" ||
    path === "/register" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path === "/accept-invitation";

  if (onAuthRoute) {
    forceLogoutInFlight = false;
    return;
  }

  try {
    showToast("error", "Your session has expired. Please sign in again.");
  } catch {
    /* if the toast helper isn't mounted yet, skip — the redirect is the
       authoritative signal */
  }

  // Use replace so the back button doesn't return to a now-broken page.
  window.location.replace("/login?session=expired");
}

// Endpoints that mint or revoke tokens directly. They reject with 401 to
// signal "wrong credentials" or "expired/invalid token" — both of which are
// terminal for the request and must NOT trigger a refresh-then-retry. Without
// this guard the LoginPage 401 would attempt a refresh against any stale
// refresh_token in localStorage; if that refresh failed we fell through to
// `window.location.href = "/login"`, which reloaded the page and silently
// wiped the user's just-typed credentials and the inline error message
// (#1638). The user saw a button click that "did nothing".
const AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/auth/sso"];
const isAuthEndpoint = (url?: string) => !!url && AUTH_ENDPOINTS.some((p) => url.includes(p));

// Handle 401 — attempt token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest?.url)
    ) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (refreshToken) {
        try {
          // If a refresh is already in-flight, reuse its promise
          if (!refreshPromise) {
            refreshPromise = axios
              .post("/oauth/token", {
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: "empcloud-dashboard",
              })
              .then(({ data }) => {
                useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
                return data.access_token as string;
              })
              .finally(() => {
                refreshPromise = null;
              });
          }

          const newAccessToken = await refreshPromise;
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh itself failed (refresh token expired / revoked / server
          // rejected). Session is unrecoverable — kick the user out cleanly.
          refreshPromise = null;
          forceLogout();
          return Promise.reject(error);
        }
      } else {
        // 401 with no refresh token to try. Most commonly happens when the
        // user's localStorage was wiped, the access token was invalidated
        // server-side (deactivation, password change), or this tab's auth
        // state went out of sync with another tab. Same outcome either way:
        // log out and surface a useful message.
        forceLogout();
        return Promise.reject(error);
      }
    }

    // Log errors to console for debugging — don't show toast for background API calls
    // Toasts should only be shown by the calling component for user-initiated actions
    if (error.response && error.response.status !== 401) {
      const status = error.response.status;
      const url = error.config?.url || "unknown";
      const msg = error.response.data?.error?.message || error.response.data?.message || "";
      const errorSummary = `[API ${status}] ${error.config?.method?.toUpperCase()} ${url}: ${msg}`;
      console.warn(errorSummary);

      // Forward to server for Log Dashboard (skip if this IS the client-error endpoint)
      if (!url.includes("client-error")) {
        fetch("/api/v1/logs/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: errorSummary,
            url: window.location.href,
            component: `API ${error.config?.method?.toUpperCase()} ${url}`,
            level: status >= 500 ? "error" : "warn",
            userId: useAuthStore.getState().user?.id || null,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } else if (!error.response && error.message) {
      const errorSummary = `[API Network Error] ${error.config?.url}: ${error.message}`;
      console.warn(errorSummary);

      // Forward network errors to server
      if (!error.config?.url?.includes("client-error")) {
        fetch("/api/v1/logs/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: errorSummary,
            url: window.location.href,
            component: `API Network ${error.config?.url}`,
            level: "error",
            userId: useAuthStore.getState().user?.id || null,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    }

    return Promise.reject(error);
  }
);

export default api;
