// =============================================================================
// EMP CLOUD — Event Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as eventService from "../../services/event/event.service.js";
import {
  createEventSchema,
  updateEventSchema,
  rsvpEventSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/events/upcoming — Upcoming events (all users)
router.get("/upcoming", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await eventService.getUpcomingEvents(req.user!.org_id);
    sendSuccess(res, events);
  } catch (err) { next(err); }
});

// GET /api/v1/events/my — My RSVPd events (all users)
router.get("/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await eventService.getMyEvents(req.user!.org_id, req.user!.sub);
    sendSuccess(res, events);
  } catch (err) { next(err); }
});

// GET /api/v1/events/dashboard — Event stats (HR only)
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await eventService.getEventDashboard(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// GET /api/v1/events — List events (all users)
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const result = await eventService.listEvents(req.user!.org_id, {
      page,
      perPage: per_page,
      event_type: req.query.event_type as string | undefined,
      status: req.query.status as string | undefined,
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
    });
    sendPaginated(res, result.events, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/events/:id — Event detail (all users)
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await eventService.getEvent(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, event);
  } catch (err) { next(err); }
});

// POST /api/v1/events — Create event (HR only)
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createEventSchema.parse(req.body);
    const event = await eventService.createEvent(
      req.user!.org_id,
      req.user!.sub,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.EVENT_CREATED,
      resourceType: "event",
      resourceId: String((event as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, event, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/events/:id — Update event (HR only)
router.put("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateEventSchema.parse(req.body);
    const event = await eventService.updateEvent(
      req.user!.org_id,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, event);
  } catch (err) { next(err); }
});

// DELETE /api/v1/events/:id — Delete event (HR only)
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await eventService.deleteEvent(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, { message: "Event deleted" });
  } catch (err) { next(err); }
});

// POST /api/v1/events/:id/cancel — Cancel event (HR only)
router.post("/:id/cancel", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await eventService.cancelEvent(
      req.user!.org_id,
      paramInt(req.params.id)
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.EVENT_CANCELLED,
      resourceType: "event",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, event);
  } catch (err) { next(err); }
});

// POST /api/v1/events/:id/rsvp — RSVP to event (any user)
router.post("/:id/rsvp", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = rsvpEventSchema.parse(req.body);
    const rsvp = await eventService.rsvpEvent(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      status
    );
    sendSuccess(res, rsvp);
  } catch (err) { next(err); }
});

export default router;
