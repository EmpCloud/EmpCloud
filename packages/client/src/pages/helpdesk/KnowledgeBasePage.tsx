import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  BookMarked,
  Search,
  Plus,
  Eye,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  Star,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

const CATEGORY_COLORS: Record<string, string> = {
  leave: "bg-blue-100 text-blue-700",
  payroll: "bg-green-100 text-green-700",
  benefits: "bg-purple-100 text-purple-700",
  it: "bg-orange-100 text-orange-700",
  facilities: "bg-yellow-100 text-yellow-700",
  onboarding: "bg-teal-100 text-teal-700",
  policy: "bg-indigo-100 text-indigo-700",
  general: "bg-gray-100 text-gray-700",
};

export default function KnowledgeBasePage() {
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formPublished, setFormPublished] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["kb-articles", page, category, search],
    queryFn: () =>
      api
        .get("/helpdesk/kb", {
          params: {
            page,
            per_page: 12,
            ...(category && { category }),
            ...(search && { search }),
          },
        })
        .then((r) => r.data),
  });

  const createArticle = useMutation({
    mutationFn: (data: object) =>
      api.post("/helpdesk/kb", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      setShowForm(false);
      setFormTitle("");
      setFormContent("");
      setFormCategory("general");
      setFormPublished(true);
      setFormFeatured(false);
    },
  });

  const rateArticle = useMutation({
    mutationFn: ({ id, helpful }: { id: number; helpful: boolean }) =>
      api.post(`/helpdesk/kb/${id}/helpful`, { helpful }).then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      if (selectedArticle) {
        setSelectedArticle(data);
      }
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createArticle.mutateAsync({
      title: formTitle,
      content: formContent,
      category: formCategory,
      is_published: formPublished,
      is_featured: formFeatured,
    });
  };

  const handleViewArticle = async (idOrSlug: string) => {
    try {
      const { data } = await api.get(`/helpdesk/kb/${idOrSlug}`);
      setSelectedArticle(data.data);
    } catch {
      // handle error silently
    }
  };

  const articles = data?.data || [];
  const meta = data?.meta;

  // Article detail view
  if (selectedArticle) {
    return (
      <div>
        <button
          onClick={() => setSelectedArticle(null)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Knowledge Base
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-3xl">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                CATEGORY_COLORS[selectedArticle.category] || "bg-gray-100 text-gray-600"
              }`}
            >
              {selectedArticle.category}
            </span>
            {selectedArticle.is_featured && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">
                <Star className="h-3 w-3" /> Featured
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {selectedArticle.title}
          </h1>

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-6">
            <span>By {selectedArticle.author_name}</span>
            <span>
              {new Date(selectedArticle.created_at).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {selectedArticle.view_count} views
            </span>
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap mb-8">
            {selectedArticle.content}
          </div>

          <div className="border-t border-gray-200 pt-6">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Was this article helpful?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  rateArticle.mutate({
                    id: selectedArticle.id,
                    helpful: true,
                  })
                }
                disabled={rateArticle.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-200 text-green-700 text-sm font-medium hover:bg-green-50 disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4" /> Yes (
                {selectedArticle.helpful_count})
              </button>
              <button
                onClick={() =>
                  rateArticle.mutate({
                    id: selectedArticle.id,
                    helpful: false,
                  })
                }
                disabled={rateArticle.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                <ThumbsDown className="h-4 w-4" /> No (
                {selectedArticle.not_helpful_count})
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-500 mt-1">
            Find answers to common questions and HR policies.
          </p>
        </div>
        {isHR && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New Article
          </button>
        )}
      </div>

      {/* Create Article Form */}
      {showForm && isHR && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              New Knowledge Base Article
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Article title"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={formPublished}
                    onChange={(e) => setFormPublished(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Published
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={formFeatured}
                    onChange={(e) => setFormFeatured(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Featured
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Content
              </label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[200px]"
                placeholder="Write the article content..."
                required
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createArticle.isPending}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <BookMarked className="h-4 w-4" />
                {createArticle.isPending ? "Publishing..." : "Publish Article"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + Category Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="flex items-center gap-2 flex-1 min-w-[200px]"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
            >
              Search
            </button>
          </form>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => {
              setCategory("");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !category
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                category === c
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          Loading articles...
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <BookMarked className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium text-gray-500 mb-1">
            No articles found
          </p>
          <p className="text-sm">
            {search
              ? "Try a different search term."
              : "Knowledge base articles will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a: any) => (
            <button
              key={a.id}
              onClick={() => handleViewArticle(a.slug || a.id)}
              className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                    CATEGORY_COLORS[a.category] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {a.category}
                </span>
                {a.is_featured && (
                  <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                )}
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">
                {a.title}
              </h3>
              <p className="text-xs text-gray-500 line-clamp-3 mb-3">
                {a.content}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {a.view_count}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" /> {a.helpful_count}
                </span>
                <span>{a.author_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
