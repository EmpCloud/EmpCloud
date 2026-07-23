import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { FolderOpen, Plus, Pencil, Trash2, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// --- Hooks ---

function useDocCategories() {
  return useQuery({
    queryKey: ["doc-categories"],
    queryFn: () => api.get("/documents/categories").then((r) => r.data.data),
  });
}

function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; is_mandatory?: boolean }) =>
      api.post("/documents/categories", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-categories"] }),
  });
}

function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; is_mandatory?: boolean }) =>
      api.put(`/documents/categories/${id}`, data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-categories"] }),
  });
}

function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/documents/categories/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-categories"] }),
  });
}

// --- Component ---

export default function DocumentCategoriesPage() {
  const { t } = useTranslation();
  const { data: categories, isLoading } = useDocCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMandatory, setFormMandatory] = useState(false);
  // Confirm-deactivate dialog state (replaces window.confirm). Holds the
  // category awaiting confirmation so the dialog can show its name.
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: number; name: string } | null>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormMandatory(false);
  };

  const startEdit = (cat: any) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormDesc(cat.description || "");
    setFormMandatory(cat.is_mandatory);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName,
      description: formDesc || undefined,
      is_mandatory: formMandatory,
    };

    if (editingId) {
      await updateCategory.mutateAsync({ id: editingId, ...payload });
    } else {
      await createCategory.mutateAsync(payload);
    }
    resetForm();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("documentCategories.page.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("documentCategories.page.subtitle")}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("documentCategories.actions.newCategory")}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? t("documentCategories.form.editTitle") : t("documentCategories.form.createTitle")}
            </h3>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">{t("documentCategories.form.nameLabel")}</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
                placeholder={t("documentCategories.form.namePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">{t("documentCategories.form.descriptionLabel")}</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
                placeholder={t("documentCategories.form.descriptionPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="is_mandatory"
                checked={formMandatory}
                onChange={(e) => setFormMandatory(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="is_mandatory" className="text-sm text-foreground">
                {t("documentCategories.form.mandatoryLabel")}
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 text-[13px] text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors">
              {t("documentCategories.actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={createCategory.isPending || updateCategory.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {editingId ? t("documentCategories.actions.update") : t("documentCategories.actions.create")}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("documentCategories.table.categoryHeader")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("documentCategories.table.descriptionHeader")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("documentCategories.table.documentsHeader")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("documentCategories.table.mandatoryHeader")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("documentCategories.table.actionsHeader")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("documentCategories.table.loading")}</td></tr>
            ) : !categories || categories.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("documentCategories.table.empty")}</td></tr>
            ) : (
              categories.map((cat: any) => (
                <tr key={cat.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                        <FolderOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                      </div>
                      <span className="text-[13px] font-medium text-foreground">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{cat.description || t("documentCategories.table.emptyValue")}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[13px] tabular-nums font-medium text-foreground">{Number(cat.document_count) || 0}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {cat.is_mandatory ? (
                      <span className="text-[11px] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-md font-medium">{t("documentCategories.mandatory.required")}</span>
                    ) : (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{t("documentCategories.mandatory.optional")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(cat)}
                        className="flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium"
                      >
                        <Pencil className="h-3 w-3" /> {t("documentCategories.actions.edit")}
                      </button>
                      <button
                        onClick={() => setDeactivateTarget({ id: cat.id, name: cat.name })}
                        className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                      >
                        <Trash2 className="h-3 w-3" /> {t("documentCategories.actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={deactivateTarget ? t("documentCategories.deactivate.titleNamed", { name: deactivateTarget.name }) : t("documentCategories.deactivate.title")}
        description={t("documentCategories.deactivate.description")}
        confirmText={t("documentCategories.deactivate.confirm")}
        variant="danger"
        loading={deleteCategory.isPending}
        onConfirm={() => {
          if (deactivateTarget) {
            deleteCategory.mutate(deactivateTarget.id, {
              onSuccess: () => setDeactivateTarget(null),
            });
          }
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
