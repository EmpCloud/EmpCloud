import { useState } from "react";
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

const POST_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof MessageCircle }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessagesSquare },
  question: { label: "Question", color: "bg-purple-100 text-purple-700", icon: HelpCircle },
  idea: { label: "Idea", color: "bg-amber-100 text-amber-700", icon: Lightbulb },
  poll: { label: "Poll", color: "bg-green-100 text-green-700", icon: BarChart3 },
};

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

export default function CategoryPostsPage() {
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
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {category?.icon && (
              <span className="text-2xl">{category.icon}</span>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {category?.name || "Category"}
              </h1>
              {category?.description && (
                <p className="text-gray-500 text-sm mt-0.5">{category.description}</p>
              )}
            </div>
          </div>
        </div>
        <Link
          to={`/forum/new?category=${id}`}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Post
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={postType}
            onChange={(e) => { setPostType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Types</option>
            <option value="discussion">Discussions</option>
            <option value="question">Questions</option>
            <option value="idea">Ideas</option>
            <option value="poll">Polls</option>
          </select>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: "recent", label: "Recent" },
            { key: "popular", label: "Popular" },
            { key: "trending", label: "Active" },
            { key: "views", label: "Most Viewed" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => { setSortBy(s.key); setPage(1); }}
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

      {/* Posts */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading posts...
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No posts in this category yet. Start the conversation!
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
                      {Boolean(post.is_pinned) && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <Pin className="h-3 w-3" /> Pinned
                        </span>
                      )}
                      {Boolean(post.is_locked) && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{post.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                      {post.content?.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>{post.author_first_name} {post.author_last_name}</span>
                      <span>{timeAgo(post.created_at)}</span>
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
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
