import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import api from "@/api/client";
import {
  MessageCircle,
  Plus,
  Eye,
  Heart,
  ArrowLeft,
  Pin,
  Lock,
  HelpCircle,
  Lightbulb,
  MessagesSquare,
  BarChart3,
  Filter,
} from "lucide-react";

const POST_TYPE_CONFIG: Record<string, { labelKey: string; color: string; icon: typeof MessageCircle }> = {
  discussion: { labelKey: "categoryPosts.postType.discussion", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", icon: MessagesSquare },
  question: { labelKey: "categoryPosts.postType.question", color: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", icon: HelpCircle },
  idea: { labelKey: "categoryPosts.postType.idea", color: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300", icon: Lightbulb },
  poll: { labelKey: "categoryPosts.postType.poll", color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300", icon: BarChart3 },
};

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return t("categoryPosts.time.justNow");
  if (diff < 3600) return t("categoryPosts.time.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("categoryPosts.time.hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("categoryPosts.time.daysAgo", { count: Math.floor(diff / 86400) });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CategoryPostsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [postType, setPostType] = useState("");
  const [sortBy, setSortBy] = useState("recent");

  const { data: categories } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: () => api.get("/forum/categories").then((r) => r.data.data),
  });

  const category = (categories || []).find((c: any) => String(c.id) === id);

  const { data: postsData, isLoading } = useQuery({
    queryKey: ["forum-posts", id, page, postType, sortBy],
    queryFn: () =>
      api
        .get("/forum/posts", {
          params: {
            category_id: id,
            page,
            per_page: 20,
            post_type: postType || undefined,
            sort_by: sortBy,
          },
        })
        .then((r) => r.data),
    enabled: !!id,
  });

  const posts = postsData?.data || [];
  const meta = postsData?.meta;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/forum"
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {category?.icon && (
              <span className="text-2xl">{category.icon}</span>
            )}
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {category?.name || t("categoryPosts.header.defaultCategoryName")}
              </h1>
              {category?.description && (
                <p className="text-muted-foreground text-sm mt-0.5">{category.description}</p>
              )}
            </div>
          </div>
        </div>
        <Link
          to={`/forum/new?category=${id}`}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> {t("categoryPosts.header.newPost")}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={postType}
            onChange={(e) => { setPostType(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-1.5 border border-border rounded-md text-[13px]"
          >
            <option value="">{t("categoryPosts.filters.allTypes")}</option>
            <option value="discussion">{t("categoryPosts.filters.discussions")}</option>
            <option value="question">{t("categoryPosts.filters.questions")}</option>
            <option value="idea">{t("categoryPosts.filters.ideas")}</option>
            <option value="poll">{t("categoryPosts.filters.polls")}</option>
          </select>
        </div>

        <div className="flex gap-1 bg-muted rounded-md p-1">
          {[
            { key: "recent", labelKey: "categoryPosts.sort.recent" },
            { key: "popular", labelKey: "categoryPosts.sort.popular" },
            { key: "trending", labelKey: "categoryPosts.sort.active" },
            { key: "views", labelKey: "categoryPosts.sort.mostViewed" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => { setSortBy(s.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === s.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-[13px] text-muted-foreground">
            {t("categoryPosts.list.loading")}
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-[13px] text-muted-foreground">
            {t("categoryPosts.list.empty")}
          </div>
        ) : (
          posts.map((post: any) => {
            const typeConfig = POST_TYPE_CONFIG[post.post_type] || POST_TYPE_CONFIG.discussion;
            const TypeIcon = typeConfig.icon;
            return (
              <Link
                key={post.id}
                to={`/forum/post/${post.id}`}
                className="block bg-card rounded-lg border border-border p-4 hover:border-brand-400 transition-colors duration-150"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                      {post.author_first_name?.[0]}
                      {post.author_last_name?.[0]}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {t(typeConfig.labelKey)}
                      </span>
                      {Boolean(post.is_pinned) && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <Pin className="h-3 w-3" /> {t("categoryPosts.badge.pinned")}
                        </span>
                      )}
                      {Boolean(post.is_locked) && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> {t("categoryPosts.badge.locked")}
                        </span>
                      )}
                    </div>

                    <h3 className="text-[13px] font-semibold text-foreground mb-1">{post.title}</h3>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                      {post.content?.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] tabular-nums text-muted-foreground">
                      <span>{post.author_first_name} {post.author_last_name}</span>
                      <span>{timeAgo(post.created_at, t)}</span>
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {post.view_count}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {post.like_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {post.reply_count}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {t("categoryPosts.pagination.pageInfo", {
              page: meta.page,
              totalPages: meta.total_pages,
              count: meta.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t("categoryPosts.pagination.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t("categoryPosts.pagination.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
