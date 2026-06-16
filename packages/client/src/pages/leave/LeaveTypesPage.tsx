import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import { useStickyLocationFilter } from "@/lib/use-sticky-location";
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  Settings2,
  Users,
  Calendar as CalendarIcon,
  RotateCcw,
  Layers,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface LeaveType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_paid: boolean;
  is_carry_forward: boolean;
  max_carry_forward_days: number;
  is_encashable: boolean;
  requires_approval: boolean;
  is_active: boolean;
  color: string | null;
}

interface LeavePolicy {
  id: number;
  leave_type_id: number;
  name: string;
  annual_quota: number;
  accrual_type: string;
  applicable_from_months: number;
  applicable_gender: string | null;
  max_consecutive_days: number | null;
  min_days_before_application: number;
  period_carry_forward: boolean;
  is_active: boolean;
}

interface OrgConfig {
  fiscal_year_start_month: number;
  fiscal_year_label_current: string;
}

interface BalanceSummary {
  id: number;
  leave_type_id: number;
  leave_type_name?: string;
  leave_type_code?: string;
  leave_type_color?: string | null;
  total_allocated: number;
  extra_allocated: number;
  total_used: number;
  period_used: number;
  available_now?: number;
  period_quota?: number;
  fiscal_year_label?: string;
}

interface EmployeeBalanceRow {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  emp_code: string | null;
  department_id: number | null;
  department_name: string | null;
  date_of_joining: string | null;
  balances: BalanceSummary[];
}

const EMPTY_TYPE = {
  name: "",
  code: "",
  description: "",
  is_paid: true,
  is_carry_forward: false,
  max_carry_forward_days: 0,
  is_encashable: false,
  requires_approval: true,
  color: "#6366f1",
  annual_quota: 12,
};

