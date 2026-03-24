import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { ShieldAlert, FileText, Clock, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-blue-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_investigation: "bg-yellow-100 text-yellow-700",
  escalated: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-500",
};

export default function WhistleblowingDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["whistleblowing-dashboard"],
    queryFn: () => api.get("/whistleblowing/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Whistleblowing Dashboard</h1>
            <p className="text-sm text-gray-500">EU Directive 2019/1937 compliance overview</p>
          </div>
        </div>
        <Link
          to="/whistleblowing/reports"
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition text-sm font-medium"
        >
          View All Reports
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-500">Total Reports</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-gray-500">Open</span>
          </div>
          <p className="text-3xl font-bold text-yellow-600">{data.open}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-500">Resolved</span>
          </div>
          <p className="text-3xl font-bold text-green-600">{data.resolved}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-brand-500" />
            <span className="text-sm text-gray-500">Avg. Resolution</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {data.avg_resolution_days !== null ? `${data.avg_resolution_days}d` : "--"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By Severity */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">By Severity</h3>
          <div className="space-y-3">
            {data.by_severity?.map((item: { severity: string; count: number }) => (
              <div key={item.severity} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${SEVERITY_COLOR[item.severity] || "bg-gray-400"}`} />
                  <span className="text-sm text-gray-700 capitalize">{item.severity}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{Number(item.count)}</span>
              </div>
            ))}
            {(!data.by_severity || data.by_severity.length === 0) && (
              <p className="text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>

        {/* By Category */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">By Category</h3>
          <div className="space-y-3">
            {data.by_category?.map((item: { category: string; count: number }) => (
              <div key={item.category} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">{item.category.replace(/_/g, " ")}</span>
                <span className="text-sm font-semibold text-gray-900">{Number(item.count)}</span>
              </div>
            ))}
            {(!data.by_category || data.by_category.length === 0) && (
              <p className="text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-5 border-b">
          <h3 className="text-sm font-semibold text-gray-700 uppercase">Recent Reports</h3>
        </div>
        {data.recent && data.recent.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Case #</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-left">Severity</th>
                <th className="px-5 py-3 text-left">Subject</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.recent.map((r: { id: number; case_number: string; category: string; severity: string; subject: string; status: string; created_at: string }) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link to={`/whistleblowing/reports/${r.id}`} className="font-mono text-sm text-brand-600 hover:underline">
                      {r.case_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700 capitalize">{r.category.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.severity === "critical" ? "bg-red-100 text-red-700" :
                      r.severity === "high" ? "bg-orange-100 text-orange-700" :
                      r.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-900 max-w-xs truncate">{r.subject}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || ""}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-gray-400">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>No reports yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
