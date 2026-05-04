// =============================================================================
// EMP CLOUD — RBAC Middleware
// Role-based access control using role hierarchy.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { sendError } from "../../utils/response.js";
import { ROLE_HIERARCHY } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { getDB } from "../../db/connection.js";

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
export const requireOrgAdmin = requireRole("org_admin" as UserRole, "super_admin" as UserRole, "hr_admin" as UserRole);

/**
 * Require super admin.
 */
export const requireSuperAdmin = requireRole("super_admin" as UserRole);

/**
 * Require HR Admin or higher.
 */
export const requireHR = requireRole("hr_admin" as UserRole);

/**
 * Allow access if user's role >= manager OR they functionally manage at least
 * one direct report (someone in users.reporting_manager_id = req.user.sub).
 *
 * Why: many orgs leave the role at "employee" but assign direct reports
 * via reporting_manager_id. The plain requireRole("manager") gate then
 * 403's the manager dashboard for those users even though they should
 * see their team. This widens access to the functional-manager case
 * without changing role data.
 */
export function requireManagerOrHasReports() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const managerLevel = ROLE_HIERARCHY["manager" as UserRole] ?? 20;
    if (userRoleLevel >= managerLevel) {
      next();
      return;
    }
    // Fallback: any direct report makes the requester a functional manager.
    try {
      const db = getDB();
      const row = await db("users")
        .where({ reporting_manager_id: req.user.sub, organization_id: req.user.org_id })
        .select("id")
        .first();
      if (row) {
        next();
        return;
      }
    } catch {
      // Fall through to 403 — never leak DB errors as auth bypasses.
    }
    sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
  };
}

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

    const targetUserId = parseInt(String(req.params[paramName]), 10);
    const isSelf = req.user.sub === targetUserId;
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const hrLevel = ROLE_HIERARCHY["hr_admin" as UserRole] ?? 60;

    if (isSelf || userRoleLevel >= hrLevel) {
      next();
      return;
    }

    sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
  };
}
