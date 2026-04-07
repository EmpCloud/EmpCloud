import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Package, Loader2, Shield, AlertTriangle } from "lucide-react";
import api from "@/api/client";

export default function ModuleAccessPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    userId: number;
    moduleId: number;
    moduleName: string;
    userName: string;
    action: "enable" | "disable";
  } | null>(null);

  // Fetch all users with their module access
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-module-map"],
    queryFn: () => api.get("/subscriptions/users-module-map").then((r) => r.data.data),
  });

  // Fetch all subscribed modules
  const { data: subscriptions = [] } = useQuery({
    queryKey: ["org-subscriptions"],
    queryFn: () => api.get("/subscriptions").then((r) => r.data.data),
  });

  const activeModules = subscriptions.filter(
    (s: any) => s.status === "active" || s.status === "trial"
  );

  // Fetch module details
  const { data: allModules = [] } = useQuery({
    queryKey: ["modules-list"],
    queryFn: () => api.get("/modules").then((r) => r.data.data),
  });

  const subscribedModules = allModules.filter((m: any) =>
    activeModules.some((s: any) => s.module_id === m.id)
  );

  const enableModule = useMutation({
    mutationFn: (data: { module_id: number; user_id: number }) =>
      api.post("/subscriptions/enable-module", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAction(null);
    },
  });

  const disableModule = useMutation({
    mutationFn: (data: { module_id: number; user_id: number }) =>
      api.post("/subscriptions/disable-module", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAction(null);
    },
  });

  const handleToggle = (
    userId: number,
    moduleId: number,
    moduleName: string,
    userName: string,
    currentlyEnabled: boolean,
  ) => {
    if (currentlyEnabled) {
      // Show confirmation for disable
      setConfirmAction({ userId, moduleId, moduleName, userName, action: "disable" });
    } else {
      // Enable directly
      enableModule.mutate({ module_id: moduleId, user_id: userId });
    }
  };

  const filteredUsers = search
    ? users.filter((u: any) =>
        `${u.first_name} ${u.last_name} ${u.email} ${u.emp_code || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : users;

  const isPending = enableModule.isPending || disableModule.isPending;

  // Module colors
  const moduleColors: Record<string, string> = {
    "emp-payroll": "bg-green-100 text-green-700 border-green-200",
    "emp-monitor": "bg-blue-100 text-blue-700 border-blue-200",
    "emp-recruit": "bg-purple-100 text-purple-700 border-purple-200",
    "emp-projects": "bg-orange-100 text-orange-700 border-orange-200",
    "emp-performance": "bg-pink-100 text-pink-700 border-pink-200",
    "emp-exit": "bg-red-100 text-red-700 border-red-200",
    "emp-rewards": "bg-yellow-100 text-yellow-700 border-yellow-200",
    "emp-lms": "bg-indigo-100 text-indigo-700 border-indigo-200",
    "emp-field": "bg-teal-100 text-teal-700 border-teal-200",
    "emp-biometrics": "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Module Access</h1>
          <p className="text-gray-500 mt-1">
            Manage which employees have access to each module.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Package className="h-4 w-4" />
          {subscribedModules.length} active modules
        </div>
      </div>

      {/* Module Legend */}
      {subscribedModules.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {subscribedModules.map((m: any) => {
            const sub = activeModules.find((s: any) => s.module_id === m.id);
            return (
              <span
                key={m.id}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border ${
                  moduleColors[m.slug] || "bg-gray-100 text-gray-700 border-gray-200"
                }`}
              >
                {m.name.replace("EMP ", "")} ({sub?.used_seats || 0}/{sub?.total_seats || 0})
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Search employees..."
        />
      </div>

      {/* Confirm Disable Modal */}
      {confirmAction && confirmAction.action === "disable" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Disable Module Access</h3>
                <p className="text-xs text-gray-400">This action may delete user data in the module</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to remove <strong>{confirmAction.userName}</strong>'s access to{" "}
              <strong>{confirmAction.moduleName}</strong>? Their data in this module may be permanently deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  disableModule.mutate({
                    module_id: confirmAction.moduleId,
                    user_id: confirmAction.userId,
                  })
                }
                disabled={disableModule.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {disableModule.isPending ? "Removing..." : "Remove Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3 sticky left-0 bg-gray-50">
                Employee
              </th>
              {subscribedModules.map((m: any) => (
                <th
                  key={m.id}
                  className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 min-w-[100px]"
                >
                  {m.name.replace("EMP ", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={1 + subscribedModules.length} className="px-6 py-8 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={1 + subscribedModules.length} className="px-6 py-8 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user: any) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 sticky left-0 bg-white">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {user.first_name?.[0]}
                        {user.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {user.emp_code || user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  {subscribedModules.map((m: any) => {
                    const isEnabled = user.modules?.some(
                      (um: any) => um.module_id === m.id
                    );
                    return (
                      <td key={m.id} className="px-4 py-4 text-center">
                        <button
                          onClick={() =>
                            handleToggle(
                              user.id,
                              m.id,
                              m.name,
                              `${user.first_name} ${user.last_name}`,
                              isEnabled,
                            )
                          }
                          disabled={isPending}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isEnabled
                              ? "bg-brand-600"
                              : "bg-gray-200 hover:bg-gray-300"
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                              isEnabled ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
