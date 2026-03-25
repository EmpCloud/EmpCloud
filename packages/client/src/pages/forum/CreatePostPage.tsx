import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/api/client";
import { ArrowLeft, Send } from "lucide-react";

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCategory = searchParams.get("category") || "";

  const [categoryId, setCategoryId] = useState(preselectedCategory);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState("discussion");
  const [tagsInput, setTagsInput] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: () => api.get("/forum/categories").then((r) => r.data.data),
  });

  const createPost = useMutation({
    mutationFn: (data: object) => api.post("/forum/posts", data).then((r) => r.data.data),
    onSuccess: (post) => {
      navigate(`/forum/post/${post.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    createPost.mutate({
      category_id: Number(categoryId),
      title,
      content,
      post_type: postType,
      tags: tags.length > 0 ? tags : null,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Post</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            >
              <option value="">Select category...</option>
              {(categories || []).length === 0 && (
                <option value="" disabled>No categories — create them in Forum Dashboard</option>
              )}
              {(categories || []).map((cat: any) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Post Type
            </label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="discussion">Discussion</option>
              <option value="question">Question</option>
              <option value="idea">Idea</option>
              <option value="poll">Poll</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="What's on your mind?"
            maxLength={255}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Content <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[200px] resize-y"
            placeholder={
              postType === "question"
                ? "Describe your question in detail..."
                : postType === "idea"
                ? "Share your idea and explain its potential impact..."
                : "Share your thoughts..."
            }
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags <span className="text-xs text-gray-400">(comma-separated, optional)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. engineering, culture, process"
          />
          {tagsInput && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tagsInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs"
                  >
                    #{tag}
                  </span>
                ))}
            </div>
          )}
        </div>

        {createPost.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            Failed to create post. Please try again.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createPost.isPending}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {createPost.isPending ? "Publishing..." : "Publish Post"}
          </button>
        </div>
      </form>
    </div>
  );
}
