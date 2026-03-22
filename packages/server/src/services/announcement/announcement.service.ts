// =============================================================================
// EMP CLOUD — Announcement Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError } from "../../utils/errors.js";
import type { CreateAnnouncementInput } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  orgId: number,
  createdBy: number,
  data: CreateAnnouncementInput
) {
  const db = getDB();

  const [id] = await db("announcements").insert({
    organization_id: orgId,
    title: data.title,
    content: data.content,
    priority: data.priority || "normal",
    target_type: data.target_type || "all",
    target_ids: data.target_ids || null,
    published_at: data.published_at || new Date(),
    expires_at: data.expires_at || null,
    created_by: createdBy,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("announcements").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List (with target filtering + read status)
// ---------------------------------------------------------------------------

export async function listAnnouncements(
  orgId: number,
  userId: number,
  params?: {
    page?: number;
    perPage?: number;
    userRole?: string;
    userDepartmentId?: number | null;
  }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("announcements")
    .where({ "announcements.organization_id": orgId, "announcements.is_active": true })
    .where(function () {
      this.whereNull("announcements.published_at").orWhere(
        "announcements.published_at",
        "<=",
        new Date()
      );
    })
    .where(function () {
      this.whereNull("announcements.expires_at").orWhere(
        "announcements.expires_at",
        ">",
        new Date()
      );
    });

  // Target filtering: show announcements targeted to this user
  if (params?.userRole || params?.userDepartmentId) {
    query = query.where(function () {
      // "all" targets are always visible
      this.where("announcements.target_type", "all");

      // Department-targeted announcements
      if (params?.userDepartmentId) {
        this.orWhere(function () {
          this.where("announcements.target_type", "department").whereRaw(
            "JSON_CONTAINS(announcements.target_ids, ?)",
            [JSON.stringify(String(params.userDepartmentId))]
          );
        });
      }

      // Role-targeted announcements
      if (params?.userRole) {
        this.orWhere(function () {
          this.where("announcements.target_type", "role").whereRaw(
            "JSON_CONTAINS(announcements.target_ids, ?)",
            [JSON.stringify(params.userRole)]
          );
        });
      }
    });
  }

  const countQuery = query.clone().count("announcements.id as count");
  const [{ count }] = await countQuery;

  const announcements = await query
    .clone()
    .select(
      "announcements.*",
      db.raw(
        `(SELECT read_at FROM announcement_reads WHERE announcement_reads.announcement_id = announcements.id AND announcement_reads.user_id = ?) as read_at`,
        [userId]
      )
    )
    .orderByRaw(
      `FIELD(announcements.priority, 'urgent', 'high', 'normal', 'low')`
    )
    .orderBy("announcements.published_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    announcements,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateAnnouncement(
  orgId: number,
  announcementId: number,
  data: Partial<CreateAnnouncementInput>
) {
  const db = getDB();

  const existing = await db("announcements")
    .where({ id: announcementId, organization_id: orgId, is_active: true })
    .first();
  if (!existing) throw new NotFoundError("Announcement");

  await db("announcements")
    .where({ id: announcementId })
    .update({ ...data, updated_at: new Date() });

  return db("announcements").where({ id: announcementId }).first();
}

// ---------------------------------------------------------------------------
// Soft Delete
// ---------------------------------------------------------------------------

export async function deleteAnnouncement(
  orgId: number,
  announcementId: number
): Promise<void> {
  const db = getDB();

  const existing = await db("announcements")
    .where({ id: announcementId, organization_id: orgId, is_active: true })
    .first();
  if (!existing) throw new NotFoundError("Announcement");

  await db("announcements")
    .where({ id: announcementId })
    .update({ is_active: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Mark as Read
// ---------------------------------------------------------------------------

export async function markAsRead(
  announcementId: number,
  userId: number,
  orgId: number
): Promise<void> {
  const db = getDB();

  const existing = await db("announcements")
    .where({ id: announcementId, organization_id: orgId, is_active: true })
    .first();
  if (!existing) throw new NotFoundError("Announcement");

  // Upsert — ignore duplicate
  await db.raw(
    `INSERT IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)`,
    [announcementId, userId, new Date()]
  );
}

// ---------------------------------------------------------------------------
// Read Status
// ---------------------------------------------------------------------------

export async function getReadStatus(
  announcementId: number,
  orgId: number
) {
  const db = getDB();

  const existing = await db("announcements")
    .where({ id: announcementId, organization_id: orgId, is_active: true })
    .first();
  if (!existing) throw new NotFoundError("Announcement");

  const reads = await db("announcement_reads")
    .join("users", "announcement_reads.user_id", "users.id")
    .where({ "announcement_reads.announcement_id": announcementId })
    .select(
      "announcement_reads.user_id",
      "announcement_reads.read_at",
      "users.first_name",
      "users.last_name",
      "users.email"
    );

  return reads;
}

// ---------------------------------------------------------------------------
// Unread Count
// ---------------------------------------------------------------------------

export async function getUnreadCount(
  orgId: number,
  userId: number,
  userRole?: string,
  userDepartmentId?: number | null
): Promise<number> {
  const db = getDB();

  let query = db("announcements")
    .where({ "announcements.organization_id": orgId, "announcements.is_active": true })
    .where(function () {
      this.whereNull("announcements.published_at").orWhere(
        "announcements.published_at",
        "<=",
        new Date()
      );
    })
    .where(function () {
      this.whereNull("announcements.expires_at").orWhere(
        "announcements.expires_at",
        ">",
        new Date()
      );
    })
    .whereNotExists(function () {
      this.select(db.raw(1))
        .from("announcement_reads")
        .whereRaw("announcement_reads.announcement_id = announcements.id")
        .where("announcement_reads.user_id", userId);
    });

  // Target filtering
  if (userRole || userDepartmentId) {
    query = query.where(function () {
      this.where("announcements.target_type", "all");

      if (userDepartmentId) {
        this.orWhere(function () {
          this.where("announcements.target_type", "department").whereRaw(
            "JSON_CONTAINS(announcements.target_ids, ?)",
            [JSON.stringify(String(userDepartmentId))]
          );
        });
      }

      if (userRole) {
        this.orWhere(function () {
          this.where("announcements.target_type", "role").whereRaw(
            "JSON_CONTAINS(announcements.target_ids, ?)",
            [JSON.stringify(userRole)]
          );
        });
      }
    });
  }

  const [{ count }] = await query.count("announcements.id as count");
  return Number(count);
}
