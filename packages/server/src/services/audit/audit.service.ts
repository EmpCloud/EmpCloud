// =============================================================================
// EMP CLOUD — Audit Service
// Logs all security-relevant events for SOC 2 compliance.
// =============================================================================

import { getDB } from "../../db/connection.js";
import type { AuditAction } from "@empcloud/shared";

export async function logAudit(params: {
  organizationId?: number | null;
  userId?: number | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: object;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = getDB();
  await db("audit_logs").insert({
    organization_id: params.organizationId ?? null,
    user_id: params.userId ?? null,
    action: params.action,
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
    details: params.details ? JSON.stringify(params.details) : null,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
    created_at: new Date(),
  });
}

export async function getAuditLogs(params: {
  organizationId: number;
  page?: number;
  perPage?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ logs: object[]; total: number }> {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.perPage || 20;

  let query = db("audit_logs").where({ "audit_logs.organization_id": params.organizationId });
  if (params.action) {
    query = query.where({ "audit_logs.action": params.action });
  }
  if (params.startDate) {
    query = query.where("audit_logs.created_at", ">=", params.startDate);
  }
  if (params.endDate) {
    // End date is inclusive — add 1 day so it includes the full end day
    const nextDay = new Date(params.endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query = query.where("audit_logs.created_at", "<", nextDay.toISOString().slice(0, 10));
  }

  const [{ count }] = await query.clone().count("* as count");
  const logs = await query
    .clone()
    .select(
      "audit_logs.*",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.email as user_email"
    )
    .leftJoin("users", "audit_logs.user_id", "users.id")
    .orderBy("audit_logs.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { logs, total: Number(count) };
}
