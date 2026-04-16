// -----------------------------------------------------------------------------
// Feed — shared types
//
// Mirrors the backend shape of a "feed post" (a forum_post row + author chip
// + preview replies + viewer's like state). Kept separate from the wire Zod
// schemas in @empcloud/shared so the client can also use these for local
// (optimistic) state without needing a runtime validator.
// -----------------------------------------------------------------------------

import type { MediaAttachment } from "@empcloud/shared";

export type FeedAuthor = {
  id: number;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  title: string | null;
};

export type FeedReply = {
  id: number;
  post_id: number;
  author_id: number;
  author_first_name: string;
  author_last_name: string;
  author_photo: string | null;
  content: string;
  parent_reply_id: number | null;
  like_count: number;
  is_accepted: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedPost = {
  id: number;
  organization_id: number;
  category_id: number;
  category_name: string | null;
  category_icon: string | null;
  author_id: number;
  author_first_name: string;
  author_last_name: string;
  author_photo: string | null;
  author_title: string | null;
  title: string;
  content: string;
  post_type: "discussion" | "question" | "idea" | "poll";
  is_pinned: boolean;
  is_locked: boolean;
  comments_disabled: boolean;
  is_flagged: boolean;
  view_count: number;
  like_count: number;
  reply_count: number;
  tags: string[] | null;
  media: MediaAttachment[] | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  // Enrichments returned by GET /forum/feed
  my_liked: boolean;
  preview_replies: FeedReply[];
};

export type FeedPage = {
  items: FeedPost[];
  next_cursor: number | null;
};
