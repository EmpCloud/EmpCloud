import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  DatabaseZap,
  ChevronDown,
  ChevronRight,
  Wrench,
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SanityCheckItem {
  id: number;
  description: string;
}

interface SanityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  details: string;
  count: number;
  items?: SanityCheckItem[];
}

interface SanityReport {
  timestamp: string;
  overall_status: "healthy" | "warnings" | "critical";
  checks: SanityCheck[];
  summary: {
    total_checks: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

interface FixReport {
  timestamp: string;
  fixes_applied: Array<{
    name: string;
    description: string;
    affected_rows: number;
  }>;
  total_fixes: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function OverallStatusBanner({ status }: { status: SanityReport["overall_status"] }) {
  const cfg = {
    healthy: {
      bg: "bg-emerald-50 border-emerald-200",
      icon: <ShieldCheck className="h-8 w-8 text-emerald-600" />,
      title: "All Systems Healthy",
      subtitle: "All cross-module data consistency checks passed.",
      text: "text-emerald-800",
    },
    warnings: {
      bg: "bg-amber-50 border-amber-200",
      icon: <ShieldAlert className="h-8 w-8 text-amber-600" />,
      title: "Warnings Detected",
      subtitle: "Some data inconsistencies were found that may need attention.",
      text: "text-amber-800",
    },
    critical: {
      bg: "bg-red-50 border-red-200",
      icon: <XCircle className="h-8 w-8 text-red-600" />,
      title: "Critical Issues Found",
      subtitle: "Data integrity problems detected that require immediate action.",
      text: "text-red-800",
    },
  }[status];

  return (
    <div className={`flex items-center gap-4 p-5 rounded-xl border ${cfg.bg}`}>
      {cfg.icon}
      <div>
        <h2 className={`text-lg font-semibold ${cfg.text}`}>{cfg.title}</h2>
        <p className={`text-sm ${cfg.text} opacity-80`}>{cfg.subtitle}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SanityCheck["status"] }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> Pass
      </span>
    );
  }
  if (status === "warn") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <XCircle className="h-3.5 w-3.5" /> Fail
    </span>
  );
}

// ---------------------------------------------------------------------------
// Check card (expandable)
// ---------------------------------------------------------------------------

