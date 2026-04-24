import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Scan,
  Smartphone,
  UserCheck,
  UserX,
  AlertTriangle,
  QrCode,
  Fingerprint,
  Camera,
  ChevronRight,
} from "lucide-react";

const methodIcons: Record<string, any> = {
  face: Camera,
  fingerprint: Fingerprint,
  qr: QrCode,
  selfie: Camera,
};

const resultColors: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  spoofing_detected: "bg-orange-50 text-orange-700",
  no_match: "bg-yellow-50 text-yellow-700",
};

export default function BiometricsDashboardPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["biometrics-dashboard"],
    queryFn: () => api.get("/biometrics/dashboard").then((r) => r.data.data),
  });

  const stats = [
    { label: "Check-ins Today", value: dashboard?.today_check_ins ?? "-", icon: UserCheck, color: "bg-green-50 text-green-700" },
    { label: "Check-outs Today", value: dashboard?.today_check_outs ?? "-", icon: UserX, color: "bg-blue-50 text-blue-700" },
    { label: "Failed Attempts", value: dashboard?.failed_attempts ?? "-", icon: AlertTriangle, color: "bg-red-50 text-red-700" },
    { label: "Enrolled Users", value: dashboard?.enrolled_users ?? "-", icon: Scan, color: "bg-purple-50 text-purple-700" },
    { label: "Online Devices", value: dashboard ? `${dashboard.online_devices}/${dashboard.total_devices}` : "-", icon: Smartphone, color: "bg-indigo-50 text-indigo-700" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Biometric Attendance</h1>
        <p className="text-gray-500 mt-1">Overview of biometric check-ins, devices, and enrollments.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{isLoading ? "..." : s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Self-service: per-user 6-digit kiosk PIN. Discoverable from the
           dashboard so employees don't have to know the URL. */}
      <Link
        to="/biometrics/kiosk-pin"
        className="mb-8 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm transition"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">My Kiosk PIN</p>
            <p className="text-xs text-gray-500">
              Enable, disable, or change your 6-digit PIN for biometric kiosk sign-in.
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Today's Methods</h2>
          {!dashboard?.method_breakdown?.length ? (
            <p className="text-gray-400 text-sm">No biometric events today</p>
          ) : (
            <div className="space-y-3">
              {dashboard.method_breakdown.map((m: any) => {
                const Icon = methodIcons[m.method] || Scan;
                return (
                  <div key={m.method} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 capitalize">{m.method}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{m.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Events */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Events</h2>
          {!dashboard?.recent_events?.length ? (
            <p className="text-gray-400 text-sm">No recent biometric events</p>
          ) : (
            <div className="space-y-3">
              {dashboard.recent_events.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
                      {e.first_name?.[0]}{e.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.first_name} {e.last_name}</p>
                      <p className="text-xs text-gray-400 capitalize">{e.method} {e.scan_type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${resultColors[e.result] || "bg-gray-50 text-gray-700"}`}>
                      {e.result.replace(/_/g, " ")}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{new Date(e.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
