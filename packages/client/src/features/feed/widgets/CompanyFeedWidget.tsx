import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { useFeed } from "../api";
import { PostComposer } from "../components/PostComposer";
import { PostCard } from "../components/PostCard";

// Dashboard feed card. Composer on top, every post that has been fetched, a
// "View all" link out to /feed. Mirrors the FeedPage behaviour so the
// dashboard is a self-contained feed reader: posts paginate in via infinite
// scroll as the user reads down.
export function CompanyFeedWidget() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed();
  const posts = data?.pages.flatMap((p) => p.items) ?? [];

  // IntersectionObserver-driven "load more" so paging is invisible.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

      <div ref={sentinelRef} />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading more...
        </div>
      )}
    </div>
  );
}
