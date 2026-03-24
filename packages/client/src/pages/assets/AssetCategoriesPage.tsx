import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";

export default function AssetCategoriesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => api.get("/assets/categories").then((r) => r.data.data),
  });

  const createCategory = useMutation({
    mutationFn: (data: object) => api.post("/assets/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      resetForm();
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/assets/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      resetForm();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.delete(`/assets/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
    },
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
    if (editingId) {
      await updateCategory.mutateAsync({ id: editingId, data });
    } else {
      await createCategory.mutateAsync(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Categories</h1>
          <p className="text-sm text-gray-500 mt-1">Organize assets by type</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-400">Loading categories...</div>
        </div>
      ) : !categories || categories.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No categories yet. Create your first one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat: any) => (
                <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-600">{cat.description || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Deactivate category "${cat.name}"?`)) {
                            deleteCategory.mutate(cat.id);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                        title="Delete"
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? "Edit Category" : "New Category"}
              </h2>
              <button onClick={resetForm} className="p-1 rounded hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Laptop, Monitor, Phone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCategory.isPending || updateCategory.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
