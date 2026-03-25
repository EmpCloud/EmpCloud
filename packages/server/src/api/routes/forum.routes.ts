// =============================================================================
// EMP CLOUD — Forum / Social Intranet Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as forumService from "../../services/forum/forum.service.js";
import {
  createForumCategorySchema,
  updateForumCategorySchema,
  createForumPostSchema,
  updateForumPostSchema,
  forumPostQuerySchema,
  createForumReplySchema,
  forumLikeSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// ---- Categories ----

// GET /api/v1/forum/categories
router.get("/categories", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await forumService.listCategories(req.user!.org_id);
    sendSuccess(res, categories);
  } catch (err) { next(err); }
});

// POST /api/v1/forum/categories
router.post("/categories", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createForumCategorySchema.parse(req.body);
    const category = await forumService.createCategory(req.user!.org_id, data);
    sendSuccess(res, category, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/forum/categories/:id
router.put("/categories/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateForumCategorySchema.parse(req.body);
    const category = await forumService.updateCategory(
      req.user!.org_id,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, category);
  } catch (err) { next(err); }
});

// ---- Posts ----

// POST /api/v1/forum/posts
router.post("/posts", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createForumPostSchema.parse(req.body);
    const post = await forumService.createPost(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.FORUM_POST_CREATED,
      resourceType: "forum_post",
      resourceId: String((post as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, post, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/forum/posts
router.get("/posts", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = forumPostQuerySchema.parse(req.query);
    const result = await forumService.listPosts(req.user!.org_id, filters);
    sendPaginated(res, result.posts, result.total, filters.page || 1, filters.per_page || 20);
  } catch (err) { next(err); }
});

// GET /api/v1/forum/posts/:id
router.get("/posts/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await forumService.getPost(
      req.user!.org_id,
      paramInt(req.params.id),
      true // increment view count on page load
    );

    // Also fetch user's like status for this post and its replies
    const replyIds = (post.replies || []).map((r: any) => r.id);
    const [likedPosts, likedReplies] = await Promise.all([
      forumService.getUserLikes(req.user!.org_id, req.user!.sub, "post", [post.id]),
      forumService.getUserLikes(req.user!.org_id, req.user!.sub, "reply", replyIds),
    ]);

    sendSuccess(res, {
      ...post,
      user_liked: likedPosts.includes(post.id),
      replies: (post.replies || []).map((r: any) => ({
        ...r,
        user_liked: likedReplies.includes(r.id),
      })),
    });
  } catch (err) { next(err); }
});

// PUT /api/v1/forum/posts/:id
router.put("/posts/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateForumPostSchema.parse(req.body);
    const post = await forumService.updatePost(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data
    );
    sendSuccess(res, post);
  } catch (err) { next(err); }
});

// DELETE /api/v1/forum/posts/:id
router.delete("/posts/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await forumService.deletePost(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      req.user!.role
    );
    sendSuccess(res, { message: "Post deleted" });
  } catch (err) { next(err); }
});

// POST /api/v1/forum/posts/:id/pin
router.post("/posts/:id/pin", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await forumService.pinPost(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// POST /api/v1/forum/posts/:id/lock
router.post("/posts/:id/lock", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await forumService.lockPost(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ---- Replies ----

// POST /api/v1/forum/posts/:id/reply
router.post("/posts/:id/reply", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createForumReplySchema.parse(req.body);
    const reply = await forumService.createReply(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data
    );
    sendSuccess(res, reply, 201);
  } catch (err) { next(err); }
});

// DELETE /api/v1/forum/replies/:id
router.delete("/replies/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await forumService.deleteReply(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      req.user!.role
    );
    sendSuccess(res, { message: "Reply deleted" });
  } catch (err) { next(err); }
});

// POST /api/v1/forum/replies/:id/accept
router.post("/replies/:id/accept", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await forumService.acceptReply(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ---- Likes ----

// POST /api/v1/forum/like
router.post("/like", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = forumLikeSchema.parse(req.body);
    const result = await forumService.toggleLike(
      req.user!.org_id,
      req.user!.sub,
      data
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ---- Dashboard ----

// GET /api/v1/forum/dashboard
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await forumService.getForumDashboard(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

export default router;
