import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import { useViewModeStore, hasAnyAdminPermission } from "@/lib/use-view-mode";
import { PlusCircle, Clock, CheckCircle2, XCircle, CalendarDays, Plus } from "lucide-react";

interface CompOffRequest {
  id: number;
  user_id: number;
  worked_date: string;
  expires_on: string;
  reason: string;
  days: number;
  status: string;
  approved_by: number | null;
  rejection_reason: string | null;
  created_at: string;
  user_first_name?: string | null;
  user_last_name?: string | null;
  user_email?: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", icon: Clock },
  approved: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", icon: XCircle },
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

export default function CompOffPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  // Personal sections (own balance, own request form, "My Requests") belong to
  // the self experience. Mirror the DashboardLayout view-toggle rule so that a
  // non-HR user with admin permissions who flips to Admin view sees only the HR
  // management sections (Credit Balance, Pending Approvals), not their own
  // comp-off. HR users have no toggle → isSelfView stays true (unchanged).
  const { permissions } = usePermissions();
  const viewMode = useViewModeStore((s) => s.viewMode);
  const showViewToggle = !isHR && hasAnyAdminPermission(permissions);
  const isSelfView = !(showViewToggle && viewMode === "admin");
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"my" | "pending">("my");
  // In Admin view the "My Requests" tab is hidden, so force the Pending
  // Approvals table regardless of the persisted tab state.
  const effectiveTab = isSelfView ? tab : "pending";
  const [rejectReason, setRejectReason] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  const [form, setForm] = useState({
    worked_date: "",
    expires_on: "",
    reason: "",
    days: 1,
  });

