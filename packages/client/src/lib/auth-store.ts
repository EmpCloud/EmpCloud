// =============================================================================
// EMP CLOUD — Auth Store (Zustand)
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { queryClient } from "@/main";

interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  org_id: number;
  org_name: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  login: (user: AuthUser, tokens: { access_token: string; refresh_token: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh }),

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      login: (user, tokens) => {
        // Purge any cached queries from a previous session on the same
        // browser — otherwise the new user briefly sees the old user's
        // attendance status, leave balances, notifications, etc.
        queryClient.clear();
        set({
          user,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
        });
      },

      logout: () => {
        queryClient.clear();
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },
    }),
    { name: "empcloud-auth" }
  )
);
