import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageSquareText } from "lucide-react";
import { useFeed } from "../api";
import { PostComposer } from "../components/PostComposer";
import { PostCard } from "../components/PostCard";

const PREVIEW_LIMIT = 3;
const filters = ["all", "announcements", "team", "recognition"] as const;
type FeedFilter = (typeof filters)[number];

const labels: Record<FeedFilter, string> = {
  all: "All Posts",
  announcements: "Announcements",
  team: "Team",
  recognition: "Recognition",
};

export function CompanyFeedWidget() {
  const { data, isLoading } = useFeed();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const firstPagePosts = data?.pages[0]?.items ?? [];
  const filteredPosts = firstPagePosts.filter((post) => {
    if (filter === "all") return true;
    const searchable = [post.content, (post as any).category_name, ...((post as any).tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(filter.replace(/s$/, ""));
  });
  const posts = filteredPosts.slice(0, PREVIEW_LIMIT);
  const hasMore = firstPagePosts.length > PREVIEW_LIMIT || (data?.pages[0]?.next_cursor ?? null) !== null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquareText aria-hidden="true" className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <h2 className="text-base font-semibold text-foreground">Company Feed</h2>
        </div>
        <div aria-label="Filter company feed" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                filter === item ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              {labels[item]}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3 p-3.5">
        <PostComposer compact placeholder="Share something with the team..." />

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Loading feed...
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {filter === "all" ? "Nothing here yet — be the first to post." : `No ${labels[filter].toLowerCase()} posts yet.`}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} compactComments dashboardCompact />
            ))}
          </div>
        )}

        {(hasMore || posts.length > 0) && (
          <Link
            to="/feed"
            className="flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-brand-950/40"
          >
            Open full feed <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        )}
      </div>
    </section>
  );
}
