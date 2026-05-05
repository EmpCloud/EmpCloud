// =============================================================================
// EMP CLOUD — Roles & Permissions Routes
// CRUD for org-scoped custom roles + user-role assignment.
//
// Authorization:
//   - GET /roles                — any authenticated user (roles:view)
//   - GET /roles/permissions    — any authenticated user (for role-builder UI)
//   - GET /roles/:id            — roles:view
//   - POST /roles               — roles:manage
//   - PUT /roles/:id            — roles:manage
//   - DELETE /roles/:id         — roles:manage
//   - GET /users/:id/roles      — roles:view
//   - POST /users/:id/roles     — roles:manage
//   - DELETE /users/:id/roles/:rid — roles:manage
//   - GET /me/permissions       — any authenticated user (debug / introspection)
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import {
  listRolesForOrg,
  getRoleById,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  listUserCustomRoles,
  assignRoleToUser,
  unassignRoleFromUser,
  resolveUserPermissions,
  listAllPermissionKeys,
} from "../../services/permissions/permissions.service.js";
import { PERMISSIONS, groupPermissions } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";

const router = Router();

router.use(authenticate);

// GET /api/v1/roles/permissions — full permission catalogue (for role-builder UI)
// Returns the catalogue grouped by resource. Available to any authenticated user
// so the UI can render the read-only permissions tree even when viewing system roles.
router.get("/permissions", (_req: Request, res: Response) => {
  sendSuccess(res, {
    permissions: PERMISSIONS,
    grouped: groupPermissions(),
    keys: listAllPermissionKeys(),
  });
});

// GET /api/v1/roles/me/permissions — caller's effective permissions
// Useful for debugging / for the client to show "what can I do" hints.
router.get("/me/permissions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const perms = await resolveUserPermissions(req.user!.sub, req.user!.role as UserRole);
    sendSuccess(res, { permissions: perms });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/roles — list roles in caller's org (system + custom)
router.get(
  "/",
  requirePermission("roles:view", "roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await listRolesForOrg(req.user!.org_id);
      sendSuccess(res, roles);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/roles/:id
router.get(
  "/:id",
  requirePermission("roles:view", "roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const role = await getRoleById(req.user!.org_id, id);
      if (!role) {
        sendError(res, 404, "NOT_FOUND", "Role not found");
        return;
      }
      sendSuccess(res, role);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/roles — create custom role
router.post(
  "/",
  requirePermission("roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, permissions } = req.body || {};
      if (typeof name !== "string" || name.trim().length === 0) {
        sendError(res, 400, "VALIDATION", "name is required");
        return;
      }
      if (!Array.isArray(permissions)) {
        sendError(res, 400, "VALIDATION", "permissions must be an array");
        return;
      }
      const result = await createCustomRole({
        orgId: req.user!.org_id,
        createdBy: req.user!.sub,
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        permissions,
      });
      // Audit
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: "ROLE_CREATED" as any,
        details: { role_id: result.id, name, permissions_count: permissions.length },
      });
      const created = await getRoleById(req.user!.org_id, result.id);
      sendSuccess(res, created, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/roles/:id — update custom role
router.put(
  "/:id",
  requirePermission("roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { name, description, permissions, is_active } = req.body || {};
      await updateCustomRole({
        orgId: req.user!.org_id,
        id,
        name: typeof name === "string" ? name.trim() : undefined,
        description: description === undefined ? undefined : description,
        permissions: Array.isArray(permissions) ? permissions : undefined,
        is_active: typeof is_active === "boolean" ? is_active : undefined,
      });
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: "ROLE_UPDATED" as any,
        details: {
          role_id: id,
          fields: Object.keys(req.body || {}),
        },
      });
      const updated = await getRoleById(req.user!.org_id, id);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/roles/:id — delete custom role
router.delete(
  "/:id",
  requirePermission("roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await deleteCustomRole(req.user!.org_id, id);
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: "ROLE_DELETED" as any,
        details: { role_id: id },
      });
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/roles/users/:userId — list custom roles assigned to a user
router.get(
  "/users/:userId",
  requirePermission("roles:view", "roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.userId);
      const roles = await listUserCustomRoles(userId);
      sendSuccess(res, roles);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/roles/users/:userId — assign a custom role to a user
//   body: { role_id: number }
router.post(
  "/users/:userId",
  requirePermission("roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.userId);
      const roleId = Number(req.body?.role_id);
      if (!roleId) {
        sendError(res, 400, "VALIDATION", "role_id is required");
        return;
      }
      await assignRoleToUser({ orgId: req.user!.org_id, userId, roleId });
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: "ROLE_ASSIGNED" as any,
        details: { target_user_id: userId, role_id: roleId },
      });
      sendSuccess(res, { assigned: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/roles/users/:userId/:roleId — remove a custom role from a user
router.delete(
  "/users/:userId/:roleId",
  requirePermission("roles:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.userId);
      const roleId = Number(req.params.roleId);
      await unassignRoleFromUser(req.user!.org_id, userId, roleId);
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: "ROLE_UNASSIGNED" as any,
        details: { target_user_id: userId, role_id: roleId },
      });
      sendSuccess(res, { unassigned: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
