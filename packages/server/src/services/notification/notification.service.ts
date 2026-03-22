// =============================================================================
// EMP CLOUD — Notification Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";

export async function createNotification(
  orgId: number,
  userId: number,
  type: string,
  title: string,
  body?: string | null,
  referenceType?: string | null,
  referenceId?: string | null
): Promise<object> {
  const db = getDB();
  const [id] = await db("notifications").insert({
    organization_id: orgId,
    user_id: userId,
    type,
    title,
    body: body || null,
    reference_type: referenceType || null,
    reference_id: referenceId || null,
    is_read: false,
    created_at: new Date(),
  });
  return db("notifications").where({ id }).first();
}

export async function listNotifications(
  orgId: number,
  userId: number,
  params?: { page?: number; perPage?: number; unreadOnly?: boolean }
): Promise<{ notifications: object[]; total: number }> {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("notifications").where({
    organization_id: orgId,
    user_id: userId,
  });

  if (params?.unreadOnly) {
    query = query.where({ is_read: false });
  }

  const [{ count }] = await query.clone().count("* as count");
  const notifications = await query
    .select()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    notifications,
    total: Number(count),
  };
}

export async function markAsRead(
  orgId: number,
  notificationId: number,
  userId: number
): Promise<void> {
  const db = getDB();
  const notification = await db("notifications")
    .where({ id: notificationId, organization_id: orgId, user_id: userId })
    .first();

  if (!notification) throw new NotFoundError("Notification");

  await db("notifications")
    .where({ id: notificationId })
    .update({ is_read: true, read_at: new Date() });
}

export async function markAllAsRead(orgId: number, userId: number): Promise<{ count: number }> {
  const db = getDB();
  const count = await db("notifications")
    .where({ organization_id: orgId, user_id: userId, is_read: false })
    .update({ is_read: true, read_at: new Date() });

  return { count };
}

export async function getUnreadCount(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  const [{ count }] = await db("notifications")
    .where({ organization_id: orgId, user_id: userId, is_read: false })
    .count("* as count");

  return Number(count);
}
