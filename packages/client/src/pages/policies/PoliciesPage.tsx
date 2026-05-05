import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import api from "@/api/client";
import { FileText, Plus, Check, ChevronDown, ChevronUp, Users, Trash2, Pencil } from "lucide-react";

// Defensive fallback for legacy rows that slipped past validation with a
// blank/whitespace-only title (#1636). Returns the original title when
// non-empty and a clearly-marked placeholder otherwise so admins can
// spot the broken row in the list.
function policyTitle(p: { title?: string | null }): string {
  const t = (p.title || "").trim();
  return t || "Untitled policy";
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function usePolicies(params?: { page?: number; category?: string }) {
  return useQuery({
    queryKey: ["policies", params],
    queryFn: () => api.get("/policies", { params }).then((r) => r.data),
  });
}

function usePendingPolicies() {
  return useQuery({
    queryKey: ["policies-pending"],
    queryFn: () => api.get("/policies/pending").then((r) => r.data.data),
  });
}

function useAcknowledgments(policyId: number | null) {
  return useQuery({
    queryKey: ["policy-acknowledgments", policyId],
    queryFn: () => api.get(`/policies/${policyId}/acknowledgments`).then((r) => r.data.data),
    enabled: !!policyId,
  });
}

function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post("/policies", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: number) => api.delete(`/policies/${policyId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["policies-pending"] });
    },
  });
}

function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/policies/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["policies-pending"] });
    },
  });
}

function useAcknowledgePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: number) => api.post(`/policies/${policyId}/acknowledge`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["policies-pending"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

function isHR(role: string) {
  return HR_ROLES.includes(role);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PoliciesPage() {
  const user = useAuthStore((s) => s.user);
  const hrMode = user ? isHR(user.role) : false;

  return hrMode ? <HRPoliciesView /> : <EmployeePoliciesView />;
}

// ===========================================================================
// Employee View
// ===========================================================================

function EmployeePoliciesView() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePolicies({ page });
  const pendingQuery = usePendingPolicies();
  const acknowledge = useAcknowledgePolicy();
  const [expanded, setExpanded] = useState<number | null>(null);

  const policies = data?.data || [];
  const meta = data?.meta;
  const pendingIds = new Set((pendingQuery.data || []).map((p: any) => p.id));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Company Policies</h1>
        <p className="text-gray-500 mt-1">Review and acknowledge company policies.</p>
      </div>

      {pendingIds.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          You have <strong>{pendingIds.size}</strong> {pendingIds.size === 1 ? "policy" : "policies"} pending acknowledgment.
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Loading...</div>
        ) : policies.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">No policies found.</div>
        ) : (
          policies.map((p: any) => {
            const isPending = pendingIds.has(p.id);
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-brand-600" />
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{policyTitle(p)}</span>
                      {p.category && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.category}</span>
                      )}
                      <span className="ml-2 text-xs text-gray-400">v{p.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isPending ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Pending</span>
                    ) : (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full font-medium">Acknowledged</span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-6 pb-4 border-t border-gray-100">
                    <div className="prose prose-sm max-w-none py-4 text-gray-700 whitespace-pre-wrap">{p.content}</div>
                    {p.effective_date && (
                      <p className="text-xs text-gray-400 mb-3">Effective: {p.effective_date}</p>
                    )}
                    {isPending && (
                      <button
                        onClick={() => acknowledge.mutate(p.id)}
                        disabled={acknowledge.isPending}
                        className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" /> Acknowledge Policy
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// HR View
// ===========================================================================

function HRPoliciesView() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePolicies({ page });
  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewAckFor, setViewAckFor] = useState<number | null>(null);
  const [viewContentFor, setViewContentFor] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const ackQuery = useAcknowledgments(viewAckFor);
  // Panels are now inline within table rows — no external refs needed

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const policies = data?.data || [];
  const meta = data?.meta;

  const resetForm = () => {
    setTitle("");
    setContent("");
    setCategory("");
    setEffectiveDate("");
    setEditingId(null);
    setShowCreate(false);
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setTitle(p.title || "");
    setContent(p.content || "");
    setCategory(p.category || "");
    // The API returns DATE columns as ISO datetimes ("2025-12-31T18:30:00.000Z").
    // `<input type="date">` only renders YYYY-MM-DD; if we hand it the full
    // ISO string it shows blank but React state still holds the bad value,
    // and submitting it makes MySQL throw "Incorrect date value" on the
    // DATE column. Slice to the date portion before binding.
    setEffectiveDate(typeof p.effective_date === "string" ? p.effective_date.slice(0, 10) : "");
    setShowCreate(true);
    setViewContentFor(null);
    setViewAckFor(null);
    // Scroll the form into view so the user sees what they're editing.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title,
      content,
      category: category || null,
      effective_date: effectiveDate || null,
    };
    if (editingId != null) {
      await updatePolicy.mutateAsync({ id: editingId, data: payload });
    } else {
      await createPolicy.mutateAsync(payload);
    }
    resetForm();
  };

  const isSavingPolicy = editingId != null ? updatePolicy.isPending : createPolicy.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Policies</h1>
          <p className="text-gray-500 mt-1">Create and manage organization policies.</p>
        </div>
        <button
          onClick={() => {
            if (showCreate) {
              resetForm();
            } else {
              setEditingId(null);
              setTitle("");
              setContent("");
              setCategory("");
              setEffectiveDate("");
              setShowCreate(true);
            }
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Policy
        </button>
      </div>

      {/* Create / edit form */}
      {showCreate && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {editingId != null ? "Edit policy" : "Create policy"}
            </h2>
            {editingId != null && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Editing — version may bump on save
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Policy title"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g. HR, IT, Security"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Content <span className="text-red-500">*</span></label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Write the policy content..."
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingPolicy || !title.trim() || !content.trim()}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId != null ? (
                <><Pencil className="h-4 w-4" /> {isSavingPolicy ? "Saving…" : "Save changes"}</>
              ) : (
                <><Plus className="h-4 w-4" /> {isSavingPolicy ? "Creating…" : "Create Policy"}</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Policies table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Title</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Version</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Effective Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Acknowledgments</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No policies created yet.</td></tr>
            ) : (
              policies.map((p: any) => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-brand-600" />
                        <span className="text-sm font-medium text-gray-900">{policyTitle(p)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {p.category ? (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{p.category}</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">v{p.version}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.effective_date || "-"}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-brand-700">{p.acknowledgment_count ?? 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setViewAckFor(null);
                            setViewContentFor(viewContentFor === p.id ? null : p.id);
                          }}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            viewContentFor === p.id ? "text-brand-700 underline" : "text-brand-600 hover:text-brand-700"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" /> View
                        </button>
                        <button
                          onClick={() => {
                            setViewContentFor(null);
                            setViewAckFor(viewAckFor === p.id ? null : p.id);
                          }}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            viewAckFor === p.id ? "text-gray-900 underline" : "text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          <Users className="h-3.5 w-3.5" /> Acks
                        </button>
                        <button
                          onClick={() => startEdit(p)}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            editingId === p.id ? "text-amber-700 underline" : "text-amber-600 hover:text-amber-700"
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          disabled={deletePolicy.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Inline floating panel — View Content */}
                  {viewContentFor === p.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="mx-4 my-2 bg-gray-50 border border-gray-200 rounded-xl shadow-lg animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-brand-600" />
                              <h3 className="text-sm font-semibold text-gray-900">{policyTitle(p)}</h3>
                              {p.category && (
                                <span className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">{p.category}</span>
                              )}
                              <span className="text-xs text-gray-400">v{p.version}</span>
                            </div>
                            <button
                              onClick={() => setViewContentFor(null)}
                              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-200"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="px-5 py-4 max-h-64 overflow-y-auto">
                            {p.effective_date && (
                              <p className="text-xs text-gray-400 mb-2">Effective: {p.effective_date}</p>
                            )}
                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{p.content}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline floating panel — Acknowledgments */}
                  {viewAckFor === p.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="mx-4 my-2 bg-gray-50 border border-gray-200 rounded-xl shadow-lg animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-600" />
                              <h3 className="text-sm font-semibold text-gray-900">Acknowledgments — {policyTitle(p)}</h3>
                            </div>
                            <button
                              onClick={() => setViewAckFor(null)}
                              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-200"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="px-5 py-3 max-h-64 overflow-y-auto">
                            {ackQuery.isLoading ? (
                              <p className="text-sm text-gray-400 py-2">Loading...</p>
                            ) : (ackQuery.data || []).length === 0 ? (
                              <p className="text-sm text-gray-400 py-2">No acknowledgments yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {(ackQuery.data || []).map((a: any) => (
                                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                    <div className="flex items-center gap-3">
                                      <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
                                        {a.first_name?.[0]}{a.last_name?.[0]}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{a.first_name} {a.last_name}</p>
                                        <p className="text-xs text-gray-400">{a.email}</p>
                                      </div>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {new Date(a.acknowledged_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Panels are now inline within the table rows above */}

      {confirmDeleteId != null && (() => {
        const target = policies.find((x: any) => x.id === confirmDeleteId);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Delete policy?</h3>
              </div>
              <div className="px-6 py-4 text-sm text-gray-600">
                {target ? (
                  <>
                    Are you sure you want to delete <strong className="text-gray-900">{policyTitle(target)}</strong>?
                    The policy will be hidden from employees; existing acknowledgments are retained for audit.
                  </>
                ) : (
                  "Are you sure you want to delete this policy?"
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-3 bg-gray-50 rounded-b-xl border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = confirmDeleteId;
                    deletePolicy.mutate(id, {
                      onSuccess: () => {
                        if (viewAckFor === id) setViewAckFor(null);
                        if (viewContentFor === id) setViewContentFor(null);
                        setConfirmDeleteId(null);
                      },
                    });
                  }}
                  disabled={deletePolicy.isPending}
                  className="flex items-center gap-1 text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletePolicy.isPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
