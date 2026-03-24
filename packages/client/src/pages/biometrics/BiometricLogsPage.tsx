import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Camera, Fingerprint, QrCode, ScanFace } from "lucide-react";

const methodIcons: Record<string, any> = {
  face: ScanFace,
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

export default function BiometricLogsPage() {
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState("");
  const [result, setResult] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: logsData, isLoading } = useQuery({
    queryKey: ["biometric-logs", page, method, result, dateFrom, dateTo],
    queryFn: () =>
      api.get("/biometrics/logs", {
        params: {
          page,
          per_page: 20,
          ...(method && { method }),
          ...(result && { result }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
        },
      }).then((r) => r.data),
  });

  const logs = logsData?.data || [];
  const meta = logsData?.meta;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Biometric Logs</h1>
        <p className="text-gray-500 mt-1">View all biometric attendance events and their results.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => { setMethod(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Methods</option>
              <option value="face">Face</option>
              <option value="fingerprint">Fingerprint</option>
              <option value="qr">QR Code</option>
              <option value="selfie">Selfie</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Result</label>
            <select
              value={result}
              onChange={(e) => { setResult(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Results</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="spoofing_detected">Spoofing Detected</option>
              <option value="no_match">No Match</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setMethod(""); setResult(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Result</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Confidence</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Liveness</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Synced</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No biometric logs found</td></tr>
            ) : (
              logs.map((l: any) => {
                const MethodIcon = methodIcons[l.method] || ScanFace;
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                          {l.first_name?.[0]}{l.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{l.first_name} {l.last_name}</p>
                          <p className="text-xs text-gray-400">{l.emp_code || l.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-sm text-gray-600 capitalize">
                        <MethodIcon className="h-3.5 w-3.5" />
                        {l.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                      {l.scan_type.replace("_", " ")}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${resultColors[l.result] || "bg-gray-50 text-gray-700"}`}>
                        {l.result.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {l.confidence_score != null ? `${(l.confidence_score * 100).toFixed(1)}%` : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {l.liveness_passed === true ? (
                        <span className="text-green-600">Passed</span>
                      ) : l.liveness_passed === false ? (
                        <span className="text-red-600">Failed</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {l.synced_to_attendance ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {meta.page} of {meta.total_pages} ({meta.total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
