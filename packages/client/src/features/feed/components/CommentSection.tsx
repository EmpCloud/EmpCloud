import { useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  useAddComment,
  useDeleteComment,
  useEditComment,
  usePostDetail,
} from "../api";
import type { FeedReply } from "../types";
import { formatTimestamp } from "./AuthorChip";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Loader2, MoreHorizontal, Pencil, Trash2, Send, MessageSquare } from "lucide-react";

type Props = {
  postId: number;
  previewReplies: FeedReply[];
  previewOnly?: boolean;      // widget shows only preview
  commentsDisabled?: boolean; // HR has moderated this post
  totalCount: number;
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

// Two modes:
//   previewOnly: render up to 2 existing replies + an "Add comment" box
//                when the full replies list isn't loaded yet (widget view).
//   full:        fetch and render the complete thread — used by /feed and
//                the future in-dashboard "expand" interaction.
export function CommentSection({
  postId,
  previewReplies,
  previewOnly,
  commentsDisabled,
  totalCount,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const isHR = !!user && HR_ROLES.includes(user.role);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const detail = usePostDetail(expanded && !previewOnly ? postId : null);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();

  const replies: FeedReply[] =
    !previewOnly && detail.data?.replies
      ? detail.data.replies
      : previewReplies;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setError(null);
    try {
      await addComment.mutateAsync({ postId, content: draft.trim() });
      setDraft("");
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Failed to comment");
    }
  };

  const hidden = totalCount - replies.length;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {/* Empty + comments-disabled state */}
      {commentsDisabled && replies.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 italic">
          <MessageSquare className="h-3.5 w-3.5" />
          Comments are disabled on this post.
        </div>
      ) : (
        <div className="space-y-3">
          {/* "View more" toggle */}
          {!previewOnly && hidden > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View {hidden} more {hidden === 1 ? "comment" : "comments"}
            </button>
          )}

          {!previewOnly && expanded && detail.isLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading comments...
            </div>
          )}

          {/* Comment list */}
          {replies.map((reply) => (
            <CommentRow
              key={reply.id}
              reply={reply}
              canManage={user?.id === reply.author_id || isHR}
              postId={postId}
              onDelete={() => deleteComment.mutate({ commentId: reply.id, postId })}
            />
          ))}
        </div>
      )}

      {/* Composer */}
      {!commentsDisabled && (
        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <Avatar userId={user?.id} firstName={user?.first_name} lastName={user?.last_name} />
          <div className="flex-1 relative">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment..."
              className="w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2 pr-11 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={!draft.trim() || addComment.isPending}
              aria-label="Send comment"
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {addComment.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </form>
      )}
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single comment row — avatar + bubble + action row
// ---------------------------------------------------------------------------

function CommentRow({
  reply,
  canManage,
  postId,
  onDelete,
}: {
  reply: FeedReply;
  canManage: boolean;
  postId: number;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const [menuOpen, setMenuOpen] = useState(false);
  const editComment = useEditComment();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await editComment.mutateAsync({ commentId: reply.id, postId, content: draft.trim() });
    setEditing(false);
  };

  const fullName = `${reply.author_first_name} ${reply.author_last_name}`.trim();

  return (
    <div className="flex items-start gap-2.5 group">
      <Avatar
        userId={reply.author_id}
        hasPhoto={!!reply.author_photo}
        firstName={reply.author_first_name}
        lastName={reply.author_last_name}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <form onSubmit={save} className="space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex items-center gap-2 text-xs">
              <button
                type="submit"
                disabled={!draft.trim() || editComment.isPending}
                className="rounded-full bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {editComment.isPending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(reply.content); }}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="relative inline-block max-w-full">
              {/* Bubble */}
              <div className="rounded-2xl bg-gray-100 px-3 py-2 pr-8">
                <p className="text-xs font-semibold text-gray-900">{fullName}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800 leading-snug">
                  {reply.content}
                </p>
              </div>

              {/* Inline 3-dot menu — visible on hover/focus, anchored inside the bubble */}
              {canManage && (
                <div className="absolute top-1.5 right-1.5">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Comment actions"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  {menuOpen && (
                    <div
                      className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                      onMouseLeave={() => setMenuOpen(false)}
                    >
                      <button
                        type="button"
                        onClick={() => { setEditing(true); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { onDelete(); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quiet meta row under the bubble */}
            <div className="mt-1 ml-3 flex items-center gap-2 text-[11px] text-gray-400">
              <span>{formatTimestamp(reply.created_at)}</span>
              {reply.edited_at && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="italic">edited</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact circular avatar — used in the comment row + composer. Falls back
// to coloured initials when no photo is available.
// ---------------------------------------------------------------------------

// #1650 — Local Avatar wraps EmployeeAvatar so all comment avatars share the
// same blob-based photo loader used elsewhere.
function Avatar({
  userId,
  hasPhoto,
  firstName,
  lastName,
}: {
  userId?: number | null;
  hasPhoto?: boolean;
  firstName?: string;
  lastName?: string;
}) {
  return (
    <EmployeeAvatar
      userId={userId}
      hasPhoto={hasPhoto}
      firstName={firstName}
      lastName={lastName}
      size="sm"
    />
  );
}
