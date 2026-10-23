import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import RichTextEditor, { isRichTextEmpty } from "@/components/ui/RichTextEditor";
import {
  ArrowUpDown,
  BookOpen,
  BookMarked,
  Bookmark,
  Building2,
  CalendarDays,
  DollarSign,
  FileText,
  Search,
  Plus,
  Eye,
  Heart,
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
  LayoutGrid,
  List,
  Minus,
  Monitor,
  MoreVertical,
  ShieldCheck,
  UserPlus,
  UsersRound,
  type LucideIcon,
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
  leave: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  payroll: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  benefits: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  it: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  facilities: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  onboarding: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  policy: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  general: "bg-muted text-muted-foreground",
};

type CategoryUi = {
  icon: LucideIcon;
  iconBox: string;
  pill: string;
};

const CATEGORY_UI: Record<string, CategoryUi> = {
  leave: {
    icon: CalendarDays,
    iconBox: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    pill: "border-blue-100 bg-blue-50/80 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
  },
  payroll: {
    icon: DollarSign,
    iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    pill: "border-emerald-100 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  benefits: {
    icon: Heart,
    iconBox: "bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300",
    pill: "border-rose-100 bg-rose-50/80 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300",
  },
  it: {
    icon: Monitor,
    iconBox: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    pill: "border-violet-100 bg-violet-50/80 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300",
  },
  facilities: {
    icon: Building2,
    iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    pill: "border-amber-100 bg-amber-50/80 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  },
  onboarding: {
    icon: UserPlus,
    iconBox: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300",
    pill: "border-teal-100 bg-teal-50/80 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300",
  },
  policy: {
    icon: ShieldCheck,
    iconBox: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
    pill: "border-purple-100 bg-purple-50/80 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300",
  },
  general: {
    icon: FileText,
    iconBox: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
    pill: "border-slate-200 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
  },
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function articleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function initials(name: string): string {
  const result = String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return result || "KB";
}

export default function KnowledgeBasePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<"most-viewed" | "recent" | "title">("most-viewed");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  // The reference dashboard summarizes the full article library above the
  // paginated results. Fetch the library once (the API caps this at 500) so
  // the stat cards and category counts stay stable while users filter pages.
  const { data: libraryData } = useQuery({
    queryKey: ["kb-articles", "library-summary"],
    queryFn: () =>
      api
        .get("/helpdesk/kb", { params: { page: 1, per_page: 500 } })
        .then((r) => r.data),
    staleTime: 60_000,
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
  const libraryArticles = (libraryData?.data || articles) as any[];
  const libraryTotal = Number(libraryData?.meta?.total ?? meta?.total ?? libraryArticles.length);
  const totalViews = libraryArticles.reduce(
    (total: number, article: any) => total + Number(article.view_count || 0),
    0,
  );
  const helpfulVotes = libraryArticles.reduce(
    (total: number, article: any) => total + Number(article.helpful_count || 0),
    0,
  );
  const unhelpfulVotes = libraryArticles.reduce(
    (total: number, article: any) => total + Number(article.not_helpful_count || 0),
    0,
  );
  const feedbackTotal = helpfulVotes + unhelpfulVotes;
  const helpfulRate = feedbackTotal > 0 ? Math.round((helpfulVotes / feedbackTotal) * 100) : 0;
  const categoryCounts = libraryArticles.reduce<Record<string, number>>((counts, article: any) => {
    const key = String(article.category || "general");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const sortedArticles = [...articles].sort((left: any, right: any) => {
    if (sortBy === "title") {
      return String(left.title || "").localeCompare(String(right.title || ""));
    }
    if (sortBy === "recent") {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    }
    return Number(right.view_count || 0) - Number(left.view_count || 0);
  });
  const resultStart = articles.length > 0 ? (Number(meta?.page || page) - 1) * 12 + 1 : 0;
  const resultEnd = Math.min(resultStart + articles.length - 1, Number(meta?.total || 0));
  const totalPages = Number(meta?.total_pages || 1);
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    const start = Math.min(Math.max(page - 2, 1), totalPages - 4);
    return start + index;
  });

  const stats: Array<{
    label: string;
    value: string;
    helper: string;
    trendLabel?: string;
    icon: LucideIcon;
    cardClass: string;
    iconClass: string;
  }> = [
    {
      label: t("kb.totalArticles", { defaultValue: "Total Articles" }),
      value: compactNumber(libraryTotal),
      helper: t("kb.publishedKnowledge", { defaultValue: "Published knowledge" }),
      trendLabel: t("kb.trendUnavailable", { defaultValue: "Trend unavailable" }),
      icon: FileText,
      cardClass: "border-blue-100 bg-gradient-to-br from-white to-blue-50/70 dark:border-blue-900/40 dark:from-card dark:to-blue-950/20",
      iconClass: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
    },
    {
      label: t("kb.totalViews", { defaultValue: "Total Views" }),
      value: compactNumber(totalViews),
      helper: t("kb.acrossAllArticles", { defaultValue: "Across all articles" }),
      trendLabel: t("kb.trendUnavailable", { defaultValue: "Trend unavailable" }),
      icon: Eye,
      cardClass: "border-emerald-100 bg-gradient-to-br from-white to-emerald-50/80 dark:border-emerald-900/40 dark:from-card dark:to-emerald-950/20",
      iconClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
    },
    {
      label: t("kb.helpfulRate", { defaultValue: "Helpful Rate" }),
      value: `${helpfulRate}%`,
      helper: t("kb.readerFeedback", { defaultValue: "Based on reader feedback" }),
      trendLabel: t("kb.trendUnavailable", { defaultValue: "Trend unavailable" }),
      icon: ThumbsUp,
      cardClass: "border-amber-100 bg-gradient-to-br from-white to-amber-50/80 dark:border-amber-900/40 dark:from-card dark:to-amber-950/20",
      iconClass: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
    },
    {
      label: t("kb.categories", { defaultValue: "Categories" }),
      value: String(CATEGORIES.length),
      helper: t("kb.organizedKnowledge", { defaultValue: "Organized knowledge" }),
      icon: UsersRound,
      cardClass: "border-purple-100 bg-gradient-to-br from-white to-purple-50/80 dark:border-purple-900/40 dark:from-card dark:to-purple-950/20",
      iconClass: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300",
    },
  ];

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
            <span>{articleDate(selectedArticle.created_at)}</span>
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
    <div className="space-y-3 pb-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-5 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.8)] transition-colors hover:from-blue-700 hover:to-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-auto"
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

      <section
        aria-label={t("kb.overview", { defaultValue: "Knowledge base overview" })}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => {
          const StatIcon = stat.icon;
          return (
            <article
              key={stat.label}
              className={`relative min-h-[88px] overflow-hidden rounded-xl border px-4 py-3 shadow-sm ${stat.cardClass}`}
            >
              <div className="relative z-10 flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}>
                  <StatIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-none tabular-nums text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  {stat.trendLabel ? (
                    <p className="mt-1.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold">
                        <Minus className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <span className="truncate">{stat.trendLabel}</span>
                    </p>
                  ) : (
                    <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                      {stat.helper}
                    </p>
                  )}
                </div>
              </div>
              {stat.trendLabel && (
                <svg
                  viewBox="0 0 84 40"
                  className="absolute bottom-3 right-2 h-10 w-20 text-slate-300 opacity-75 dark:text-slate-700"
                  aria-hidden="true"
                >
                  <path
                    d="M2 24 H82"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </article>
          );
        })}
      </section>

      {/* Search, sort, view toggle and category filters */}
      <section aria-label={t("kb.searchPlaceholder")} className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
            <label htmlFor="knowledge-base-search" className="sr-only">
              {t("kb.searchPlaceholder")}
            </label>
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
              onChange={(event) => {
                setSearchInput(event.target.value);
                if (!event.target.value) {
                  setSearch("");
                  setPage(1);
                }
              }}
              placeholder={t("kb.searchLongPlaceholder", {
                defaultValue: "Search articles, keywords, or questions...",
              })}
              className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-[13px] text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
            />
            <button type="submit" className="sr-only">
              {t("kb.search")}
            </button>
          </form>

          <label className="relative block min-w-[180px]">
            <span className="sr-only">{t("kb.sortArticles", { defaultValue: "Sort articles" })}</span>
            <ArrowUpDown
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-[12px] font-medium text-foreground shadow-sm outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
            >
              <option value="most-viewed">
                {t("kb.sortMostViewed", { defaultValue: "Sort: Most Viewed" })}
              </option>
              <option value="recent">{t("kb.sortRecent", { defaultValue: "Sort: Recent" })}</option>
              <option value="title">{t("kb.sortTitle", { defaultValue: "Sort: Title" })}</option>
            </select>
          </label>

          <div
            role="group"
            aria-label={t("kb.viewStyle", { defaultValue: "Article view style" })}
            className="flex shrink-0 rounded-lg border border-border bg-card p-0.5 shadow-sm"
          >
            <button
              type="button"
              aria-label={t("kb.gridView", { defaultValue: "Grid view" })}
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={`inline-flex h-9 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                viewMode === "grid"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("kb.listView", { defaultValue: "List view" })}
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`inline-flex h-9 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                viewMode === "list"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          role="group"
          aria-label={t("kb.categoryLabel")}
          className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5"
        >
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => {
              setCategory("");
              setPage(1);
            }}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              !category
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border bg-card text-muted-foreground hover:border-brand-200 hover:text-foreground"
            }`}
          >
            {t("kb.all")}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${!category ? "bg-white/20" : "bg-muted"}`}>
              {libraryTotal}
            </span>
          </button>
          {CATEGORIES.map((categoryName) => {
            const categoryUi = CATEGORY_UI[categoryName] || CATEGORY_UI.general;
            const CategoryIcon = categoryUi.icon;
            const active = category === categoryName;
            return (
              <button
                key={categoryName}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategory(categoryName);
                  setPage(1);
                }}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : categoryUi.pill
                }`}
              >
                <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {categoryLabel(categoryName, t)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-white/70 dark:bg-black/10"}`}>
                  {categoryCounts[categoryName] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Articles */}
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
          <p className="mt-3 text-sm font-semibold text-foreground">{t("kb.loading")}</p>
        </div>
      ) : isError && !data ? (
        <div
          className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center shadow-sm"
          role="alert"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <BookMarked className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">{t("common.error")}</p>
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
          <p className="mt-3 text-sm font-semibold text-foreground">{t("kb.noArticles")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? t("kb.tryDifferentSearch") : t("kb.emptyHint")}
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
              : "grid grid-cols-1 gap-3"
          }
        >
          {sortedArticles.map((article: any) => {
            const articleCategory = String(article.category || "general");
            const categoryUi = CATEGORY_UI[articleCategory] || CATEGORY_UI.general;
            const CategoryIcon = categoryUi.icon;
            return (
              <article
                key={article.id}
                className={`group relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none ${
                  viewMode === "grid" ? "min-h-[130px]" : "min-h-[108px]"
                }`}
              >
                <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 text-muted-foreground">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                    aria-hidden="true"
                  >
                    <Bookmark
                      className={`h-3.5 w-3.5 ${article.is_featured ? "fill-brand-500 text-brand-500" : ""}`}
                    />
                  </span>
                  {isHR ? (
                    <button
                      type="button"
                      aria-label={t("kb.editArticleTooltip")}
                      title={t("kb.editArticleTooltip")}
                      onClick={() => startEdit(article)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleViewArticle(article.slug || article.id)}
                  className="block h-full w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  <span className={`flex gap-3 ${viewMode === "list" ? "items-center" : "items-start"}`}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${categoryUi.iconBox}`}>
                      <CategoryIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 pr-14">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          CATEGORY_COLORS[articleCategory] || CATEGORY_COLORS.general
                        }`}
                      >
                        {categoryLabel(articleCategory, t)}
                      </span>
                      <span className="mt-1 block line-clamp-1 text-[13px] font-semibold leading-5 text-foreground">
                        {article.title}
                      </span>
                      <span className={`mt-0.5 block text-[11px] leading-4 text-muted-foreground ${viewMode === "grid" ? "line-clamp-2" : "line-clamp-1"}`}>
                        {stripHtml(article.content || "")}
                      </span>
                    </span>
                  </span>

                  <span className="mt-3 flex min-w-0 items-end justify-between gap-3 border-t border-border/60 pt-2">
                    <span className="flex shrink-0 items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" aria-hidden="true" /> {Number(article.view_count || 0)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" aria-hidden="true" /> {Number(article.helpful_count || 0)}
                      </span>
                      {Number(article.not_helpful_count || 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsDown className="h-3 w-3" aria-hidden="true" /> {Number(article.not_helpful_count || 0)}
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-right">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[9px] font-bold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                        {initials(article.author_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-24 truncate text-[10px] font-medium leading-3 text-muted-foreground">
                          {article.author_name || t("kb.unknownAuthor", { defaultValue: "Unknown author" })}
                        </span>
                        <span className="block whitespace-nowrap text-[9px] leading-3 text-muted-foreground/80">
                          {articleDate(article.created_at)}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {meta && articles.length > 0 && (
        <nav
          aria-label={t("kb.title")}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs text-muted-foreground">
            {t("kb.showingArticles", {
              defaultValue: "Showing {{start}}–{{end}} of {{total}} articles",
              start: resultStart,
              end: resultEnd,
              total: meta.total,
            })}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t("kb.previous")}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                disabled={page === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </button>
              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  aria-label={t("kb.goToPage", {
                    defaultValue: "Go to page {{page}}",
                    page: pageNumber,
                  })}
                  aria-current={pageNumber === page ? "page" : undefined}
                  onClick={() => setPage(pageNumber)}
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    pageNumber === page
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label={t("kb.next")}
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                disabled={page >= totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </button>
            </div>
          )}
        </nav>
      )}

      {renderDeleteDialog()}
    </div>
  );
}
