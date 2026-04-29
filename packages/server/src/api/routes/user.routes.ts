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
  ROLE_HIERARCHY,
  adminResetUserPasswordSchema,
} from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";
import { ForbiddenError } from "../../utils/errors.js";
import * as importService from "../../services/import/import.service.js";
import multer from "multer";

/** Directory-safe fields visible to employees — strips sensitive admin data */
const EMPLOYEE_VISIBLE_FIELDS = ["id", "first_name", "last_name", "email", "designation", "department_id", "location_id", "photo_path", "emp_code"];

function stripSensitiveForEmployee(user: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of EMPLOYEE_VISIBLE_FIELDS) {
    if (key in user) safe[key] = user[key];
  }
  return safe;
}

function isEmployeeRole(role: string): boolean {
  const level = ROLE_HIERARCHY[role as UserRole] ?? 0;
  return level < (ROLE_HIERARCHY["manager" as UserRole] ?? 20);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// GET /api/v1/users
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const search = req.query.search as string | undefined;
    const include_inactive = req.query.include_inactive === "true";
    const result = await userService.listUsers(req.user!.org_id, { page, perPage: per_page, search, include_inactive });

    // RBAC: employees only see directory-safe fields (no role, status, phone, employee_code)
    const users = isEmployeeRole(req.user!.role)
      ? result.users.map((u: any) => stripSensitiveForEmployee(u))
      : result.users;

    sendPaginated(res, users, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/users/lookup?email=... — does a user with this email already
// exist in the org? Used by the Invite modal to prefill first/last name
// (and disable those inputs) when HR types an email that matches an
// existing employee. Returns { exists: false } when no match — never 404
// so the frontend can branch on a single field. Must come BEFORE /:id so
// "lookup" isn't matched as a numeric id.
router.get("/lookup", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_EMAIL", message: "email query parameter is required" },
      });
    }
    const result = await userService.lookupUserByEmail(req.user!.org_id, email);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/users/invitations — List pending invitations
router.get("/invitations", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as string) || "pending";
    const invitations = await userService.listInvitations(req.user!.org_id, status);
    sendSuccess(res, invitations);
  } catch (err) { next(err); }
});

// GET /api/v1/users/org-chart — MUST be before /:id to avoid matching "org-chart" as an ID
router.get("/org-chart", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = await userService.getOrgChart(req.user!.org_id);
    sendSuccess(res, tree);
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUser(req.user!.org_id, paramInt(req.params.id));

    // RBAC: employees only see directory-safe fields (unless viewing themselves)
    const isSelf = req.user!.sub === paramInt(req.params.id);
    const data = (!isSelf && isEmployeeRole(req.user!.role))
      ? stripSensitiveForEmployee(user as any)
      : user;

    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// POST /api/v1/users
router.post("/", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Prevent privilege escalation: only super_admins can assign the super_admin role
    if (data.role === "super_admin" && req.user!.role !== "super_admin") {
      throw new ForbiddenError("Only super admins can assign the super_admin role");
    }

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

    // Prevent privilege escalation: only super_admins can assign the super_admin role
    if (data.role === "super_admin" && req.user!.role !== "super_admin") {
      throw new ForbiddenError("Only super admins can assign the super_admin role");
    }

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

// POST /api/v1/users/:id/reset-password — admin-initiated password reset
// Org admins (and super_admins for other super_admins) can set a new password
// for another user in the same org. Self-password must go through
// /auth/change-password which requires the current password.
router.post("/:id/reset-password", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = adminResetUserPasswordSchema.parse(req.body);
    const targetUserId = paramInt(req.params.id);

    await userService.resetUserPassword(
      req.user!.org_id,
      targetUserId,
      req.user!.sub,
      req.user!.role,
      password,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PASSWORD_RESET,
      resourceType: "user",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Password reset successfully" });
  } catch (err) { next(err); }
});

// DELETE /api/v1/users/:id — hard-deletes the user. Cascading FKs wipe
// owned data (leave / attendance / forum / biometric records). Authored
// records (announcements, policies, etc.) are reassigned to the deleting
// admin so history survives. Frees the email for re-use.
router.delete("/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.deactivateUser(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_DELETED,
      resourceType: "user",
      resourceId: param(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "User deleted" });
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

// POST /api/v1/users/:id/invite — send (or resend) an invitation to an
// existing employee. Used by the per-row Invite button on the Employee
// Directory; the bulk /invite endpoint above blocks because every
// directory row is by definition already in the users table.
router.post(
  "/:id/invite",
  authenticate,
  requireOrgAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_ID", message: "User id must be a number" },
        });
      }
      const result = await userService.inviteFromDirectory(
        req.user!.org_id,
        req.user!.sub,
        id,
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.USER_INVITED,
        details: { user_id: id, email: result.email, status: result.status },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result, 200);
    } catch (err) { next(err); }
  },
);

