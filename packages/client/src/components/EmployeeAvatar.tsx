// =============================================================================
// EMP CLOUD — EmployeeAvatar (#1650)
// =============================================================================
//
// One source of truth for rendering an employee's photo (or their initials
// fallback). Centralizing this here means:
//
// - Photos load via authenticated XHR + objectURL, not a raw <img src>. The
//   /api/v1/employees/:id/photo endpoint requires a Bearer token, which <img>
//   tags don't send. Earlier display sites (OrgChart, Feed) tried <img
//   src={photo_path}> with the raw filesystem path — those URLs 404'd and the
//   fallback initials were what users always saw. This was the real bug
//   behind issue #1650 ("All employees show colored circle with initials").
//
// - React Query caches the blob URL by user_id, so the same photo across
//   different cards is fetched once per session.
//
// - On 404 (no photo / file missing), we silently swallow and render initials
//   so a single "no-photo" user doesn't error-spam the console for everyone
//   else.

import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import api from "@/api/client";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, { box: string; text: string; icon: string }> = {
  xs: { box: "h-7 w-7",   text: "text-[10px]", icon: "h-3 w-3"   },
  sm: { box: "h-8 w-8",   text: "text-xs",     icon: "h-4 w-4"   },
  md: { box: "h-10 w-10", text: "text-sm",     icon: "h-4 w-4"   },
  lg: { box: "h-11 w-11", text: "text-xs",     icon: "h-5 w-5"   },
  xl: { box: "h-16 w-16", text: "text-xl",     icon: "h-6 w-6"   },
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  return `${(firstName?.[0] ?? "")}${(lastName?.[0] ?? "")}`.toUpperCase();
}

export function useEmployeePhoto(
  userId: number | null | undefined,
  hasPhoto: boolean | undefined,
) {
  return useQuery({
    queryKey: ["employee-photo", userId],
    queryFn: async () => {
      const res = await api.get(`/employees/${userId}/photo`, { responseType: "blob" });
      return URL.createObjectURL(res.data);
    },
    // Skip the request when the caller knows there's no photo. Pass `undefined`
    // (or omit) to make the call anyway and rely on 404 fallback — that's
    // useful for the auth user where we may not know whether they have a
    // photo cached on the AuthUser object yet.
    enabled: !!userId && hasPhoto !== false,
    retry: false,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 60 * 60 * 1000,    // 1 h
    // Convert 404s into a "no photo" outcome instead of a query error so the
    // component stays in a clean fallback state.
    throwOnError: false,
    refetchOnWindowFocus: false,
  });
}

type Props = {
  userId: number | null | undefined;
  hasPhoto?: boolean;
  /** True when /api/v3/biometric/face/:id.jpg has an enrolled image for
   *  this user. When set, the avatar uses that image directly (it's a
   *  public route — no auth header needed) and skips the authenticated
   *  v1 photo fetch entirely. Biometric face takes precedence over the
   *  manually-uploaded photo so the kiosk-verified image is the canonical
   *  display. */
  hasBiometricFace?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  size?: Size;
  className?: string;
  /** When set, shown as a colored ring around the avatar. */
  ring?: string;
};

export function EmployeeAvatar({
  userId,
  hasPhoto,
  hasBiometricFace,
  firstName,
  lastName,
  size = "md",
  className = "",
  ring,
}: Props) {
  const sz = SIZE_CLASSES[size];
  // Skip the v1 photo fetch entirely when we'll use the biometric URL —
  // saves the round-trip and keeps the avatar from briefly flashing the
  // manual photo before the biometric image loads.
  const { data: photoUrl, isError } = useEmployeePhoto(
    userId,
    hasBiometricFace ? false : hasPhoto,
  );
  const initials = getInitials(firstName, lastName);

  const baseClasses = `${sz.box} rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden`;
  const ringClasses = ring ? `ring-2 ${ring}` : "";

  if (hasBiometricFace && userId) {
    return (
      <div className={`${baseClasses} ${ringClasses} ${className}`}>
        <img
          src={`/api/v3/biometric/face/${userId}.jpg`}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (photoUrl && !isError) {
    return (
      <div className={`${baseClasses} ${ringClasses} ${className}`}>
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${ringClasses} bg-brand-100 text-brand-700 ${className}`}
    >
      {initials ? (
        <span className={`font-semibold ${sz.text}`}>{initials}</span>
      ) : (
        <User className={sz.icon} />
      )}
    </div>
  );
}
