import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import {
  Package,
  Calendar,
  Shield,
  AlertTriangle,
  Hash,
} from "lucide-react";

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  good: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  fair: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  poor: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

export default function MyAssetsPage() {
  const { t } = useTranslation();
  const { data: assets, isLoading } = useQuery({
    queryKey: ["my-assets"],
    queryFn: () => api.get("/assets/my").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myAssets.page.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("myAssets.page.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="h-4 w-32 bg-muted rounded mb-2" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
                <div className="h-5 w-14 bg-muted rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 w-36 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myAssets.page.title")}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">{t("myAssets.page.subtitle")}</p>
      </div>

      {!assets || assets.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-base font-medium text-muted-foreground mb-1">{t("myAssets.empty.title")}</p>
          <p className="text-[13px] text-muted-foreground">{t("myAssets.empty.description")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset: any) => {
            const warrantyExpired = asset.warranty_expiry && new Date(asset.warranty_expiry) < new Date();
            return (
              <Link
                key={asset.id}
                to={`/assets/${asset.id}`}
                className="bg-card rounded-lg border border-border p-4 hover:border-brand-400 transition-colors duration-150"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{asset.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] tabular-nums text-muted-foreground">{asset.asset_tag}</span>
                    </div>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${CONDITION_COLORS[asset.condition_status] || "bg-muted"}`}>
                    {t(`myAssets.condition.${asset.condition_status}`, { defaultValue: asset.condition_status })}
                  </span>
                </div>

                <div className="space-y-2 text-[13px]">
                  {asset.category_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {asset.category_name}
                    </div>
                  )}
                  {asset.brand && (
                    <div className="text-muted-foreground">
                      {asset.brand} {asset.model && `- ${asset.model}`}
                    </div>
                  )}
                  {asset.serial_number && (
                    <div className="text-xs text-muted-foreground">{t("myAssets.card.serialNumber", { serial: asset.serial_number })}</div>
                  )}
                  {asset.assigned_at && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3 w-3" />
                      {t("myAssets.card.assigned", { date: new Date(asset.assigned_at).toLocaleDateString() })}
                    </div>
                  )}
                  {asset.warranty_expiry && (
                    <div className={`flex items-center gap-2 text-xs ${warrantyExpired ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {warrantyExpired ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <Shield className="h-3 w-3" />
                      )}
                      {t("myAssets.card.warranty", { date: new Date(asset.warranty_expiry).toLocaleDateString() })}
                      {warrantyExpired && ` ${t("myAssets.card.warrantyExpiredSuffix")}`}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
