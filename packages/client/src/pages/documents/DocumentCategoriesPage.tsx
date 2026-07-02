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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("documentCategories.page.title")}</h1>
          <p className="text-gray-500 mt-1">{t("documentCategories.page.subtitle")}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("documentCategories.actions.newCategory")}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? t("documentCategories.form.editTitle") : t("documentCategories.form.createTitle")}
            </h3>
            <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("documentCategories.form.nameLabel")}</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={t("documentCategories.form.namePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("documentCategories.form.descriptionLabel")}</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={t("documentCategories.form.descriptionPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="is_mandatory"
                checked={formMandatory}
                onChange={(e) => setFormMandatory(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="is_mandatory" className="text-sm text-gray-700">
                {t("documentCategories.form.mandatoryLabel")}
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              {t("documentCategories.actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={createCategory.isPending || updateCategory.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {editingId ? t("documentCategories.actions.update") : t("documentCategories.actions.create")}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("documentCategories.table.categoryHeader")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("documentCategories.table.descriptionHeader")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("documentCategories.table.documentsHeader")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("documentCategories.table.mandatoryHeader")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("documentCategories.table.actionsHeader")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">{t("documentCategories.table.loading")}</td></tr>
            ) : !categories || categories.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">{t("documentCategories.table.empty")}</td></tr>
            ) : (
              categories.map((cat: any) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
                        <FolderOpen className="h-4 w-4 text-brand-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{cat.description || t("documentCategories.table.emptyValue")}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-700">{Number(cat.document_count) || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    {cat.is_mandatory ? (
                      <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full font-medium">{t("documentCategories.mandatory.required")}</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{t("documentCategories.mandatory.optional")}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(cat)}
                        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
                      >
                        <Pencil className="h-3 w-3" /> {t("documentCategories.actions.edit")}
                      </button>
                      <button
                        onClick={() => setDeactivateTarget({ id: cat.id, name: cat.name })}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
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
