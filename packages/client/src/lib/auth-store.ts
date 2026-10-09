// =============================================================================
// EMP CLOUD — Auth Store (Zustand)
// =============================================================================

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { queryClient } from "@/main";

const AUTH_STORAGE_NAME = "empcloud-auth";
const AUTH_STORAGE_MODE = "empcloud-auth-storage-mode";

const authStorage: StateStorage = {
  getItem: (name) =>
    sessionStorage.getItem(name) ?? localStorage.getItem(name),
  setItem: (name, value) => {
    const useSessionStorage =
      sessionStorage.getItem(AUTH_STORAGE_MODE) === "session";
    const target = useSessionStorage ? sessionStorage : localStorage;
    const fallback = useSessionStorage ? localStorage : sessionStorage;

    target.setItem(name, value);
    fallback.removeItem(name);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

export function setAuthPersistence(remember: boolean) {
  if (remember) {
    sessionStorage.removeItem(AUTH_STORAGE_MODE);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_MODE, "session");
  }
}

export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  org_id: number;
  org_name: string;
  payment_restricted?: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  setPaymentRestriction: (restricted: boolean) => void;
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

      setPaymentRestriction: (restricted) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, payment_restricted: restricted }
            : state.user,
        })),

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
    {
      name: AUTH_STORAGE_NAME,
      storage: createJSONStorage(() => authStorage),
    }
  )
);
