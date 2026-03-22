// =============================================================================
// EMP CLOUD — Notification Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import * as notificationService from "../../services/notification/notification.service.js";
import { paginationSchema } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/notifications
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const unreadOnly = req.query.unread_only === "true";
    const result = await notificationService.listNotifications(
      req.user!.org_id,
      req.user!.sub,
      { page, perPage: per_page, unreadOnly }
    );
    sendPaginated(res, result.notifications, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/notifications/unread-count
router.get("/unread-count", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.org_id, req.user!.sub);
    sendSuccess(res, { count });
  } catch (err) { next(err); }
});

// PUT /api/v1/notifications/:id/read
router.put("/:id/read", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAsRead(req.user!.org_id, paramInt(req.params.id), req.user!.sub);
    sendSuccess(res, { message: "Notification marked as read" });
  } catch (err) { next(err); }
});

// PUT /api/v1/notifications/read-all
router.put("/read-all", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAllAsRead(req.user!.org_id, req.user!.sub);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
