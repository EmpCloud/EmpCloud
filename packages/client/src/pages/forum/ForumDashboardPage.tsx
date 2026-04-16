import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  MessageCircle,
  Users,
  TrendingUp,
  Eye,
  Heart,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  BarChart3,
  MessagesSquare,
} from "lucide-react";

function useDashboard() {
  return useQuery({
    queryKey: ["forum-dashboard"],
    queryFn: () => api.get("/forum/dashboard").then((r) => r.data.data),
  });
}

export default function ForumDashboardPage() {
  const { data: stats, isLoading } = useDashboard();
  const qc = useQueryClient();

  // Category management
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catSortOrder, setCatSortOrder] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; post_count: number } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createCategory = useMutation({
    mutationFn: (data: object) => api.post("/forum/categories", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      resetCatForm();
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/forum/categories/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      resetCatForm();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/forum/categories/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-dashboard"] });
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete category"),
  });

  const resetCatForm = () => {
    setShowCatForm(false);
    setEditingCat(null);
    setCatName("");
    setCatDescription("");
    setCatIcon("");
    setCatSortOrder(0);
  };

  const startEditCategory = (cat: any) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatDescription(cat.description || "");
    setCatIcon(cat.icon || "");
    setCatSortOrder(cat.sort_order || 0);
    setShowCatForm(true);
  };

  const handleCatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: catName,
      description: catDescription || null,
      icon: catIcon || null,
      sort_order: catSortOrder,
    };
    if (editingCat) {
      updateCategory.mutate({ id: editingCat.id, data: payload });
    } else {
      createCategory.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forum Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage community discussions and categories.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link to="/forum" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <MessagesSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_posts ?? 0}</p>
              <p className="text-xs text-gray-500">Total Posts</p>
            </div>
          </div>
        </Link>
        <Link to="/forum" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_replies ?? 0}</p>
              <p className="text-xs text-gray-500">Total Replies</p>
            </div>
          </div>
        </Link>
        <Link to="/forum" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.active_discussions ?? 0}</p>
              <p className="text-xs text-gray-500">Active This Week</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Trending Posts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-600" /> Trending Posts
          </h2>
          {!stats?.trending_posts?.length ? (
            <p className="text-sm text-gray-400">No trending posts this week.</p>
          ) : (
            <div className="space-y-3">
              {stats.trending_posts.map((post: any, idx: number) => (
                <Link key={post.id} to={`/forum/post/${post.id}`} className="flex items-start gap-3 hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors">
                  <span className="text-sm font-bold text-gray-300 w-5 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate hover:text-brand-600">{post.title}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span>{post.author_first_name} {post.author_last_name}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {post.like_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {post.reply_count}</span>
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {post.view_count}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top Contributors */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-600" /> Top Contributors (30 days)
          </h2>
          {!stats?.top_contributors?.length ? (
            <p className="text-sm text-gray-400">No contributors yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.top_contributors.map((user: any, idx: number) => (
                <div key={user.id} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-300 w-5 text-right">{idx + 1}</span>
                  <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-brand-700">
                      {user.first_name?.[0]}{user.last_name?.[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </p>
                  </div>
                  <Link
                    to={`/forum?author=${user.id}`}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                  >
                    {user.contribution_count} posts
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Posts — quick access to all forum posts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-brand-600" /> All Posts
          </h2>
          <Link
            to="/forum"
            className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
          >
            View Forum
          </Link>
        </div>
        {!stats?.trending_posts?.length && Number(stats?.total_posts) === 0 ? (
          <p className="text-sm text-gray-400">No posts yet. Encourage employees to start discussions!</p>
        ) : (
          <p className="text-sm text-gray-500">
            {stats?.total_posts} total posts, {stats?.total_replies} total replies.{" "}
            <Link to="/forum" className="text-brand-600 hover:underline">Browse all posts</Link>
          </p>
        )}
      </div>

      {/* Manage Categories */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-600" /> Categories
          </h2>
          <button
            onClick={() => {
              resetCatForm();
              setShowCatForm(true);
            }}
            className="flex items-center gap-2 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Category
          </button>
        </div>

        {/* Category form */}
        {showCatForm && (
          <form onSubmit={handleCatSubmit} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingCat ? "Edit Category" : "New Category"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. Engineering"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Icon (emoji)</label>
                <input
                  type="text"
                  value={catIcon}
                  onChange={(e) => setCatIcon(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. #"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={catSortOrder}
                  onChange={(e) => setCatSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  min={0}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                type="text"
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="Brief description of this category"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCatForm}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCategory.isPending || updateCategory.isPending}
                className="bg-brand-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {editingCat ? "Update" : "Create"}
              </button>
            </div>
          </form>
        )}

        {/* Category list */}
        {!stats?.categories?.length ? (
          <p className="text-sm text-gray-400">No categories created yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.categories.map((cat: any) => (
              <div key={cat.id} className="flex items-center gap-4 py-3">
                <span className="text-lg w-8 text-center">{cat.icon || "#"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-gray-500 truncate">{cat.description}</p>
                  )}
                </div>
                <span className="text-sm text-gray-500">{cat.post_count} posts</span>
                <span className="text-xs text-gray-400">Order: {cat.sort_order}</span>
                <button
                  onClick={() => startEditCategory(cat)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  title="Edit category"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setDeleteTarget({ id: cat.id, name: cat.name, post_count: Number(cat.post_count || 0) });
                    setDeleteError(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                  title="Delete category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
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
                    Delete{" "}
                    <span className="font-medium text-gray-700">{deleteTarget.name}</span>?
                    {deleteTarget.post_count > 0 ? (
                      <>
                        {" "}The {deleteTarget.post_count} existing post
                        {deleteTarget.post_count === 1 ? "" : "s"} keep their tag, but no
                        new posts can be added here until it's restored.
                      </>
                    ) : (
                      <>
                        {" "}The category will be hidden from the forum and from new-post
                        selection.
                      </>
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
