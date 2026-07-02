import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Eye,
  Pin,
  Lock,
  Trash2,
  CheckCircle2,
  Send,
  CornerDownRight,
  HelpCircle,
  Lightbulb,
  MessagesSquare,
  BarChart3,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

const POST_TYPE_CONFIG: Record<string, { labelKey: string; color: string; icon: typeof MessageCircle }> = {
  discussion: { labelKey: "postType.discussion", color: "bg-blue-100 text-blue-700", icon: MessagesSquare },
  question: { labelKey: "postType.question", color: "bg-purple-100 text-purple-700", icon: HelpCircle },
  idea: { labelKey: "postType.idea", color: "bg-amber-100 text-amber-700", icon: Lightbulb },
  poll: { labelKey: "postType.poll", color: "bg-green-100 text-green-700", icon: BarChart3 },
};

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return t("postDetail.time.justNow");
  if (diff < 3600) return t("postDetail.time.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("postDetail.time.hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("postDetail.time.daysAgo", { count: Math.floor(diff / 86400) });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PostDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const qc = useQueryClient();

  const [replyContent, setReplyContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyingToName, setReplyingToName] = useState("");
  // Confirm-delete dialog state (replaces window.confirm). One holds the
  // reply id awaiting deletion; the other gates the whole-post delete.
  const [deleteReplyId, setDeleteReplyId] = useState<number | null>(null);
  const [showDeletePost, setShowDeletePost] = useState(false);

  const { data: postData, isLoading } = useQuery({
    queryKey: ["forum-post", id],
    queryFn: () => api.get(`/forum/posts/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const post = postData;
  const replies = post?.replies || [];

  // Build nested reply tree
  const topLevelReplies = replies.filter((r: any) => !r.parent_reply_id);
  const childReplies = replies.filter((r: any) => r.parent_reply_id);

  function getChildren(parentId: number) {
    return childReplies.filter((r: any) => r.parent_reply_id === parentId);
  }

  const toggleLike = useMutation({
    mutationFn: (data: { target_type: string; target_id: number }) =>
      api.post("/forum/like", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-post", id] }),
  });

  const submitReply = useMutation({
    mutationFn: (data: { content: string; parent_reply_id?: number | null }) =>
      api.post(`/forum/posts/${id}/reply`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-post", id] });
      setReplyContent("");
      setReplyingTo(null);
      setReplyingToName("");
    },
  });

  const deletePost = useMutation({
    mutationFn: () => api.delete(`/forum/posts/${id}`),
    onSuccess: () => navigate("/forum"),
  });

  const deleteReply = useMutation({
    mutationFn: (replyId: number) => api.delete(`/forum/replies/${replyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-post", id] });
      setDeleteReplyId(null);
    },
  });

  const pinPost = useMutation({
    mutationFn: () => api.post(`/forum/posts/${id}/pin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-post", id] }),
  });

  const lockPost = useMutation({
    mutationFn: () => api.post(`/forum/posts/${id}/lock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-post", id] }),
  });

  const acceptReply = useMutation({
    mutationFn: (replyId: number) => api.post(`/forum/replies/${replyId}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-post", id] }),
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    submitReply.mutate({
      content: replyContent,
      parent_reply_id: replyingTo,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">{t("postDetail.loading")}</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">{t("postDetail.notFound")}</div>
      </div>
    );
  }

  const typeConfig = POST_TYPE_CONFIG[post.post_type] || POST_TYPE_CONFIG.discussion;
  const TypeIcon = typeConfig.icon;
  const isAuthor = user?.id === post.author_id;
  const canDelete = isAuthor || isHR;
  const canAcceptAnswers = post.post_type === "question" && isAuthor;

  function ReplyCard({ reply, depth = 0 }: { reply: any; depth?: number }) {
    const { t } = useTranslation();
    const children = getChildren(reply.id);
    const canDeleteReply = user?.id === reply.author_id || isHR;

    return (
      <div className={`${depth > 0 ? "ml-8 border-l-2 border-gray-100 pl-4" : ""}`}>
        <div className={`py-4 ${depth === 0 ? "border-t border-gray-100" : ""}`}>
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-gray-600">
                {reply.author_first_name?.[0]}
                {reply.author_last_name?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {reply.author_first_name} {reply.author_last_name}
                </span>
                <span className="text-xs text-gray-400">{timeAgo(reply.created_at, t)}</span>
                {Boolean(reply.is_accepted) && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> {t("postDetail.reply.acceptedAnswer")}
                  </span>
                )}
              </div>

              <div className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                {reply.content}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    toggleLike.mutate({ target_type: "reply", target_id: reply.id })
                  }
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    reply.user_liked
                      ? "text-red-500 hover:text-red-600"
                      : "text-gray-400 hover:text-red-500"
                  }`}
                >
                  <Heart className={`h-3.5 w-3.5 ${reply.user_liked ? "fill-current" : ""}`} />
                  {reply.like_count > 0 && reply.like_count}
                </button>

                {!post.is_locked && (
                  <button
                    onClick={() => {
                      setReplyingTo(reply.id);
                      setReplyingToName(`${reply.author_first_name} ${reply.author_last_name}`);
                    }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors"
                  >
                    <CornerDownRight className="h-3.5 w-3.5" /> {t("postDetail.reply.replyAction")}
                  </button>
                )}

                {canAcceptAnswers && !reply.is_accepted && (
                  <button
                    onClick={() => acceptReply.mutate(reply.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("postDetail.reply.acceptAnswer")}
                  </button>
                )}

                {canDeleteReply && (
                  <button
                    onClick={() => setDeleteReplyId(reply.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Nested replies */}
        {children.map((child: any) => (
          <ReplyCard key={child.id} reply={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link
          to={`/forum/category/${post.category_id}`}
          className="text-sm text-brand-600 hover:text-brand-700"
        >
          {post.category_name}
        </Link>
      </div>

      {/* Post */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
            <span className="text-base font-semibold text-brand-700">
              {post.author_first_name?.[0]}
              {post.author_last_name?.[0]}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                <TypeIcon className="h-3 w-3" />
                {t(`postDetail.${typeConfig.labelKey}`)}
              </span>
              {Boolean(post.is_pinned) && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <Pin className="h-3 w-3" /> {t("postDetail.badge.pinned")}
                </span>
              )}
              {Boolean(post.is_locked) && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Lock className="h-3 w-3" /> {t("postDetail.badge.locked")}
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-gray-900 mb-1">{post.title}</h1>

            <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
              <span className="font-medium text-gray-600">
                {post.author_first_name} {post.author_last_name}
              </span>
              <span>{timeAgo(post.created_at, t)}</span>
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {post.view_count}</span>
            </div>

            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-4">
              {post.content}
            </div>

            {/* Tags */}
            {post.tags && (() => {
              try {
                const parsed = typeof post.tags === "string" ? JSON.parse(post.tags) : post.tags;
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <div className="flex items-center gap-2 mb-4">
                      {parsed.map((tag: string) => (
                        <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  );
                }
                return null;
              } catch { return null; }
            })()}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => toggleLike.mutate({ target_type: "post", target_id: post.id })}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  post.user_liked
                    ? "text-red-500 hover:text-red-600"
                    : "text-gray-500 hover:text-red-500"
                }`}
              >
                <Heart className={`h-4 w-4 ${post.user_liked ? "fill-current" : ""}`} />
                {post.like_count > 0 ? post.like_count : t("postDetail.action.like")}
              </button>

              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <MessageCircle className="h-4 w-4" />
                {t("postDetail.replyCount", { count: post.reply_count })}
              </span>

              {/* HR actions */}
              {isHR && (
                <>
                  <button
                    onClick={() => pinPost.mutate()}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition-colors ml-auto"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    {post.is_pinned ? t("postDetail.action.unpin") : t("postDetail.action.pin")}
                  </button>
                  <button
                    onClick={() => lockPost.mutate()}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {post.is_locked ? t("postDetail.action.unlock") : t("postDetail.action.lock")}
                  </button>
                </>
              )}

              {canDelete && (
                <button
                  onClick={() => setShowDeletePost(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("postDetail.action.delete")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {t("postDetail.replies.heading", { count: replies.length })}
        </h2>

        {topLevelReplies.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t("postDetail.replies.empty")}</p>
        ) : (
          topLevelReplies.map((reply: any) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))
        )}

        {/* Reply form */}
        {!post.is_locked ? (
          <form onSubmit={handleReply} className="mt-6 pt-4 border-t border-gray-100">
            {replyingTo && (
              <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                <CornerDownRight className="h-3 w-3" />
                {t("postDetail.form.replyingTo", { name: replyingToName })}
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyingToName("");
                  }}
                  className="text-brand-600 hover:text-brand-700"
                >
                  {t("postDetail.form.cancel")}
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-brand-700">
                  {user?.first_name?.[0]}
                  {user?.last_name?.[0]}
                </span>
              </div>
              <div className="flex-1">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={t("postDetail.form.placeholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[80px] focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                  required
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="submit"
                    disabled={submitReply.isPending || !replyContent.trim()}
                    className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submitReply.isPending ? t("postDetail.form.posting") : t("postDetail.form.submit")}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="mt-6 pt-4 border-t border-gray-100 text-center text-sm text-gray-400">
            <Lock className="h-4 w-4 inline mr-1" />
            {t("postDetail.locked.message")}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteReplyId !== null}
        title={t("postDetail.deleteReply.title")}
        confirmText={t("postDetail.deleteReply.confirm")}
        variant="danger"
        loading={deleteReply.isPending}
        onConfirm={() => deleteReplyId !== null && deleteReply.mutate(deleteReplyId)}
        onCancel={() => setDeleteReplyId(null)}
      />

      <ConfirmDialog
        open={showDeletePost}
        title={t("postDetail.deletePost.title")}
        description={t("postDetail.deletePost.description")}
        confirmText={t("postDetail.deletePost.confirm")}
        variant="danger"
        loading={deletePost.isPending}
        onConfirm={() => deletePost.mutate()}
        onCancel={() => setShowDeletePost(false)}
      />
    </div>
  );
}
