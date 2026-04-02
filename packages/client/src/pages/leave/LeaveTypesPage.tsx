import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";

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
  max_consecutive_days: number | null;
  min_days_before_application: number;
  is_active: boolean;
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
};

const EMPTY_POLICY = {
  leave_type_id: 0,
  name: "",
  annual_quota: 12,
  accrual_type: "annual" as string,
  applicable_from_months: 0,
  max_consecutive_days: null as number | null,
  min_days_before_application: 0,
};

export default function LeaveTypesPage() {
  const qc = useQueryClient();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY);

  const { data: leaveTypes = [], isLoading: loadingTypes } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });

  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["leave-policies"],
    queryFn: () => api.get("/leave/policies").then((r) => r.data.data),
  });

  const createType = useMutation({
    mutationFn: (data: typeof EMPTY_TYPE) =>
      api.post("/leave/types", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      setShowTypeForm(false);
      setTypeForm(EMPTY_TYPE);
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
    },
  });

  const deleteType = useMutation({
    mutationFn: (id: number) => api.delete(`/leave/types/${id}`),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-policies"] }),
  });

  const initBalances = useMutation({
    mutationFn: () =>
      api.post("/leave/balances/initialize", { year: new Date().getFullYear() }).then((r) => r.data.data),
  });

  const handleTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingType) {
      updateType.mutate({ id: editingType.id, data: typeForm });
    } else {
      createType.mutate(typeForm);
    }
  };

  const startEdit = (lt: LeaveType) => {
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
      max_consecutive_days: p.max_consecutive_days,
      min_days_before_application: p.min_days_before_application,
    });
    setShowPolicyForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Configuration</h1>
          <p className="text-gray-500 mt-1">Manage leave types, policies, and balance initialization.</p>
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
          Balances initialized: {(initBalances.data as any)?.initialized ?? 0} records created.
        </div>
      )}

      {/* ---- Leave Types ---- */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Leave Types</h2>
          <button
            onClick={() => { setShowTypeForm(!showTypeForm); setEditingType(null); setTypeForm(EMPTY_TYPE); }}
            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Type
          </button>
        </div>

        {showTypeForm && (
          <form onSubmit={handleTypeSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code <span className="text-red-500">*</span></label>
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
                    checked={typeForm.is_carry_forward}
                    onChange={(e) => setTypeForm({ ...typeForm, is_carry_forward: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Carry Forward
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
                {typeForm.is_carry_forward && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Max Carry Days:</label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={typeForm.max_carry_forward_days}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 0 && val <= 365) setTypeForm({ ...typeForm, max_carry_forward_days: val });
                      }}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => { setShowTypeForm(false); setEditingType(null); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createType.isPending || updateType.isPending}
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
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : leaveTypes.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No leave types configured</td></tr>
              ) : (
                leaveTypes.map((lt) => (
                  <tr key={lt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: lt.color ?? "#6366f1" }} />
                        <span className="text-sm font-medium text-gray-900">{lt.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{lt.code}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {lt.is_paid && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Paid</span>}
                        {lt.is_carry_forward && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">Carry Fwd</span>}
                        {lt.is_encashable && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Encashable</span>}
                        {lt.requires_approval && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Approval</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${lt.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {lt.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(lt)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Deactivate this leave type?")) deleteType.mutate(lt.id); }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Leave Policies ---- */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Leave Policies</h2>
          <button
            onClick={() => { setShowPolicyForm(!showPolicyForm); setEditingPolicy(null); setPolicyForm(EMPTY_POLICY); }}
            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Policy
          </button>
        </div>

        {showPolicyForm && (
          <form onSubmit={handlePolicySubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                <select
                  value={policyForm.leave_type_id}
                  onChange={(e) => setPolicyForm({ ...policyForm, leave_type_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                >
                  <option value={0} disabled>Select type</option>
                  {leaveTypes.filter((t) => t.is_active).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Quota <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={policyForm.annual_quota}
                  onChange={(e) => setPolicyForm({ ...policyForm, annual_quota: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accrual Type</label>
                <select
                  value={policyForm.accrual_type}
                  onChange={(e) => setPolicyForm({ ...policyForm, accrual_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applicable After (months)</label>
                <input
                  type="number"
                  min={0}
                  value={policyForm.applicable_from_months}
                  onChange={(e) => setPolicyForm({ ...policyForm, applicable_from_months: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Days Before Application</label>
                <input
                  type="number"
                  min={0}
                  value={policyForm.min_days_before_application}
                  onChange={(e) => setPolicyForm({ ...policyForm, min_days_before_application: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
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
                disabled={createPolicy.isPending || updatePolicy.isPending}
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
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {policies.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No policies configured</td></tr>
              ) : (
                policies.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {leaveTypes.find((t) => t.id === p.leave_type_id)?.name ?? "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">{Number(p.annual_quota)} days</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                        {p.accrual_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEditPolicy(p)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Deactivate this policy?")) deletePolicy.mutate(p.id); }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
