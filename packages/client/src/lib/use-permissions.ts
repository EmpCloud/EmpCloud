// =============================================================================
// EMP CLOUD — usePermissions hook
// Reads the `permissions: string[]` claim from the current access-token JWT.
// No network call — the JWT already carries the resolved permission set
// (computed by the server at login + every refresh, see issueTokens()).
//
// Re-derives whenever the access token changes. Returns an empty array if
// the user isn't logged in or the token doesn't carry the claim (legacy
// pre-RBAC tokens).
// =============================================================================

import { useMemo } from "react";
import { useAuthStore } from "./auth-store";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function usePermissions(): {
  permissions: Set<string>;
  has: (...keys: string[]) => boolean;
  hasAll: (...keys: string[]) => boolean;
  isSuperAdmin: boolean;
} {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userRole = useAuthStore((s) => s.user?.role);

  return useMemo(() => {
    const isSuperAdmin = userRole === "super_admin";
    const permissions = new Set<string>();
    if (accessToken) {
      const payload = decodeJwtPayload(accessToken);
      const perms = payload?.permissions;
      if (Array.isArray(perms)) {
        for (const p of perms) {
          if (typeof p === "string") permissions.add(p);
        }
      }
    }
    return {
      permissions,
      // super_admin bypasses permission checks; aligns with server middleware.
      has: (...keys: string[]) =>
        isSuperAdmin || keys.some((k) => permissions.has(k)),
      hasAll: (...keys: string[]) =>
        isSuperAdmin || keys.every((k) => permissions.has(k)),
      isSuperAdmin,
    };
  }, [accessToken, userRole]);
}
