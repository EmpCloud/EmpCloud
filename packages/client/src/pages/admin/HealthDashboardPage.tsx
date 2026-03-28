import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Server,
  Wifi,
  WifiOff,
  Clock,
  Zap,
  Shield,
  Globe,
  HardDrive,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModuleHealth {
  name: string;
  slug: string;
  port: number;
  status: "healthy" | "degraded" | "down";
  responseTime: number;
  lastChecked: string;
  uptime?: string;
  version?: string;
  error?: string;
}

interface InfraHealth {
  name: string;
  status: "connected" | "disconnected";
  responseTime: number;
  lastChecked: string;
  error?: string;
  details?: Record<string, any>;
}

interface EndpointStatus {
  module: string;
  endpoint: string;
  method: string;
  status: "healthy" | "down";
  responseTime: number;
  statusCode?: number;
  lastChecked: string;
}

interface HealthCheckResult {
  overall_status: "operational" | "degraded" | "major_outage";
  modules: ModuleHealth[];
  infrastructure: InfraHealth[];
  endpoints: EndpointStatus[];
  healthy_count: number;
  degraded_count: number;
  down_count: number;
  total_count: number;
  last_full_check: string;
}

// ---------------------------------------------------------------------------
// Module icon mapping
// ---------------------------------------------------------------------------

const MODULE_ICONS: Record<string, string> = {
  empcloud: "EC",
  "emp-recruit": "RC",
  "emp-performance": "PF",
  "emp-rewards": "RW",
  "emp-exit": "EX",
  "emp-billing": "BL",
  "emp-lms": "LM",
  "emp-payroll": "PR",
  "emp-projects": "PJ",
  "emp-monitor": "MN",
};