  // My comp-off requests
  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["comp-off-my"],
    queryFn: () => api.get("/leave/comp-off/my").then((r) => r.data),
  });
  const myRequests: CompOffRequest[] = myData?.data || [];

  // Pending comp-off requests (HR/manager view)
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["comp-off-pending"],
    queryFn: () => api.get("/leave/comp-off/pending").then((r) => r.data),
    enabled: !!isHR,
  });
  const pendingRequests: CompOffRequest[] = pendingData?.data || [];

  // Comp-off balance
  const { data: balanceData } = useQuery({
    queryKey: ["comp-off-balance"],
    queryFn: () => api.get("/leave/comp-off/balance").then((r) => r.data.data),
  });

  // Submit comp-off request
  const submitMut = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/leave/comp-off/request", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      qc.invalidateQueries({ queryKey: ["comp-off-balance"] });
      setShowForm(false);
      setForm({ worked_date: "", expires_on: "", reason: "", days: 1 });
    },
  });

  // Approve
  const approveMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/comp-off/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-pending"] });
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      qc.invalidateQueries({ queryKey: ["comp-off-balance"] });
      setActionId(null);
    },
  });

  // Reject
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.put(`/leave/comp-off/${id}/reject`, { reason }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-pending"] });
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      setActionId(null);
      setRejectReason("");
    },
  });

  // #1933 — HR-only manual credit/debit of an employee's comp-off balance.
  // Loads the org's employee directory once when the form is opened, then
  // posts to /leave/comp-off/balance/adjust. Negative days debit; the
  // server rejects debits that would take a balance negative.
  const [showCredit, setShowCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ user_id: 0, days: 1, reason: "" });
  const [creditError, setCreditError] = useState<string | null>(null);
  const { data: employeesData } = useQuery({
    queryKey: ["comp-off-employees"],
    queryFn: () =>
      api.get("/employees", { params: { per_page: 500 } }).then((r) => r.data.data || []),
    enabled: !!isHR && showCredit,
  });
  const employeeOptions: Array<{ id: number; first_name: string; last_name: string; email?: string }> =
    Array.isArray(employeesData) ? employeesData : [];
  const creditMut = useMutation({
    mutationFn: (data: typeof creditForm) =>
      api
        .post("/leave/comp-off/balance/adjust", {
          user_id: data.user_id,
          days: data.days,
          reason: data.reason || undefined,
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-balance"] });
      qc.invalidateQueries({ queryKey: ["comp-off-pending"] });
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      setShowCredit(false);
      setCreditForm({ user_id: 0, days: 1, reason: "" });
      setCreditError(null);
    },
    onError: (err: any) => {
      setCreditError(
        err?.response?.data?.error?.message ||
          "Failed to adjust balance. Check the days and try again.",
      );
    },
  });
  const handleCreditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreditError(null);
    if (!creditForm.user_id) {
      setCreditError("Please pick an employee.");
      return;
    }
    if (!Number.isFinite(creditForm.days) || creditForm.days === 0) {
      setCreditError("Enter a non-zero number of days.");
      return;
    }
    creditMut.mutate(creditForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMut.mutate(form);
  };

  // Auto-set expiry to 30 days from worked date
  const handleWorkedDateChange = (date: string) => {
    const expiryDate = new Date(date);
    expiryDate.setDate(expiryDate.getDate() + 30);
    setForm({
      ...form,
      worked_date: date,
      expires_on: expiryDate.toISOString().slice(0, 10),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('leave.compOff.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('leave.compOff.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* #1933 — HR-only Credit Balance entry point. Lets admins grant
              comp-off days without going through the request/approve flow. */}
          {isHR && (
            <button
              onClick={() => setShowCredit((v) => !v)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Credit Balance
            </button>
          )}
          {isSelfView && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              <PlusCircle className="h-4 w-4" /> {t('leave.compOff.request')}
            </button>
          )}
        </div>
      </div>

      {/* Credit Balance Form (HR-only, #1933) */}
      {isHR && showCredit && (
        <form
          onSubmit={handleCreditSubmit}
          className="bg-card rounded-xl border border-emerald-200 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-foreground mb-1">Credit / Debit Comp-Off Balance</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Manually grant days to an employee's comp-off balance. Use a negative number to debit.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Employee <span className="text-red-500">*</span>
              </label>
              <select
                value={creditForm.user_id || ""}
                onChange={(e) => setCreditForm({ ...creditForm, user_id: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card"
                required
              >
                <option value="">— Select employee —</option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                    {emp.email ? ` · ${emp.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Days <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.5"
                value={creditForm.days}
                onChange={(e) => setCreditForm({ ...creditForm, days: Number(e.target.value) })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Positive to credit, negative to debit.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Reason</label>
              <input
                type="text"
                value={creditForm.reason}
                onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                placeholder="e.g. Year-end carry forward"
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          </div>
          {creditError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{creditError}</p>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowCredit(false);
                setCreditError(null);
                setCreditForm({ user_id: 0, days: 1, reason: "" });
              }}
              className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creditMut.isPending}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {creditMut.isPending ? "Saving..." : "Apply Adjustment"}
            </button>
          </div>
        </form>
      )}

      {/* Balance Cards — own comp-off balance & counts; self view only. */}
      {isSelfView && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {balanceData?.balance ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">{t('leave.compOff.balanceLabel')}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('leave.compOff.usedOfAllocated', { used: balanceData?.total_used ?? 0, allocated: balanceData?.total_allocated ?? 0 })}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {myRequests.filter((r) => r.status === "pending").length}
              </p>
              <p className="text-xs text-muted-foreground">{t('leave.compOff.pendingRequests')}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {myRequests.filter((r) => r.status === "approved").length}
              </p>
              <p className="text-xs text-muted-foreground">{t('leave.compOff.approvedRequests')}</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Request Form — own comp-off request; self view only. */}
      {isSelfView && showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-xl border border-border p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('leave.compOff.requestTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('leave.compOff.dateWorked')} <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.worked_date}
                onChange={(e) => handleWorkedDateChange(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('leave.compOff.expiresOn')} <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.expires_on}
                onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">{t('leave.compOff.expiryHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('leave.compOff.days')}</label>
              <select
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
              >
                <option value={0.5}>{t('leave.compOff.daysHalf')}</option>
                <option value={1}>{t('leave.compOff.daysFull')}</option>
                <option value={1.5}>{t('leave.compOff.days1_5')}</option>
                <option value={2}>{t('leave.compOff.days2')}</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('leave.compOff.reason')} <span className="text-red-500">*</span></label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                rows={2}
                placeholder={t('leave.compOff.reasonPlaceholder')}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
            >
              {t('leave.compOff.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitMut.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {t('leave.compOff.submit')}
            </button>
          </div>
          {submitMut.isError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              {(submitMut.error as any)?.response?.data?.error?.message || t('leave.compOff.submitFailed')}
            </p>
          )}
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {isSelfView && (
          <button
            onClick={() => setTab("my")}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${
              effectiveTab === "my"
                ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t('leave.compOff.myRequests')}
          </button>
        )}
        {isHR && (
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${
              effectiveTab === "pending"
                ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t('leave.compOff.pendingApprovals')}
            {pendingRequests.length > 0 && (
              <span className="ml-2 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs px-1.5 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* My Requests Table — own comp-off history; self view only. */}
      {isSelfView && effectiveTab === "my" && (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.workedDate')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.days')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.expiresOn')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.reason')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.status')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.submitted')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {myLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t('leave.compOff.loading')}</td>
                </tr>
              ) : myRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    {t('leave.compOff.noRequests')}
                  </td>
                </tr>
              ) : (
                myRequests.map((req) => {
                  const style = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
                  const Icon = style.icon;
                  return (
                    <tr key={req.id} className="hover:bg-muted">
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{req.worked_date}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{Number(req.days)}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{req.expires_on}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">{req.reason}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                          <Icon className="h-3 w-3" /> {t(`leave.compOff.status${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`, { defaultValue: req.status })}
                        </span>
                        {req.rejection_reason && (
                          <p className="text-xs text-red-500 mt-1">{req.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Approvals Table (HR View) */}
      {effectiveTab === "pending" && isHR && (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.employee')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.workedDate')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.days')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.reason')}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t('leave.compOff.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">{t('leave.compOff.loading')}</td>
                </tr>
              ) : pendingRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    {t('leave.compOff.noPending')}
                  </td>
                </tr>
              ) : (
                pendingRequests.map((req) => {
                  const fullName = [req.user_first_name, req.user_last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const displayName =
                    fullName ||
                    req.user_email ||
                    t('leave.compOff.userHash', { id: req.user_id });
                  return (
                  <tr key={req.id} className="hover:bg-muted">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {displayName}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{req.worked_date}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{Number(req.days)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">{req.reason}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveMut.mutate(req.id)}
                            disabled={approveMut.isPending}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3 inline mr-1" />{t('leave.compOff.approve')}
                          </button>
                          <button
                            onClick={() => setActionId(actionId === req.id ? null : req.id)}
                            className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40"
                          >
                            <XCircle className="h-3 w-3 inline mr-1" />{t('leave.compOff.reject')}
                          </button>
                        </div>
                        {actionId === req.id && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder={t('leave.compOff.rejectionReason')}
                              className="bg-card text-foreground px-2 py-1 border border-border rounded text-xs flex-1"
                            />
                            <button
                              onClick={() => rejectMut.mutate({ id: req.id, reason: rejectReason })}
                              disabled={rejectMut.isPending}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              {t('leave.compOff.confirmReject')}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
