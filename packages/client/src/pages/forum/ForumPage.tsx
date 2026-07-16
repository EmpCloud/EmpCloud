import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  MessageCircle,
  Plus,
  TrendingUp,
  Eye,
  Heart,
  Search,
  Pin,
  Lock,
  Lightbulb,
  HelpCircle,
  MessagesSquare,
  BarChart3,
  AlertCircle,
} from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

// Post type → colour + icon. Label text comes from i18n (forum.page.postType.*).
const POST_TYPE_CONFIG: Record<string, { color: string; icon: typeof MessageCircle }> = {
  discussion: { color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", icon: MessagesSquare },
  question: { color: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", icon: HelpCircle },
  idea: { color: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300", icon: Lightbulb },
  poll: { color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300", icon: BarChart3 },
};

function useCategories() {
  return useQuery({
    queryKey: ["forum-categories"],
    queryFn: () => api.get("/forum/categories").then((r) => r.data.data),
  });
}

function useRecentPosts(search: string, sortBy: string) {
  return useQuery({
    queryKey: ["forum-posts", "recent", search, sortBy],
    queryFn: () =>
      api
        .get("/forum/posts", { params: { page: 1, per_page: 10, search: search || undefined, sort_by: sortBy } })
        .then((r) => r.data),
    retry: 1,
  });
}

function safeParseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function timeAgo(dateStr: string, t: TFn) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return t("forum.page.justNow");
  if (diff < 3600) return t("forum.page.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("forum.page.hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("forum.page.daysAgo", { count: Math.floor(diff / 86400) });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ForumPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const { data: categories, isLoading: loadingCats, isError: catsError } = useCategories();
  const { data: postsData, isLoading: loadingPosts, isError: postsError } = useRecentPosts(search, sortBy);
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);

  const posts = postsData?.data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("forum.page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("forum.page.subtitle")}</p>
        </div>
        <div className="flex gap-3">
          {isHR && (
            <Link
              to="/forum/dashboard"
              className="flex items-center gap-2 border border-border text-muted-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted"
            >
              <TrendingUp className="h-4 w-4" /> {t("forum.page.dashboard")}
            </Link>
          )}
          <Link
            to="/forum/new"
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("forum.page.newPost")}
          </Link>
        </div>
      </div>

      {/* Category Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("forum.page.categories")}</h2>
        {loadingCats ? (
          <div className="text-muted-foreground text-sm">{t("forum.page.loadingCategories")}</div>
        ) : catsError ? (
          <div className="bg-card rounded-xl border border-red-200 dark:border-red-900 p-6 text-center text-red-500 dark:text-red-400 text-sm">
            {t("forum.page.categoriesError")}
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-6 text-center text-muted-foreground text-sm">
            {t("forum.page.noCategories")} {isHR ? t("forum.page.noCategoriesHr") : t("forum.page.noCategoriesEmployee")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat: any) => (
              <Link
                key={cat.id}
                to={`/forum/category/${cat.id}`}
                className="bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-brand-200 dark:hover:border-brand-900 transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center text-brand-600 dark:text-brand-400 group-hover:bg-brand-100 dark:group-hover:bg-brand-950/40 transition-colors">
                    <span className="text-lg">{cat.icon || "#"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{cat.name}</h3>
                    <p className="text-xs text-muted-foreground">{t("forum.page.postsCount", { count: cat.post_count || 0 })}</p>
                  </div>
                </div>
                {cat.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{cat.description}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("forum.page.searchPlaceholder")}
            className="bg-card text-foreground w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {[
            { key: "recent", label: t("forum.page.sortRecent") },
            { key: "popular", label: t("forum.page.sortPopular") },
            { key: "trending", label: t("forum.page.sortTrending") },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === s.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Feed */}
      <div className="space-y-3">
        {loadingPosts ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-16 bg-muted rounded-full" />
                      <div className="h-3 w-20 bg-muted rounded" />
                    </div>
                    <div className="h-4 w-2/3 bg-muted rounded mb-2" />
                    <div className="h-3 w-full bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : postsError ? (
          <div className="bg-card rounded-xl border border-red-200 dark:border-red-900 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">{t("forum.page.postsError")}</p>
            <p className="text-sm text-red-500 dark:text-red-400">{t("forum.page.tryRefresh")}</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <MessagesSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-1">{t("forum.page.noPosts")}</p>
            <p className="text-sm text-muted-foreground mb-4">{t("forum.page.beFirst")}</p>
            <Link
              to="/forum/new"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> {t("forum.page.startDiscussion")}
            </Link>
          </div>
        ) : (
          posts.map((post: any) => {
            const typeConfig = POST_TYPE_CONFIG[post.post_type] || POST_TYPE_CONFIG.discussion;
            const TypeIcon = typeConfig.icon;
            return (
              <Link
                key={post.id}
                to={`/forum/post/${post.id}`}
                className="block bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-brand-200 dark:hover:border-brand-900 transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Author avatar */}
                  <div className="h-10 w-10 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                      {post.author_first_name?.[0]}
                      {post.author_last_name?.[0]}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {t(`forum.page.postType.${post.post_type}`, { defaultValue: post.post_type })}
                      </span>
                      {Boolean(post.is_pinned) && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <Pin className="h-3 w-3" /> {t("forum.page.pinned")}
                        </span>
                      )}
                      {Boolean(post.is_locked) && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> {t("forum.page.locked")}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{post.category_name}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-foreground mb-1">{post.title}</h3>

                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {post.content?.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {post.author_first_name} {post.author_last_name}
                      </span>
                      <span>{timeAgo(post.created_at, t)}</span>
                      {post.view_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {post.view_count}
                        </span>
                      )}
                      {post.like_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {post.like_count}
                        </span>
                      )}
                      {post.reply_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> {post.reply_count}
                        </span>
                      )}
                      {safeParseTags(post.tags).length > 0 && (
                        <span className="flex items-center gap-1">
                          {safeParseTags(post.tags)
                            .slice(0, 3)
                            .map((tag: string) => (
                              <span
                                key={tag}
                                className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs"
                              >
                                #{tag}
                              </span>
                            ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