// POST /api/v1/users/invitations/:id/resend — rotate token + re-email a pending invite
router.post(
  "/invitations/:id/resend",
  authenticate,
  requireOrgAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_ID", message: "Invitation id must be a number" },
        });
      }
      const result = await userService.resendInvitation(req.user!.org_id, id, req.user!.sub);

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.USER_INVITED,
        details: { resent: true, invitation_id: id, email: result.email },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// DELETE /api/v1/users/invitations/:id — cancel a pending invite. When the
// matching user row exists but has never activated (no password set), it
// gets hard-deleted in the same transaction so HR doesn't end up with a
// phantom account. Active users are left alone — only the invitation is
// cancelled.
router.delete(
  "/invitations/:id",
  authenticate,
  requireOrgAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_ID", message: "Invitation id must be a number" },
        });
      }
      const result = await userService.cancelInvitation(req.user!.org_id, id);

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.INVITATION_CANCELLED,
        details: {
          invitation_id: id,
          email: result.email,
          user_deleted: result.user_deleted,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// POST /api/v1/users/bulk-invite-employees — invite every directory user
// who doesn't already have a pending invite. By default restricts to
// users who haven't set a password yet (onboarding). Body
// { include_activated: true } lifts that filter so already-activated
// users also get a fresh invite link (effectively a bulk password
// reset).
router.post(
  "/bulk-invite-employees",
  authenticate,
  requireOrgAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeActivated = req.body?.include_activated === true;
      const result = await userService.bulkInviteFromDirectory(
        req.user!.org_id,
        req.user!.sub,
        { includeActivated },
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.USER_INVITED,
        details: {
          bulk: true,
          include_activated: includeActivated,
          invited: result.invited,
          skipped: result.skipped,
          total_eligible: result.total_eligible,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

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

// POST /api/v1/users/import — parse CSV and return preview
router.post("/import", authenticate, requireOrgAdmin, upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      sendSuccess(res, { error: "No file uploaded" }, 400);
      return;
    }
    const rows = importService.parseCSV(req.file.buffer);
    const result = await importService.validateImportData(req.user!.org_id, rows);
    sendSuccess(res, { ...result, totalRows: rows.length });
  } catch (err) { next(err); }
});

// POST /api/v1/users/import/execute — execute the import
router.post("/import/execute", authenticate, requireOrgAdmin, upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      sendSuccess(res, { error: "No file uploaded" }, 400);
      return;
    }
    const rows = importService.parseCSV(req.file.buffer);
    const { valid, errors } = await importService.validateImportData(req.user!.org_id, rows);

    // Privilege-escalation check: only super_admin importers can assign
    // super_admin role. Block the whole batch if any row tries it.
    if (req.user!.role !== "super_admin") {
      const escalatingRows = valid.filter((r) => r.role === "super_admin");
      if (escalatingRows.length > 0) {
        throw new ForbiddenError("Only super admins can assign the super_admin role");
      }
    }

    // Skip rows that failed validation and import the valid ones. The UI
    // button says "Import N valid users" and lists the invalid rows in the
    // preview step, so skipping is the expected behavior — the user has
    // already seen and acknowledged the invalid rows. If NO rows are
    // valid we still 400 so the client gets a clear failure.
    if (valid.length === 0) {
      sendSuccess(
        res,
        {
          error: "Validation failed — no rows could be imported",
          errors,
          totalRows: rows.length,
          count: 0,
        },
        400,
      );
      return;
    }

    const result = await importService.executeImport(req.user!.org_id, valid, req.user!.sub);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.USER_CREATED,
      details: { bulk_import: true, count: result.count, skipped: errors.length },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Return both the successful import result and the skipped rows so the
    // UI can surface "imported 229, skipped 4" instead of a silent success.
    sendSuccess(
      res,
      {
        ...result,
        skipped: errors,
        totalRows: rows.length,
      },
      201,
    );
  } catch (err) { next(err); }
});

export default router;
