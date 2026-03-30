// =============================================================================
// EMP CLOUD — Event Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type { CreateEventInput } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createEvent(
  orgId: number,
  userId: number,
  data: CreateEventInput
) {
  const db = getDB();

  // Validate date range
  if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
    throw new ValidationError("End date cannot be before start date");
  }

  const [id] = await db("company_events").insert({
    organization_id: orgId,
    title: data.title,
    description: data.description || null,
    event_type: data.event_type || "other",
    start_date: new Date(data.start_date),
    end_date: data.end_date ? new Date(data.end_date) : null,
    is_all_day: data.is_all_day || false,
    location: data.location || null,
    virtual_link: data.virtual_link || null,
    target_type: data.target_type || "all",
    target_ids: data.target_ids ? JSON.stringify(data.target_ids) : null,
    max_attendees: data.max_attendees || null,
    is_mandatory: data.is_mandatory || false,
    status: "upcoming",
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("company_events").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List (paginated, filterable)
// ---------------------------------------------------------------------------

export async function listEvents(
  orgId: number,
  params?: {
    page?: number;
    perPage?: number;
    event_type?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("company_events").where({
    "company_events.organization_id": orgId,
  });

  if (params?.event_type) {
    query = query.where("company_events.event_type", params.event_type);
  }
  if (params?.status) {
    query = query.where("company_events.status", params.status);
  }
  if (params?.start_date) {
    query = query.where("company_events.start_date", ">=", params.start_date);
  }
  if (params?.end_date) {
    query = query.where("company_events.start_date", "<=", params.end_date);
  }

  const countQuery = query.clone().count("company_events.id as count");
  const [{ count }] = await countQuery;

  const events = await query
    .clone()
    .select(
      "company_events.*",
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
      )
    )
    .orderBy("company_events.start_date", "asc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Auto-correct status for past events that are still marked as "upcoming"
  const now = new Date();
  const pastUpcomingIds: number[] = [];
  for (const event of events) {
    const endDate = event.end_date ? new Date(event.end_date) : new Date(event.start_date);
    if ((event.status === "upcoming" || event.status === "ongoing") && endDate < now) {
      event.status = "completed";
      pastUpcomingIds.push(event.id);
    }
  }
  // Update the database in the background for stale events
  if (pastUpcomingIds.length > 0) {
    db("company_events")
      .whereIn("id", pastUpcomingIds)
      .update({ status: "completed", updated_at: new Date() })
      .catch(() => {}); // fire-and-forget
  }

  return {
    events,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Get Single Event (with RSVP count)
// ---------------------------------------------------------------------------

export async function getEvent(orgId: number, eventId: number) {
  const db = getDB();

  const event = await db("company_events")
    .where({ id: eventId, organization_id: orgId })
    .select(
      "company_events.*",
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
      ),
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'maybe') as maybe_count`
      ),
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'declined') as declined_count`
      )
    )
    .first();

  if (!event) throw new NotFoundError("Event");

  // Get RSVPs with user info
  const rsvps = await db("event_rsvps")
    .join("users", "event_rsvps.user_id", "users.id")
    .where({ "event_rsvps.event_id": eventId })
    .select(
      "event_rsvps.id",
      "event_rsvps.user_id",
      "event_rsvps.status",
      "event_rsvps.created_at",
      "users.first_name",
      "users.last_name",
      "users.email"
    );

  return { ...event, rsvps };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateEvent(
  orgId: number,
  eventId: number,
  data: Partial<CreateEventInput>
) {
  const db = getDB();

  const existing = await db("company_events")
    .where({ id: eventId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Event");

  const updateData: Record<string, unknown> = { ...data, updated_at: new Date() };
  if (data.start_date) {
    updateData.start_date = new Date(data.start_date);
  }
  if (data.end_date) {
    updateData.end_date = new Date(data.end_date);
  }
  if (data.target_ids !== undefined) {
    updateData.target_ids = data.target_ids ? JSON.stringify(data.target_ids) : null;
  }

  await db("company_events")
    .where({ id: eventId })
    .update(updateData);

  return db("company_events").where({ id: eventId }).first();
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelEvent(
  orgId: number,
  eventId: number
) {
  const db = getDB();

  const existing = await db("company_events")
    .where({ id: eventId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Event");

  await db("company_events")
    .where({ id: eventId })
    .update({ status: "cancelled", updated_at: new Date() });

  return db("company_events").where({ id: eventId }).first();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteEvent(
  orgId: number,
  eventId: number
): Promise<void> {
  const db = getDB();

  const existing = await db("company_events")
    .where({ id: eventId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Event");

  await db("company_events").where({ id: eventId }).del();
}

// ---------------------------------------------------------------------------
// RSVP
// ---------------------------------------------------------------------------

export async function rsvpEvent(
  orgId: number,
  eventId: number,
  userId: number,
  status: "attending" | "maybe" | "declined"
) {
  const db = getDB();

  const event = await db("company_events")
    .where({ id: eventId, organization_id: orgId })
    .first();
  if (!event) throw new NotFoundError("Event");

  if (event.status === "cancelled") {
    throw new Error("Cannot RSVP to a cancelled event");
  }

  // Check max attendees
  if (status === "attending" && event.max_attendees) {
    const [{ count }] = await db("event_rsvps")
      .where({ event_id: eventId, status: "attending" })
      .whereNot({ user_id: userId })
      .count("id as count");

    if (Number(count) >= event.max_attendees) {
      throw new Error("Event has reached maximum attendees");
    }
  }

  // Upsert RSVP
  await db.raw(
    `INSERT INTO event_rsvps (event_id, organization_id, user_id, status, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [eventId, orgId, userId, status, new Date()]
  );

  return db("event_rsvps")
    .where({ event_id: eventId, user_id: userId })
    .first();
}

// ---------------------------------------------------------------------------
// My Events (events user has RSVPd to)
// ---------------------------------------------------------------------------

export async function getMyEvents(orgId: number, userId: number) {
  const db = getDB();

  const events = await db("company_events")
    .join("event_rsvps", "company_events.id", "event_rsvps.event_id")
    .where({
      "company_events.organization_id": orgId,
      "event_rsvps.user_id": userId,
    })
    .whereIn("event_rsvps.status", ["attending", "maybe"])
    .select(
      "company_events.*",
      "event_rsvps.status as rsvp_status",
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = company_events.id AND er.status = 'attending') as attending_count`
      )
    )
    .orderBy("company_events.start_date", "asc");

  return events;
}

// ---------------------------------------------------------------------------
// Upcoming Events (next 10)
// ---------------------------------------------------------------------------

export async function getUpcomingEvents(orgId: number) {
  const db = getDB();

  const events = await db("company_events")
    .where({
      organization_id: orgId,
    })
    .whereIn("status", ["upcoming", "ongoing"])
    .where("start_date", ">=", new Date())
    .select(
      "company_events.*",
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
      )
    )
    .orderBy("start_date", "asc")
    .limit(10);

  return events;
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

export async function getEventDashboard(orgId: number) {
  const db = getDB();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Upcoming count
  const [{ upcoming_count }] = await db("company_events")
    .where({ organization_id: orgId })
    .whereIn("status", ["upcoming", "ongoing"])
    .where("start_date", ">=", now)
    .count("id as upcoming_count");

  // This month count
  const [{ month_count }] = await db("company_events")
    .where({ organization_id: orgId })
    .whereBetween("start_date", [startOfMonth, endOfMonth])
    .count("id as month_count");

  // Total attendees (attending RSVPs for upcoming events)
  const [{ total_attendees }] = await db("event_rsvps")
    .join("company_events", "event_rsvps.event_id", "company_events.id")
    .where({
      "company_events.organization_id": orgId,
      "event_rsvps.status": "attending",
    })
    .whereIn("company_events.status", ["upcoming", "ongoing"])
    .count("event_rsvps.id as total_attendees");

  // Type breakdown
  const typeBreakdown = await db("company_events")
    .where({ organization_id: orgId })
    .whereIn("status", ["upcoming", "ongoing", "completed"])
    .select("event_type")
    .count("id as count")
    .groupBy("event_type")
    .orderBy("count", "desc");

  // Upcoming events list
  const upcoming = await db("company_events")
    .where({ organization_id: orgId })
    .whereIn("status", ["upcoming", "ongoing"])
    .where("start_date", ">=", now)
    .select(
      "company_events.*",
      db.raw(
        `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
      )
    )
    .orderBy("start_date", "asc")
    .limit(5);

  return {
    upcoming_count: Number(upcoming_count),
    month_count: Number(month_count),
    total_attendees: Number(total_attendees),
    type_breakdown: typeBreakdown,
    upcoming_events: upcoming,
  };
}
