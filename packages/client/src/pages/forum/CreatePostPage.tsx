import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/api/client";
import { ArrowLeft, Send } from "lucide-react";

export default function CreatePostPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
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
      // Invalidate forum post lists so they refresh when the user navigates back
      qc.invalidateQueries({ queryKey: ["forum-posts"] });
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
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
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("forum.create.title")}</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg border border-border p-4 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-medium text-muted-foreground mb-1">
              {t("forum.create.category")} <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
              required
            >
              <option value="">{t("forum.create.selectCategory")}</option>
              {(categories || []).length === 0 && (
                <option value="" disabled>{t("forum.create.noCategories")}</option>
              )}
              {(categories || []).map((cat: any) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-muted-foreground mb-1">
              {t("forum.create.postType")}
            </label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
            >
              <option value="discussion">{t("forum.page.postType.discussion")}</option>
              <option value="question">{t("forum.page.postType.question")}</option>
              <option value="idea">{t("forum.page.postType.idea")}</option>
              <option value="poll">{t("forum.page.postType.poll")}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-muted-foreground mb-1">
            {t("forum.create.fieldTitle")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
            placeholder={t("forum.create.titlePlaceholder")}
            maxLength={255}
            required
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-muted-foreground mb-1">
            {t("forum.create.content")} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] min-h-[200px] resize-y"
            placeholder={
              postType === "question"
                ? t("forum.create.contentPlaceholderQuestion")
                : postType === "idea"
                ? t("forum.create.contentPlaceholderIdea")
                : t("forum.create.contentPlaceholder")
            }
            required
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-muted-foreground mb-1">
            {t("forum.create.tags")} <span className="text-xs text-muted-foreground">{t("forum.create.tagsHint")}</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
            placeholder={t("forum.create.tagsPlaceholder")}
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
                    className="bg-muted text-muted-foreground px-2 py-0.5 rounded-md text-[11px]"
                  >
                    #{tag}
                  </span>
                ))}
            </div>
          )}
        </div>

        {createPost.isError && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13px] rounded-md px-4 py-3">
            {t("forum.create.error")}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-[13px] border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            {t("forum.create.cancel")}
          </button>
          <button
            type="submit"
            disabled={createPost.isPending}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {createPost.isPending ? t("forum.create.publishing") : t("forum.create.publish")}
          </button>
        </div>
      </form>
    </div>
  );
}
