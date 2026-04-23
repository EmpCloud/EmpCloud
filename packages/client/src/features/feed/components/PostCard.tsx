import { useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useDeletePost, useEditPost, useTogglePostLike } from "../api";
import type { FeedPost } from "../types";
import { AuthorChip, formatTimestamp } from "./AuthorChip";
import { CommentSection } from "./CommentSection";
import { MediaGrid } from "./MediaGrid";
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

type Props = {
  post: FeedPost;
  // When true we only render the first 2 preview replies and don't expand
  // to the full thread. Used in the dashboard widget to keep the card short.
  compactComments?: boolean;
};

export function PostCard({ post, compactComments }: Props) {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.id === post.author_id;
  const isHR = !!user && HR_ROLES.includes(user.role);
  const canManage = isOwner || isHR;

  const toggleLike = useTogglePostLike();
  const deletePost = useDeletePost();
  const editPost = useEditPost();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [editError, setEditError] = useState<string | null>(null);
  // Comments are collapsed by default; the footer Comments button toggles
  // them so the feed stays scannable until the reader opts in.
  const [showComments, setShowComments] = useState(false);

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    try {
      await editPost.mutateAsync({ id: post.id, content: draft.trim() });
      setEditing(false);
    } catch (err: any) {
      setEditError(err?.response?.data?.error?.message || "Failed to save");
    }
  };

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5">
      <header className="flex items-start justify-between gap-2">
        <AuthorChip
          firstName={post.author_first_name}
          lastName={post.author_last_name}
          photoUrl={post.author_photo}
          title={post.author_title}
          timestamp={formatTimestamp(post.created_at)}
          edited={!!post.edited_at}
        />
        {canManage && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              aria-label="Post actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setDraft(post.content); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="mt-3">
        {editing ? (
          <form onSubmit={submitEdit} className="space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {editError && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{editError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(post.content); setEditError(null); }}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.trim() || editPost.isPending}
                className="rounded bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {editPost.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          // #1554 — clicking the post body toggles the comments section,
          // matching reader expectation that "tap the post to see replies".
          // The composer / edit form / footer buttons remain non-interactive
          // here because they're outside this <p>.
          <p
            role="button"
            tabIndex={0}
            onClick={() => setShowComments((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowComments((v) => !v);
              }
            }}
            className="whitespace-pre-wrap break-words text-sm text-gray-800 leading-relaxed cursor-pointer hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
          >
            {post.content}
          </p>
        )}
        {post.media && post.media.length > 0 && <MediaGrid media={post.media} />}
      </div>

      <footer className="mt-4 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => toggleLike.mutate(post.id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            post.my_liked
              ? "text-red-600 bg-red-50 hover:bg-red-100"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Heart className={`h-4 w-4 ${post.my_liked ? "fill-red-600" : ""}`} />
          {post.like_count > 0 && <span>{post.like_count}</span>}
          <span className="sr-only">Like</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            showComments
              ? "text-brand-700 bg-brand-50 hover:bg-brand-100"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          {post.reply_count > 0 && <span>{post.reply_count}</span>}
          <span className="text-xs">{showComments ? "Hide" : "Comments"}</span>
        </button>
      </footer>

      {showComments && (
        <CommentSection
          postId={post.id}
          previewReplies={post.preview_replies}
          previewOnly={compactComments}
          commentsDisabled={post.comments_disabled}
          totalCount={post.reply_count}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deletePost.isPending && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete post?</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    This removes the post and all its comments from the feed. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deletePost.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deletePost.mutate(post.id, { onSuccess: () => setConfirmDelete(false) })}
                disabled={deletePost.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletePost.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
