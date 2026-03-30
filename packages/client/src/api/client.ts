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
      console.warn(`[API ${status}] ${error.config?.method?.toUpperCase()} ${url}: ${msg}`);
    } else if (!error.response && error.message) {
      console.warn(`[API Network Error] ${error.config?.url}: ${error.message}`);
    }

    return Promise.reject(error);
  }
);

export default api;
