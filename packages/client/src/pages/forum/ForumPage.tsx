import { useState } from "react";
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

const POST_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof MessageCircle }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessagesSquare },
  question: { label: "Question", color: "bg-purple-100 text-purple-700", icon: HelpCircle },
  idea: { label: "Idea", color: "bg-amber-100 text-amber-700", icon: Lightbulb },
  poll: { label: "Poll", color: "bg-green-100 text-green-700", icon: BarChart3 },
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

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ForumPage() {
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
          <h1 className="text-2xl font-bold text-gray-900">Community Forum</h1>
          <p className="text-gray-500 mt-1">Connect, discuss, and share ideas with your colleagues.</p>
        </div>
        <div className="flex gap-3">
          {isHR && (
            <Link
              to="/forum/dashboard"
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <TrendingUp className="h-4 w-4" /> Dashboard
            </Link>
          )}
          <Link
            to="/forum/new"
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New Post
          </Link>
        </div>
      </div>

      {/* Category Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Categories</h2>
        {loadingCats ? (
          <div className="text-gray-400 text-sm">Loading categories...</div>
        ) : catsError ? (
          <div className="bg-white rounded-xl border border-red-200 p-6 text-center text-red-500 text-sm">
            Failed to load categories. Please try refreshing the page.
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
            No categories yet. {isHR ? "Create one from the Dashboard." : "Ask your HR team to set up categories."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat: any) => (
              <Link
                key={cat.id}
                to={`/forum/category/${cat.id}`}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-100 transition-colors">
                    <span className="text-lg">{cat.icon || "#"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{cat.name}</h3>
                    <p className="text-xs text-gray-400">{cat.post_count || 0} posts</p>
                  </div>
                </div>
                {cat.description && (
                  <p className="text-xs text-gray-500 line-clamp-2">{cat.description}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search discussions..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: "recent", label: "Recent" },
            { key: "popular", label: "Popular" },
            { key: "trending", label: "Trending" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === s.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
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
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-16 bg-gray-200 rounded-full" />
                      <div className="h-3 w-20 bg-gray-200 rounded" />
                    </div>
                    <div className="h-4 w-2/3 bg-gray-200 rounded mb-2" />
                    <div className="h-3 w-full bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : postsError ? (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium mb-1">Failed to load posts</p>
            <p className="text-sm text-red-500">Please try refreshing the page.</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <MessagesSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-500 mb-1">No posts yet</p>
            <p className="text-sm text-gray-400 mb-4">Be the first to start a discussion!</p>
            <Link
              to="/forum/new"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Start a Discussion
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
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-brand-200 transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Author avatar */}
                  <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-brand-700">
                      {post.author_first_name?.[0]}
                      {post.author_last_name?.[0]}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {typeConfig.label}
                      </span>
                      {post.is_pinned && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <Pin className="h-3 w-3" /> Pinned
                        </span>
                      )}
                      {post.is_locked && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{post.category_name}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{post.title}</h3>

                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                      {post.content?.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>
                        {post.author_first_name} {post.author_last_name}
                      </span>
                      <span>{timeAgo(post.created_at)}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {post.view_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {post.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {post.reply_count}
                      </span>
                      {safeParseTags(post.tags).length > 0 && (
                        <span className="flex items-center gap-1">
                          {safeParseTags(post.tags)
                            .slice(0, 3)
                            .map((tag: string) => (
                              <span
                                key={tag}
                                className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs"
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
