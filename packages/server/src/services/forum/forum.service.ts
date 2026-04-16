// =============================================================================
// EMP CLOUD — Forum / Social Intranet Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { sanitizeHtml } from "../../utils/sanitize-html.js";
import type {
  CreateForumCategoryInput,
  UpdateForumCategoryInput,
  CreateForumPostInput,
  UpdateForumPostInput,
  ForumPostQueryInput,
  CreateForumReplyInput,
  UpdateForumReplyInput,
  ForumLikeInput,
  FeedQueryInput,
  MediaAttachment,
} from "@empcloud/shared";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

// Default feed category — auto-created on first listCategories() call below.
const DEFAULT_FEED_CATEGORY = "General";

function serializeMedia(media: MediaAttachment[] | null | undefined): string | null {
  return media && media.length > 0 ? JSON.stringify(media) : null;
}

// Always parse JSON columns defensively — mysql2 can return string or array.
function parseMedia(value: unknown): MediaAttachment[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as MediaAttachment[];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as MediaAttachment[];
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(orgId: number) {
  const db = getDB();
  const categories = await db("forum_categories")
    .where({ "forum_categories.organization_id": orgId, "forum_categories.is_active": true })
    .select(
      "forum_categories.*",
      db.raw(
        `(SELECT COUNT(*) FROM forum_posts WHERE forum_posts.category_id = forum_categories.id AND forum_posts.organization_id = ?) as post_count`,
        [orgId]
      )
    )
    .orderBy("forum_categories.sort_order", "asc")
    .orderBy("forum_categories.name", "asc");

  // Auto-seed default categories if none exist for this organization
  if (categories.length === 0) {
    const defaults = [
      { name: "General", description: "General discussions and conversations", icon: "💬", sort_order: 1 },
      { name: "Questions", description: "Ask questions and get answers from colleagues", icon: "❓", sort_order: 2 },
      { name: "Ideas", description: "Share ideas and suggestions for improvement", icon: "💡", sort_order: 3 },
      { name: "Announcements", description: "Important announcements and updates", icon: "📢", sort_order: 4 },
    ];

    for (const cat of defaults) {
      await db("forum_categories").insert({
        organization_id: orgId,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        sort_order: cat.sort_order,
        is_active: true,
        post_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return db("forum_categories")
      .where({ "forum_categories.organization_id": orgId, "forum_categories.is_active": true })
      .select(
        "forum_categories.*",
        db.raw(
          `(SELECT COUNT(*) FROM forum_posts WHERE forum_posts.category_id = forum_categories.id AND forum_posts.organization_id = ?) as post_count`,
          [orgId]
        )
      )
      .orderBy("forum_categories.sort_order", "asc")
      .orderBy("forum_categories.name", "asc");
  }

  return categories;
}

export async function createCategory(orgId: number, data: CreateForumCategoryInput) {
  const db = getDB();
  const [id] = await db("forum_categories").insert({
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    sort_order: data.sort_order ?? 0,
    is_active: true,
    post_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("forum_categories").where({ id }).first();
}

export async function updateCategory(
  orgId: number,
  categoryId: number,
  data: UpdateForumCategoryInput
) {
  const db = getDB();
  const existing = await db("forum_categories")
    .where({ id: categoryId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum category");

  await db("forum_categories")
    .where({ id: categoryId })
    .update({ ...data, updated_at: new Date() });

  return db("forum_categories").where({ id: categoryId }).first();
}

export async function deleteCategory(orgId: number, categoryId: number) {
  const db = getDB();
  const existing = await db("forum_categories")
    .where({ id: categoryId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum category");

  // Soft-delete — mark inactive. Existing posts keep their category_id but
  // the category is hidden from the listing and createPost blocks new posts
  // since it filters on is_active=true.
  await db("forum_categories")
    .where({ id: categoryId })
    .update({ is_active: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function createPost(
  orgId: number,
  userId: number,
  data: CreateForumPostInput
) {
  const db = getDB();

  // Verify category exists
  const category = await db("forum_categories")
    .where({ id: data.category_id, organization_id: orgId, is_active: true })
    .first();
  if (!category) throw new NotFoundError("Forum category");

  const [id] = await db("forum_posts").insert({
    organization_id: orgId,
    category_id: data.category_id,
    author_id: userId,
    title: sanitizeHtml(data.title),
    content: sanitizeHtml(data.content),
    post_type: data.post_type || "discussion",
    tags: data.tags ? JSON.stringify(data.tags) : null,
    media: serializeMedia(data.media),
    is_pinned: false,
    is_locked: false,
    view_count: 0,
    like_count: 0,
    reply_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Increment category post_count
  await db("forum_categories")
    .where({ id: data.category_id })
    .increment("post_count", 1);

  return db("forum_posts").where({ id }).first();
}

export async function listPosts(orgId: number, filters: ForumPostQueryInput) {
  const db = getDB();
  const page = filters.page || 1;
  const perPage = filters.per_page || 20;

  let query = db("forum_posts")
    .where({ "forum_posts.organization_id": orgId })
    .whereNull("forum_posts.deleted_at");

  if (filters.category_id) {
    query = query.where("forum_posts.category_id", filters.category_id);
  }
  if (filters.post_type) {
    query = query.where("forum_posts.post_type", filters.post_type);
  }
  if (filters.author_id) {
    query = query.where("forum_posts.author_id", filters.author_id);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.where(function () {
      this.where("forum_posts.title", "like", term).orWhere(
        "forum_posts.content",
        "like",
        term
      );
    });
  }

  const countQuery = query.clone().count("forum_posts.id as count");
  const [{ count }] = await countQuery;

  // Sort
  let sortCol = "forum_posts.created_at";
  let sortDir: "asc" | "desc" = "desc";
  if (filters.sort_by === "popular") {
    sortCol = "forum_posts.like_count";
    sortDir = "desc";
  } else if (filters.sort_by === "trending") {
    sortCol = "forum_posts.reply_count";
    sortDir = "desc";
  } else if (filters.sort_by === "views") {
    sortCol = "forum_posts.view_count";
    sortDir = "desc";
  }

  const posts = await query
    .clone()
    .select(
      "forum_posts.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo",
      "forum_categories.name as category_name",
      "forum_categories.icon as category_icon"
    )
    .leftJoin("users", "forum_posts.author_id", "users.id")
    .leftJoin("forum_categories", "forum_posts.category_id", "forum_categories.id")
    .orderBy("forum_posts.is_pinned", "desc")
    .orderBy(sortCol, sortDir)
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { posts, total: Number(count) };
}

export async function getPost(orgId: number, postId: number, incrementView = false) {
  const db = getDB();

  const post = await db("forum_posts")
    .where({ "forum_posts.id": postId, "forum_posts.organization_id": orgId })
    .whereNull("forum_posts.deleted_at")
    .select(
      "forum_posts.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo",
      "forum_categories.name as category_name",
      "forum_categories.icon as category_icon"
    )
    .leftJoin("users", "forum_posts.author_id", "users.id")
    .leftJoin("forum_categories", "forum_posts.category_id", "forum_categories.id")
    .first();

  if (!post) throw new NotFoundError("Forum post");

  // Only increment view count when explicitly requested (i.e. on page load via GET route)
  if (incrementView) {
    await db("forum_posts").where({ id: postId }).increment("view_count", 1);
  }

  // Fetch non-deleted replies with author info
  const replies = await db("forum_replies")
    .where({ "forum_replies.post_id": postId })
    .whereNull("forum_replies.deleted_at")
    .select(
      "forum_replies.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo"
    )
    .leftJoin("users", "forum_replies.author_id", "users.id")
    .orderBy("forum_replies.created_at", "asc");

  return { ...post, media: parseMedia(post.media), replies };
}

export async function updatePost(
  orgId: number,
  postId: number,
  userId: number,
  userRole: string,
  data: UpdateForumPostInput
) {
  const db = getDB();

  const existing = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  const isAuthor = existing.author_id === userId;
  const isHR = HR_ROLES.includes(userRole);
  // comments_disabled is a moderation toggle — HR only. Author edits
  // their own title/content/tags/media.
  if (data.comments_disabled !== undefined && !isHR) {
    throw new ForbiddenError("Only HR can disable comments");
  }
  if (!isAuthor && !isHR) {
    throw new ForbiddenError("You can only edit your own posts");
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    updated_at: now,
    // edited_at marks content changes only — not moderation toggles
    edited_at:
      data.title !== undefined ||
      data.content !== undefined ||
      data.media !== undefined
        ? now
        : existing.edited_at,
  };
  if (data.title !== undefined) updateData.title = sanitizeHtml(data.title);
  if (data.content !== undefined) updateData.content = sanitizeHtml(data.content);
  if (data.tags !== undefined)
    updateData.tags = data.tags ? JSON.stringify(data.tags) : null;
  if (data.media !== undefined) updateData.media = serializeMedia(data.media);
  if (data.comments_disabled !== undefined)
    updateData.comments_disabled = data.comments_disabled;

  await db("forum_posts").where({ id: postId }).update(updateData);
  const fresh = await db("forum_posts").where({ id: postId }).first();
  return { ...fresh, media: parseMedia(fresh.media) };
}

export async function deletePost(
  orgId: number,
  postId: number,
  userId: number,
  userRole: string
) {
  const db = getDB();

  const existing = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  const isAuthor = existing.author_id === userId;
  const isHR = HR_ROLES.includes(userRole);
  if (!isAuthor && !isHR) {
    throw new ForbiddenError("You can only delete your own posts");
  }

  const now = new Date();

  // Soft-delete: stamp deleted_at on the post and cascade to its replies.
  // Likes are left in place — the counts come from the columns on the post
  // itself, which are no longer shown once the post is filtered out.
  await db.transaction(async (trx) => {
    await trx("forum_posts")
      .where({ id: postId })
      .update({ deleted_at: now, updated_at: now });

    await trx("forum_replies")
      .where({ post_id: postId })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    // Decrement category post_count since the post is no longer visible
    await trx("forum_categories")
      .where({ id: existing.category_id })
      .decrement("post_count", 1);
  });
}

export async function pinPost(orgId: number, postId: number) {
  const db = getDB();
  const existing = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  const newVal = !existing.is_pinned;
  await db("forum_posts")
    .where({ id: postId })
    .update({ is_pinned: newVal, updated_at: new Date() });

  return { is_pinned: newVal };
}

export async function lockPost(orgId: number, postId: number) {
  const db = getDB();
  const existing = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  const newVal = !existing.is_locked;
  await db("forum_posts")
    .where({ id: postId })
    .update({ is_locked: newVal, updated_at: new Date() });

  return { is_locked: newVal };
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export async function createReply(
  orgId: number,
  postId: number,
  userId: number,
  data: CreateForumReplyInput
) {
  const db = getDB();

  const post = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!post) throw new NotFoundError("Forum post");
  if (post.is_locked) {
    throw new ForbiddenError("This post is locked and cannot receive replies");
  }
  if (post.comments_disabled) {
    throw new ForbiddenError("Comments are disabled on this post");
  }

  // Validate parent_reply_id if given (must also still exist)
  if (data.parent_reply_id) {
    const parentReply = await db("forum_replies")
      .where({ id: data.parent_reply_id, post_id: postId })
      .whereNull("deleted_at")
      .first();
    if (!parentReply) throw new NotFoundError("Parent reply");
  }

  const [id] = await db("forum_replies").insert({
    post_id: postId,
    organization_id: orgId,
    author_id: userId,
    content: sanitizeHtml(data.content),
    parent_reply_id: data.parent_reply_id || null,
    like_count: 0,
    is_accepted: false,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Increment post reply_count
  await db("forum_posts").where({ id: postId }).increment("reply_count", 1);

  return db("forum_replies")
    .where({ "forum_replies.id": id })
    .select(
      "forum_replies.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo"
    )
    .leftJoin("users", "forum_replies.author_id", "users.id")
    .first();
}

export async function updateReply(
  orgId: number,
  replyId: number,
  userId: number,
  data: UpdateForumReplyInput
) {
  const db = getDB();

  const existing = await db("forum_replies")
    .where({ id: replyId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!existing) throw new NotFoundError("Forum reply");

  // Owner only — comments are personal speech; HR can still delete but
  // not rewrite someone else's words.
  if (existing.author_id !== userId) {
    throw new ForbiddenError("You can only edit your own replies");
  }

  const now = new Date();
  await db("forum_replies").where({ id: replyId }).update({
    content: sanitizeHtml(data.content),
    edited_at: now,
    updated_at: now,
  });

  return db("forum_replies")
    .where({ "forum_replies.id": replyId })
    .select(
      "forum_replies.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo"
    )
    .leftJoin("users", "forum_replies.author_id", "users.id")
    .first();
}

export async function deleteReply(
  orgId: number,
  replyId: number,
  userId: number,
  userRole: string
) {
  const db = getDB();

  const existing = await db("forum_replies")
    .where({ id: replyId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!existing) throw new NotFoundError("Forum reply");

  const isAuthor = existing.author_id === userId;
  const isHR = HR_ROLES.includes(userRole);
  if (!isAuthor && !isHR) {
    throw new ForbiddenError("You can only delete your own replies");
  }

  const now = new Date();
  // Soft-delete the reply and any children in one statement
  await db("forum_replies")
    .where(function () {
      this.where("id", replyId).orWhere("parent_reply_id", replyId);
    })
    .whereNull("deleted_at")
    .update({ deleted_at: now, updated_at: now });

  // Decrement post reply_count
  await db("forum_posts")
    .where({ id: existing.post_id })
    .decrement("reply_count", 1);
}

export async function acceptReply(
  orgId: number,
  replyId: number,
  userId: number
) {
  const db = getDB();

  const reply = await db("forum_replies")
    .where({ id: replyId, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!reply) throw new NotFoundError("Forum reply");

  // Only question post author can accept
  const post = await db("forum_posts")
    .where({ id: reply.post_id, organization_id: orgId })
    .whereNull("deleted_at")
    .first();
  if (!post) throw new NotFoundError("Forum post");
  if (post.post_type !== "question") {
    throw new ForbiddenError("Only question posts can have accepted answers");
  }
  if (post.author_id !== userId) {
    throw new ForbiddenError("Only the question author can accept answers");
  }

  // Unaccept all other replies for this post
  await db("forum_replies")
    .where({ post_id: reply.post_id })
    .update({ is_accepted: false });

  // Toggle: if it was already accepted, it's now unaccepted
  const newVal = !reply.is_accepted;
  await db("forum_replies")
    .where({ id: replyId })
    .update({ is_accepted: newVal, updated_at: new Date() });

  return { is_accepted: newVal };
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export async function toggleLike(
  orgId: number,
  userId: number,
  data: ForumLikeInput
) {
  const db = getDB();

  // Verify target exists and is not soft-deleted
  if (data.target_type === "post") {
    const post = await db("forum_posts")
      .where({ id: data.target_id, organization_id: orgId })
      .whereNull("deleted_at")
      .first();
    if (!post) throw new NotFoundError("Forum post");
  } else {
    const reply = await db("forum_replies")
      .where({ id: data.target_id, organization_id: orgId })
      .whereNull("deleted_at")
      .first();
    if (!reply) throw new NotFoundError("Forum reply");
  }

  const existing = await db("forum_likes")
    .where({
      user_id: userId,
      target_type: data.target_type,
      target_id: data.target_id,
    })
    .first();

  if (existing) {
    // Unlike
    await db("forum_likes").where({ id: existing.id }).del();
    // Decrement like_count
    const table = data.target_type === "post" ? "forum_posts" : "forum_replies";
    await db(table).where({ id: data.target_id }).decrement("like_count", 1);
    return { liked: false };
  } else {
    // Like
    await db("forum_likes").insert({
      organization_id: orgId,
      user_id: userId,
      target_type: data.target_type,
      target_id: data.target_id,
      created_at: new Date(),
    });
    const table = data.target_type === "post" ? "forum_posts" : "forum_replies";
    await db(table).where({ id: data.target_id }).increment("like_count", 1);
    return { liked: true };
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getForumDashboard(orgId: number) {
  const db = getDB();

  // Total posts
  const [{ total_posts }] = await db("forum_posts")
    .where({ organization_id: orgId })
    .count("id as total_posts");

  // Total replies
  const [{ total_replies }] = await db("forum_replies")
    .where({ organization_id: orgId })
    .count("id as total_replies");

  // Active discussions (posts with replies in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [{ active_discussions }] = await db("forum_posts")
    .where({ organization_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .count("id as active_discussions");

  // Top contributors (most posts + replies in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const topContributors = await db.raw(
    `SELECT u.id, u.first_name, u.last_name, u.photo_path,
      (
        (SELECT COUNT(*) FROM forum_posts fp WHERE fp.author_id = u.id AND fp.organization_id = ? AND fp.created_at >= ?) +
        (SELECT COUNT(*) FROM forum_replies fr WHERE fr.author_id = u.id AND fr.organization_id = ? AND fr.created_at >= ?)
      ) as contribution_count
     FROM users u
     WHERE u.organization_id = ?
     HAVING contribution_count > 0
     ORDER BY contribution_count DESC
     LIMIT 10`,
    [orgId, thirtyDaysAgo, orgId, thirtyDaysAgo, orgId]
  );

  // Trending posts (most likes + replies in last 7 days)
  const trendingPosts = await db("forum_posts")
    .where({ "forum_posts.organization_id": orgId })
    .where("forum_posts.created_at", ">=", sevenDaysAgo)
    .select(
      "forum_posts.id",
      "forum_posts.title",
      "forum_posts.post_type",
      "forum_posts.like_count",
      "forum_posts.reply_count",
      "forum_posts.view_count",
      "forum_posts.created_at",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name"
    )
    .leftJoin("users", "forum_posts.author_id", "users.id")
    .orderByRaw("(forum_posts.like_count + forum_posts.reply_count) DESC")
    .limit(10);

  // Category stats — use live computed post_count
  const categories = await db("forum_categories")
    .where({ "forum_categories.organization_id": orgId, "forum_categories.is_active": true })
    .select(
      "forum_categories.*",
      db.raw(
        `(SELECT COUNT(*) FROM forum_posts WHERE forum_posts.category_id = forum_categories.id AND forum_posts.organization_id = ?) as post_count`,
        [orgId]
      )
    )
    .orderBy("post_count", "desc");

  return {
    total_posts: Number(total_posts),
    total_replies: Number(total_replies),
    active_discussions: Number(active_discussions),
    top_contributors: topContributors[0] || [],
    trending_posts: trendingPosts,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Check if user has liked
// ---------------------------------------------------------------------------

export async function getUserLikes(
  orgId: number,
  userId: number,
  targetType: string,
  targetIds: number[]
) {
  if (targetIds.length === 0) return [];
  const db = getDB();
  return db("forum_likes")
    .where({ organization_id: orgId, user_id: userId, target_type: targetType })
    .whereIn("target_id", targetIds)
    .pluck("target_id");
}

// ---------------------------------------------------------------------------
// Feed (cross-category, cursor paginated)
// ---------------------------------------------------------------------------

// Resolve a default "General" category id for quick composer writes. Creates
// it on demand so a fresh org doesn't need a seed step.
async function getOrCreateDefaultCategory(orgId: number): Promise<number> {
  const db = getDB();
  const existing = await db("forum_categories")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("sort_order", "asc")
    .first();
  if (existing) return existing.id;

  const [id] = await db("forum_categories").insert({
    organization_id: orgId,
    name: DEFAULT_FEED_CATEGORY,
    description: "Company feed",
    icon: "💬",
    sort_order: 0,
    is_active: true,
    post_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return id;
}

export async function getDefaultFeedCategoryId(orgId: number): Promise<number> {
  return getOrCreateDefaultCategory(orgId);
}

/**
 * Cross-category cursor-paginated feed. Returns posts newest-first with the
 * author chip, category label, up to 2 preview replies, and my_liked flags
 * for both the post and those preview replies — so the widget can render
 * without a waterfall of follow-up requests.
 */
export async function listFeed(
  orgId: number,
  userId: number,
  params: FeedQueryInput
) {
  const db = getDB();
  const limit = params.limit ?? 20;

  let q = db("forum_posts")
    .where({ "forum_posts.organization_id": orgId })
    .whereNull("forum_posts.deleted_at");

  if (params.cursor) {
    q = q.where("forum_posts.id", "<", params.cursor);
  }
  if (params.author_id) {
    q = q.where("forum_posts.author_id", params.author_id);
  }
  if (params.search) {
    const term = `%${params.search}%`;
    q = q.where(function () {
      this.where("forum_posts.title", "like", term)
        .orWhere("forum_posts.content", "like", term);
    });
  }

  const rows = await q
    .select(
      "forum_posts.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo",
      "users.designation as author_title",
      "forum_categories.name as category_name",
      "forum_categories.icon as category_icon"
    )
    .leftJoin("users", "forum_posts.author_id", "users.id")
    .leftJoin("forum_categories", "forum_posts.category_id", "forum_categories.id")
    .orderBy("forum_posts.id", "desc")
    .limit(limit + 1); // fetch one extra to know if there's a next page

  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;
  const postIds = posts.map((p: any) => p.id);

  // Which of these posts has the viewer liked?
  const likedPostIds = await getUserLikes(orgId, userId, "post", postIds);
  const likedSet = new Set(likedPostIds);

  // Preview the 2 most recent replies per post (single query, grouped client-side).
  // We fetch all non-deleted replies for these posts and slice per post; for
  // large pages this is still bounded by `limit * <replies-per-post>`. If this
  // becomes a hotspot we can move to a correlated `LATERAL` query on MySQL 8+.
  const replyRows = postIds.length
    ? await db("forum_replies")
        .whereIn("post_id", postIds)
        .whereNull("forum_replies.deleted_at")
        .select(
          "forum_replies.*",
          "users.first_name as author_first_name",
          "users.last_name as author_last_name",
          "users.photo_path as author_photo"
        )
        .leftJoin("users", "forum_replies.author_id", "users.id")
        .orderBy("forum_replies.id", "desc")
    : [];

  const byPost = new Map<number, any[]>();
  for (const r of replyRows) {
    const arr = byPost.get(r.post_id) || [];
    if (arr.length < 2) arr.push(r);
    byPost.set(r.post_id, arr);
  }

  const items = posts.map((p: any) => ({
    ...p,
    media: parseMedia(p.media),
    my_liked: likedSet.has(p.id),
    preview_replies: (byPost.get(p.id) || []).reverse(), // oldest preview first
  }));

  return {
    items,
    next_cursor: hasMore ? posts[posts.length - 1].id : null,
  };
}