const MODULE_COLORS: Record<string, string> = {
  empcloud: "from-indigo-500 to-indigo-600",
  "emp-recruit": "from-blue-500 to-blue-600",
  "emp-performance": "from-purple-500 to-purple-600",
  "emp-rewards": "from-amber-500 to-amber-600",
  "emp-exit": "from-red-500 to-red-600",
  "emp-billing": "from-green-500 to-green-600",
  "emp-lms": "from-teal-500 to-teal-600",
  "emp-payroll": "from-cyan-500 to-cyan-600",
  "emp-projects": "from-orange-500 to-orange-600",
  "emp-monitor": "from-pink-500 to-pink-600",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResponseTimeColor(ms: number): string {
  if (ms < 100) return "text-green-600";
  if (ms < 500) return "text-amber-600";
  return "text-red-600";
}

function getResponseTimeBg(ms: number): string {
  if (ms < 100) return "bg-green-500";
  if (ms < 500) return "bg-amber-500";
  return "bg-red-500";
}

function getResponseTimeBarWidth(ms: number): string {
  // Scale: 0-1000ms maps to 0-100%
  const pct = Math.min((ms / 1000) * 100, 100);
  return `${pct}%`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function OverallStatusBanner({ status, lastCheck }: { status: string; lastCheck: string }) {
  const bannerConfig = {
    operational: {
      bg: "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200",
      icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
      title: "All Systems Operational",
      subtitle: "Every service is running normally.",
      dotColor: "bg-green-500",
    },
    degraded: {
      bg: "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200",
      icon: <AlertTriangle className="h-8 w-8 text-amber-500" />,
      title: "Partial System Degradation",
      subtitle: "One or more services are experiencing issues.",
      dotColor: "bg-amber-500",
    },
    major_outage: {
      bg: "bg-gradient-to-r from-red-50 to-rose-50 border-red-200",
      icon: <XCircle className="h-8 w-8 text-red-500" />,
      title: "Major Outage",
      subtitle: "Multiple services are currently unavailable.",
      dotColor: "bg-red-500",
    },
  }[status] || {
    bg: "bg-gray-50 border-gray-200",
    icon: <Activity className="h-8 w-8 text-gray-400" />,
    title: "Checking Status...",
    subtitle: "Performing initial health check.",
    dotColor: "bg-gray-400",
  };

  return (
    <div className={`rounded-xl border-2 p-6 ${bannerConfig.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            {bannerConfig.icon}
            <span
              className={`absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full ${bannerConfig.dotColor} animate-pulse`}
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{bannerConfig.title}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{bannerConfig.subtitle}</p>
          </div>
        </div>
        {lastCheck && (
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500">Last checked</p>
            <p className="text-sm font-medium text-gray-700">{timeAgo(lastCheck)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const configs = {
    healthy: {
      bg: "bg-green-100 text-green-700",
      dot: "bg-green-500 animate-pulse",
      label: "Healthy",
    },
    degraded: {
      bg: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500 animate-pulse",
      label: "Degraded",
    },
    down: {
      bg: "bg-red-100 text-red-700",
      dot: "bg-red-500",
      label: "Down",
    },
  };

  const c = configs[status] || configs.down;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg}`}>
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function ModuleCard({ module }: { module: ModuleHealth }) {
  const iconText = MODULE_ICONS[module.slug] || module.name.substring(0, 2).toUpperCase();
  const gradient = MODULE_COLORS[module.slug] || "from-gray-500 to-gray-600";

  const borderColor =
    module.status === "healthy"
      ? "border-green-200 hover:border-green-300"
      : module.status === "degraded"
        ? "border-amber-200 hover:border-amber-300"
        : "border-red-200 hover:border-red-300";

  return (
    <div
      className={`bg-white rounded-xl border-2 ${borderColor} p-5 transition-all hover:shadow-md`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold`}
          >
            {iconText}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{module.name}</h3>
            <p className="text-xs text-gray-500">Port {module.port}</p>
          </div>
        </div>
        <StatusBadge status={module.status} />
      </div>

      {/* Response Time */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Zap className="h-3 w-3" /> Response Time
          </span>
          <span className={`text-xs font-bold ${getResponseTimeColor(module.responseTime)}`}>
            {module.responseTime}ms
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getResponseTimeBg(module.responseTime)}`}
            style={{ width: getResponseTimeBarWidth(module.responseTime) }}
          />
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        {module.version && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Shield className="h-3 w-3" /> Version
            </span>
            <span className="text-xs font-medium text-gray-700">{module.version}</span>
          </div>
        )}
        {module.uptime && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Uptime
            </span>
            <span className="text-xs font-medium text-gray-700">{module.uptime}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Last Check
          </span>
          <span className="text-xs font-medium text-gray-700">
            {formatTimestamp(module.lastChecked)}
          </span>
        </div>
      </div>

      {/* Error message */}
      {module.error && (
        <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
          <p className="text-xs text-red-600 font-medium truncate" title={module.error}>
            {module.error}
          </p>
        </div>
      )}
    </div>
  );
}

function InfraCard({ infra }: { infra: InfraHealth }) {
  const isConnected = infra.status === "connected";
  const icon =
    infra.name === "MySQL" ? (
      <Database className="h-5 w-5" />
    ) : (
      <HardDrive className="h-5 w-5" />
    );

  return (
    <div
      className={`bg-white rounded-xl border-2 p-5 transition-all hover:shadow-md ${
        isConnected
          ? "border-green-200 hover:border-green-300"
          : "border-red-200 hover:border-red-300"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              isConnected ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
            }`}
          >
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{infra.name}</h3>
            <p className="text-xs text-gray-500">
              {infra.details?.host ? String(infra.details.host) : "Infrastructure"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span
            className={`text-xs font-semibold ${
              isConnected ? "text-green-600" : "text-red-600"
            }`}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Response time */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">Response Time</span>
        <span className={`text-xs font-bold ${getResponseTimeColor(infra.responseTime)}`}>
          {infra.responseTime}ms
        </span>
      </div>

      {/* Details */}
      {infra.details && (
        <div className="space-y-1 mt-3 pt-3 border-t border-gray-100">
          {infra.details.version && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Version</span>
              <span className="text-xs font-medium text-gray-700">
                {String(infra.details.version)}
              </span>
            </div>
          )}
          {infra.details.database && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Database</span>
              <span className="text-xs font-medium text-gray-700">
                {String(infra.details.database)}
              </span>
            </div>
          )}
          {infra.details.threads_connected && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Threads</span>
              <span className="text-xs font-medium text-gray-700">
                {String(infra.details.threads_connected)}
              </span>
            </div>
          )}
          {infra.details.uptime && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Uptime</span>
              <span className="text-xs font-medium text-gray-700">
                {String(infra.details.uptime)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {infra.error && (
        <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
          <p className="text-xs text-red-600 font-medium truncate" title={infra.error}>
            {infra.error}
          </p>
        </div>
      )}
    </div>
  );
}

function EndpointsTable({ endpoints }: { endpoints: EndpointStatus[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">API Endpoints Status</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">Health check endpoints for each module</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Module
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Endpoint
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Method
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Response
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                HTTP Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Last Checked
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {endpoints.map((ep, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3">
                  <span className="text-sm font-medium text-gray-900">{ep.module}</span>
                </td>
                <td className="px-6 py-3">
                  <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {ep.endpoint}
                  </code>
                </td>
                <td className="px-6 py-3">
                  <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {ep.method}
                  </span>
                </td>
                <td className="px-6 py-3">
                  {ep.status === "healthy" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                      <XCircle className="h-3.5 w-3.5" /> Down
                    </span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <span className={`text-xs font-bold ${getResponseTimeColor(ep.responseTime)}`}>
                    {ep.responseTime}ms
                  </span>
                </td>
                <td className="px-6 py-3">
                  {ep.statusCode ? (
                    <span
                      className={`text-xs font-mono font-medium ${
                        ep.statusCode < 400 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {ep.statusCode}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(ep.lastChecked)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HealthDashboardPage() {
  const queryClient = useQueryClient();

  const {
    data: health,
    isLoading,
    isFetching,
  } = useQuery<HealthCheckResult>({
    queryKey: ["admin-service-health"],
    queryFn: () => api.get("/admin/service-health").then((r) => r.data.data),
    refetchInterval: 30_000, // Auto-refresh every 30 seconds
  });

  const forceCheckMutation = useMutation({
    mutationFn: () => api.post("/admin/service-health/check").then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-service-health"], data);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <div className="text-gray-400 text-sm">Running health checks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Service Health</h1>
              <p className="text-gray-500 text-sm">
                Real-time health status of all EMP Cloud ecosystem services
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-refresh indicator */}
          {isFetching && !forceCheckMutation.isPending && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing...
            </span>
          )}

          {/* Check Now button */}
          <button
            onClick={() => forceCheckMutation.mutate()}
            disabled={forceCheckMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw
              className={`h-4 w-4 ${forceCheckMutation.isPending ? "animate-spin" : ""}`}
            />
            {forceCheckMutation.isPending ? "Checking..." : "Check Now"}
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div className="mb-6">
        <OverallStatusBanner
          status={health?.overall_status || "unknown"}
          lastCheck={health?.last_full_check || ""}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Server className="h-4 w-4 text-gray-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{health?.total_count || 0}</p>
          <p className="text-xs text-gray-500">Total Services</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600">{health?.healthy_count || 0}</p>
          <p className="text-xs text-gray-500">Healthy</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">{health?.degraded_count || 0}</p>
          <p className="text-xs text-gray-500">Degraded</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600">{health?.down_count || 0}</p>
          <p className="text-xs text-gray-500">Down</p>
        </div>
      </div>

      {/* Module Cards Grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Module Services</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {health?.modules?.map((mod) => (
            <ModuleCard key={mod.slug} module={mod} />
          ))}
        </div>
      </div>

      {/* Infrastructure Section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Infrastructure</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {health?.infrastructure?.map((infra) => (
            <InfraCard key={infra.name} infra={infra} />
          ))}
        </div>
      </div>

      {/* API Endpoints Table */}
      {health?.endpoints && health.endpoints.length > 0 && (
        <div className="mb-6">
          <EndpointsTable endpoints={health.endpoints} />
        </div>
      )}

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-400">
          Auto-refreshes every 30 seconds. Background checks run every 60 seconds.
        </p>
      </div>
    </div>
  );
}
