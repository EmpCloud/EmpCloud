// =============================================================================
// EMP CLOUD — Delete Organization (super admin, irreversible)
//
// Removes a tenant and everything it owns. Guarded three ways: the impact is
// fetched and shown first, the operator must retype the organization's exact
// name, and the server re-checks that name plus who is asking.
// =============================================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

interface DeletionImpact {
  organization_id: number;
  name: string;
  users: number;
  subscriptions: number;
  is_platform_org: boolean;
}

export default function DeleteOrgCard({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Blast radius — only fetched once the dialog is opened.
  const { data: impact } = useQuery<DeletionImpact>({
    queryKey: ["admin-org-deletion-impact", orgId],
    queryFn: () =>
      api.get(`/admin/organizations/${orgId}/deletion-impact`).then((r) => r.data.data),
    enabled: showModal,
  });

  const deleteMut = useMutation({
    // The name goes in the body, not the URL — it can contain anything.
    mutationFn: () =>
      api.delete(`/admin/organizations/${orgId}`, { data: { confirm_name: confirmText.trim() } }),
    onSuccess: (res) => {
      const deleted = res?.data?.data;
      showToast(
        "success",
        t("orgDelete.toast.deleted", {
          defaultValue: "Organization deleted",
          name: deleted?.name ?? orgName,
        }),
      );
      // The detail page this card lives on no longer has anything to show.
      queryClient.invalidateQueries({ queryKey: ["admin-org-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-org-stats"] });
      navigate("/admin/organizations");
    },
    onError: (e: any) =>
      showToast(
        "error",
        e?.response?.data?.error?.message ||
          t("orgDelete.toast.failed", { defaultValue: "Could not delete organization" }),
      ),
  });

  const isPlatformOrg = impact?.is_platform_org ?? false;
  const nameMatches = confirmText.trim() === orgName.trim();

  function close() {
    setShowModal(false);
    setConfirmText("");
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-red-200 dark:border-red-900 p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {t("orgDelete.title", { defaultValue: "Danger zone" })}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("orgDelete.description", {
                defaultValue:
                  "Permanently delete this organization and every record it owns — users, attendance, leave, payroll data, subscriptions and documents. This cannot be undone.",
              })}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            {t("orgDelete.button", { defaultValue: "Delete organization" })}
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {t("orgDelete.modal.title", { defaultValue: "Delete organization" })}
              </h3>
              <button
                onClick={close}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isPlatformOrg ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
                {t("orgDelete.modal.platformOrg", {
                  defaultValue:
                    "This is the platform organization that owns super-admin accounts. It cannot be deleted.",
                })}
              </div>
            ) : (
              <>
                {/* Loud, unmissable irreversibility banner — the first thing the
                    operator sees before any detail. */}
                <div className="flex items-start gap-3 rounded-lg bg-red-600 text-white p-4 mb-4">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">
                      {t("orgDelete.modal.irreversibleTitle", {
                        defaultValue: "This action is permanent and cannot be undone.",
                      })}
                    </p>
                    <p className="text-sm text-red-50 mt-0.5">
                      {t("orgDelete.modal.irreversibleBody", {
                        defaultValue:
                          "There is no recovery, no undo and no trash. Proceed only if you are absolutely certain.",
                      })}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4 mb-4">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                    {t("orgDelete.modal.warning", {
                      defaultValue: "This permanently removes:",
                    })}
                  </p>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                    <li>
                      {t("orgDelete.modal.users", {
                        defaultValue: "{{count}} user accounts",
                        count: impact?.users ?? 0,
                      })}
                    </li>
                    <li>
                      {t("orgDelete.modal.subscriptions", {
                        defaultValue: "{{count}} module subscriptions",
                        count: impact?.subscriptions ?? 0,
                      })}
                    </li>
                    <li>
                      {t("orgDelete.modal.allData", {
                        defaultValue:
                          "All attendance, leave, payroll, documents, tickets and assets",
                      })}
                    </li>
                  </ul>
                </div>

                <p className="text-sm text-muted-foreground mb-2">
                  {t("orgDelete.modal.confirmPrompt", {
                    defaultValue: "Type the organization name to confirm:",
                  })}
                </p>
                <p className="text-sm font-mono font-semibold text-foreground bg-muted px-3 py-2 rounded-lg mb-3 break-words">
                  {orgName}
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  placeholder={t("orgDelete.modal.confirmPlaceholder", {
                    defaultValue: "Organization name",
                  })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none mb-6"
                />
              </>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={close}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                {t("orgDelete.modal.cancel", { defaultValue: "Cancel" })}
              </button>
              {!isPlatformOrg && (
                <button
                  onClick={() => deleteMut.mutate()}
                  disabled={!nameMatches || deleteMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deleteMut.isPending
                    ? t("orgDelete.modal.deleting", { defaultValue: "Deleting…" })
                    : t("orgDelete.modal.confirm", { defaultValue: "Delete permanently" })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
