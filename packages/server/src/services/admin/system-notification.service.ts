// =============================================================================
// EMP CLOUD — System Notification Service
// Platform-wide announcements (maintenance windows, feature releases, etc.)
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Create system notification
// ---------------------------------------------------------------------------

export async function createSystemNotification(params: {
  title: string;
  message: string;
  target_type: "all" | "org";
  target_org_id?: number | null;
  notification_type?: string;
  created_by: number;
  scheduled_at?: string | null;
  expires_at?: string | null;
}) {
  const db = getDB();

  const [id] = await db("system_notifications").insert({
    title: params.title,
    message: params.message,
    target_type: params.target_type,
    target_org_id: params.target_org_id || null,
    notification_type: params.notification_type || "info",
    created_by: params.created_by,
    is_active: true,
    scheduled_at: params.scheduled_at || null,
    expires_at: params.expires_at || null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // If target_type is 'all', push notifications to all users across all orgs
  // If 'org', push only to users in the target org
  try {
    let users: Array<{ id: number; organization_id: number }> = [];
    if (params.target_type === "all") {
      users = await db("users")
        .where({ status: 1 })
        .select("id", "organization_id");
    } else if (params.target_type === "org" && params.target_org_id) {
      users = await db("users")
        .where({ organization_id: params.target_org_id, status: 1 })
        .select("id", "organization_id");
    }

    // Insert user notifications in batches
    if (users.length > 0) {
      const notifRows = users.map((u: any) => ({
        organization_id: u.organization_id,
        user_id: u.id,
        type: "system",
        title: params.title,
        body: params.message,
        reference_type: "system_notification",
        reference_id: String(id),
        is_read: false,
        created_at: new Date(),
      }));

      for (let i = 0; i < notifRows.length; i += 500) {
        await db("notifications").insert(notifRows.slice(i, i + 500));
      }
    }

    logger.info(`System notification #${id} sent to ${users.length} users`);
  } catch (err) {
    logger.error("Failed to broadcast system notification to users", err);
  }

  return db("system_notifications").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List system notifications
// ---------------------------------------------------------------------------

export async function listSystemNotifications(params?: {
  page?: number;
  perPage?: number;
  activeOnly?: boolean;
}) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("system_notifications")
    .leftJoin("users", "system_notifications.created_by", "users.id")
    .leftJoin("organizations", "system_notifications.target_org_id", "organizations.id");

  if (params?.activeOnly) {
    query = query.where({ "system_notifications.is_active": true });
  }

  const countQuery = db("system_notifications");
  if (params?.activeOnly) {
    countQuery.where({ is_active: true });
  }

  const [{ count }] = await countQuery.count("id as count");

  const notifications = await query
    .select(
      "system_notifications.*",
      db.raw("CONCAT(users.first_name, ' ', users.last_name) as created_by_name"),
      "organizations.name as target_org_name"
    )
    .orderBy("system_notifications.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    notifications,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Deactivate system notification
// ---------------------------------------------------------------------------

export async function deactivateSystemNotification(id: number) {
  const db = getDB();
  const notification = await db("system_notifications").where({ id }).first();
  if (!notification) throw new NotFoundError("System notification");

  await db("system_notifications")
    .where({ id })
    .update({ is_active: false, updated_at: new Date() });

  return { message: "Notification deactivated" };
}
