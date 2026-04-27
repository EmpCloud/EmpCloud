// =============================================================================
// useAttendancePolicy — fetches /attendance/me/policy and exposes channel checks.
//
// The signed-in user's effective policy (resolved server-side from the org
// settings + any active per-user override). Pages that surface a check-in /
// check-out button consult this hook so the button hides when the relevant
// channel ('dashboard' for the web UI) isn't allowed for the user.
//
// Cached for 60s — admins don't change settings every minute, and any user
// trying to check in always sees a fresh fetch on page mount via react-query.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";

type Channel = "dashboard" | "biometric" | "app";

export interface AttendancePolicy {
  organization_id: number;
  user_id: number;
  effective_date: string;
  allowed_channels: Channel[];
  geofence_advisory: boolean;
  source: "org" | "override";
  override_id: number | null;
  geofences: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
  }>;
}

export function useAttendancePolicy() {
  const query = useQuery({
    queryKey: ["attendance-me-policy"],
    queryFn: () =>
      api
        .get("/attendance/me/policy")
        .then((r) => r.data.data as AttendancePolicy)
        // Fail open: if the policy lookup itself errors out (e.g. transient
        // 5xx on the server) we don't want to lock the user out of clocking
        // in. The server will still enforce the channel guard on the actual
        // check-in request, so the worst case is a single 403 toast.
        .catch(() => null),
    staleTime: 60_000,
  });

  const dashboardAllowed =
    query.data == null ? true : query.data.allowed_channels.includes("dashboard");

  return {
    policy: query.data ?? null,
    isLoading: query.isLoading,
    dashboardAllowed,
    isChannelAllowed: (channel: Channel) =>
      query.data == null ? true : query.data.allowed_channels.includes(channel),
  };
}
