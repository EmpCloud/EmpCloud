import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Package,
  UserCheck,
  Box,
  Wrench,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  Archive,
} from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  created: "text-green-600 dark:text-green-400",
  assigned: "text-blue-600 dark:text-blue-400",
  returned: "text-purple-600 dark:text-purple-400",
  sent_to_repair: "text-yellow-600 dark:text-yellow-400",
  repaired: "text-yellow-600 dark:text-yellow-400",
  retired: "text-muted-foreground",
  lost: "text-red-600 dark:text-red-400",
  found: "text-green-600 dark:text-green-400",
  damaged: "text-orange-600 dark:text-orange-400",
  updated: "text-indigo-600 dark:text-indigo-400",
};

function useDashboard() {
  return useQuery({
    queryKey: ["asset-dashboard"],
    queryFn: () => api.get("/assets/dashboard").then((r) => r.data.data),
  });
}

export default function AssetDashboardPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("assetDashboard.loading")}</div>
      </div>
    );
  }

  if (!stats) return null;

  // #1531 — Each card deep-links into /assets with the matching status filter
  // preselected. AssetListPage reads `?status=<v>` from the URL on mount.
  // "Lost / Damaged" is a combined card but the list currently only filters on
  // a single status — link to lost as the default; user can swap to damaged
  // from the dropdown. A "multi-status" filter is a follow-up.
  //
  // #1640 — Surface Retired so the headline cards reconcile with Total. The
  // status enum is fixed to {available, assigned, in_repair, retired, lost,
  // damaged}; without a Retired card a tenant whose inventory has been mostly
  // retired (e.g. 30 of 33) saw "33 total / 0 / 1 / 0 / 2" and could not
  // explain the missing 30. A small "Unaccounted" badge below catches any
  // future status drift (e.g. a new enum value the UI doesn't know about yet).
  const statCards = [
    { label: t("assetDashboard.totalAssets"), value: stats.total, icon: Package, color: "text-foreground bg-muted", to: "/assets" },
    { label: t("assetDashboard.available"), value: stats.available, icon: Box, color: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40", to: "/assets?status=available" },
    { label: t("assetDashboard.assigned"), value: stats.assigned, icon: UserCheck, color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40", to: "/assets?status=assigned" },
    { label: t("assetDashboard.inRepair"), value: stats.in_repair, icon: Wrench, color: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40", to: "/assets?status=in_repair" },
    { label: t("assetDashboard.lostDamaged"), value: (stats.lost || 0) + (stats.damaged || 0), icon: AlertTriangle, color: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40", to: "/assets?status=lost" },
    { label: t("assetDashboard.retired"), value: stats.retired || 0, icon: Archive, color: "text-muted-foreground bg-muted", to: "/assets?status=retired" },
  ];

  const accounted =
    (stats.available || 0) +
    (stats.assigned || 0) +
    (stats.in_repair || 0) +
    (stats.lost || 0) +
    (stats.damaged || 0) +
    (stats.retired || 0);
  const unaccounted = Math.max(0, (stats.total || 0) - accounted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("assetDashboard.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("assetDashboard.subtitle")}</p>
        </div>
        <Link
          to="/assets"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors text-[13px] font-medium"
        >
          {t("assetDashboard.viewAllAssets")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="block text-left w-full bg-card rounded-lg border border-border p-4 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">{card.value}</p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* #1640 — Reconciliation note. Only shown when the cards don't add up
          to total, which signals either bad data (a status outside the enum
          slipped in) or that the dashboard hasn't been refreshed since a new
          status was added. Linking to the unfiltered list lets the admin
          inspect the offending rows directly. */}
      {unaccounted > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-[13px] tabular-nums text-amber-800 dark:text-amber-200 flex items-center justify-between">
          <span>
            {t("assetDashboard.unaccounted", { count: unaccounted })}
          </span>
          <Link to="/assets" className="font-medium underline hover:text-amber-900 dark:hover:text-amber-100">{t("assetDashboard.viewAll")}</Link>
        </div>
      )}

      {/* Expiring Warranties Alert */}
      {stats.expiring_warranties && stats.expiring_warranties.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {t("assetDashboard.warrantiesExpiring", { count: stats.expiring_warranties.length })}
            </h2>
          </div>
          <div className="space-y-2">
            {stats.expiring_warranties.slice(0, 5).map((asset: any) => (
              <div key={asset.id} className="flex items-center justify-between text-[13px]">
                <div>
                  <Link
                    to={`/assets/${asset.id}`}
                    className="font-medium text-amber-900 dark:text-amber-100 hover:underline"
                  >
                    {asset.asset_tag} - {asset.name}
                  </Link>
                  {asset.assigned_to_name && (
                    <span className="text-amber-700 dark:text-amber-300 ml-2">({asset.assigned_to_name})</span>
                  )}
                </div>
                <span className="text-amber-600 dark:text-amber-400">
                  {t("assetDashboard.expires", { date: new Date(asset.warranty_expiry).toLocaleDateString() })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("assetDashboard.byCategory")}</h2>
          </div>
          {stats.category_breakdown && stats.category_breakdown.length > 0 ? (
            <div className="space-y-3">
              {stats.category_breakdown.map((cat: any) => {
                const pct = stats.total > 0 ? Math.round((cat.count / stats.total) * 100) : 0;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{cat.category}</span>
                      <span className="tabular-nums text-muted-foreground">{cat.count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("assetDashboard.noAssets")}</p>
          )}
        </div>

        {/* Top Assignees */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("assetDashboard.topAssignees")}</h2>
          </div>
          {stats.top_assignees && stats.top_assignees.length > 0 ? (
            <div className="space-y-3">
              {stats.top_assignees.map((assignee: any, idx: number) => (
                <Link
                  key={assignee.user_id}
                  to={`/assets?assigned_to=${assignee.user_id}`}
                  className="flex items-center justify-between rounded-md p-2 -m-2 transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300">
                      {idx + 1}
                    </div>
                    <span className="text-sm text-muted-foreground">{assignee.name}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{t("assetDashboard.assetsCount", { count: assignee.count })}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("assetDashboard.noAssignments")}</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("assetDashboard.recentActivity")}</h2>
        </div>
        {stats.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="space-y-3">
            {stats.recent_activity.map((activity: any) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 text-sm border-b border-border pb-3 last:border-0"
              >
                <div className={`mt-0.5 font-medium ${ACTION_COLORS[activity.action] || "text-muted-foreground"}`}>
                  {t(`assetDashboard.action.${activity.action}`, { defaultValue: activity.action })}
                </div>
                <div className="flex-1">
                  <Link
                    to={`/assets/${activity.asset_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {activity.asset_tag} - {activity.asset_name}
                  </Link>
                  {activity.notes && (
                    <p className="text-muted-foreground text-xs mt-0.5">{activity.notes}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("assetDashboard.noActivity")}</p>
        )}
      </div>
    </div>
  );
}
