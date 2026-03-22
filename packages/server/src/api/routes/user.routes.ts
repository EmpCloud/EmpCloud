// =============================================================================
// EMP CLOUD — User Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as userService from "../../services/user/user.service.js";
import {
  createUserSchema,
  updateUserSchema,
  inviteUserSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";

const router = Router();

// GET /api/v1/users
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const search = req.query.search as string | undefined;
    const result = await userService.listUsers(req.user!.org_id, { page, perPage: per_page, search });
    sendPaginated(res, result.users, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUser(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

// POST /api/v1/users
router.post("/", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await userService.createUser(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_CREATED,
      resourceType: "user",
      resourceId: String((user as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, user, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/users/:id
router.put("/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await userService.updateUser(req.user!.org_id, paramInt(req.params.id), data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_UPDATED,
      resourceType: "user",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, user);
  } catch (err) { next(err); }
});

// DELETE /api/v1/users/:id
router.delete("/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.deactivateUser(req.user!.org_id, paramInt(req.params.id));

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_DEACTIVATED,
      resourceType: "user",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "User deactivated" });
  } catch (err) { next(err); }
});

// POST /api/v1/users/invite
router.post("/invite", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = inviteUserSchema.parse(req.body);
    const result = await userService.inviteUser(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_INVITED,
      details: { email: data.email },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// POST /api/v1/users/accept-invitation
router.post("/accept-invitation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, first_name, last_name, password } = req.body;
    const user = await userService.acceptInvitation({
      token,
      firstName: first_name,
      lastName: last_name,
      password,
    });
    sendSuccess(res, user, 201);
  } catch (err) { next(err); }
});

export default router;
