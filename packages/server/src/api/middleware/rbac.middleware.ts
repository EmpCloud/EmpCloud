// =============================================================================
// EMP CLOUD — RBAC Middleware
// Role-based access control using role hierarchy.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { sendError } from "../../utils/response.js";
import { ROLE_HIERARCHY } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";

/**
 * Require minimum role level. Must be used after authenticate middleware.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }

    const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const hasAccess = allowedRoles.some(
      (role) => userRoleLevel >= (ROLE_HIERARCHY[role] ?? 0)
    );

    if (!hasAccess) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }

    next();
  };
}

/**
 * Require org admin or higher.
 */
export const requireOrgAdmin = requireRole("org_admin" as UserRole, "super_admin" as UserRole);

/**
 * Require super admin.
 */
export const requireSuperAdmin = requireRole("super_admin" as UserRole);

/**
 * Require HR Admin or HR Manager (or higher).
 */
export const requireHR = requireRole("hr_admin" as UserRole, "hr_manager" as UserRole);

/**
 * Allow access if user is accessing their own resource OR has HR role.
 * paramName is the route param containing the user ID to compare against.
 */
export function requireSelfOrHR(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }

    const targetUserId = parseInt(req.params[paramName], 10);
    const isSelf = req.user.sub === targetUserId;
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const hrLevel = ROLE_HIERARCHY["hr_manager" as UserRole] ?? 40;

    if (isSelf || userRoleLevel >= hrLevel) {
      next();
      return;
    }

    sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
  };
}
