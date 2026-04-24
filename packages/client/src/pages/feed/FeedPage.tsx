import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Loader2,
  MessagesSquare,
  MessageCircle,
  TrendingUp,
  Users,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { FEED_QUERY_KEY, useFeed } from "@/features/feed/api";
import { PostComposer } from "@/features/feed/components/PostComposer";
import { PostCard } from "@/features/feed/components/PostCard";
import { CategoriesPanel } from "@/features/feed/components/CategoriesPanel";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

type FeedFilter = "all" | "mine";

// Full feed — one column for employees, three (feed + stats sidebar) for HR.
// Composer at the top so users land on /feed → post → read without a modal.
export default function FeedPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = !!user && HR_ROLES.includes(user.role);
  // Back button always returns to the role-appropriate home. Previously we
  // used navigate(-1) which could land on unrelated pages (or nothing at all
  // when the user typed the URL or used a bookmark / sidebar link).
  const homePath = isHR ? "/" : "/self-service";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const author_id = filter === "mine" && user ? Number(user.id) : undefined;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } = useFeed({
    search,
    author_id,
  });

  const { data: stats } = useQuery({
    queryKey: ["forum-dashboard"],
    queryFn: () => api.get("/forum/dashboard").then((r) => r.data.data),
    enabled: isHR,
  });

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
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const posts = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const refresh = () => qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });

  return (
    <div className={isHR ? "" : "mx-auto max-w-2xl"}>
      {/* ───────────────────── Hero header ───────────────────── */}
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-50 via-white to-purple-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(homePath)}
              aria-label="Back to dashboard"
              title="Back to dashboard"
              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-gray-600 backdrop-blur hover:bg-white hover:text-gray-900 transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">Company Feed</h1>
                {isHR && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                    <Sparkles className="h-3 w-3" /> Admin
                  </span>
                )}
              </div>
              <p className="text-gray-600 mt-1 text-sm">
                {isHR
                  ? "Browse, post and moderate the company-wide conversation."
                  : "Share updates, ask questions, celebrate wins."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh feed"
              disabled={isFetching}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-gray-600 backdrop-blur hover:bg-white hover:text-brand-700 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ───────────────────── Body layout ─────────────────────
          On lg+ the HR sidebar is positioned absolutely on the right so
          it doesn't contribute to page flow. This keeps the scrollable
          page height equal to the main column's content height — a grid
          layout would force the row (and the page) to grow to the taller
          of the two columns, producing a big blank canvas below the last
          post when the feed has few items. */}
      <div className={isHR ? "relative" : ""}>
        {/* Main column — reserve 1/3 + gap on the right for the sidebar */}
        <div className={isHR ? "space-y-4 lg:pr-[calc(33.333%+1.5rem)]" : "space-y-4"}>
          {/* Search + filter chips */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
            <form
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim() || undefined); }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search posts by keyword..."
                className="w-full rounded-full border border-gray-200 bg-gray-50 pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white focus:border-transparent transition-all"
              />
              {(searchInput || search) && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(""); setSearch(undefined); }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            <div className="flex items-center gap-2">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                All posts
              </FilterChip>
              <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>
                My posts
              </FilterChip>
              {(search || filter !== "all") && (
                <span className="ml-auto text-xs text-gray-400">
                  {posts.length} result{posts.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          {/* Composer */}
          <PostComposer placeholder="What's on your mind?" />

          {/* Posts */}
          {isLoading ? (
            <FeedSkeleton />
          ) : posts.length === 0 ? (
            <EmptyState search={search} filter={filter} />
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          <div ref={sentinelRef} />

          {isFetchingNextPage && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading more...
            </div>
          )}
        </div>

        {/* HR sidebar.
            - Mobile / tablet: stacks below main (normal flow, mt-6).
            - lg+: absolutely positioned on the right so it does NOT
              lengthen the page; internal wrapper uses sticky so it
              follows scroll, and max-h + overflow cap it to the
              viewport when the sidebar content is tall. */}
        {isHR && (
          <aside className="mt-6 space-y-4 lg:mt-0 lg:absolute lg:right-0 lg:top-0 lg:w-1/3">
            <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            {/* KPI grid */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<MessagesSquare className="h-4 w-4" />}
                  label="Total posts"
                  value={stats.total_posts ?? 0}
                  tone="blue"
                />
                <StatCard
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Comments"
                  value={stats.total_replies ?? 0}
                  tone="green"
                />
                <StatCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Active 7d"
                  value={stats.active_discussions ?? 0}
                  tone="amber"
                />
                <StatCard
                  icon={<Users className="h-4 w-4" />}
                  label="Contributors"
                  value={Array.isArray(stats.top_contributors) ? stats.top_contributors.length : 0}
                  tone="purple"
                />
              </div>
            )}

            {/* Categories — full CRUD lives here now (replaces the old
                standalone Forum Dashboard page). */}
            <CategoriesPanel />

            {/* Top contributors */}
            {stats?.top_contributors && stats.top_contributors.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-brand-600" />
                    Top contributors
                  </h3>
                  <span className="text-[11px] text-gray-400">last 30d</span>
                </div>
                <ul className="space-y-2">
                  {stats.top_contributors.slice(0, 5).map((u: any, i: number) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 rounded-lg p-1.5 -m-1.5 hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                        {i + 1}
                      </span>
                      <div className="h-8 w-8 flex-shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center overflow-hidden">
                        {u.photo_path ? (
                          <img src={u.photo_path} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold">
                            {(u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.first_name} {u.last_name}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-brand-600">
                        {u.contribution_count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Trending posts */}
            {stats?.trending_posts && stats.trending_posts.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                  Trending this week
                </h3>
                <ul className="space-y-2.5">
                  {stats.trending_posts.slice(0, 4).map((p: any) => (
                    <li key={p.id} className="text-sm">
                      <p className="font-medium text-gray-800 line-clamp-2">{p.title}</p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-400">
                        <span>{p.author_first_name} {p.author_last_name}</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> {p.reply_count}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "blue" | "green" | "amber" | "purple";
}) {
  const toneClasses: Record<string, { bg: string; text: string; ring: string }> = {
    blue:   { bg: "bg-blue-50",   text: "text-blue-700",   ring: "group-hover:ring-blue-200" },
    green:  { bg: "bg-green-50",  text: "text-green-700",  ring: "group-hover:ring-green-200" },
    amber:  { bg: "bg-amber-50",  text: "text-amber-700",  ring: "group-hover:ring-amber-200" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "group-hover:ring-purple-200" },
  };
  const t = toneClasses[tone];
  return (
    <div className={`group rounded-xl border border-gray-200 bg-white p-3 transition-all hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-transparent ${t.ring}`}>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t.bg} ${t.text}`}>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-32 bg-gray-200 rounded" />
              <div className="h-2.5 w-20 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-5/6 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search, filter }: { search?: string; filter: FeedFilter }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
        <MessagesSquare className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-gray-700">
        {search
          ? "No posts match that search."
          : filter === "mine"
            ? "You haven't posted yet."
            : "Nothing here yet — be the first to post."}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {search ? "Try a different keyword." : "Use the box above to share something."}
      </p>
    </div>
  );
}
