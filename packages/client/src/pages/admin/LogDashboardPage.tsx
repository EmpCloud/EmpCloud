import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Shield,
  XCircle,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogSummary {
  period: string;
  since: string;
  audit_events: number;
  file_errors: number;
  errors_by_action: Array<{ action: string; count: number }>;
  module_error_counts: Record<string, number>;
}

interface LogError {
  module: string;
  level: string;
  message: string;
  timestamp: string;
  stack?: string;
  sql?: string;
  source?: "frontend" | "backend";
  url?: string;
  component?: string;
}

interface SlowQuery {
  module: string;
  sql: string;
  duration_ms: number;
  timestamp: string;
}

interface AuthEvent {
  id: number;
  user_id: number | null;
  action: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface ModuleHealth {
  name: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  restarts: number;
  recent_errors: number;
  last_log_at: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogDashboardPage() {
  const [errorsPage, setErrorsPage] = useState(1);
  const [authPage, setAuthPage] = useState(1);
  const [expandedError, setExpandedError] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "errors" | "slow" | "auth" | "health"
  >("overview");

  const summaryQ = useQuery<LogSummary>({
    queryKey: ["admin-logs-summary"],
    queryFn: () => api.get("/admin/logs/summary").then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const errorsQ = useQuery<{ data: LogError[]; meta: any }>({
    queryKey: ["admin-logs-errors", errorsPage],
    queryFn: () =>
      api
        .get("/admin/logs/errors", { params: { page: errorsPage, per_page: 15 } })
        .then((r) => ({ data: r.data.data, meta: r.data.meta })),
    enabled: activeTab === "errors" || activeTab === "overview",
  });

  const slowQ = useQuery<{ data: SlowQuery[]; meta: any }>({
    queryKey: ["admin-logs-slow-queries"],
    queryFn: () =>
      api
        .get("/admin/logs/slow-queries", { params: { page: 1, per_page: 20 } })
        .then((r) => ({ data: r.data.data, meta: r.data.meta })),
    enabled: activeTab === "slow" || activeTab === "overview",
  });

  const authQ = useQuery<{ data: AuthEvent[]; meta: any }>({
    queryKey: ["admin-logs-auth", authPage],
    queryFn: () =>
      api
        .get("/admin/logs/auth-events", { params: { page: authPage, per_page: 20 } })
        .then((r) => ({ data: r.data.data, meta: r.data.meta })),
    enabled: activeTab === "auth" || activeTab === "overview",
  });

  const healthQ = useQuery<ModuleHealth[]>({
    queryKey: ["admin-logs-health"],
    queryFn: () => api.get("/admin/logs/health").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const summary = summaryQ.data;
  const healthData = healthQ.data || [];

  const statusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "critical":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-50 border-green-200";
      case "warning":
        return "bg-amber-50 border-amber-200";
      case "critical":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: Activity },
    { key: "errors" as const, label: "Errors", icon: XCircle },
    { key: "slow" as const, label: "Slow Queries", icon: Database },
    { key: "auth" as const, label: "Auth Events", icon: Shield },
    { key: "health" as const, label: "Module Health", icon: CheckCircle },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Log Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time monitoring across all EMP Cloud modules
          </p>
        </div>
        <button
          onClick={() => {
            summaryQ.refetch();
            healthQ.refetch();
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${summaryQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm text-gray-500 mb-1">Audit Events (24h)</div>
              <div className="text-2xl font-bold text-gray-900">
                {summary?.audit_events?.toLocaleString() ?? "--"}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm text-gray-500 mb-1">File Errors (24h)</div>
              <div className="text-2xl font-bold text-red-600">
                {summary?.file_errors?.toLocaleString() ?? "--"}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm text-gray-500 mb-1">Slow Queries</div>
              <div className="text-2xl font-bold text-amber-600">
                {slowQ.data?.meta?.total?.toLocaleString() ?? "--"}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm text-gray-500 mb-1">Healthy Modules</div>
              <div className="text-2xl font-bold text-green-600">
                {healthData.filter((h) => h.status === "healthy").length} / {healthData.length || "--"}
              </div>
            </div>
          </div>

          {/* Errors by Action */}
          {summary && summary.errors_by_action.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Errors by Action (24h)
              </h3>
              <div className="space-y-2">
                {summary.errors_by_action.map((e) => (
                  <div
                    key={e.action}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-gray-600 font-mono">
                      {e.action}
                    </span>
                    <span className="text-sm font-semibold text-red-600">
                      {e.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Module Error Breakdown */}
          {summary && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Errors per Module (from log files)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(summary.module_error_counts).map(
                  ([mod, count]) => (
                    <div
                      key={mod}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        count === 0
                          ? "bg-green-50 border-green-200"
                          : count < 10
                          ? "bg-amber-50 border-amber-200"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      <span className="text-sm text-gray-700">{mod}</span>
                      <span
                        className={`text-sm font-bold ${
                          count === 0
                            ? "text-green-600"
                            : count < 10
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Module Health Cards */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Module Health
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {healthData.map((mod) => (
                <div
                  key={mod.name}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${statusBg(mod.status)}`}
                >
                  {statusIcon(mod.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {mod.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {mod.restarts > 0 && `${mod.restarts} restart(s) | `}
                      {mod.recent_errors} errors
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === "errors" && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Recent Errors</h3>
            <p className="text-sm text-gray-500 mt-1">
              From PM2 error logs and frontend client errors across all modules
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {(errorsQ.data?.data || []).map((err, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() =>
                    setExpandedError(expandedError === idx ? null : idx)
                  }
                >
                  {expandedError === idx ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  {err.source === "frontend" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex-shrink-0">
                      Frontend
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex-shrink-0">
                      {err.module}
                    </span>
                  )}
                  <span className="text-sm text-gray-900 truncate flex-1">
                    {err.message}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {err.timestamp
                      ? new Date(err.timestamp).toLocaleString()
                      : ""}
                  </span>
                </div>
                {expandedError === idx && (
                  <div className="mt-3 ml-7 space-y-2">
                    {err.source === "frontend" && (err.url || err.component) && (
                      <div className="text-xs text-gray-500">
                        {err.url && <span className="mr-4">Page: {err.url}</span>}
                        {err.component && <span>Component: {err.component}</span>}
                      </div>
                    )}
                    {err.stack && (
                      <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto max-h-48">
                        {err.stack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(errorsQ.data?.data || []).length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No errors found.
              </div>
            )}
          </div>
          {/* Pagination */}
          {errorsQ.data?.meta && errorsQ.data.meta.total_pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                Page {errorsPage} of {errorsQ.data.meta.total_pages} ({errorsQ.data.meta.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={errorsPage <= 1}
                  onClick={() => setErrorsPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  disabled={errorsPage >= errorsQ.data.meta.total_pages}
                  onClick={() => setErrorsPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slow Queries Tab */}
      {activeTab === "slow" && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Slow Queries</h3>
            <p className="text-sm text-gray-500 mt-1">
              Database queries exceeding 1 second
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 text-gray-600 font-medium">Module</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Duration</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">SQL</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(slowQ.data?.data || []).map((q, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{q.module}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          q.duration_ms > 5000
                            ? "bg-red-100 text-red-700"
                            : q.duration_ms > 2000
                            ? "bg-amber-100 text-amber-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {q.duration_ms}ms
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-md truncate">
                      {q.sql}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {q.timestamp
                        ? new Date(q.timestamp).toLocaleString()
                        : ""}
                    </td>
                  </tr>
                ))}
                {(slowQ.data?.data || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No slow queries detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auth Events Tab */}
      {activeTab === "auth" && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Auth Events</h3>
            <p className="text-sm text-gray-500 mt-1">
              Login, logout, password changes, token events (last 24h)
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {(authQ.data?.data || []).map((event) => (
              <div key={event.id} className="p-4 flex items-center gap-4">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    event.action.includes("fail")
                      ? "bg-red-100"
                      : event.action.includes("revoke")
                      ? "bg-amber-100"
                      : "bg-green-100"
                  }`}
                >
                  <Shield
                    className={`h-4 w-4 ${
                      event.action.includes("fail")
                        ? "text-red-600"
                        : event.action.includes("revoke")
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {event.action.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-gray-500">
                    User #{event.user_id || "N/A"} | IP: {event.ip_address || "N/A"}
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(event.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {(authQ.data?.data || []).length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No auth events in the last 24 hours.
              </div>
            )}
          </div>
          {/* Pagination */}
          {authQ.data?.meta && authQ.data.meta.total_pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                Page {authPage} of {authQ.data.meta.total_pages} ({authQ.data.meta.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={authPage <= 1}
                  onClick={() => setAuthPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  disabled={authPage >= authQ.data.meta.total_pages}
                  onClick={() => setAuthPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Module Health Tab */}
      {activeTab === "health" && (
        <div className="space-y-4">
          {healthData.map((mod) => (
            <div
              key={mod.name}
              className={`flex items-center gap-4 p-5 rounded-xl border ${statusBg(mod.status)}`}
            >
              {statusIcon(mod.status)}
              <div className="flex-1">
                <div className="text-base font-semibold text-gray-900">
                  {mod.name}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  Status: {mod.status} | Restarts: {mod.restarts} | Recent
                  errors: {mod.recent_errors}
                </div>
                {mod.last_log_at && (
                  <div className="text-xs text-gray-400 mt-1">
                    Last activity: {new Date(mod.last_log_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}
          {healthData.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              {healthQ.isLoading
                ? "Loading module health..."
                : "No module health data available."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
