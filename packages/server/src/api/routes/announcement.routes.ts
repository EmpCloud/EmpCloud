// =============================================================================
// EMP CLOUD — Announcement Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as announcementService from "../../services/announcement/announcement.service.js";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/announcements
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    // Look up user's department_id from DB since it's not in the JWT payload
    const { getDB } = await import("../../db/connection.js");
    const userRecord = await getDB()("users").where({ id: req.user!.sub }).select("department_id").first();
    const result = await announcementService.listAnnouncements(
      req.user!.org_id,
      req.user!.sub,
      {
        page,
        perPage: per_page,
        userRole: req.user!.role,
        userDepartmentId: userRecord?.department_id || null,
      }
    );
    sendPaginated(res, result.announcements, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/announcements/unread-count
router.get("/unread-count", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getDB } = await import("../../db/connection.js");
    const userRecord = await getDB()("users").where({ id: req.user!.sub }).select("department_id").first();
    const count = await announcementService.getUnreadCount(
      req.user!.org_id,
      req.user!.sub,
      req.user!.role,
      userRecord?.department_id || null
    );
    sendSuccess(res, { count });
  } catch (err) { next(err); }
});

// GET /api/v1/announcements/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const announcement = await announcementService.getAnnouncement(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );
    sendSuccess(res, announcement);
  } catch (err) { next(err); }
});

// POST /api/v1/announcements
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createAnnouncementSchema.parse(req.body);
    const announcement = await announcementService.createAnnouncement(
      req.user!.org_id,
      req.user!.sub,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.ANNOUNCEMENT_CREATED,
      resourceType: "announcement",
      resourceId: String((announcement as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, announcement, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/announcements/:id
router.put("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateAnnouncementSchema.parse(req.body);
    const announcement = await announcementService.updateAnnouncement(
      req.user!.org_id,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, announcement);
  } catch (err) { next(err); }
});

// DELETE /api/v1/announcements/:id
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await announcementService.deleteAnnouncement(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, { message: "Announcement deleted" });
  } catch (err) { next(err); }
});

// POST /api/v1/announcements/:id/read
router.post("/:id/read", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await announcementService.markAsRead(
      paramInt(req.params.id),
      req.user!.sub,
      req.user!.org_id
    );
    sendSuccess(res, { message: "Marked as read" });
  } catch (err) { next(err); }
});

export default router;
