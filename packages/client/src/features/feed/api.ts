// -----------------------------------------------------------------------------
// Feed — react-query hooks
//
// Single source of truth for every feed-related network call. All mutations
// invalidate (or optimistically patch) the shared ["feed"] key so the
// dashboard widget, the /feed page and any embedded <PostCard /> stay in
// sync without ad-hoc refetch logic scattered across components.
// -----------------------------------------------------------------------------

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import api from "@/api/client";
import type { FeedPage, FeedPost, FeedReply } from "./types";
import type { MediaAttachment } from "@empcloud/shared";

export const FEED_QUERY_KEY = ["feed"] as const;

type FeedFilters = {
  search?: string;
  author_id?: number;
};

export function useFeed(filters: FeedFilters = {}) {
  return useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage>, readonly unknown[], number | undefined>({
    queryKey: [...FEED_QUERY_KEY, filters],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get("/forum/feed", {
        params: {
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 20,
          ...(filters.search ? { search: filters.search } : {}),
          ...(filters.author_id ? { author_id: filters.author_id } : {}),
        },
      });
      return data.data as FeedPage;
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

// -------------------------------------------------- create post

type CreatePostInput = {
  content: string;
  title?: string;
  media?: MediaAttachment[];
};

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      // Resolve the default "General" category for this org. The server
      // creates one on demand so this is safe even on a fresh tenant.
      const { data: cat } = await api.get("/forum/feed/default-category");
      const { data } = await api.post("/forum/posts", {
        category_id: cat.data.category_id,
        // Title falls back to the first line of the body so the forum's
        // NOT NULL title constraint is satisfied without a separate field.
        title:
          input.title ||
          input.content.split("\n")[0].slice(0, 120) ||
          "Post",
        content: input.content,
        post_type: "discussion",
        ...(input.media && input.media.length > 0 ? { media: input.media } : {}),
      });
      return data.data as FeedPost;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });
}

// -------------------------------------------------- edit / delete post

export function useEditPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; title?: string; content?: string; media?: MediaAttachment[] | null }) => {
      const { data } = await api.put(`/forum/posts/${input.id}`, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.media !== undefined ? { media: input.media } : {}),
      });
      return data.data as FeedPost;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/forum/posts/${id}`);
      return id;
    },
    // Optimistic removal — yank the post from every cached feed page
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: FEED_QUERY_KEY });
      const snapshots = qc.getQueriesData<InfiniteData<FeedPage>>({ queryKey: FEED_QUERY_KEY });
      for (const [key, value] of snapshots) {
        if (!value) continue;
        qc.setQueryData<InfiniteData<FeedPage>>(key, {
          ...value,
          pages: value.pages.map((p) => ({
            ...p,
            items: p.items.filter((post) => post.id !== id),
          })),
        });
      }
      return { snapshots };
    },
    onError: (_e, _id, ctx) => {
      for (const [key, value] of ctx?.snapshots ?? []) {
        qc.setQueryData(key, value);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: FEED_QUERY_KEY }),
  });
}

// -------------------------------------------------- likes

// Toggle like with optimistic update on every cached feed page.
export function useTogglePostLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: number) => {
      const { data } = await api.post("/forum/like", { target_type: "post", target_id: postId });
      return data.data as { liked: boolean };
    },
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: FEED_QUERY_KEY });
      const snapshots = qc.getQueriesData<InfiniteData<FeedPage>>({ queryKey: FEED_QUERY_KEY });
      for (const [key, value] of snapshots) {
        if (!value) continue;
        qc.setQueryData<InfiniteData<FeedPage>>(key, {
          ...value,
          pages: value.pages.map((p) => ({
            ...p,
            items: p.items.map((post) =>
              post.id === postId
                ? {
                    ...post,
                    my_liked: !post.my_liked,
                    like_count: post.like_count + (post.my_liked ? -1 : 1),
                  }
                : post
            ),
          })),
        });
      }
      return { snapshots };
    },
    onError: (_e, _id, ctx) => {
      for (const [key, value] of ctx?.snapshots ?? []) {
        qc.setQueryData(key, value);
      }
    },
    // No onSettled refetch — server is authoritative only on failure
  });
}

// -------------------------------------------------- comments

// Fetch full (non-preview) comments for a single post
export function usePostDetail(postId: number | null) {
  return useQuery({
    queryKey: ["feed-post", postId],
    queryFn: async () => {
      const { data } = await api.get(`/forum/posts/${postId}`);
      return data.data as FeedPost & { replies: FeedReply[] };
    },
    enabled: !!postId,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: number; content: string }) => {
      const { data } = await api.post(`/forum/posts/${input.postId}/reply`, {
        content: input.content,
      });
      return data.data as FeedReply;
    },
    onSuccess: (_reply, vars) => {
      qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["feed-post", vars.postId] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { commentId: number; postId: number }) => {
      await api.delete(`/forum/replies/${input.commentId}`);
      return input;
    },
    onSuccess: (vars) => {
      qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["feed-post", vars.postId] });
    },
  });
}

export function useEditComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { commentId: number; postId: number; content: string }) => {
      const { data } = await api.put(`/forum/replies/${input.commentId}`, {
        content: input.content,
      });
      return data.data as FeedReply;
    },
    onSuccess: (_reply, vars) => {
      qc.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["feed-post", vars.postId] });
    },
  });
}
