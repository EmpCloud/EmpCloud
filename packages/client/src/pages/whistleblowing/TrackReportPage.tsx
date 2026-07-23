import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { Search, Clock, CheckCircle, AlertTriangle, XCircle, ArrowUpRight, FileText } from "lucide-react";

// Status → colour + icon. The label text comes from i18n
// (whistleblowing.reports.status.*), reused from the reports list.
const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  submitted: { color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", icon: Clock },
  under_investigation: { color: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300", icon: Search },
  escalated: { color: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300", icon: ArrowUpRight },
  resolved: { color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300", icon: CheckCircle },
  dismissed: { color: "bg-muted text-muted-foreground", icon: XCircle },
  closed: { color: "bg-muted text-muted-foreground", icon: CheckCircle },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  medium: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  critical: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

export default function TrackReportPage() {
  const { t } = useTranslation();
  const [caseNumber, setCaseNumber] = useState("");
  const [searchCase, setSearchCase] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["whistleblowing-lookup", searchCase],
    queryFn: () =>
      api.get(`/whistleblowing/reports/lookup/${searchCase}`).then((r) => r.data.data),
    enabled: !!searchCase,
  });

  const handleSearch = () => {
    if (caseNumber.trim()) {
      setSearchCase(caseNumber.trim().toUpperCase());
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-7 w-7 text-brand-600 dark:text-brand-400" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("whistleblowing.track.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("whistleblowing.track.subtitle")}</p>
        </div>
      </div>

      {/* Search Box */}
      <div className="bg-card rounded-lg shadow-sm border p-4 mb-6">
        <label className="block text-[13px] font-medium text-muted-foreground mb-2">{t("whistleblowing.track.caseNumber")}</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("whistleblowing.track.placeholder")}
            className="flex-1 border border-border rounded-md px-4 py-2.5 font-mono text-lg tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-card text-foreground"
          />
          <button
            onClick={handleSearch}
            disabled={!caseNumber.trim()}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            {t("whistleblowing.track.lookup")}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-card rounded-lg shadow-sm border p-12 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">{t("whistleblowing.track.lookingUp")}</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-700 dark:text-red-300 font-medium">{t("whistleblowing.track.notFound")}</p>
          <p className="text-[13px] text-red-600 dark:text-red-400 mt-1">
            {t("whistleblowing.track.notFoundDetail", { caseNumber: searchCase })}
          </p>
        </div>
      )}

      {/* Report Details */}
      {data && (
        <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-muted">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">{t("whistleblowing.track.caseNumber")}</p>
                <p className="text-xl font-mono font-bold tabular-nums text-foreground">{data.case_number}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-md text-[11px] font-medium ${SEVERITY_BADGE[data.severity] || ""}`}>
                  {t(`whistleblowing.reports.severity.${data.severity}`, { defaultValue: data.severity })}
                </span>
                {(() => {
                  const cfg = STATUS_CONFIG[data.status];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return (
                    <span className={`px-3 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                      {t(`whistleblowing.reports.status.${data.status}`, { defaultValue: data.status })}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-[13px] text-muted-foreground">{t("whistleblowing.track.category")}</p>
              <p className="font-medium text-foreground capitalize">
                {t(`whistleblowing.reports.category.${data.category}`, { defaultValue: data.category?.replace(/_/g, " ") })}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">{t("whistleblowing.track.subject")}</p>
              <p className="font-medium text-foreground">{data.subject}</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-[13px] text-muted-foreground">{t("whistleblowing.track.submitted")}</p>
                <p className="text-foreground">{new Date(data.created_at).toLocaleDateString()}</p>
              </div>
              {data.resolved_at && (
                <div>
                  <p className="text-[13px] text-muted-foreground">{t("whistleblowing.track.resolved")}</p>
                  <p className="text-foreground">{new Date(data.resolved_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Updates Timeline */}
          {data.updates && data.updates.length > 0 && (
            <div className="p-4 border-t">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("whistleblowing.track.updates")}</h3>
              <div className="space-y-4">
                {data.updates.map((update: { id: number; update_type: string; content: string; created_at: string }) => (
                  <div key={update.id} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-brand-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] text-foreground">{update.content}</p>
                      <p className="text-[11px] tabular-nums text-muted-foreground mt-1">
                        {new Date(update.created_at).toLocaleString()} &middot;{" "}
                        <span className="capitalize">{update.update_type.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
