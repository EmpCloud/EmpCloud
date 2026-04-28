import { useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useCreatePost } from "../api";
import { AuthorChip } from "./AuthorChip";
import { Send, Loader2 } from "lucide-react";

type Props = {
  placeholder?: string;
  autofocus?: boolean;
  onPosted?: () => void;
};

// Inline composer — used at the top of the dashboard widget and the /feed
// page. Phase 1 is text-only; the `media` plumbing is already in the API,
// so adding an image picker in phase 2 is additive and won't touch this
// signature.
export function PostComposer({ placeholder, autofocus, onPosted }: Props) {
  const user = useAuthStore((s) => s.user);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createPost = useCreatePost();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setError(null);
    try {
      await createPost.mutateAsync({ content: content.trim() });
      setContent("");
      onPosted?.();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Failed to post");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <AuthorChip
          userId={user?.id}
          firstName={user?.first_name ?? ""}
          lastName={user?.last_name ?? ""}
          compact
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder || "Share something with the team..."}
        autoFocus={autofocus}
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
      />
      {error && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {content.length > 0 ? `${content.length} characters` : ""}
        </span>
        <button
          type="submit"
          disabled={!content.trim() || createPost.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createPost.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Posting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Post
            </>
          )}
        </button>
      </div>
    </form>
  );
}