function CheckCard({ check }: { check: SanityCheck }) {
  const [expanded, setExpanded] = useState(false);

  const borderColor =
    check.status === "pass"
      ? "border-l-emerald-400"
      : check.status === "warn"
      ? "border-l-amber-400"
      : "border-l-red-400";

  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={check.status} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{check.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{check.details}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {check.count > 0 && (
            <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
              {check.count}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">{check.details}</p>
          {check.count > 0 && (
            <p className="text-xs font-medium text-gray-500 mb-2">
              {check.count} issue{check.count !== 1 ? "s" : ""} found
              {check.items && check.items.length < check.count ? ` (showing ${check.items.length})` : ""}
            </p>
          )}
          {check.items && check.items.length > 0 && (
            <ul className="space-y-1.5">
              {check.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs text-gray-700 bg-white rounded p-2 border border-gray-200"
                >
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                    {idx + 1}
                  </span>
                  <span className="font-mono break-all">{item.description}</span>
                </li>
              ))}
            </ul>
          )}
          {check.count === 0 && !check.items?.length && (
            <p className="text-xs text-emerald-600 italic">No issues detected.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fix confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmFixDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Confirm Auto-Fix</h3>
        </div>
        <p className="text-sm text-gray-600 mb-2">This will automatically apply the following fixes:</p>
        <ul className="text-sm text-gray-700 space-y-1 mb-4 pl-4 list-disc">
          <li>Sync organization user counts</li>
          <li>Sync subscription seat counts</li>
          <li>Fix negative leave balances (clamp to 0)</li>
          <li>Remove orphaned records (leave, attendance, helpdesk, announcements)</li>
        </ul>
        <p className="text-xs text-amber-600 font-medium mb-4">
          These changes cannot be undone. Make sure you have a database backup.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
            {loading ? "Fixing..." : "Apply Fixes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fix Results Banner
// ---------------------------------------------------------------------------

function FixResultsBanner({ report }: { report: FixReport }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-blue-800 mb-2">
        Auto-Fix Results ({report.total_fixes} total change{report.total_fixes !== 1 ? "s" : ""})
      </h3>
      {report.fixes_applied.length === 0 ? (
        <p className="text-sm text-blue-700">No fixes were necessary. Everything looks clean.</p>
      ) : (
        <ul className="space-y-1">
          {report.fixes_applied.map((fix, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-blue-700">
              <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                <span className="font-medium">{fix.name}:</span> {fix.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DataSanityPage() {
  const queryClient = useQueryClient();
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);

  // Fetch sanity check report
  const {
    data: report,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<SanityReport>({
    queryKey: ["data-sanity"],
    queryFn: () => api.get("/admin/data-sanity").then((r) => r.data.data),
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: false, // Manual trigger only
  });

  // Auto-fix mutation
  const fixMutation = useMutation({
    mutationFn: () => api.post("/admin/data-sanity/fix").then((r) => r.data.data),
    onSuccess: (data: FixReport) => {
      setFixReport(data);
      setShowFixDialog(false);
      // Re-run the check to get updated status
      queryClient.invalidateQueries({ queryKey: ["data-sanity"] });
      refetch();
    },
    onError: () => {
      setShowFixDialog(false);
    },
  });

  const handleRunCheck = () => {
    setFixReport(null);
    refetch();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-6 w-6 text-brand-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Data Sanity Checker</h1>
              <p className="text-sm text-gray-500">Cross-module data consistency verification</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={() => setShowFixDialog(true)}
              disabled={fixMutation.isPending || isLoading || isFetching}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Wrench className="h-4 w-4" />
              Auto-Fix
            </button>
          )}
          <button
            onClick={handleRunCheck}
            disabled={isLoading || isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Running..." : "Run Check"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {(isLoading || isFetching) && !report && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RefreshCw className="h-10 w-10 text-brand-500 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Running Sanity Checks...</h3>
          <p className="text-sm text-gray-500">
            Checking data consistency across all module databases. This may take a moment.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isFetching && !report && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Shield className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Report Yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Click "Run Check" to verify data consistency across all module databases.
          </p>
          <button
            onClick={handleRunCheck}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            <DatabaseZap className="h-4 w-4" />
            Run Sanity Check
          </button>
        </div>
      )}

      {/* Report results */}
      {report && (
        <>
          {/* Overall status */}
          <OverallStatusBanner status={report.overall_status} />

          {/* Fix results if any */}
          {fixReport && <FixResultsBanner report={fixReport} />}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{report.summary.total_checks}</p>
              <p className="text-xs text-gray-500 mt-1">Total Checks</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{report.summary.passed}</p>
              <p className="text-xs text-gray-500 mt-1">Passed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{report.summary.warnings}</p>
              <p className="text-xs text-gray-500 mt-1">Warnings</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{report.summary.failures}</p>
              <p className="text-xs text-gray-500 mt-1">Failures</p>
            </div>
          </div>

          {/* Last run timestamp */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            Last run: {new Date(report.timestamp).toLocaleString()}
            {isFetching && <RefreshCw className="h-3 w-3 animate-spin text-brand-500 ml-2" />}
          </div>

          {/* Check results */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Check Results</h2>
            {report.checks.map((check, idx) => (
              <CheckCard key={idx} check={check} />
            ))}
          </div>
        </>
      )}

      {/* Fix confirmation dialog */}
      <ConfirmFixDialog
        open={showFixDialog}
        onConfirm={() => fixMutation.mutate()}
        onCancel={() => setShowFixDialog(false)}
        loading={fixMutation.isPending}
      />
    </div>
  );
}
