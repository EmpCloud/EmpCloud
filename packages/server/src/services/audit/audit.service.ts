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
}): Promise<{ logs: object[]; total: number }> {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.perPage || 20;

  let query = db("audit_logs").where({ organization_id: params.organizationId });
  if (params.action) {
    query = query.where({ action: params.action });
  }

  const [{ count }] = await query.clone().count("* as count");
  const logs = await query
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { logs, total: Number(count) };
}
