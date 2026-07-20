import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { FileText, Plus, Check, ChevronDown, ChevronUp, Users, Trash2, Pencil } from "lucide-react";
import RichTextEditor, { isRichTextEmpty } from "@/components/ui/RichTextEditor";

// Defensive fallback for legacy rows that slipped past validation with a
// blank/whitespace-only title (#1636). Returns the original title when
// non-empty and a clearly-marked placeholder otherwise so admins can
// spot the broken row in the list. `untitled` is the localized fallback.
function policyTitle(p: { title?: string | null }, untitled: string): string {
  const t = (p.title || "").trim();
  return t || untitled;
}

// Policies created before the rich-text editor are stored as plain text with
// newline breaks; newer ones store HTML. Detect HTML so display panels can add
// `whitespace-pre-wrap` for the legacy plain-text rows (preserving their line
// breaks) without injecting blank lines between HTML block elements.
function isHtmlContent(s: string | null | undefined): boolean {
  return !!s && /<\/?[a-z][^>]*>/i.test(s);
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePolicies({ page });
  const pendingQuery = usePendingPolicies();
  const acknowledge = useAcknowledgePolicy();
  const [expanded, setExpanded] = useState<number | null>(null);

  const policies = data?.data || [];
  const meta = data?.meta;
  const pendingIds = new Set((pendingQuery.data || []).map((p: any) => p.id));
  const untitled = t("policies.page.untitled");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("policies.page.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("policies.page.subtitleEmployee")}</p>
      </div>

      {pendingIds.size > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-4 mb-6 text-sm text-amber-800 dark:text-amber-200">
          {t("policies.page.pendingBanner", { count: pendingIds.size })}
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">{t("policies.page.loading")}</div>
        ) : policies.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">{t("policies.page.emptyEmployee")}</div>
        ) : (
          policies.map((p: any) => {
            const isPending = pendingIds.has(p.id);
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="bg-card rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    <div>
                      <span className="text-sm font-semibold text-foreground">{policyTitle(p, untitled)}</span>
                      {p.category && (
                        <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{p.category}</span>
                      )}
                      <span className="ml-2 text-xs text-muted-foreground">v{p.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isPending ? (
                      <span className="text-[11px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md font-medium">{t("policies.page.pending")}</span>
                    ) : (
                      <span className="text-[11px] bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-md font-medium">{t("policies.page.acknowledged")}</span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-6 pb-4 border-t border-border">
                    {/* Content is sanitized server-side via sanitizeHtml() on
                        write, so rendering it as HTML is safe. Legacy plain-text
                        rows keep their line breaks via whitespace-pre-wrap. */}
                    <div
                      className={`rich-text py-4 ${isHtmlContent(p.content) ? "" : "whitespace-pre-wrap"}`}
                      dangerouslySetInnerHTML={{ __html: p.content || "" }}
                    />
                    {p.effective_date && (
                      <p className="text-xs text-muted-foreground mb-3">{t("policies.page.effective", { date: p.effective_date })}</p>
                    )}
                    {isPending && (
                      <button
                        onClick={() => acknowledge.mutate(p.id)}
                        disabled={acknowledge.isPending}
                        className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" /> {t("policies.page.acknowledgePolicy")}
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
          <p className="text-sm text-muted-foreground">
            {t("policies.page.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
            >
              {t("policies.page.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
            >
              {t("policies.page.next")}
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
  const { t } = useTranslation();
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
  const untitled = t("policies.page.untitled");

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
    // Content is HTML now — guard against a visually-blank editor (innerHTML
    // like "<br>") that `value.trim()` would wrongly treat as filled.
    if (!title.trim() || isRichTextEmpty(content)) return;
    const payload = {
      title,
      content,
      category: category || null,
      effective_date: effectiveDate || null,
    };
    const isEditing = editingId != null;
    try {
      if (isEditing) {
        await updatePolicy.mutateAsync({ id: editingId, data: payload });
      } else {
        await createPolicy.mutateAsync(payload);
      }
      showToast("success", isEditing ? t("policies.toast.updated") : t("policies.toast.created"));
      resetForm();
    } catch (err: any) {
      // Keep the form open with the user's edits intact so they can retry.
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (isEditing ? t("policies.toast.updateFailed") : t("policies.toast.createFailed"));
      showToast("error", msg);
    }
  };

  const isSavingPolicy = editingId != null ? updatePolicy.isPending : createPolicy.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("policies.page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("policies.page.subtitleHr")}</p>
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
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("policies.page.newPolicy")}
        </button>
      </div>

      {/* Create / edit form */}
      {showCreate && (
        <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-4 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              {editingId != null ? t("policies.page.editPolicy") : t("policies.page.createPolicy")}
            </h2>
            {editingId != null && (
              <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-md">
                {t("policies.page.editingHint")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("policies.page.fieldTitle")} <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                placeholder={t("policies.page.titlePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("policies.page.fieldCategory")}</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                placeholder={t("policies.page.categoryPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("policies.page.fieldEffectiveDate")}</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("policies.page.fieldContent")} <span className="text-red-500">*</span></label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder={t("policies.page.contentPlaceholder")}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-[13px] border border-border rounded-md hover:bg-muted"
            >
              {t("policies.page.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSavingPolicy || !title.trim() || isRichTextEmpty(content)}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId != null ? (
                <><Pencil className="h-4 w-4" /> {isSavingPolicy ? t("policies.page.saving") : t("policies.page.saveChanges")}</>
              ) : (
                <><Plus className="h-4 w-4" /> {isSavingPolicy ? t("policies.page.creating") : t("policies.page.createPolicyBtn")}</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Policies table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colTitle")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colCategory")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colVersion")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colEffectiveDate")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colAcknowledgments")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("policies.page.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("policies.page.loading")}</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("policies.page.emptyHr")}</td></tr>
            ) : (
              policies.map((p: any) => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span className="text-sm font-medium text-foreground">{policyTitle(p, untitled)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.category ? (
                        <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{p.category}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">v{p.version}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.effective_date || "-"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-brand-700 dark:text-brand-300">{p.acknowledgment_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setViewAckFor(null);
                            setViewContentFor(viewContentFor === p.id ? null : p.id);
                          }}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            viewContentFor === p.id ? "text-brand-700 dark:text-brand-300 underline" : "text-brand-600 dark:text-brand-400 hover:text-brand-700"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" /> {t("policies.page.view")}
                        </button>
                        <button
                          onClick={() => {
                            setViewContentFor(null);
                            setViewAckFor(viewAckFor === p.id ? null : p.id);
                          }}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            viewAckFor === p.id ? "text-foreground underline" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Users className="h-3.5 w-3.5" /> {t("policies.page.acks")}
                        </button>
                        <button
                          onClick={() => startEdit(p)}
                          className={`flex items-center gap-1 text-xs font-medium ${
                            editingId === p.id ? "text-amber-700 dark:text-amber-300 underline" : "text-amber-600 dark:text-amber-400 hover:text-amber-700"
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("policies.page.edit")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          disabled={deletePolicy.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("policies.page.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Inline floating panel — View Content */}
                  {viewContentFor === p.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="mx-4 my-2 bg-muted border border-border rounded-lg shadow-lg animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                              <h3 className="text-sm font-semibold text-foreground">{policyTitle(p, untitled)}</h3>
                              {p.category && (
                                <span className="text-xs bg-card text-muted-foreground px-2 py-0.5 rounded-md border border-border">{p.category}</span>
                              )}
                              <span className="text-xs text-muted-foreground">v{p.version}</span>
                            </div>
                            <button
                              onClick={() => setViewContentFor(null)}
                              className="text-muted-foreground hover:text-muted-foreground text-sm px-2 py-1 rounded hover:bg-muted"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="px-5 py-4 max-h-64 overflow-y-auto">
                            {p.effective_date && (
                              <p className="text-xs text-muted-foreground mb-2">{t("policies.page.effective", { date: p.effective_date })}</p>
                            )}
                            {/* Sanitized server-side on write — safe as HTML.
                                Legacy plain-text rows keep their line breaks. */}
                            <div
                              className={`rich-text ${isHtmlContent(p.content) ? "" : "whitespace-pre-wrap"}`}
                              dangerouslySetInnerHTML={{ __html: p.content || "" }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline floating panel — Acknowledgments */}
                  {viewAckFor === p.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="mx-4 my-2 bg-muted border border-border rounded-lg shadow-lg animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <h3 className="text-sm font-semibold text-foreground">{t("policies.page.acksHeader", { title: policyTitle(p, untitled) })}</h3>
                            </div>
                            <button
                              onClick={() => setViewAckFor(null)}
                              className="text-muted-foreground hover:text-muted-foreground text-sm px-2 py-1 rounded hover:bg-muted"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="px-5 py-3 max-h-64 overflow-y-auto">
                            {ackQuery.isLoading ? (
                              <p className="text-sm text-muted-foreground py-2">{t("policies.page.loading")}</p>
                            ) : (ackQuery.data || []).length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">{t("policies.page.noAcks")}</p>
                            ) : (
                              <div className="space-y-1">
                                {(ackQuery.data || []).map((a: any) => (
                                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                    <div className="flex items-center gap-3">
                                      <div className="h-7 w-7 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300">
                                        {a.first_name?.[0]}{a.last_name?.[0]}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{a.first_name} {a.last_name}</p>
                                        <p className="text-xs text-muted-foreground">{a.email}</p>
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
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
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {t("policies.page.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
              >
                {t("policies.page.previous")}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
              >
                {t("policies.page.next")}
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
              className="w-full max-w-md rounded-lg bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">{t("policies.page.deleteTitle")}</h3>
              </div>
              <div className="px-6 py-4 text-sm text-muted-foreground">
                {target ? (
                  <>
                    {t("policies.page.deleteConfirmPrefix")} <strong className="text-foreground">{policyTitle(target, untitled)}</strong>{t("policies.page.deleteConfirmSuffix")}
                  </>
                ) : (
                  t("policies.page.deleteConfirmGeneric")
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-3 bg-muted rounded-b-xl border-t border-border">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-card"
                >
                  {t("policies.page.cancel")}
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
                        showToast("success", t("policies.toast.deleted"));
                      },
                      onError: (err: any) => {
                        showToast(
                          "error",
                          err?.response?.data?.error?.message ||
                            err?.response?.data?.message ||
                            t("policies.toast.deleteFailed"),
                        );
                      },
                    });
                  }}
                  disabled={deletePolicy.isPending}
                  className="flex items-center gap-1 text-[13px] bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletePolicy.isPending ? t("policies.page.deleting") : t("policies.page.delete")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
