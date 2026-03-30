// =============================================================================
// EMP CLOUD — Dashboard Widget Card
// Reusable card for displaying module summary metrics.
// =============================================================================

import type { LucideIcon } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import axios from "axios";

// ---------------------------------------------------------------------------
// Color presets
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; icon: string; border: string; header: string }> = {
  indigo: {
    bg: "bg-indigo-50",
    icon: "text-indigo-600",
    border: "border-indigo-200",
    header: "text-indigo-900",
  },
  green: {
    bg: "bg-green-50",
    icon: "text-green-600",
    border: "border-green-200",
    header: "text-green-900",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    border: "border-amber-200",
    header: "text-amber-900",
  },
  rose: {
    bg: "bg-rose-50",
    icon: "text-rose-600",
    border: "border-rose-200",
    header: "text-rose-900",
  },
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    border: "border-blue-200",
    header: "text-blue-900",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    border: "border-purple-200",
    header: "text-purple-900",
  },
  cyan: {
    bg: "bg-cyan-50",
    icon: "text-cyan-600",
    border: "border-cyan-200",
    header: "text-cyan-900",
  },
};

// ---------------------------------------------------------------------------
// Stat sub-component
// ---------------------------------------------------------------------------

export function Stat({ label, value }: { label: string; value?: string | number | null }) {
  const display = value === undefined || value === null ? "--" : value;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{display}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function WidgetSkeleton({ color = "indigo" }: { color?: string }) {
  const c = colorMap[color] || colorMap.indigo;
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 animate-pulse`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-gray-200" />
        <div className="h-4 w-24 rounded bg-gray-200" />
      </div>
      <div className="space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-gray-200" />
          <div className="h-3 w-10 rounded bg-gray-200" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-3 w-8 rounded bg-gray-200" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="h-3 w-12 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

function WidgetOffline({ title, icon: Icon, color = "indigo" }: {
  title: string;
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-400" />
        </div>
        <h3 className="font-semibold text-gray-400">{title}</h3>
      </div>
      <p className="text-sm text-gray-400 text-center py-4">Module offline</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WidgetCard
// ---------------------------------------------------------------------------

interface WidgetCardProps {
  title: string;
  icon: LucideIcon;
  color?: string;
  moduleUrl?: string;
  isLoading?: boolean;
  isOffline?: boolean;
  children: React.ReactNode;
}

export default function WidgetCard({
  title,
  icon: Icon,
  color = "indigo",
  moduleUrl,
  isLoading,
  isOffline,
  children,
}: WidgetCardProps) {
  const c = colorMap[color] || colorMap.indigo;

  if (isLoading) return <WidgetSkeleton color={color} />;
  if (isOffline) return <WidgetOffline title={title} icon={Icon} color={color} />;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 transition-shadow hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-9 w-9 rounded-lg bg-white/80 flex items-center justify-center shadow-sm`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <h3 className={`font-semibold ${c.header}`}>{title}</h3>
      </div>

      {/* Metrics */}
      <div className="divide-y divide-gray-200/60">{children}</div>

      {/* View Details link — refreshes token then launches with SSO */}
      {moduleUrl && (
        <button
          onClick={async () => {
            let token = useAuthStore.getState().accessToken || "";
            const refreshToken = useAuthStore.getState().refreshToken;
            if (refreshToken) {
              try {
                const { data } = await axios.post("/oauth/token", {
                  grant_type: "refresh_token",
                  refresh_token: refreshToken,
                  client_id: "empcloud-dashboard",
                });
                if (data.access_token) {
                  useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
                  token = data.access_token;
                }
              } catch {
                // Use existing token — backend has a grace period
              }
            }
            const returnUrl = encodeURIComponent(`${window.location.origin}/dashboard`);
            const ssoUrl = `${moduleUrl}?sso_token=${encodeURIComponent(token)}&return_url=${returnUrl}`;
            window.open(ssoUrl, "_blank", "noopener,noreferrer");
          }}
          className={`mt-4 flex items-center gap-1.5 text-xs font-medium ${c.icon} hover:underline`}
        >
          View Details <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
