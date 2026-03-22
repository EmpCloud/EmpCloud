// =============================================================================
// EMP CLOUD — Policy Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as policyService from "../../services/policy/policy.service.js";
import {
  createPolicySchema,
  updatePolicySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/policies/pending — policies current user has NOT acknowledged
router.get("/pending", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await policyService.getPendingAcknowledgments(req.user!.org_id, req.user!.sub);
    sendSuccess(res, pending);
  } catch (err) { next(err); }
});

// GET /api/v1/policies
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const category = req.query.category as string | undefined;
    const result = await policyService.listPolicies(req.user!.org_id, { page, perPage: per_page, category });
    sendPaginated(res, result.policies, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/policies/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await policyService.getPolicy(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// POST /api/v1/policies
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPolicySchema.parse(req.body);
    const policy = await policyService.createPolicy(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.POLICY_CREATED,
      resourceType: "policy",
      resourceId: String((policy as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, policy, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/policies/:id
router.put("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updatePolicySchema.parse(req.body);
    const policy = await policyService.updatePolicy(req.user!.org_id, paramInt(req.params.id), data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.POLICY_CREATED,
      resourceType: "policy",
      resourceId: String(paramInt(req.params.id)),
      details: { action: "updated" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// DELETE /api/v1/policies/:id
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await policyService.deletePolicy(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Policy deactivated" });
  } catch (err) { next(err); }
});

// POST /api/v1/policies/:id/acknowledge
router.post("/:id/acknowledge", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await policyService.acknowledgePolicy(
      paramInt(req.params.id),
      req.user!.sub,
      req.user!.org_id
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.POLICY_ACKNOWLEDGED,
      resourceType: "policy",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/policies/:id/acknowledgments
router.get("/:id/acknowledgments", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const acknowledgments = await policyService.getAcknowledgments(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, acknowledgments);
  } catch (err) { next(err); }
});

export default router;
