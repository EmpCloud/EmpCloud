import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { Search, Clock, CheckCircle, AlertTriangle, XCircle, ArrowUpRight, FileText } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700", icon: Clock },
  under_investigation: { label: "Under Investigation", color: "bg-yellow-100 text-yellow-700", icon: Search },
  escalated: { label: "Escalated", color: "bg-orange-100 text-orange-700", icon: ArrowUpRight },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-600", icon: XCircle },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-500", icon: CheckCircle },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default function TrackReportPage() {
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
        <FileText className="h-7 w-7 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Track Your Report</h1>
          <p className="text-sm text-gray-500">
            Enter your case number to check the status of your whistleblowing report
          </p>
        </div>
      </div>

      {/* Search Box */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Case Number</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. WB-2026-0001"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 font-mono text-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <button
            onClick={handleSearch}
            disabled={!caseNumber.trim()}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Lookup
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500">Looking up report...</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-700 font-medium">Report Not Found</p>
          <p className="text-sm text-red-600 mt-1">
            No report found with case number "{searchCase}". Please double-check and try again.
          </p>
        </div>
      )}

      {/* Report Details */}
      {data && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Case Number</p>
                <p className="text-xl font-mono font-bold text-gray-900">{data.case_number}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${SEVERITY_BADGE[data.severity] || ""}`}>
                  {data.severity}
                </span>
                {(() => {
                  const cfg = STATUS_CONFIG[data.status];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return (
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-500">Category</p>
              <p className="font-medium text-gray-900 capitalize">{data.category?.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Subject</p>
              <p className="font-medium text-gray-900">{data.subject}</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-sm text-gray-500">Submitted</p>
                <p className="text-gray-900">{new Date(data.created_at).toLocaleDateString()}</p>
              </div>
              {data.resolved_at && (
                <div>
                  <p className="text-sm text-gray-500">Resolved</p>
                  <p className="text-gray-900">{new Date(data.resolved_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Updates Timeline */}
          {data.updates && data.updates.length > 0 && (
            <div className="p-6 border-t">
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">Updates</h3>
              <div className="space-y-4">
                {data.updates.map((update: { id: number; update_type: string; content: string; created_at: string }) => (
                  <div key={update.id} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-brand-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{update.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
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
