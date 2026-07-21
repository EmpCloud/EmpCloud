import { getDB } from "../../db/connection.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import type { AccessTokenPayload } from "@empcloud/shared";

export interface AssistantContext {
  orgId: number;
  userId: number;
  role: string;
  permissions: Set<string>;
}

export function createAssistantContext(user: AccessTokenPayload): AssistantContext {
  return {
    orgId: user.org_id,
    userId: user.sub,
    role: user.role,
    permissions: new Set((user as AccessTokenPayload & { permissions?: string[] }).permissions || []),
  };
}

export function hasPermission(ctx: AssistantContext, permission: string): boolean {
  return ctx.role === "super_admin" || ctx.permissions.has(permission);
}

export async function getTeamUserIds(ctx: AssistantContext): Promise<number[]> {
  const db = getDB();
  const [primary, additional] = await Promise.all([
    db("users").where({ organization_id: ctx.orgId, reporting_manager_id: ctx.userId, status: 1 }).pluck("id"),
    db("user_additional_managers as uam")
      .join("users as u", "u.id", "uam.user_id")
      .where({ "uam.manager_id": ctx.userId, "u.organization_id": ctx.orgId, "u.status": 1 })
      .pluck("u.id"),
  ]);
  return [...new Set([...primary, ...additional].map(Number))];
}

export async function assertTargetAccess(
  ctx: AssistantContext,
  targetUserId: number,
  ownPermission: string,
  teamPermission: string | null,
  allPermission: string,
): Promise<"own" | "team" | "all"> {
  const user = await getDB()("users").where({ id: targetUserId, organization_id: ctx.orgId, status: 1 }).first("id");
  if (!user) throw new NotFoundError("Employee");
  if (targetUserId === ctx.userId && hasPermission(ctx, ownPermission)) return "own";
  if (hasPermission(ctx, allPermission)) return "all";
  if (teamPermission && hasPermission(ctx, teamPermission)) {
    const team = await getTeamUserIds(ctx);
    if (team.includes(targetUserId)) return "team";
  }
  throw new ForbiddenError("You do not have permission to view this employee's data");
}

export async function visibleEmployeeIds(ctx: AssistantContext): Promise<number[] | null> {
  if (hasPermission(ctx, "employees:view_all")) return null;
  if (hasPermission(ctx, "employees:view_team")) return [ctx.userId, ...(await getTeamUserIds(ctx))];
  if (hasPermission(ctx, "employees:view")) return [ctx.userId];
  throw new ForbiddenError("Employee visibility permission is required");
}

export async function resolveMonitorScope(
  ctx: AssistantContext,
  scope: "own" | "team" | "organization",
  employeeId?: number,
): Promise<{ employeeIds?: number[]; employeeId?: number }> {
  if (scope === "organization") {
    if (!hasPermission(ctx, "monitor:view_all")) throw new ForbiddenError("monitor:view_all is required");
    return {};
  }
  if (scope === "team") {
    if (!hasPermission(ctx, "monitor:view_team") && !hasPermission(ctx, "monitor:view_all")) {
      throw new ForbiddenError("monitor:view_team is required");
    }
    const employeeIds = await getTeamUserIds(ctx);
    if (employeeIds.length === 0) throw new ValidationError("No direct reports are available for team scope");
    return { employeeIds };
  }
  const target = employeeId || ctx.userId;
  await assertTargetAccess(ctx, target, "monitor:view_own", "monitor:view_team", "monitor:view_all");
  return { employeeId: target };
}
