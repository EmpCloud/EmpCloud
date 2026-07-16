import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import {
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
} from "lucide-react";

export default function AssetCategoriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  // Confirm dialog for deactivating a category. Replaces window.confirm().
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => api.get("/assets/categories").then((r) => r.data.data),
  });

  const createCategory = useMutation({
    mutationFn: (data: object) => api.post("/assets/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      resetForm();
      showToast("success", t("assetCategories.toast.created"));
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/assets/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      resetForm();
      showToast("success", t("assetCategories.toast.updated"));
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.delete(`/assets/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      setDeleteTarget(null);
      setDeleteError(null);
      showToast("success", t("assetCategories.toast.deactivated"));
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || t("assetCategories.errors.deactivateFailed")),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormDescription("");
  }

  function startEdit(cat: any) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormDescription(cat.description || "");
    setShowForm(true);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name: formName, description: formDescription || null };
    const isEditing = editingId != null;
    try {
      if (isEditing) {
        await updateCategory.mutateAsync({ id: editingId, data });
      } else {
        await createCategory.mutateAsync(data);
      }
    } catch (err: any) {
      // Keep the form open with the user's input so they can retry.
      showToast(
        "error",
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isEditing ? t("assetCategories.toast.updateFailed") : t("assetCategories.toast.createFailed")),
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("assetCategories.header.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("assetCategories.header.subtitle")}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t("assetCategories.actions.addCategory")}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-muted-foreground">{t("assetCategories.list.loading")}</div>
        </div>
      ) : !categories || categories.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">{t("assetCategories.list.empty")}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("assetCategories.table.name")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("assetCategories.table.description")}</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("assetCategories.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat: any) => (
                <tr key={cat.id} className="border-b border-border hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{cat.description || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title={t("assetCategories.actions.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget({ id: cat.id, name: cat.name });
                          setDeleteError(null);
                        }}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        title={t("assetCategories.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? t("assetCategories.form.editTitle") : t("assetCategories.form.newTitle")}
              </h2>
              <button onClick={resetForm} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetCategories.form.nameLabel")}</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={t("assetCategories.form.namePlaceholder")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetCategories.form.descriptionLabel")}</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {t("assetCategories.form.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createCategory.isPending || updateCategory.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {editingId ? t("assetCategories.form.update") : t("assetCategories.form.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate confirmation — replaces window.confirm() */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteCategory.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{t("assetCategories.delete.title")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("assetCategories.delete.message", { name: deleteTarget.name })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteCategory.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
              >
                {t("assetCategories.delete.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteCategory.mutate(deleteTarget.id)}
                disabled={deleteCategory.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCategory.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("assetCategories.delete.inProgress")}
                  </>
                ) : (
                  t("assetCategories.delete.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
