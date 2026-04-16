import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Folder, Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";

type Category = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  post_count: number;
};

// Sidebar card for HR — list, add, edit, soft-delete forum categories.
// Used on the unified feed page in place of the old standalone Forum
// Dashboard, which had a much heavier form layout for the same task.
export function CategoriesPanel() {
  const qc = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: () => api.get("/forum/categories").then((r) => r.data.data as Category[]),
  });

  // Local UI state
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; post_count: number } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form fields — single set, used for both add and edit modes
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const reset = () => {
    setEditing(null);
    setAdding(false);
    setName("");
    setIcon("");
  };

  const startEdit = (c: Category) => {
    setEditing(c);
    setAdding(false);
    setName(c.name);
    setIcon(c.icon || "");
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setName("");
    setIcon("");
  };

  const createCategory = useMutation({
    mutationFn: (data: object) => api.post("/forum/categories", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      reset();
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/forum/categories/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      reset();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.delete(`/forum/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete category"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = { name: name.trim(), icon: icon.trim() || null };
    if (editing) {
      updateCategory.mutate({ id: editing.id, data: payload });
    } else {
      createCategory.mutate(payload);
    }
  };

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Folder className="h-4 w-4 text-brand-600" />
          Categories
        </h3>
        {!adding && !editing && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>

      {/* Inline form — appears when adding or editing */}
      {(adding || editing) && (
        <form onSubmit={handleSubmit} className="mb-3 rounded-lg bg-gray-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🎯"
              maxLength={4}
              className="w-12 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              required
              autoFocus
              className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isPending}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {!categories || categories.length === 0 ? (
        <p className="text-xs text-gray-400">No categories yet.</p>
      ) : (
        <ul className="space-y-1">
          {categories.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-2 rounded-md p-2 -m-1 hover:bg-gray-50 transition-colors"
            >
              <span className="w-6 text-center text-base">{c.icon || "#"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400">
                  {c.post_count} {c.post_count === 1 ? "post" : "posts"}
                </p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  aria-label={`Edit ${c.name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget({ id: c.id, name: c.name, post_count: c.post_count });
                    setDeleteError(null);
                  }}
                  aria-label={`Delete ${c.name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteCategory.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete category?</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Delete <span className="font-medium text-gray-700">{deleteTarget.name}</span>?
                    {deleteTarget.post_count > 0 ? (
                      <>
                        {" "}The {deleteTarget.post_count} existing post
                        {deleteTarget.post_count === 1 ? "" : "s"} keep their tag, but no new
                        posts can be added here until it is restored.
                      </>
                    ) : (
                      <>{" "}The category will be hidden from the forum.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteCategory.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteCategory.mutate(deleteTarget.id)}
                disabled={deleteCategory.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCategory.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
