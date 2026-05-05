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
    // Fallback: any direct report (primary OR additional manager assignment)
    // makes the requester a functional manager.
    try {
      const db = getDB();
      const primary = await db("users")
        .where({ reporting_manager_id: req.user.sub, organization_id: req.user.org_id })
        .select("id")
        .first();
      if (primary) {
        next();
        return;
      }
      // Check the additional-managers junction (matrix / co-manager rows).
      const additional = await db("user_additional_managers as uam")
        .join("users", "users.id", "uam.user_id")
        .where("uam.manager_id", req.user.sub)
        .andWhere("users.organization_id", req.user.org_id)
        .select("uam.id")
        .first();
      if (additional) {
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
 * Permission-based access control (RBAC v1).
 * Checks the `permissions` claim on the verified JWT (set during issueTokens).
 *
 * Use these in preference to requireRole / requireOrgAdmin for new routes —
 * they support custom roles created by org admins, not just the 4 system roles.
 *
 * Example:
 *   router.get("/", authenticate, requirePermission("attendance:view_all"), handler);
 *   router.post("/", authenticate, requireAllPermissions("salary:edit", "salary:approve_changes"), handler);
 */
export function requirePermission(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    const granted = (req.user as any).permissions as string[] | undefined;
    // super_admin bypasses permission checks — they're a platform-level role
    // that operates across orgs and isn't part of the per-org RBAC system.
    if (req.user.role === "super_admin") {
      next();
      return;
    }
    if (!granted || granted.length === 0) {
      sendError(
        res,
        403,
        "FORBIDDEN",
        `This action requires one of: ${required.join(", ")}`,
      );
      return;
    }
    if (required.some((p) => granted.includes(p))) {
      next();
      return;
    }
    sendError(
      res,
      403,
      "FORBIDDEN",
      `This action requires one of: ${required.join(", ")}`,
    );
  };
}

/** Same as requirePermission but the user must have ALL listed permissions. */
export function requireAllPermissions(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    if (req.user.role === "super_admin") {
      next();
      return;
    }
    const granted = (req.user as any).permissions as string[] | undefined;
    if (!granted || !required.every((p) => granted.includes(p))) {
      const missing = required.filter((p) => !granted?.includes(p));
      sendError(
        res,
        403,
        "FORBIDDEN",
        `This action requires all of: ${required.join(", ")} (missing: ${missing.join(", ")})`,
      );
      return;
    }
    next();
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
