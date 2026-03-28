import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { Settings, Server, Shield, Mail, Clock } from "lucide-react";

interface PlatformInfo {
  server: {
    version: string;
    node_version: string;
    uptime_seconds: number;
    environment: string;
  };
  email: {
    configured: boolean;
    host: string;
    from: string;
  };
  security: {
    bcrypt_rounds: number;
    access_token_expiry: string;
    refresh_token_expiry: string;
    rate_limit_auth: string;
    rate_limit_api: string;
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function PlatformSettingsPage() {
  const { data: info, isLoading } = useQuery<PlatformInfo>({
    queryKey: ["platform-info"],
    queryFn: () => api.get("/admin/platform-info").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const sections = [
    {
      title: "Platform Info",
      icon: Server,
      color: "bg-blue-50 text-blue-600",
      items: info
        ? [
            { label: "Server Version", value: info.server.version },
            { label: "Node.js Version", value: info.server.node_version },
            { label: "Environment", value: info.server.environment },
            { label: "Uptime", value: formatUptime(info.server.uptime_seconds) },
          ]
        : [],
    },
    {
      title: "Email / SMTP Settings",
      icon: Mail,
      color: "bg-green-50 text-green-600",
      items: info
        ? [
            {
              label: "SMTP Status",
              value: info.email.configured ? "Configured" : "Not Configured",
              badge: info.email.configured,
            },
            { label: "SMTP Host", value: info.email.host || "-" },
            { label: "From Address", value: info.email.from || "-" },
          ]
        : [],
    },
    {
      title: "Security Settings",
      icon: Shield,
      color: "bg-amber-50 text-amber-600",
      items: info
        ? [
            { label: "Bcrypt Rounds", value: String(info.security.bcrypt_rounds) },
            { label: "Access Token Expiry", value: info.security.access_token_expiry },
            { label: "Refresh Token Expiry", value: info.security.refresh_token_expiry },
            { label: "Auth Rate Limit", value: info.security.rate_limit_auth },
            { label: "API Rate Limit", value: info.security.rate_limit_api },
          ]
        : [],
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Settings className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              View current platform configuration and system information.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {sections.map((section) => (
            <div
              key={section.title}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${section.color}`}>
                  <section.icon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
              </div>
              <div className="p-6">
                <dl className="space-y-3">
                  {section.items.map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <dt className="text-sm text-gray-500">{item.label}</dt>
                      <dd className="text-sm font-medium text-gray-900 text-right">
                        {"badge" in item ? (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.badge
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.value}
                          </span>
                        ) : (
                          item.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        <span>Auto-refreshes every 30 seconds</span>
      </div>
    </div>
  );
}
