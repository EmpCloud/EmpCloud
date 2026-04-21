import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { Link } from "react-router-dom";
import { CalendarDays, PlusCircle, Clock, CheckCircle2, XCircle, Ban, AlertCircle, Settings2 } from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin", "manager"];

interface LeaveBalance {
  id: number;
  leave_type_id: number;
  year: number;
  total_allocated: number;
  total_used: number;
  total_carry_forward: number;
  balance: number;
}

interface LeaveType {
  id: number;
  name: string;
  code: string;
  color: string | null;
  is_paid: boolean;
  is_active: boolean | number;
}

export default function LeaveDashboardPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user ? HR_ROLES.includes(user.role) : false;
  const [showApply, setShowApply] = useState(false);

  const { data: balances = [], isLoading: loadingBalances } = useQuery<LeaveBalance[]>({
    queryKey: ["leave-balances"],
    queryFn: () => api.get("/leave/balances").then((r) => r.data.data),
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });

  const [form, setForm] = useState({
    leave_type_id: 0,
    start_date: "",
    end_date: "",
    days_count: 1,
    is_half_day: false,
    half_day_type: "" as string | null,
    reason: "",
  });

  const applyLeave = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/leave/applications", {
        ...data,
        half_day_type: data.half_day_type || null,
      }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
      qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
      setShowApply(false);
      setForm({ leave_type_id: 0, start_date: "", end_date: "", days_count: 1, is_half_day: false, half_day_type: "", reason: "" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leave_type_id || form.leave_type_id === 0) return;
    if (!form.start_date || !form.end_date || !form.reason) return;
    applyLeave.mutate(form);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('leave.dashboard.title')}</h1>
          <p className="text-gray-500 mt-1">{t('leave.dashboard.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link
              to="/leave/settings"
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              <Settings2 className="h-4 w-4" /> {t('leave.dashboard.leaveSettings')}
            </Link>
          )}
          <button
            onClick={() => setShowApply(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <PlusCircle className="h-4 w-4" /> {t('leave.applyLeave')}
          </button>
        </div>
      </div>

      {/* Balance Cards — #1409: render one card per active leave type so
          employees see all configured types even when a balance row has not
          yet been initialized (missing rows render as zero). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loadingBalances ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                <div className="h-7 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-2 w-full bg-gray-200 rounded-full" />
              </div>
            ))}
          </>
        ) : leaveTypes.filter((lt) => Boolean(lt.is_active)).length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-8">
            {t('leave.noTypes')}
          </div>
        ) : (
          leaveTypes
            .filter((lt) => Boolean(lt.is_active))
            .map((type) => {
              const bal = balances.find((b) => b.leave_type_id === type.id);
              const typeColor = type.color ?? "#6366f1";
              const allocated = Number(bal?.total_allocated ?? 0);
              const used = Number(bal?.total_used ?? 0);
              const carry = Number(bal?.total_carry_forward ?? 0);
              const balance = Number(bal?.balance ?? 0);
              const total = allocated + carry;
              return (
                <div
                  key={type.id}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: typeColor }}
                    />
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {type.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mb-3 ml-6">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${type.is_paid ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-500"}`}>
                      {type.is_paid ? t('leave.dashboard.paid') : t('leave.dashboard.unpaid')}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-medium text-gray-400">{t('leave.leaveBalance')}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {balance} <span className="text-sm font-normal text-gray-400">{t('leave.dashboard.days')}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t('leave.dashboard.usedOfAllocated', { used, allocated })}
                    {carry > 0 && ` ${t('leave.dashboard.carrySuffix', { carry })}`}
                  </p>
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${total > 0 ? Math.min(100, (used / total) * 100) : 0}%`,
                        backgroundColor: typeColor,
                      }}
                    />
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Quick Apply Form */}
      {showApply && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('leave.dashboard.applyTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.leaveType')} <span className="text-red-500">*</span></label>
              <select
                value={form.leave_type_id}
                onChange={(e) => setForm({ ...form, leave_type_id: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value={0} disabled>{t('leave.dashboard.selectType')}</option>
                {leaveTypes
                  .filter((lt) => Boolean(lt.is_active))
                  .filter((lt, i, arr) => arr.findIndex((x) => x.name === lt.name) === i)
                  .map((lt) => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.startDate')} <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => {
                  const startDate = e.target.value;
                  let days = form.days_count;
                  if (startDate && form.end_date) {
                    const diff = Math.ceil((new Date(form.end_date).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    if (diff > 0) days = form.is_half_day ? 0.5 : diff;
                  }
                  setForm({ ...form, start_date: startDate, days_count: days });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.endDate')} <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => {
                  const endDate = e.target.value;
                  let days = form.days_count;
                  if (form.start_date && endDate) {
                    const diff = Math.ceil((new Date(endDate).getTime() - new Date(form.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    if (diff > 0) days = form.is_half_day ? 0.5 : diff;
                  }
                  setForm({ ...form, end_date: endDate, days_count: days });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.dashboard.numberOfDays')} <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="365"
                value={form.days_count}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val >= 0.5 && val <= 365) setForm({ ...form, days_count: val });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_half_day}
                  onChange={(e) => setForm({ ...form, is_half_day: e.target.checked, half_day_type: e.target.checked ? "first_half" : "" })}
                  className="rounded border-gray-300"
                />
                {t('leave.dashboard.halfDay')}
              </label>
              {form.is_half_day && (
                <select
                  value={form.half_day_type ?? ""}
                  onChange={(e) => setForm({ ...form, half_day_type: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="first_half">{t('leave.dashboard.firstHalf')}</option>
                  <option value="second_half">{t('leave.dashboard.secondHalf')}</option>
                </select>
              )}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.reason')} <span className="text-red-500">*</span></label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
                required
              />
            </div>
          </div>
          {applyLeave.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mt-4">
              {(applyLeave.error && typeof applyLeave.error === "object" && "response" in applyLeave.error ? (applyLeave.error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message : null) || t('leave.dashboard.submitError')}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowApply(false);
                setForm({ leave_type_id: 0, start_date: "", end_date: "", days_count: 1, is_half_day: false, half_day_type: "", reason: "" });
                applyLeave.reset();
              }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={applyLeave.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" /> {applyLeave.isPending ? t('leave.dashboard.submitting') : t('leave.dashboard.submitApplication')}
            </button>
          </div>
        </form>
      )}

      {/* Pending Approvals — Admin/Manager View */}
      {isAdmin && <PendingApprovals leaveTypes={leaveTypes} />}

      {/* Recent Applications */}
      <RecentApplications leaveTypes={leaveTypes} locale={i18n.language} />

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500 mt-6">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-500" /> {t('common.pending')}</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {t('common.approved')}</span>
        <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> {t('common.rejected')}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Applications sub-component
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  cancelled: { bg: "bg-gray-50", text: "text-gray-500", icon: Ban },
};

function RecentApplications({ leaveTypes, locale }: { leaveTypes: LeaveType[]; locale: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["leave-applications-me"],
    queryFn: () =>
      api
        .get("/leave/applications/me", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data),
  });

  const applications = data?.data || [];
  const getTypeName = (id: number) => leaveTypes.find((lt) => lt.id === id)?.name ?? "-";
  const statusLabel = (s: string) => {
    const key = s === "pending" ? "common.pending" : s === "approved" ? "common.approved" : s === "rejected" ? "common.rejected" : s === "cancelled" ? "common.cancelled" : "";
    return key ? t(key) : s;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t('leave.dashboard.recentTitle')}</h2>
      </div>
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.typeHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.datesHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.daysHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.statusHeader')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded-full" /></td>
                </tr>
              ))}
            </>
          ) : applications.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-gray-400">{t('leave.dashboard.noApplications')}</td>
            </tr>
          ) : (
            applications.map((app: any) => {
              const style = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
              const Icon = style.icon;
              return (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {getTypeName(app.leave_type_id)}
                    {app.is_half_day && <span className="ml-1 text-xs text-gray-400">{t('leave.dashboard.halfSuffix')}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(app.start_date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })} &mdash; {new Date(app.end_date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {Number(app.days_count)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                      <Icon className="h-3 w-3" /> {statusLabel(app.status)}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending Approvals sub-component — shows all pending leave requests for admins
// ---------------------------------------------------------------------------

function PendingApprovals({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: string; success: number; failed: number } | null>(null);
  // #1411 — show server errors instead of silently swallowing them
  const [actionError, setActionError] = useState<string | null>(null);
  const extractErr = (err: any) =>
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    t('leave.dashboard.actionFailed');

  const { data, isLoading } = useQuery({
    queryKey: ["leave-applications-pending"],
    queryFn: () =>
      api
        .get("/leave/applications", { params: { page: 1, per_page: 20, status: "pending" } })
        .then((r) => r.data),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, remarks: r }: { id: number; remarks: string }) =>
      api.put(`/leave/applications/${id}/approve`, { remarks: r }).then((res) => res.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      setActionId(null);
      setRemarks("");
      setActionError(null);
    },
    onError: (err: any) => setActionError(extractErr(err)),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, remarks: r }: { id: number; remarks: string }) =>
      api.put(`/leave/applications/${id}/reject`, { remarks: r }).then((res) => res.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      setActionId(null);
      setRemarks("");
      setActionError(null);
    },
    onError: (err: any) => setActionError(extractErr(err)),
  });

  const applications = data?.data || [];
  const getTypeName = (id: number) => leaveTypes.find((lt) => lt.id === id)?.name ?? "-";

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === applications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map((a: any) => a.id)));
    }
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    setBulkResult(null);
    let success = 0;
    let failed = 0;

    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        if (action === "approve") {
          await api.put(`/leave/applications/${id}/approve`, { remarks: "" });
        } else {
          await api.put(`/leave/applications/${id}/reject`, { remarks: "" });
        }
        success++;
      } catch {
        failed++;
      }
    }

    setBulkProcessing(false);
    setBulkResult({ type: action, success, failed });
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
    qc.invalidateQueries({ queryKey: ["leave-balances"] });
    qc.invalidateQueries({ queryKey: ["leave-applications"] });

    // Auto-clear result after 5 seconds
    setTimeout(() => setBulkResult(null), 5000);
  };

  if (isLoading) return null;
  if (applications.length === 0) return null;

  const allSelected = applications.length > 0 && selectedIds.size === applications.length;

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-amber-200 bg-amber-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {t('leave.dashboard.pendingTitle')} ({applications.length})
          </h2>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{t('leave.dashboard.selectedCount', { count: selectedIds.size })}</span>
              <button
                onClick={() => handleBulkAction("approve")}
                disabled={bulkProcessing}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {bulkProcessing ? t('leave.dashboard.processing') : t('leave.dashboard.approveSelected')}
              </button>
              <button
                onClick={() => handleBulkAction("reject")}
                disabled={bulkProcessing}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {bulkProcessing ? t('leave.dashboard.processing') : t('leave.dashboard.rejectSelected')}
              </button>
            </div>
          )}
        </div>
      </div>

      {bulkResult && (
        <div className={`px-6 py-3 text-sm font-medium ${
          bulkResult.type === "approve" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {bulkResult.type === "approve"
            ? t('leave.dashboard.bulkApproved', { count: bulkResult.success })
            : t('leave.dashboard.bulkRejected', { count: bulkResult.success })}
          {bulkResult.failed > 0 && ` ${t('leave.dashboard.bulkFailed', { count: bulkResult.failed })}`}
        </div>
      )}

      {/* #1411 — surface server errors on approve/reject actions */}
      {actionError && (
        <div className="flex items-start justify-between gap-3 px-6 py-3 bg-red-50 text-red-700 text-sm border-t border-red-200">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            {t('leave.dashboard.dismiss')}
          </button>
        </div>
      )}

      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.employeeHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.typeHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.datesHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.daysHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.reasonHeader')}</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('leave.dashboard.actionsHeader')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {applications.map((app: any) => (
            <tr key={app.id} className={`hover:bg-gray-50 ${selectedIds.has(app.id) ? "bg-brand-50/50" : ""}`}>
              <td className="px-6 py-4">
                <input
                  type="checkbox"
                  checked={selectedIds.has(app.id)}
                  onChange={() => toggleSelect(app.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </td>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">
                {app.user_first_name ? `${app.user_first_name} ${app.user_last_name || ""}` : t('leave.dashboard.userFallback', { id: app.user_id })}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {getTypeName(app.leave_type_id)}
                {app.is_half_day && <span className="ml-1 text-xs text-gray-400">{t('leave.dashboard.halfSuffix')}</span>}
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {new Date(app.start_date).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" })} &mdash; {new Date(app.end_date).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" })}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700 font-medium">{Number(app.days_count)}</td>
              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{app.reason}</td>
              <td className="px-6 py-4">
                {actionId === app.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={t('leave.dashboard.remarksPlaceholder')}
                      className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[120px]"
                    />
                    <button
                      onClick={() => approveMut.mutate({ id: app.id, remarks })}
                      disabled={approveMut.isPending}
                      className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {t('leave.approve')}
                    </button>
                    <button
                      onClick={() => rejectMut.mutate({ id: app.id, remarks })}
                      disabled={rejectMut.isPending}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {t('leave.reject')}
                    </button>
                    <button
                      onClick={() => { setActionId(null); setRemarks(""); }}
                      className="text-xs text-gray-500 px-1"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActionId(app.id)}
                    className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 font-medium"
                  >
                    {t('leave.dashboard.review')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
