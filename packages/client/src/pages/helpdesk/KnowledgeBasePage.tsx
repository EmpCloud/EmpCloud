import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import RichTextEditor, { isRichTextEmpty } from "@/components/ui/RichTextEditor";
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
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Display labels override the default Tailwind `capitalize` rendering for
// values that aren't title-cased — "it" → "IT" because it's an acronym
// (#1646). Translations live under kb.category.*; the English capitalised
// value (or "IT") is the defaultValue so an unknown category still renders.
const CATEGORY_LABELS: Record<string, string> = {
  it: "IT",
};
function categoryLabel(c: string, t: TFn): string {
  return t(`kb.category.${c}`, {
    defaultValue: CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1),
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  leave: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  payroll: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  benefits: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  it: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  facilities: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  onboarding: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300",
  policy: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  general: "bg-muted text-muted-foreground",
};

export default function KnowledgeBasePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [currentVote, setCurrentVote] = useState<null | boolean>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formPublished, setFormPublished] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);

  function resetForm() {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("general");
    setFormPublished(true);
    setFormFeatured(false);
  }

  function startEdit(article: any) {
    setEditingId(article.id);
    setFormTitle(article.title);
    setFormContent(article.content);
    setFormCategory(article.category);
    setFormPublished(!!article.is_published);
    setFormFeatured(!!article.is_featured);
    setSelectedArticle(null);
    setShowForm(true);
  }

  const { data, isLoading, isError, refetch } = useQuery({
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
      resetForm();
    },
  });

  const updateArticle = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/helpdesk/kb/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteArticle = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/helpdesk/kb/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      setDeleteTarget(null);
      setDeleteError(null);
      setSelectedArticle(null);
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || t("kb.deleteError")),
  });

  const rateArticle = useMutation({
    mutationFn: ({ id, helpful }: { id: number; helpful: boolean }) =>
      api.post(`/helpdesk/kb/${id}/helpful`, { helpful }).then((r) => r.data.data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      setHasVoted(true);
      setCurrentVote(variables.helpful);
      setSelectedArticle((current: any) =>
        current?.id === data.id ? { ...current, ...data } : current,
      );
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: formTitle,
      content: formContent,
      category: formCategory,
      is_published: formPublished,
      is_featured: formFeatured,
    };
    if (editingId) {
      await updateArticle.mutateAsync({ id: editingId, data: payload });
    } else {
      await createArticle.mutateAsync(payload);
    }
  };

  const handleViewArticle = async (idOrSlug: string) => {
    try {
      const { data } = await api.get(`/helpdesk/kb/${idOrSlug}`);
      setSelectedArticle(data.data);
      // Check if user already rated this article
      try {
        const { data: ratingData } = await api.get(`/helpdesk/kb/${data.data.id}/my-rating`);
        setHasVoted(ratingData.data?.rated || false);
        setCurrentVote(
          ratingData.data?.rated ? Boolean(ratingData.data.helpful) : null,
        );
      } catch {
        setHasVoted(false);
        setCurrentVote(null);
      }
    } catch {
      // handle error silently
    }
  };

  const articles = data?.data || [];
  const meta = data?.meta;

  function renderDeleteDialog() {
    if (!deleteTarget) return null;

    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open && !deleteArticle.isPending) setDeleteTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            aria-busy={deleteArticle.isPending}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
          <div className="px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                <Trash2
                  className="h-5 w-5 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {t("kb.deleteTitle")}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  <Trans
                    i18nKey="kb.deleteBody"
                    values={{ title: deleteTarget.title }}
                    components={{
                      strong: <span className="font-medium text-foreground" />,
                    }}
                  />
                </Dialog.Description>
              </div>
            </div>
          </div>
          {deleteError && (
            <div
              role="alert"
              className="mx-5 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:mx-6 dark:bg-red-950/40 dark:text-red-300"
            >
              {deleteError}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteArticle.isPending}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("kb.cancel")}
            </button>
            <button
              type="button"
              onClick={() => deleteArticle.mutate(deleteTarget.id)}
              disabled={deleteArticle.isPending}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteArticle.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {t("kb.deleting")}
                </>
              ) : (
                t("kb.delete")
              )}
            </button>
          </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  // Article detail view
  if (selectedArticle) {
    return (
      <div className="max-w-4xl space-y-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setSelectedArticle(null)}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t("kb.backToKb")}
          </button>
          {isHR && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => startEdit(selectedArticle)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" /> {t("kb.edit")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget({ id: selectedArticle.id, title: selectedArticle.title });
                  setDeleteError(null);
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-card px-3 text-[13px] font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("kb.delete")}
              </button>
            </div>
          )}
        </div>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                CATEGORY_COLORS[selectedArticle.category] || "bg-muted text-muted-foreground"
              }`}
            >
              {categoryLabel(selectedArticle.category, t)}
            </span>
            {Boolean(selectedArticle.is_featured) && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-950/40 px-2 py-0.5 rounded">
                <Star className="h-3 w-3" aria-hidden="true" /> {t("kb.featured")}
              </span>
            )}
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-foreground mb-2">
            {selectedArticle.title}
          </h1>

          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{t("kb.byAuthor", { author: selectedArticle.author_name })}</span>
            <span>
              {new Date(selectedArticle.created_at).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden="true" /> {t("kb.viewsCount", { count: selectedArticle.view_count })}
            </span>
          </div>

          {/* Content is sanitized server-side; render as HTML so authored
              markup doesn't leak as literal <p>...</p> tags to readers
              (#1634). whitespace-pre-wrap stays for legacy plaintext. */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap mb-8"
            dangerouslySetInnerHTML={{ __html: selectedArticle.content || "" }}
          />

          <div className="border-t border-border pt-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              {t("kb.wasHelpful")}
            </p>
            {hasVoted && (
              <p className="text-xs text-muted-foreground mb-2">
                {currentVote ? t("kb.ratedHelpful") : t("kb.ratedNotHelpful")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-pressed={currentVote === true}
                onClick={() =>
                  rateArticle.mutate({
                    id: selectedArticle.id,
                    helpful: true,
                  })
                }
                disabled={rateArticle.isPending}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  currentVote === true
                    ? "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200"
                    : "border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/40"
                }`}
              >
                <ThumbsUp className="h-4 w-4" aria-hidden="true" /> {t("kb.yes")} (
                {selectedArticle.helpful_count})
              </button>
              <button
                type="button"
                aria-pressed={currentVote === false}
                onClick={() =>
                  rateArticle.mutate({
                    id: selectedArticle.id,
                    helpful: false,
                  })
                }
                disabled={rateArticle.isPending}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  currentVote === false
                    ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
                    : "border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                }`}
              >
                <ThumbsDown className="h-4 w-4" aria-hidden="true" /> {t("kb.no")} (
                {selectedArticle.not_helpful_count})
              </button>
            </div>
          </div>
        </article>

        {deleteTarget && renderDeleteDialog()}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50">
            <BookMarked className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {t("kb.title")}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t("kb.subtitle")}
            </p>
          </div>
        </div>
        {isHR && (
          <button
            type="button"
            aria-expanded={showForm}
            aria-controls="knowledge-base-article-form"
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                resetForm();
              } else {
                resetForm();
                setShowForm(true);
              }
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("kb.newArticle")}
          </button>
        )}
      </header>

      {/* Create / Edit Article Form */}
      {showForm && isHR && (
        <section
          id="knowledge-base-article-form"
          aria-labelledby="knowledge-base-article-form-title"
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              id="knowledge-base-article-form-title"
              className="text-base font-semibold text-foreground"
            >
              {editingId ? t("kb.editArticle") : t("kb.newKbArticle")}
            </h2>
            <button
              type="button"
              aria-label={t("kb.cancel")}
              onClick={() => { setShowForm(false); resetForm(); }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={handleSubmitForm} className="space-y-4">
            <div>
              <label
                htmlFor="knowledge-base-title"
                className="mb-1 block text-[13px] font-medium text-muted-foreground"
              >
                {t("kb.titleLabel")}
              </label>
              <input
                id="knowledge-base-title"
                name="title"
                type="text"
                autoComplete="off"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
                placeholder={t("kb.titlePlaceholder")}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="knowledge-base-category"
                  className="mb-1 block text-[13px] font-medium text-muted-foreground"
                >
                  {t("kb.categoryLabel")}
                </label>
                <select
                  id="knowledge-base-category"
                  name="category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formPublished}
                    onChange={(e) => setFormPublished(e.target.checked)}
                    className="rounded border-border"
                  />
                  {t("kb.published")}
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formFeatured}
                    onChange={(e) => setFormFeatured(e.target.checked)}
                    className="rounded border-border"
                  />
                  {t("kb.featured")}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {t("kb.contentLabel")}
              </label>
              <RichTextEditor
                value={formContent}
                onChange={setFormContent}
                placeholder={t("kb.contentPlaceholder")}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {t("kb.cancel")}
              </button>
              <button
                type="submit"
                disabled={
                  createArticle.isPending ||
                  updateArticle.isPending ||
                  !formTitle.trim() ||
                  isRichTextEmpty(formContent)
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BookMarked className="h-4 w-4" aria-hidden="true" />
                {editingId
                  ? updateArticle.isPending
                    ? t("kb.updating")
                    : t("kb.updateArticle")
                  : createArticle.isPending
                    ? t("kb.publishing")
                    : t("kb.publishArticle")}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Search + Category Filter */}
      <section
        aria-label={t("kb.searchPlaceholder")}
        className="rounded-xl border border-border bg-card p-3 shadow-sm"
      >
        <form
          onSubmit={handleSearch}
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
        >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t("kb.searchPlaceholder")}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="knowledge-base-search"
                name="search"
                type="search"
                autoComplete="off"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("kb.searchPlaceholder")}
                className="min-h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              {t("kb.search")}
            </button>
        </form>
        <div
          role="group"
          aria-label={t("kb.categoryLabel")}
          className="mt-3 flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1"
        >
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => {
              setCategory("");
              setPage(1);
            }}
            className={`inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              !category
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            {t("kb.all")}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                category === c
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              {categoryLabel(c, t)}
            </button>
          ))}
        </div>
      </section>

      {/* Articles Grid */}
      {isLoading ? (
        <div
          className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center shadow-sm"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Loader2
              className="h-5 w-5 animate-spin text-brand-600 motion-reduce:animate-none"
              aria-hidden="true"
            />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {t("kb.loading")}
          </p>
        </div>
      ) : isError && !data ? (
        <div
          className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center shadow-sm"
          role="alert"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <BookMarked className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {t("common.error")}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {t("common.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      ) : articles.length === 0 ? (
        <div
          className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center shadow-sm"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <BookMarked className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {t("kb.noArticles")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search
              ? t("kb.tryDifferentSearch")
              : t("kb.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a: any) => (
            <article
              key={a.id}
              className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
            >
              {isHR && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("kb.editArticleTooltip")}
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(a);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    title={t("kb.editArticleTooltip")}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("kb.deleteArticleTooltip")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: a.id, title: a.title });
                      setDeleteError(null);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/40"
                    title={t("kb.deleteArticleTooltip")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleViewArticle(a.slug || a.id)}
                className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className={`mb-2 flex items-center gap-2 ${isHR ? "pr-20" : ""}`}>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      CATEGORY_COLORS[a.category] || "bg-muted text-muted-foreground"
                    }`}
                  >
                    {categoryLabel(a.category, t)}
                  </span>
                  {Boolean(a.is_featured) && (
                    <Star
                      className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400"
                      aria-label={t("kb.featured")}
                    />
                  )}
                </div>
                <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">
                  {a.title}
                </h3>
                {/* Card previews strip HTML so the snippet stays readable
                    even when authors saved their content with markup
                    (#1634). The detail view above still renders the
                    sanitized HTML. */}
                <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">
                  {(a.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {a.view_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" aria-hidden="true" /> {a.view_count}
                    </span>
                  )}
                  {a.helpful_count > 0 && (
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" aria-hidden="true" /> {a.helpful_count}
                    </span>
                  )}
                  {(a.not_helpful_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <ThumbsDown className="h-3 w-3" aria-hidden="true" /> {a.not_helpful_count}
                    </span>
                  )}
                  <span>{a.author_name}</span>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <nav
          aria-label={t("kb.title")}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs text-muted-foreground">
            {t("kb.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {t("kb.previous")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {t("kb.next")}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {renderDeleteDialog()}
    </div>
  );
}
