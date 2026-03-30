// =============================================================================
// EMP CLOUD — API Client (Axios)
// =============================================================================

import axios from "axios";
import { useAuthStore } from "@/lib/auth-store";

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

// Handle 401 — attempt token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
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
          refreshPromise = null;
          useAuthStore.getState().logout();
          window.location.href = "/login";
        }
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
