import { useAuditLogs } from "@/api/hooks";
import { useState } from "react";

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs({ page });

  const logs = data?.data || [];
  const meta = data?.meta;

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Complete activity trail for SOC 2 compliance.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Time</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Action</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">User</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No audit logs yet</td></tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(log.created_at)}</td>
                  <td className="px-6 py-3">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">{log.user_id || "System"}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 font-mono">{log.ip_address || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {meta.page} of {meta.total_pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
