// =============================================================================
// EMP CLOUD — Organization Comments (super admin)
//
// Operator notes kept against a tenant on the org detail page: support context,
// billing arrangements, churn risk, who to call. Any super admin can add, edit
// and delete; the author and an "edited" marker are shown so the history stays
// attributable.
// =============================================================================

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { MessageSquare, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

interface OrgComment {
  id: number;
  comment: string;
  author_name: string | null;
  author_email: string | null;
  edited_at: string | null;
  created_at: string;
}

const MAX_LENGTH = 5000;

function errorMessage(e: any, fallback: string): string {
  return e?.response?.data?.error?.message || fallback;
}

export default function OrgCommentsCard({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Two-step delete inline rather than a modal — these notes are cheap to
  // recreate and a full dialog for each one is heavy.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const queryKey = ["admin-org-comments", orgId];

  const { data: comments = [], isLoading } = useQuery<OrgComment[]>({
    queryKey,
    queryFn: () => api.get(`/admin/organizations/${orgId}/comments`).then((r) => r.data.data),
    enabled: !!orgId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const addMut = useMutation({
    mutationFn: (comment: string) =>
      api.post(`/admin/organizations/${orgId}/comments`, { comment }),
    onSuccess: () => {
      setDraft("");
      refresh();
      showToast("success", t("orgComments.toast.added", { defaultValue: "Note added" }));
    },
    onError: (e: any) =>
      showToast("error", errorMessage(e, t("orgComments.toast.addFailed", { defaultValue: "Could not add note" }))),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: number; comment: string }) =>
      api.put(`/admin/organizations/${orgId}/comments/${vars.id}`, { comment: vars.comment }),
    onSuccess: () => {
      setEditingId(null);
      setEditDraft("");
      refresh();
      showToast("success", t("orgComments.toast.updated", { defaultValue: "Note updated" }));
    },
    onError: (e: any) =>
      showToast("error", errorMessage(e, t("orgComments.toast.updateFailed", { defaultValue: "Could not update note" }))),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/organizations/${orgId}/comments/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      refresh();
      showToast("success", t("orgComments.toast.deleted", { defaultValue: "Note deleted" }));
    },
    onError: (e: any) =>
      showToast("error", errorMessage(e, t("orgComments.toast.deleteFailed", { defaultValue: "Could not delete note" }))),
  });

  function startEdit(c: OrgComment) {
    setEditingId(c.id);
    setEditDraft(c.comment);
    setConfirmDeleteId(null);
  }

  const trimmedDraft = draft.trim();
  const trimmedEdit = editDraft.trim();

  return (
    <div className="bg-card rounded-xl border border-border p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-semibold text-foreground">
          {t("orgComments.title", { defaultValue: "Internal notes" })}
        </h2>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {comments.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {t("orgComments.description", {
          defaultValue:
            "Visible to super admins only. Not shown to anyone inside the organization.",
        })}
      </p>

      {/* Composer */}
      <div className="mb-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder={t("orgComments.placeholder", {
            defaultValue: "Add a note about this organization…",
          })}
          className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {draft.length}/{MAX_LENGTH}
          </span>
          <button
            onClick={() => addMut.mutate(trimmedDraft)}
            disabled={!trimmedDraft || addMut.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {addMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("orgComments.add", { defaultValue: "Add note" })}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">
          {t("orgComments.loading", { defaultValue: "Loading notes…" })}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          {t("orgComments.empty", { defaultValue: "No notes yet." })}
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.author_name ||
                      c.author_email ||
                      t("orgComments.unknownAuthor", { defaultValue: "Unknown" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                    {c.edited_at && (
                      <span className="ml-1.5 italic">
                        {t("orgComments.edited", { defaultValue: "(edited)" })}
                      </span>
                    )}
                  </p>
                </div>

                {editingId !== c.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(c)}
                      title={t("orgComments.editAction", { defaultValue: "Edit" })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      title={t("orgComments.deleteAction", { defaultValue: "Delete" })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {editingId === c.id ? (
                <div>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    maxLength={MAX_LENGTH}
                    rows={3}
                    autoFocus
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("orgComments.cancel", { defaultValue: "Cancel" })}
                    </button>
                    <button
                      onClick={() => updateMut.mutate({ id: c.id, comment: trimmedEdit })}
                      disabled={!trimmedEdit || trimmedEdit === c.comment || updateMut.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updateMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t("orgComments.save", { defaultValue: "Save" })}
                    </button>
                  </div>
                </div>
              ) : (
                // Notes are plain text; preserve the author's line breaks and
                // never render them as markup.
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {c.comment}
                </p>
              )}

              {confirmDeleteId === c.id && (
                <div className="flex items-center justify-between gap-3 mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                  <span className="text-sm text-red-700 dark:text-red-300">
                    {t("orgComments.confirmDelete", { defaultValue: "Delete this note?" })}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1 text-sm font-medium text-muted-foreground bg-card border border-border hover:bg-muted rounded-lg transition-colors"
                    >
                      {t("orgComments.cancel", { defaultValue: "Cancel" })}
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(c.id)}
                      disabled={deleteMut.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleteMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("orgComments.deleteAction", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