const EMPTY_POLICY = {
  leave_type_id: 0,
  name: "",
  annual_quota: 12,
  accrual_type: "annual" as string,
  applicable_from_months: 0,
  // null = applicable to all genders; "male" | "female" | "other" restricts.
  applicable_gender: null as string | null,
  max_consecutive_days: null as number | null,
  min_days_before_application: 0,
  period_carry_forward: false,
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type TabKey = "types" | "policies" | "employees" | "settings";

export default function LeaveTypesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("settings");
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY);
  const [typeFormError, setTypeFormError] = useState<string | null>(null);
  // Confirm-dialog state (replaces window.confirm). Each holds the id of the
  // leave type / policy awaiting confirmation before the destructive action.
  const [deleteTypeId, setDeleteTypeId] = useState<number | null>(null);
  const [deletePolicyId, setDeletePolicyId] = useState<number | null>(null);

  // ---- Queries ----
  const { data: leaveTypes = [], isLoading: loadingTypes } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });
  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["leave-policies"],
    queryFn: () => api.get("/leave/policies").then((r) => r.data.data),
  });
  const { data: orgConfig } = useQuery<OrgConfig>({
    queryKey: ["leave-org-config"],
    queryFn: () => api.get("/leave/config").then((r) => r.data.data),
  });

  // ---- Mutations ----
  const createType = useMutation({
    mutationFn: (data: typeof EMPTY_TYPE) =>
      api.post("/leave/types", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      setShowTypeForm(false);
      setTypeForm(EMPTY_TYPE);
      setTypeFormError(null);
    },
    onError: (err: any) => {
      setTypeFormError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          "Failed to create leave type",
      );
    },
  });
  const updateType = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_TYPE> }) =>
      api.put(`/leave/types/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      setEditingType(null);
      setShowTypeForm(false);
      setTypeForm(EMPTY_TYPE);
      setTypeFormError(null);
    },
    onError: (err: any) => {
      setTypeFormError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          "Failed to update leave type",
      );
    },
  });
  const deleteType = useMutation({
    mutationFn: (id: number) => api.delete(`/leave/types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      setDeleteTypeId(null);
    },
  });
  const reactivateType = useMutation({
    mutationFn: (id: number) => api.post(`/leave/types/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-types"] }),
  });
  const createPolicy = useMutation({
    mutationFn: (data: typeof EMPTY_POLICY) =>
      api.post("/leave/policies", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      setShowPolicyForm(false);
      setPolicyForm(EMPTY_POLICY);
      setEditingPolicy(null);
    },
  });
  const updatePolicy = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_POLICY> }) =>
      api.put(`/leave/policies/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      setEditingPolicy(null);
      setShowPolicyForm(false);
      setPolicyForm(EMPTY_POLICY);
    },
  });
  const deletePolicy = useMutation({
    mutationFn: (id: number) => api.delete(`/leave/policies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      setDeletePolicyId(null);
    },
  });
  const initBalances = useMutation({
    mutationFn: () =>
      api
        .post("/leave/balances/initialize", { year: new Date().getFullYear() })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
    },
  });
  const updateOrgConfig = useMutation({
    mutationFn: (fiscal_year_start_month: number) =>
      api
        .put("/leave/config", { fiscal_year_start_month })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-org-config"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
    },
  });

  // ---- Handlers ----
  const handleTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTypeFormError(null);
    if (editingType) {
      updateType.mutate({ id: editingType.id, data: typeForm });
    } else {
      createType.mutate(typeForm);
    }
  };
  const startEdit = (lt: LeaveType) => {
    setTypeFormError(null);
    setEditingType(lt);
    setTypeForm({
      name: lt.name,
      code: lt.code,
      description: lt.description ?? "",
      is_paid: lt.is_paid,
      is_carry_forward: lt.is_carry_forward,
      max_carry_forward_days: lt.max_carry_forward_days,
      is_encashable: lt.is_encashable,
      requires_approval: lt.requires_approval,
      color: lt.color ?? "#6366f1",
      annual_quota: 12,
    });
    setShowTypeForm(true);
  };
  const handlePolicySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPolicy) {
      updatePolicy.mutate({ id: editingPolicy.id, data: policyForm });
    } else {
      createPolicy.mutate(policyForm);
    }
  };
  const startEditPolicy = (p: LeavePolicy) => {
    setEditingPolicy(p);
    setPolicyForm({
      leave_type_id: p.leave_type_id,
      name: p.name,
      annual_quota: p.annual_quota,
      accrual_type: p.accrual_type,
      applicable_from_months: p.applicable_from_months,
      applicable_gender: p.applicable_gender ?? null,
      max_consecutive_days: p.max_consecutive_days,
      min_days_before_application: p.min_days_before_application,
      period_carry_forward: !!p.period_carry_forward,
    });
    setShowPolicyForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Configuration</h1>
          <p className="text-gray-500 mt-1">
            {orgConfig
              ? `Fiscal year ${orgConfig.fiscal_year_label_current} — manage settings, types, policies, and employee balances.`
              : "Manage settings, types, policies, and employee balances."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => initBalances.mutate()}
            disabled={initBalances.isPending}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            <Settings2 className="h-4 w-4" />
            {initBalances.isPending ? "Initializing..." : "Initialize Balances"}
          </button>
        </div>
      </div>

      {initBalances.isSuccess && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {((initBalances.data as any)?.initialized ?? 0) > 0
            ? `Balances initialized: ${(initBalances.data as any).initialized} record(s) created.`
            : "All users already have balance rows for every active policy. No new records were created."}
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div className="flex border-b border-gray-200 mb-6 -mx-4 px-4 lg:mx-0 overflow-x-auto">
        {[
          { key: "settings", label: "Settings", icon: Settings2 },
          { key: "types", label: "Leave Types", icon: Layers },
          { key: "policies", label: "Leave Policies", icon: CalendarIcon },
          { key: "employees", label: "Employee Leaves", icon: Users },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as TabKey)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "settings" && (
        <SettingsSection
          orgConfig={orgConfig}
          isPending={updateOrgConfig.isPending}
          onSave={(m) => updateOrgConfig.mutate(m)}
        />
      )}

      {tab === "types" && (
        <TypesSection
          loadingTypes={loadingTypes}
          leaveTypes={leaveTypes}
          showTypeForm={showTypeForm}
          setShowTypeForm={setShowTypeForm}
          editingType={editingType}
          setEditingType={setEditingType}
          typeForm={typeForm}
          setTypeForm={setTypeForm}
          typeFormError={typeFormError}
          onSubmit={handleTypeSubmit}
          onStartEdit={startEdit}
          onDelete={(id) => setDeleteTypeId(id)}
          onReactivate={(id) => reactivateType.mutate(id)}
          createPending={createType.isPending}
          updatePending={updateType.isPending}
          t={t}
        />
      )}

      {tab === "policies" && (
        <PoliciesSection
          policies={policies}
          leaveTypes={leaveTypes}
          showPolicyForm={showPolicyForm}
          setShowPolicyForm={setShowPolicyForm}
          editingPolicy={editingPolicy}
          setEditingPolicy={setEditingPolicy}
          policyForm={policyForm}
          setPolicyForm={setPolicyForm}
          onSubmit={handlePolicySubmit}
          onStartEdit={startEditPolicy}
          onDelete={(id) => setDeletePolicyId(id)}
          createPending={createPolicy.isPending}
          updatePending={updatePolicy.isPending}
          t={t}
        />
      )}

      {tab === "employees" && (
        <EmployeesSection leaveTypes={leaveTypes} />
      )}

      <ConfirmDialog
        open={deleteTypeId !== null}
        title="Deactivate this leave type?"
        description="The data is preserved and you can reactivate later."
        confirmText="Deactivate"
        variant="danger"
        loading={deleteType.isPending}
        onConfirm={() => deleteTypeId !== null && deleteType.mutate(deleteTypeId)}
        onCancel={() => setDeleteTypeId(null)}
      />

      <ConfirmDialog
        open={deletePolicyId !== null}
        title="Delete this leave policy?"
        description="This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deletePolicy.isPending}
        onConfirm={() => deletePolicyId !== null && deletePolicy.mutate(deletePolicyId)}
        onCancel={() => setDeletePolicyId(null)}
      />
    </div>
  );
}

// ============================================================================
// Settings Section — fiscal year start
// ============================================================================
function SettingsSection({
  orgConfig,
  isPending,
  onSave,
}: {
  orgConfig: OrgConfig | undefined;
  isPending: boolean;
  onSave: (month: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  // Confirm-dialog state (replaces window.confirm for changing the fiscal year).
  const [confirmFiscalChange, setConfirmFiscalChange] = useState(false);
  const month = pending ?? orgConfig?.fiscal_year_start_month ?? 4;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fiscal Year Start Month
          </label>
          <select
            value={month}
            onChange={(e) => setPending(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Sessions run {MONTHS[month - 1]} YYYY –{" "}
            {MONTHS[(month + 10) % 12]} YYYY+1. Default: April (Indian fiscal year).
          </p>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (pending != null && pending !== orgConfig?.fiscal_year_start_month) {
                setConfirmFiscalChange(true);
              }
            }}
            disabled={isPending || pending == null || pending === orgConfig?.fiscal_year_start_month}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {orgConfig && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
          <div>
            <span className="font-medium">Current fiscal year:</span>{" "}
            {orgConfig.fiscal_year_label_current}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmFiscalChange}
        title="Change fiscal year?"
        description="Existing balance rows for the previous fiscal year remain in place; new initialization will use the new start month."
        confirmText="Change"
        variant="info"
        loading={isPending}
        onConfirm={() => {
          if (pending != null) onSave(pending);
          setConfirmFiscalChange(false);
        }}
        onCancel={() => setConfirmFiscalChange(false)}
      />
    </div>
  );
}

// ============================================================================
// Types Section — extracted from original page
// ============================================================================
function TypesSection(props: {
  loadingTypes: boolean;
  leaveTypes: LeaveType[];
  showTypeForm: boolean;
  setShowTypeForm: (b: boolean) => void;
  editingType: LeaveType | null;
  setEditingType: (t: LeaveType | null) => void;
  typeForm: typeof EMPTY_TYPE;
  setTypeForm: (t: typeof EMPTY_TYPE) => void;
  typeFormError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onStartEdit: (lt: LeaveType) => void;
  onDelete: (id: number) => void;
  onReactivate: (id: number) => void;
  createPending: boolean;
  updatePending: boolean;
  t: any;
}) {
  const {
    loadingTypes, leaveTypes, showTypeForm, setShowTypeForm, editingType, setEditingType,
    typeForm, setTypeForm, typeFormError, onSubmit, onStartEdit, onDelete, onReactivate,
    createPending, updatePending, t,
  } = props;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Leave Types</h2>
        <button
          onClick={() => {
            setShowTypeForm(!showTypeForm);
            setEditingType(null);
            setTypeForm(EMPTY_TYPE);
          }}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-4 w-4" /> Add Type
        </button>
      </div>

      {showTypeForm && (
        <form onSubmit={onSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          {typeFormError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {typeFormError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
                disabled={!!editingType}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input
                type="color"
                value={typeForm.color}
                onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                className="w-full h-10 border border-gray-300 rounded-lg"
              />
            </div>
            {!editingType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Annual Quota (days) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={typeForm.annual_quota}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 1 && val <= 365) setTypeForm({ ...typeForm, annual_quota: val });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  A default policy will be created with this quota.
                </p>
              </div>
            )}
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="md:col-span-3 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={typeForm.is_paid}
                  onChange={(e) => setTypeForm({ ...typeForm, is_paid: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Paid Leave
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={typeForm.is_encashable}
                  onChange={(e) => setTypeForm({ ...typeForm, is_encashable: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Encashable
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={typeForm.requires_approval}
                  onChange={(e) => setTypeForm({ ...typeForm, requires_approval: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Requires Approval
              </label>
            </div>
            <div className="md:col-span-3 text-xs text-gray-500 -mt-2">
              Within-fiscal-year carry-forward (across quarters / months) is configured per
              policy in the Leave Policies tab.
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowTypeForm(false);
                setEditingType(null);
              }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPending || updatePending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {editingType ? "Update" : "Create"} Leave Type
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Properties</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingTypes ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : leaveTypes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No leave types configured
                </td>
              </tr>
            ) : (
              leaveTypes.map((lt) => (
                <tr key={lt.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: lt.color ?? "#6366f1" }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {leaveTypeLabel(t, lt)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{lt.code}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const isUnpaidByName = /\b(unpaid|lwp|without\s*pay|loss\s*of\s*pay)\b/i.test(
                          lt.name || "",
                        );
                        if (lt.is_paid && !isUnpaidByName) {
                          return (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              Paid
                            </span>
                          );
                        }
                        if (isUnpaidByName) {
                          return (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              Unpaid
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {lt.is_encashable && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          Encashable
                        </span>
                      )}
                      {lt.requires_approval && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          Approval
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        lt.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {lt.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onStartEdit(lt)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                      {lt.is_active ? (
                        <button
                          onClick={() => onDelete(lt.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Deactivate (data preserved)"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onReactivate(lt.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Reactivate"
                        >
                          <Power className="h-3.5 w-3.5 text-green-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Policies Section
// ============================================================================
function PoliciesSection(props: {
  policies: LeavePolicy[];
  leaveTypes: LeaveType[];
  showPolicyForm: boolean;
  setShowPolicyForm: (b: boolean) => void;
  editingPolicy: LeavePolicy | null;
  setEditingPolicy: (p: LeavePolicy | null) => void;
  policyForm: typeof EMPTY_POLICY;
  setPolicyForm: (p: typeof EMPTY_POLICY) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStartEdit: (p: LeavePolicy) => void;
  onDelete: (id: number) => void;
  createPending: boolean;
  updatePending: boolean;
  t: any;
}) {
  const {
    policies, leaveTypes, showPolicyForm, setShowPolicyForm, editingPolicy, setEditingPolicy,
    policyForm, setPolicyForm, onSubmit, onStartEdit, onDelete, createPending, updatePending, t,
  } = props;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Leave Policies</h2>
        <button
          onClick={() => {
            setShowPolicyForm(!showPolicyForm);
            setEditingPolicy(null);
            setPolicyForm(EMPTY_POLICY);
          }}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-4 w-4" /> Add Policy
        </button>
      </div>

      {showPolicyForm && (
        <form onSubmit={onSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Leave Type <span className="text-red-500">*</span>
              </label>
              <select
                value={policyForm.leave_type_id}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, leave_type_id: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value={0} disabled>
                  Select type
                </option>
                {leaveTypes
                  .filter((lt) => lt.is_active)
                  .map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {leaveTypeLabel(t, lt)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Policy Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Quota <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={policyForm.annual_quota}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, annual_quota: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accrual Type</label>
              <select
                value={policyForm.accrual_type}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, accrual_type: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="annual">Annual (full quota up front)</option>
                <option value="monthly">Monthly (1/12 each month)</option>
                <option value="quarterly">Quarterly (1/4 each quarter)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Applicable After (months)
              </label>
              <input
                type="number"
                min={0}
                value={policyForm.applicable_from_months}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    applicable_from_months: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Days Before Application
              </label>
              <input
                type="number"
                min={0}
                value={policyForm.min_days_before_application}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    min_days_before_application: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Applicable To
              </label>
              <select
                value={policyForm.applicable_gender ?? ""}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    applicable_gender: e.target.value === "" ? null : e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Everyone</option>
                <option value="female">Female only</option>
                <option value="male">Male only</option>
                <option value="other">Other only</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Restricts who sees and can apply for this leave (e.g. Maternity → Female only).
              </p>
            </div>
            <div className="md:col-span-3">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={policyForm.period_carry_forward}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, period_carry_forward: e.target.checked })
                  }
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  <span className="font-medium">Carry forward unused days within the year</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    When ON, unused days from one period (quarter/month) roll into the next.
                    When OFF, each period resets and unused days are forfeited at the boundary.
                    Has no effect for "Annual" accrual.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowPolicyForm(false);
                setPolicyForm(EMPTY_POLICY);
                setEditingPolicy(null);
              }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPending || updatePending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {editingPolicy ? "Update" : "Create"} Policy
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Policy</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Leave Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Quota</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Accrual</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Carry</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Applicable</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {policies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                  No policies configured
                </td>
              </tr>
            ) : (
              policies.map((p) => {
                const lt = leaveTypes.find((x) => x.id === p.leave_type_id);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {lt ? leaveTypeLabel(t, lt) : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                      {Number(p.annual_quota)} days
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                        {p.accrual_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.period_carry_forward ? (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                          Cumulative
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                          Resets
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const g = (p.applicable_gender ?? "").toLowerCase();
                        if (g === "female") {
                          return (
                            <span className="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded-full">
                              Female only
                            </span>
                          );
                        }
                        if (g === "male") {
                          return (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                              Male only
                            </span>
                          );
                        }
                        if (g === "other") {
                          return (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                              Other only
                            </span>
                          );
                        }
                        return (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                            Everyone
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onStartEdit(p)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                        <button
                          onClick={() => onDelete(p.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Employees Section — view + override per-employee balances
// ============================================================================
const EMPLOYEE_LEAVES_PAGE_SIZES = [10, 25, 50, 100];

function EmployeesSection({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useStickyLocationFilter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const { data: locations = [] } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });
  const [editing, setEditing] = useState<{
    user_id: number;
    user_name: string;
    balance: BalanceSummary;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Server wraps the response with sendPaginated -> { success, data, meta },
  // not { pagination }. The previous typing read `data.pagination.total`,
  // which never existed, so `total` was permanently 0 and the pagination
  // footer (gated on `total > 0`) never rendered. Match the actual shape.
  const { data, isLoading } = useQuery<{
    data: EmployeeBalanceRow[];
    meta: { total: number; page: number; per_page: number; total_pages: number };
  }>({
    queryKey: ["admin-employee-leaves", search, locationId, page, perPage],
    queryFn: () =>
      api
        .get("/leave/admin/employees", {
          params: {
            page,
            per_page: perPage,
            search: search || undefined,
            location_id: locationId || undefined,
          },
        })
        .then((r) => r.data),
  });
  const employees = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const overrideMut = useMutation({
    mutationFn: ({
      balanceId,
      body,
    }: {
      balanceId: number;
      body: { extra_allocated?: number; total_used?: number; reason: string };
    }) =>
      api
        .put(`/leave/admin/balances/${balanceId}`, body)
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
      setEditing(null);
    },
  });
  const resetMut = useMutation({
    mutationFn: ({ balanceId, reason }: { balanceId: number; reason: string }) =>
      api
        .post(`/leave/admin/balances/${balanceId}/reset-period`, { reason })
        .then((r) => r.data.data),
    onSuccess: () => {
      // Reset zeroes both period_used and total_used, so every cache that
      // reads either needs to be invalidated -- otherwise the modal closes
      // but the row in the table behind it still shows the old Used value
      // until the user manually refreshes.
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
      qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
      setEditing(null);
    },
  });
  const bulkMut = useMutation({
    mutationFn: (body: {
      user_ids: number[];
      leave_type_id: number;
      extra_allocated_delta: number;
      reason: string;
    }) => api.post("/leave/admin/balances/bulk", body).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      setBulkOpen(false);
    },
  });

  const visibleTypes = useMemo(
    () => leaveTypes.filter((lt) => lt.is_active),
    [leaveTypes],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Employee Leaves</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search by name, email, code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
          <select
            value={locationId ?? ""}
            onChange={(e) => {
              setLocationId(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All locations</option>
            {locations.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1 text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
          >
            <Layers className="h-4 w-4" /> Bulk Grant
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Employee</th>
              {visibleTypes.map((lt) => (
                <th
                  key={lt.id}
                  className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-3"
                >
                  {lt.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={1 + visibleTypes.length} className="px-6 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={1 + visibleTypes.length} className="px-6 py-8 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {emp.first_name} {emp.last_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {emp.emp_code ? `${emp.emp_code} · ` : ""}
                      {emp.department_name ?? "No dept"}
                    </div>
                  </td>
                  {visibleTypes.map((lt) => {
                    const bal = emp.balances.find((b) => b.leave_type_id === lt.id);
                    if (!bal)
                      return (
                        <td key={lt.id} className="px-3 py-3 text-xs text-gray-400">
                          —
                        </td>
                      );
                    const avail = Number(bal.available_now ?? 0);
                    const used = Number(bal.total_used ?? 0);
                    // Match the modal: derive Allocated from avail+used so
                    // the cell never shows a denominator that contradicts
                    // the available number above it.
                    const allocatedDisplay = avail + used;
                    const extra = Number(bal.extra_allocated ?? 0);
                    return (
                      <td key={lt.id} className="px-3 py-3">
                        <button
                          onClick={() =>
                            setEditing({
                              user_id: emp.user_id,
                              user_name: `${emp.first_name} ${emp.last_name}`,
                              balance: bal,
                            })
                          }
                          className="text-left hover:bg-gray-100 rounded px-2 py-1 -mx-2 w-full"
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {avail} / {allocatedDisplay}
                          </div>
                          {extra !== 0 && (
                            <div
                              className={`text-[10px] ${extra > 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {extra > 0 ? `+${extra}` : extra} extra
                            </div>
                          )}
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

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
              aria-label="Employees per page"
            >
              {EMPLOYEE_LEAVES_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>per page · {total} employees</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / perPage))}
            </span>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * perPage >= total}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editing && (
        <OverrideModal
          userName={editing.user_name}
          balance={editing.balance}
          leaveTypes={leaveTypes}
          isPending={overrideMut.isPending}
          isResetPending={resetMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            overrideMut.mutate({ balanceId: editing.balance.id, body })
          }
          onResetPeriod={(reason) =>
            resetMut.mutate({ balanceId: editing.balance.id, reason })
          }
        />
      )}

      {bulkOpen && (
        <BulkGrantModal
          employees={employees}
          leaveTypes={visibleTypes}
          isPending={bulkMut.isPending}
          onClose={() => setBulkOpen(false)}
          onSubmit={(body) => bulkMut.mutate(body)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Override Modal
// ============================================================================
function OverrideModal({
  userName,
  balance,
  leaveTypes,
  isPending,
  isResetPending,
  onClose,
  onSave,
  onResetPeriod,
}: {
  userName: string;
  balance: BalanceSummary;
  leaveTypes: LeaveType[];
  isPending: boolean;
  isResetPending: boolean;
  onClose: () => void;
  onSave: (body: { extra_allocated?: number; total_used?: number; reason: string }) => void;
  onResetPeriod: (reason: string) => void;
}) {
  const [extra, setExtra] = useState(Number(balance.extra_allocated ?? 0));
  const [used, setUsed] = useState(Number(balance.total_used ?? 0));
  const [reason, setReason] = useState("");
  // Confirm-dialog state (replaces window.confirm for the "Reset Used to 0" action).
  const [confirmReset, setConfirmReset] = useState(false);

  const lt = leaveTypes.find((x) => x.id === balance.leave_type_id);
  const typeName = lt?.name ?? balance.leave_type_name ?? "Leave";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onSave({
      extra_allocated: extra,
      total_used: used,
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Adjust {typeName} for {userName}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Fiscal year {balance.fiscal_year_label ?? ""} · changes are audit-logged
          </p>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {(() => {
            // Allocated previously showed the raw `total_allocated` column,
            // which is the value persisted on the balance row at the time it
            // was created. That can drift from the policy's current annual
            // quota (e.g. policy bumped from 11 -> 12 days but the balance
            // row was never re-synced), or fail to reflect bonus / extra
            // grants -- both produce confusing "11 / 0 / 12" displays where
            // Allocated and Available don't reconcile.
            //
            // Back-compute Allocated from Available + Used so the three
            // cells always reconcile against the same authoritative number
            // the rest of the system uses (`available_now`).
            const used = Number(balance.total_used ?? 0);
            const available = Number(balance.available_now ?? 0);
            const allocatedDisplay = available + used;
            const persistedAllocated = Number(balance.total_allocated ?? 0);
            const showDriftHint = persistedAllocated !== allocatedDisplay;
            return (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-[10px] uppercase text-gray-500">Allocated</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {allocatedDisplay}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500">Used</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {used}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500">Available</div>
                    <div className="text-lg font-semibold text-brand-700">
                      {available}
                    </div>
                  </div>
                </div>
                {showDriftHint && (
                  <p className="text-[11px] text-gray-500 text-center mt-2">
                    Stored row says {persistedAllocated}; effective allocation
                    derived from {available} available + {used} used.
                  </p>
                )}
              </div>
            );
          })()}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Extra days granted (added to allocation)
            </label>
            <input
              type="number"
              step={0.5}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use a positive value to grant bonus days, negative to revoke previously granted bonus.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Used so far (advanced — use sparingly)
            </label>
            <input
              type="number"
              step={0.5}
              min={0}
              value={used}
              onChange={(e) => setUsed(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={1}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g. Joined mid-year correction; performance bonus; ..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={isResetPending || !reason.trim()}
              onClick={() => {
                if (!reason.trim()) return;
                setConfirmReset(true);
              }}
              className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Used to 0
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !reason.trim()}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset Used to 0 for this fiscal year?"
        description="The Available days will jump back up. Use this only when correcting a mistaken approval."
        confirmText="Reset Used to 0"
        variant="danger"
        loading={isResetPending}
        onConfirm={() => {
          if (reason.trim()) onResetPeriod(reason.trim());
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

// ============================================================================
// Bulk Grant Modal
// ============================================================================
function BulkGrantModal({
  employees,
  leaveTypes,
  isPending,
  onClose,
  onSubmit,
}: {
  employees: EmployeeBalanceRow[];
  leaveTypes: LeaveType[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (body: {
    user_ids: number[];
    leave_type_id: number;
    extra_allocated_delta: number;
    reason: string;
  }) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [leaveTypeId, setLeaveTypeId] = useState<number>(leaveTypes[0]?.id ?? 0);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");

  const toggle = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const allSelected = employees.length > 0 && selected.size === employees.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(employees.map((e) => e.user_id)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || selected.size === 0 || !leaveTypeId) return;
    onSubmit({
      user_ids: Array.from(selected),
      leave_type_id: leaveTypeId,
      extra_allocated_delta: delta,
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Bulk Grant Leaves</h3>
          <p className="text-xs text-gray-500 mt-1">
            Apply a positive or negative delta to selected employees on one leave type.
          </p>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Leave Type <span className="text-red-500">*</span>
              </label>
              <select
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Days delta <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step={0.5}
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={500}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g. Q3 morale bump for engineering"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Select Employees ({selected.size} of {employees.length})
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-brand-600 hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {employees.map((e) => (
                <label
                  key={e.user_id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.user_id)}
                    onChange={() => toggle(e.user_id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">
                      {e.first_name} {e.last_name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {e.emp_code ? `${e.emp_code} · ` : ""}
                      {e.department_name ?? "No dept"}
                    </div>
                  </div>
                </label>
              ))}
              {employees.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-gray-400">
                  No employees on this page.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isPending || !reason.trim() || selected.size === 0 || !leaveTypeId
              }
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? "Applying..." : `Apply to ${selected.size} employees`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
