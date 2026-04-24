import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Package, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Filter, Check, X } from "lucide-react";
import api from "@/api/client";

const PAGE_SIZE = 20;

export default function ModuleAccessPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterModule, setFilterModule] = useState<string>("all"); // "all" | "enabled:<id>" | "disabled:<id>"
  const [syncAlert, setSyncAlert] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    userId: number;
    moduleId: number;
    moduleName: string;
    userName: string;
    action: "enable" | "disable";
  } | null>(null);
  const [confirmAllAction, setConfirmAllAction] = useState<{
    moduleId: number;
    moduleName: string;
    action: "enable" | "disable";
  } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-module-map"],
    queryFn: () => api.get("/subscriptions/users-module-map").then((r) => r.data.data),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ["org-subscriptions"],
    queryFn: () => api.get("/subscriptions").then((r) => r.data.data),
  });

  const activeModules = subscriptions.filter(
    (s: any) => s.status === "active" || s.status === "trial"
  );

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
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAction(null);
      if (data.sync_status === "synced") {
        setSyncAlert({ type: "success", message: t('modulesAccess.syncAlerts.enabledSynced') });
      } else if (data.sync_status === "skipped") {
        setSyncAlert({ type: "warning", message: t('modulesAccess.syncAlerts.enabledSkipped') });
      } else {
        setSyncAlert({ type: "warning", message: t('modulesAccess.syncAlerts.enabledPartial', { status: data.sync_status }) });
      }
      setTimeout(() => setSyncAlert(null), 5000);
    },
    onError: (err: any) => {
      // #1461 — Surface server-side seat-limit errors so admins see *why*
      // the assignment failed instead of the UI silently incrementing.
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error?.message;
      const message =
        status === 409 && serverMsg
          ? serverMsg
          : serverMsg || t('modulesAccess.syncAlerts.enableFailed');
      setSyncAlert({ type: "error", message });
      setConfirmAction(null);
      // Seat-limit messages are longer and more important — keep them visible longer
      setTimeout(() => setSyncAlert(null), status === 409 ? 8000 : 5000);
    },
  });

  const disableModule = useMutation({
    mutationFn: (data: { module_id: number; user_id: number }) =>
      api.post("/subscriptions/disable-module", data).then((r) => r.data.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAction(null);
      if (data.sync_status === "synced") {
        setSyncAlert({ type: "success", message: t('modulesAccess.syncAlerts.disabledSynced') });
      } else {
        setSyncAlert({ type: "warning", message: t('modulesAccess.syncAlerts.disabledPartial', { status: data.sync_status }) });
      }
      setTimeout(() => setSyncAlert(null), 5000);
    },
    onError: (err: any) => {
      setSyncAlert({ type: "error", message: err.response?.data?.error?.message || t('modulesAccess.syncAlerts.disableFailed') });
      setTimeout(() => setSyncAlert(null), 5000);
    },
  });

  const enableModuleAll = useMutation({
    mutationFn: (module_id: number) =>
      api.post("/subscriptions/enable-module-all", { module_id }).then((r) => r.data.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAllAction(null);
      setSyncAlert({
        type: "success",
        message: `Enabled for ${data.enabled} employee(s)${data.skipped > 0 ? ` (${data.skipped} already had access)` : ""}.`,
      });
      setTimeout(() => setSyncAlert(null), 6000);
    },
    onError: (err: any) => {
      setSyncAlert({ type: "error", message: err.response?.data?.error?.message || "Failed to enable for all" });
      setTimeout(() => setSyncAlert(null), 5000);
    },
  });

  const disableModuleAll = useMutation({
    mutationFn: (module_id: number) =>
      api.post("/subscriptions/disable-module-all", { module_id }).then((r) => r.data.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users-module-map"] });
      qc.invalidateQueries({ queryKey: ["org-subscriptions"] });
      setConfirmAllAction(null);
      setSyncAlert({
        type: "success",
        message: `Removed access for ${data.disabled} employee(s)${data.errors > 0 ? ` (${data.errors} failed)` : ""}.`,
      });
      setTimeout(() => setSyncAlert(null), 6000);
    },
    onError: (err: any) => {
      setSyncAlert({ type: "error", message: err.response?.data?.error?.message || "Failed to disable for all" });
      setTimeout(() => setSyncAlert(null), 5000);
    },
  });

  const handleToggle = (userId: number, moduleId: number, moduleName: string, userName: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      setConfirmAction({ userId, moduleId, moduleName, userName, action: "disable" });
    } else {
      enableModule.mutate({ module_id: moduleId, user_id: userId });
    }
  };

  // Filter users
  let filteredUsers = users;
  if (search) {
    const q = search.toLowerCase();
    filteredUsers = filteredUsers.filter((u: any) =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.emp_code || ""} ${u.designation || ""}`.toLowerCase().includes(q)
    );
  }
  if (filterModule.startsWith("enabled:")) {
    const modId = Number(filterModule.split(":")[1]);
    filteredUsers = filteredUsers.filter((u: any) => u.modules?.some((m: any) => m.module_id === modId));
  } else if (filterModule.startsWith("disabled:")) {
    const modId = Number(filterModule.split(":")[1]);
    filteredUsers = filteredUsers.filter((u: any) => !u.modules?.some((m: any) => m.module_id === modId));
  }

  // Pagination
  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isPending = enableModule.isPending || disableModule.isPending;

  // Stats
  const totalEnabled = users.reduce((acc: number, u: any) => acc + (u.modules?.length || 0), 0);


  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('modulesAccess.title')}</h1>
          <p className="text-gray-500 mt-1">{t('modulesAccess.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Package className="h-4 w-4" /> {t('modulesAccess.modulesCount', { count: subscribedModules.length })}</span>
          <span>{t('modulesAccess.employeesCount', { count: users.length })}</span>
          <span>{t('modulesAccess.seatsAssignedCount', { count: totalEnabled })}</span>
        </div>
      </div>

      {/* Module Seat Cards */}
      {subscribedModules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {subscribedModules.map((m: any) => {
            const sub = activeModules.find((s: any) => s.module_id === m.id);
            const used = sub?.used_seats || 0;
            const total = sub?.total_seats || 0;
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
            const isFilteredOnThis = filterModule === `enabled:${m.id}`;
            return (
              <div
                key={m.id}
                className={`bg-white rounded-xl border p-3 ${
                  isFilteredOnThis ? "border-brand-400 ring-1 ring-brand-200" : "border-gray-200"
                }`}
              >
                {/* #1537 — Card header is a button that filters the employee
                    table below to only show people enabled for this module.
                    Clicking again clears the filter (toggle). The Enable/
                    Disable All buttons below are separate so they don't
                    trigger the filter. */}
                <button
                  type="button"
                  onClick={() => setFilterModule(isFilteredOnThis ? "all" : `enabled:${m.id}`)}
                  aria-label={isFilteredOnThis
                    ? `Clear filter for ${m.name}`
                    : `Show employees enabled for ${m.name}`}
                  aria-pressed={isFilteredOnThis}
                  className="w-full text-left rounded-md -m-1 p-1 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${used > 0 ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-xs font-medium text-gray-700 truncate">{m.name.replace(/^EMP\s+/i, "")}</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">{used}<span className="text-sm font-normal text-gray-400">/{total}</span></div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </button>
                <div className="flex gap-1 mt-3">
                  <button
                    onClick={() => setConfirmAllAction({ moduleId: m.id, moduleName: m.name, action: "enable" })}
                    disabled={enableModuleAll.isPending || disableModuleAll.isPending}
                    className="flex-1 text-xs py-1.5 px-2 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 font-medium disabled:opacity-50 transition-colors"
                  >
                    Enable All
                  </button>
                  <button
                    onClick={() => setConfirmAllAction({ moduleId: m.id, moduleName: m.name, action: "disable" })}
                    disabled={enableModuleAll.isPending || disableModuleAll.isPending}
                    className="flex-1 text-xs py-1.5 px-2 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium disabled:opacity-50 transition-colors"
                  >
                    Disable All
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sync Alert */}
      {syncAlert && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          syncAlert.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
            : syncAlert.type === "warning" ? "bg-amber-50 text-amber-800 border border-amber-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {syncAlert.type === "success" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {syncAlert.message}
          <button onClick={() => setSyncAlert(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder={t('modulesAccess.searchPlaceholder')}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filterModule}
            onChange={(e) => { setFilterModule(e.target.value); setPage(1); }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="all">{t('modulesAccess.allEmployees')}</option>
            <optgroup label={t('modulesAccess.enabledFor')}>
              {subscribedModules.map((m: any) => (
                <option key={`e-${m.id}`} value={`enabled:${m.id}`}>{m.name.replace(/^EMP\s+/i, "")} — {t('modulesAccess.enabledSuffix')}</option>
              ))}
            </optgroup>
            <optgroup label={t('modulesAccess.notEnabledFor')}>
              {subscribedModules.map((m: any) => (
                <option key={`d-${m.id}`} value={`disabled:${m.id}`}>{m.name.replace(/^EMP\s+/i, "")} — {t('modulesAccess.notEnabledSuffix')}</option>
              ))}
            </optgroup>
          </select>
        </div>
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
                <h3 className="text-lg font-semibold text-gray-900">{t('modulesAccess.confirm.title')}</h3>
                <p className="text-xs text-gray-400">{t('modulesAccess.confirm.subtitle')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6"
               dangerouslySetInnerHTML={{
                 __html: t('modulesAccess.confirm.message', { user: confirmAction.userName, module: confirmAction.moduleName })
               }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">{t('modulesAccess.confirm.cancel')}</button>
              <button
                onClick={() => disableModule.mutate({ module_id: confirmAction.moduleId, user_id: confirmAction.userId })}
                disabled={disableModule.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {disableModule.isPending ? t('modulesAccess.confirm.removing') : t('modulesAccess.confirm.remove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm All Action Modal */}
      {confirmAllAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${confirmAllAction.action === "enable" ? "bg-brand-50" : "bg-red-50"}`}>
                <AlertTriangle className={`h-5 w-5 ${confirmAllAction.action === "enable" ? "text-brand-600" : "text-red-600"}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {confirmAllAction.action === "enable" ? "Enable for All Employees" : "Disable for All Employees"}
                </h3>
                <p className="text-xs text-gray-400">
                  {confirmAllAction.action === "enable" ? "This will enable access for all employees" : "This will remove access from all employees"}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to <strong>{confirmAllAction.action}</strong> <strong>{confirmAllAction.moduleName}</strong> for{" "}
              <strong>all employees</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmAllAction(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => {
                  if (confirmAllAction.action === "enable") {
                    enableModuleAll.mutate(confirmAllAction.moduleId);
                  } else {
                    disableModuleAll.mutate(confirmAllAction.moduleId);
                  }
                }}
                disabled={enableModuleAll.isPending || disableModuleAll.isPending}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                  confirmAllAction.action === "enable"
                    ? "bg-brand-600 hover:bg-brand-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {enableModuleAll.isPending || disableModuleAll.isPending
                  ? confirmAllAction.action === "enable" ? "Enabling..." : "Disabling..."
                  : confirmAllAction.action === "enable" ? "Enable for All" : "Disable for All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {/* #1416 — z-index keeps the sticky Employee column above
                   horizontally scrolled toggle cells so they don't overlap. */}
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3 sticky left-0 z-20 bg-gray-50 min-w-[220px] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">{t('modulesAccess.table.employee')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">{t('modulesAccess.table.role')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">{t('modulesAccess.table.designation')}</th>
              {subscribedModules.map((m: any) => (
                <th key={m.id} className="text-center text-xs font-medium text-gray-500 uppercase px-3 py-3 min-w-[90px]">
                  {m.slug.replace("emp-", "").charAt(0).toUpperCase() + m.slug.replace("emp-", "").slice(1)}
                </th>
              ))}
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">{t('modulesAccess.table.modules')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={4 + subscribedModules.length} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> {t('modulesAccess.loading')}
                </td>
              </tr>
            ) : pagedUsers.length === 0 ? (
              <tr>
                <td colSpan={4 + subscribedModules.length} className="px-6 py-12 text-center text-gray-400">
                  {t('modulesAccess.noEmployees')} {search && t('modulesAccess.matchingSearch')} {filterModule !== "all" && t('modulesAccess.withFilter')}
                </td>
              </tr>
            ) : (
              pagedUsers.map((user: any) => {
                const enabledCount = user.modules?.length || 0;
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700 flex-shrink-0">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.first_name} {user.last_name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{user.role ? (t(`roles.${user.role}`) !== `roles.${user.role}` ? t(`roles.${user.role}`) : user.role.replace(/_/g, " ")) : ""}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[120px]">{user.designation || "-"}</td>
                    {subscribedModules.map((m: any) => {
                      const isEnabled = user.modules?.some((um: any) => um.module_id === m.id);
                      // Policy: once EmpMonitor is enabled for an org_admin,
                      // the toggle locks. Org admins are expected to retain
                      // access to the monitoring module so they can manage the
                      // rest of the workforce, so we stop this from being
                      // toggled off by mistake (or by another admin) from here.
                      // Use Settings → Subscriptions to fully unsubscribe.
                      const isOrgAdminMonitorLock =
                        user.role === "org_admin" && m.slug === "emp-monitor" && isEnabled;
                      return (
                        <td key={m.id} className="px-3 py-3 text-center">
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
                            disabled={isPending || isOrgAdminMonitorLock}
                            title={
                              isOrgAdminMonitorLock
                                ? "EmpMonitor stays enabled for Org Admins. Disable the module in Settings → Subscriptions if you need to remove it."
                                : undefined
                            }
                            aria-label={
                              isOrgAdminMonitorLock
                                ? `${m.name} is locked on for Org Admin`
                                : undefined
                            }
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              isEnabled ? "bg-brand-600" : "bg-gray-200 hover:bg-gray-300"
                            } ${
                              isOrgAdminMonitorLock
                                ? "cursor-not-allowed opacity-60"
                                : "disabled:opacity-50"
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabledCount > 0 ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-400"}`}>
                        {enabledCount}/{subscribedModules.length}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              {t('modulesAccess.pagination.showing', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, totalUsers), total: totalUsers })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-white"
              >
                <ChevronLeft className="h-4 w-4" /> {t('modulesAccess.pagination.previous')}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-white"
              >
                {t('modulesAccess.pagination.next')} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
