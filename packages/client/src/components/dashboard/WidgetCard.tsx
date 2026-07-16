// =============================================================================
// EMP CLOUD — Dashboard Widget Card
// Reusable card for displaying module summary metrics.
// =============================================================================

import type { LucideIcon } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/auth-store";
import axios from "axios";

// ---------------------------------------------------------------------------
// Color presets
// ---------------------------------------------------------------------------

// Tinted module cards: each colour carries a dark: variant so the light tint
// (bg-X-50 / dark header text) doesn't stay bright-on-dark in dark mode. In
// dark mode we use a deep translucent tint, lighter icon/header text, and a
// darker border.
const colorMap: Record<string, { bg: string; icon: string; border: string; header: string }> = {
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    icon: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-200 dark:border-indigo-900",
    header: "text-indigo-900 dark:text-indigo-200",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950/40",
    icon: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-900",
    header: "text-green-900 dark:text-green-200",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    icon: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900",
    header: "text-amber-900 dark:text-amber-200",
  },
  rose: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    icon: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-900",
    header: "text-rose-900 dark:text-rose-200",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    icon: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
    header: "text-blue-900 dark:text-blue-200",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    icon: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-900",
    header: "text-purple-900 dark:text-purple-200",
  },
  cyan: {
    bg: "bg-cyan-50 dark:bg-cyan-950/40",
    icon: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-200 dark:border-cyan-900",
    header: "text-cyan-900 dark:text-cyan-200",
  },
};

// ---------------------------------------------------------------------------
// Stat sub-component
// ---------------------------------------------------------------------------

export function Stat({ label, value }: { label: string; value?: string | number | null }) {
  const display = value === undefined || value === null ? "--" : value;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{display}</span>
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
        <div className="h-9 w-9 rounded-lg bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-3 w-10 rounded bg-muted" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-3 w-8 rounded bg-muted" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

function WidgetOffline({ title, icon: Icon, color: _color = "indigo" }: {
  title: string;
  icon: LucideIcon;
  color?: string;
}) {
  void _color;
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-muted p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-muted-foreground">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground text-center py-4">{t('dashboard.moduleOffline')}</p>
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
  const { t } = useTranslation();
  const c = colorMap[color] || colorMap.indigo;

  if (isLoading) return <WidgetSkeleton color={color} />;
  if (isOffline) return <WidgetOffline title={title} icon={Icon} color={color} />;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 transition-shadow hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-9 w-9 rounded-lg bg-card/80 flex items-center justify-center shadow-sm`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <h3 className={`font-semibold ${c.header}`}>{title}</h3>
      </div>

      {/* Metrics */}
      <div className="divide-y divide-gray-200/60">{children}</div>

      {/* View Details link — refreshes token then launches with SSO */}
      {moduleUrl && (
        <button
          // Opens the module in a new tab (SSO) — announce that to screen
          // readers (WCAG 3.2.5); the icon is decorative.
          aria-label={`${t('dashboard.viewDetails')} — ${title} (${t('dashboard.opensInNewTab')})`}
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
          {t('dashboard.viewDetails')} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
