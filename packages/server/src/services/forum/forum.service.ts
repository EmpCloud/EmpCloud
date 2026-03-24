// =============================================================================
// EMP CLOUD — Forum / Social Intranet Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError } from "../../utils/errors.js";
import type {
  CreateForumCategoryInput,
  UpdateForumCategoryInput,
  CreateForumPostInput,
  UpdateForumPostInput,
  ForumPostQueryInput,
  CreateForumReplyInput,
  ForumLikeInput,
} from "@empcloud/shared";

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(orgId: number) {
  const db = getDB();
  return db("forum_categories")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("sort_order", "asc")
    .orderBy("name", "asc");
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
    title: data.title,
    content: data.content,
    post_type: data.post_type || "discussion",
    tags: data.tags ? JSON.stringify(data.tags) : null,
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
    .where({ "forum_posts.organization_id": orgId });

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

export async function getPost(orgId: number, postId: number) {
  const db = getDB();

  const post = await db("forum_posts")
    .where({ "forum_posts.id": postId, "forum_posts.organization_id": orgId })
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

  // Increment view count
  await db("forum_posts").where({ id: postId }).increment("view_count", 1);

  // Fetch replies with author info
  const replies = await db("forum_replies")
    .where({ "forum_replies.post_id": postId })
    .select(
      "forum_replies.*",
      "users.first_name as author_first_name",
      "users.last_name as author_last_name",
      "users.photo_path as author_photo"
    )
    .leftJoin("users", "forum_replies.author_id", "users.id")
    .orderBy("forum_replies.created_at", "asc");

  return { ...post, replies };
}

export async function updatePost(
  orgId: number,
  postId: number,
  userId: number,
  data: UpdateForumPostInput
) {
  const db = getDB();

  const existing = await db("forum_posts")
    .where({ id: postId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  if (existing.author_id !== userId) {
    throw new ForbiddenError("You can only edit your own posts");
  }

  const updateData: Record<string, unknown> = { updated_at: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.tags !== undefined)
    updateData.tags = data.tags ? JSON.stringify(data.tags) : null;

  await db("forum_posts").where({ id: postId }).update(updateData);
  return db("forum_posts").where({ id: postId }).first();
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
    .first();
  if (!existing) throw new NotFoundError("Forum post");

  const isAuthor = existing.author_id === userId;
  const isHR = HR_ROLES.includes(userRole);
  if (!isAuthor && !isHR) {
    throw new ForbiddenError("You can only delete your own posts");
  }

  // Delete likes for this post's replies
  const replyIds = await db("forum_replies")
    .where({ post_id: postId })
    .pluck("id");
  if (replyIds.length > 0) {
    await db("forum_likes")
      .where("target_type", "reply")
      .whereIn("target_id", replyIds)
      .del();
  }

  // Delete likes for this post
  await db("forum_likes")
    .where({ target_type: "post", target_id: postId })
    .del();

  // Delete replies
  await db("forum_replies").where({ post_id: postId }).del();

  // Delete post
  await db("forum_posts").where({ id: postId }).del();

  // Decrement category post_count
  await db("forum_categories")
    .where({ id: existing.category_id })
    .decrement("post_count", 1);
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
    .first();
  if (!post) throw new NotFoundError("Forum post");
  if (post.is_locked) {
    throw new ForbiddenError("This post is locked and cannot receive replies");
  }

  // Validate parent_reply_id if given
  if (data.parent_reply_id) {
    const parentReply = await db("forum_replies")
      .where({ id: data.parent_reply_id, post_id: postId })
      .first();
    if (!parentReply) throw new NotFoundError("Parent reply");
  }

  const [id] = await db("forum_replies").insert({
    post_id: postId,
    organization_id: orgId,
    author_id: userId,
    content: data.content,
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

export async function deleteReply(
  orgId: number,
  replyId: number,
  userId: number,
  userRole: string
) {
  const db = getDB();

  const existing = await db("forum_replies")
    .where({ id: replyId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Forum reply");

  const isAuthor = existing.author_id === userId;
  const isHR = HR_ROLES.includes(userRole);
  if (!isAuthor && !isHR) {
    throw new ForbiddenError("You can only delete your own replies");
  }

  // Delete likes for this reply
  await db("forum_likes")
    .where({ target_type: "reply", target_id: replyId })
    .del();

  // Delete child replies
  await db("forum_replies").where({ parent_reply_id: replyId }).del();

  await db("forum_replies").where({ id: replyId }).del();

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
    .first();
  if (!reply) throw new NotFoundError("Forum reply");

  // Only question post author can accept
  const post = await db("forum_posts")
    .where({ id: reply.post_id, organization_id: orgId })
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

  // Verify target exists
  if (data.target_type === "post") {
    const post = await db("forum_posts")
      .where({ id: data.target_id, organization_id: orgId })
      .first();
    if (!post) throw new NotFoundError("Forum post");
  } else {
    const reply = await db("forum_replies")
      .where({ id: data.target_id, organization_id: orgId })
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

  // Category stats
  const categories = await db("forum_categories")
    .where({ organization_id: orgId, is_active: true })
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
