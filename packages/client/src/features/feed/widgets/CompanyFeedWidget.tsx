import { Link } from "react-router-dom";
import { MessageSquare, ArrowRight } from "lucide-react";
import { useFeed } from "../api";
import { PostComposer } from "../components/PostComposer";
import { PostCard } from "../components/PostCard";

// Dashboard feed card — shows a short PREVIEW of the most recent posts
// (first page, capped at PREVIEW_LIMIT) with a "Open full feed" link to
// the dedicated /feed page. The widget deliberately does NOT paginate —
// infinite scroll belongs on the full feed page so the dashboard stays a
// glanceable summary instead of growing into an endless scroll.
const PREVIEW_LIMIT = 3;

export function CompanyFeedWidget() {
  const { data, isLoading } = useFeed();
  // Only use the first fetched page and cap the visible posts so that
  // cached pages from /feed don't bloat the dashboard widget.
  const firstPagePosts = data?.pages[0]?.items ?? [];
  const posts = firstPagePosts.slice(0, PREVIEW_LIMIT);
  const totalInFirstPage = firstPagePosts.length;
  const hasMore = totalInFirstPage > PREVIEW_LIMIT || (data?.pages[0]?.next_cursor ?? null) !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Company Feed</h2>
        </div>
        <Link
          to="/feed"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Open full feed <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <PostComposer placeholder="Share something with the team..." />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Loading feed...
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          Nothing here yet — be the first to post.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} compactComments />
          ))}
        </div>
      )}

      {hasMore && posts.length > 0 && (
        <Link
          to="/feed"
          className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
        >
          View more posts in the full feed <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
