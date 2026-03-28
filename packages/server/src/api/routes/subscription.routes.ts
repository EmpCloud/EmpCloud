// =============================================================================
// EMP CLOUD — Subscription & Seat Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin, requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as subService from "../../services/subscription/subscription.service.js";
import * as billingService from "../../services/billing/billing.service.js";
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  assignSeatSchema,
  checkAccessSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";

const router = Router();

// GET /api/v1/subscriptions — List org subscriptions (HR+ only)
router.get("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subs = await subService.listSubscriptions(req.user!.org_id);
    sendSuccess(res, subs);
  } catch (err) { next(err); }
});

// GET /api/v1/subscriptions/billing-summary (HR+ only)
router.get("/billing-summary", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await billingService.getBillingSummary(req.user!.org_id);
    sendSuccess(res, summary);
  } catch (err) { next(err); }
});

// GET /api/v1/subscriptions/:id (HR+ only)
router.get("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await subService.getSubscription(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, sub);
  } catch (err) { next(err); }
});

// POST /api/v1/subscriptions — Subscribe to a module
router.post("/", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSubscriptionSchema.parse(req.body);
    const sub = await subService.createSubscription(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SUBSCRIPTION_CREATED,
      resourceType: "subscription",
      resourceId: String(sub.id),
      details: { module_id: data.module_id, plan_tier: data.plan_tier, seats: data.total_seats },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Notify billing
    billingService.onSubscriptionCreated(sub.id).catch(() => {});

    sendSuccess(res, sub, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/subscriptions/:id
router.put("/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateSubscriptionSchema.parse(req.body);
    const sub = await subService.updateSubscription(req.user!.org_id, paramInt(req.params.id), data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SUBSCRIPTION_UPDATED,
      resourceType: "subscription",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    billingService.onSubscriptionUpdated(sub.id).catch(() => {});

    sendSuccess(res, sub);
  } catch (err) { next(err); }
});

// DELETE /api/v1/subscriptions/:id — Cancel subscription
router.delete("/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await subService.cancelSubscription(req.user!.org_id, paramInt(req.params.id));

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      resourceType: "subscription",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    billingService.onSubscriptionCancelled(sub.id).catch(() => {});

    sendSuccess(res, sub);
  } catch (err) { next(err); }
});

// --- Seats ---

// GET /api/v1/subscriptions/:id/seats (HR+ only)
router.get("/:id/seats", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await subService.getSubscription(req.user!.org_id, paramInt(req.params.id));
    const seats = await subService.listSeats(req.user!.org_id, sub.module_id);
    sendSuccess(res, seats);
  } catch (err) { next(err); }
});

// POST /api/v1/subscriptions/assign-seat
router.post("/assign-seat", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = assignSeatSchema.parse(req.body);
    const seat = await subService.assignSeat({
      orgId: req.user!.org_id,
      moduleId: data.module_id,
      userId: data.user_id,
      assignedBy: req.user!.sub,
    });

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SEAT_ASSIGNED,
      details: { module_id: data.module_id, user_id: data.user_id },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, seat, 201);
  } catch (err) { next(err); }
});

// DELETE /api/v1/subscriptions/revoke-seat
router.post("/revoke-seat", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = assignSeatSchema.parse(req.body);
    await subService.revokeSeat(req.user!.org_id, data.module_id, data.user_id);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SEAT_REVOKED,
      details: { module_id: data.module_id, user_id: data.user_id },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Seat revoked" });
  } catch (err) { next(err); }
});

// POST /api/v1/subscriptions/check-access — Used by sub-modules
router.post("/check-access", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = checkAccessSchema.parse(req.body);
    // Extract org_id from the authenticated user or from the request
    const orgId = req.user?.org_id || (req.body.organization_id as number);
    const result = await subService.checkModuleAccess({
      userId: data.user_id,
      orgId,
      moduleSlug: data.module_slug,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
