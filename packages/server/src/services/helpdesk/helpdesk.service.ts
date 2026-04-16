// =============================================================================
// EMP CLOUD — Helpdesk / Case Management Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { createNotification } from "../notification/notification.service.js";

// ---------------------------------------------------------------------------
// SLA Configuration by Priority
// ---------------------------------------------------------------------------

const SLA_CONFIG: Record<string, { responseHours: number; resolutionHours: number }> = {
  low: { responseHours: 48, resolutionHours: 120 },
  medium: { responseHours: 24, resolutionHours: 72 },
  high: { responseHours: 8, resolutionHours: 24 },
  urgent: { responseHours: 2, resolutionHours: 8 },
};

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Create Ticket
// ---------------------------------------------------------------------------

export async function createTicket(
  orgId: number,
  userId: number,
  data: {
    category: string;
    priority?: string;
    subject: string;
    description: string;
    department_id?: number | null;
    tags?: string[] | null;
  }
) {
  const db = getDB();
  const priority = data.priority || "medium";
  const sla = SLA_CONFIG[priority] || SLA_CONFIG.medium;
  const now = new Date();

  const [id] = await db("helpdesk_tickets").insert({
    organization_id: orgId,
    raised_by: userId,
    category: data.category,
    priority,
    subject: data.subject,
    description: data.description,
    status: "open",
    assigned_to: null,
    department_id: data.department_id || null,
    sla_response_hours: sla.responseHours,
    sla_resolution_hours: sla.resolutionHours,
    sla_response_due: addHours(now, sla.responseHours),
    sla_resolution_due: addHours(now, sla.resolutionHours),
    tags: data.tags ? JSON.stringify(data.tags) : null,
    created_at: now,
    updated_at: now,
  });

  logger.info(`Helpdesk ticket #${id} created by user ${userId} in org ${orgId}`);
  return db("helpdesk_tickets").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Tickets (HR view — all tickets for the org)
// ---------------------------------------------------------------------------

export async function listTickets(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
    category?: string;
    priority?: string;
    assigned_to?: number;
    raised_by?: number;
    search?: string;
    resolved_date?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("helpdesk_tickets")
    .where({ "helpdesk_tickets.organization_id": orgId });

  // #1430 — "Resolved on X" filter. Matches the dashboard's resolved_today
  // count so the list after clicking the stat card shows the same tickets,
  // regardless of whether they've since been closed or reopened.
  if (filters?.resolved_date) {
    let start: Date;
    if (filters.resolved_date === "today") {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(filters.resolved_date);
      if (isNaN(start.getTime())) {
        start = new Date();
        start.setHours(0, 0, 0, 0);
      } else {
        start.setHours(0, 0, 0, 0);
      }
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query = query
      .whereNotNull("helpdesk_tickets.resolved_at")
      .where("helpdesk_tickets.resolved_at", ">=", start)
      .where("helpdesk_tickets.resolved_at", "<", end);
  }

  // #1376 — Dashboard's "open ticket" count aggregates 4 statuses. When the
  // client filters by status=open, return the same set so the counts align.
  if (filters?.status === "open") {
    query = query.whereIn("helpdesk_tickets.status", [
      "open",
      "in_progress",
      "awaiting_response",
      "reopened",
    ]);
  } else if (filters?.status) {
    query = query.where("helpdesk_tickets.status", filters.status);
  }
  if (filters?.category) query = query.where("helpdesk_tickets.category", filters.category);
  if (filters?.priority) query = query.where("helpdesk_tickets.priority", filters.priority);
  if (filters?.assigned_to) query = query.where("helpdesk_tickets.assigned_to", filters.assigned_to);
  if (filters?.raised_by) query = query.where("helpdesk_tickets.raised_by", filters.raised_by);
  if (filters?.search) {
    // #1377 — Support ticket ID search (numeric) alongside subject/description
    const isNumeric = /^\d+$/.test(filters.search);
    const searchTerm = filters.search;
    query = query.where(function () {
      if (isNumeric) {
        this.where("helpdesk_tickets.id", searchTerm);
      }
      this.orWhere("helpdesk_tickets.subject", "like", `%${searchTerm}%`)
        .orWhere("helpdesk_tickets.description", "like", `%${searchTerm}%`);
    });
  }

  const [{ count }] = await query.clone().count("helpdesk_tickets.id as count");

  const tickets = await query
    .clone()
    .select(
      "helpdesk_tickets.*",
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = helpdesk_tickets.raised_by) as raised_by_name`
      ),
      db.raw(
        `(SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM users u2 WHERE u2.id = helpdesk_tickets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("helpdesk_tickets.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { tickets, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Get Single Ticket (with comments)
// ---------------------------------------------------------------------------

export async function getTicket(
  orgId: number,
  ticketId: number,
  userId?: number,
  isHR?: boolean
) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .select(
      "helpdesk_tickets.*",
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = helpdesk_tickets.raised_by) as raised_by_name`
      ),
      db.raw(
        `(SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM users u2 WHERE u2.id = helpdesk_tickets.assigned_to) as assigned_to_name`
      )
    )
    .first();

  if (!ticket) throw new NotFoundError("Ticket");

  // Non-HR users can only view their own tickets
  if (!isHR && userId && ticket.raised_by !== userId) {
    throw new ForbiddenError("You can only view your own tickets");
  }

  let commentsQuery = db("ticket_comments")
    .where({ ticket_id: ticketId, "ticket_comments.organization_id": orgId })
    .join("users", "ticket_comments.user_id", "users.id")
    .select(
      "ticket_comments.*",
      "users.first_name",
      "users.last_name"
    )
    .orderBy("ticket_comments.created_at", "asc");

  // Filter out internal comments for non-HR users
  if (!isHR) {
    commentsQuery = commentsQuery.where("ticket_comments.is_internal", false);
  }

  const comments = await commentsQuery;

  return { ...ticket, comments };
}

// ---------------------------------------------------------------------------
// Update Ticket
// ---------------------------------------------------------------------------

export async function updateTicket(
  orgId: number,
  ticketId: number,
  data: {
    category?: string;
    priority?: string;
    status?: string;
    assigned_to?: number | null;
    department_id?: number | null;
    tags?: string[] | null;
  }
) {
  const db = getDB();

  const existing = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Ticket");

  const updateData: Record<string, any> = { updated_at: new Date() };

  if (data.category !== undefined) updateData.category = data.category;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
  if (data.department_id !== undefined) updateData.department_id = data.department_id;
  if (data.tags !== undefined) updateData.tags = data.tags ? JSON.stringify(data.tags) : null;

  // If priority changes, recalculate SLA
  if (data.priority !== undefined && data.priority !== existing.priority) {
    const sla = SLA_CONFIG[data.priority] || SLA_CONFIG.medium;
    updateData.priority = data.priority;
    updateData.sla_response_hours = sla.responseHours;
    updateData.sla_resolution_hours = sla.resolutionHours;
    // Recalculate from ticket creation time
    const createdAt = new Date(existing.created_at);
    updateData.sla_response_due = addHours(createdAt, sla.responseHours);
    updateData.sla_resolution_due = addHours(createdAt, sla.resolutionHours);
  }

  await db("helpdesk_tickets").where({ id: ticketId }).update(updateData);

  // Notify ticket creator when status changes
  if (data.status !== undefined && data.status !== existing.status) {
    try {
      await createNotification(
        orgId,
        existing.raised_by,
        "helpdesk_update",
        `Ticket Updated: ${existing.subject}`,
        `Your helpdesk ticket #${ticketId} status changed from "${existing.status}" to "${data.status}".`,
        "helpdesk_ticket",
        String(ticketId),
      );
    } catch (err) {
      logger.warn(`Failed to create notification for ticket #${ticketId} status change`, err);
    }
  }

  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Assign Ticket
// ---------------------------------------------------------------------------

export async function assignTicket(orgId: number, ticketId: number, assignedTo: number) {
  const db = getDB();

  const existing = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Ticket");

  // Verify assignee exists in the same org
  const assignee = await db("users").where({ id: assignedTo, organization_id: orgId, status: 1 }).first();
  if (!assignee) throw new NotFoundError("Assignee user not found in this organization");

  const updateData: Record<string, any> = {
    assigned_to: assignedTo,
    updated_at: new Date(),
  };

  // If ticket is open, move it to in_progress on assignment
  if (existing.status === "open" || existing.status === "reopened") {
    updateData.status = "in_progress";
  }

  await db("helpdesk_tickets").where({ id: ticketId }).update(updateData);

  // Notify ticket creator about assignment
  try {
    await createNotification(
      orgId,
      existing.raised_by,
      "helpdesk_update",
      `Ticket Assigned: ${existing.subject}`,
      `Your helpdesk ticket #${ticketId} has been assigned to ${assignee.first_name} ${assignee.last_name}.`,
      "helpdesk_ticket",
      String(ticketId),
    );
  } catch (err) {
    logger.warn(`Failed to create notification for ticket #${ticketId} assignment`, err);
  }

  logger.info(`Ticket #${ticketId} assigned to user ${assignedTo} in org ${orgId}`);
  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Add Comment
// ---------------------------------------------------------------------------

export async function addComment(
  orgId: number,
  ticketId: number,
  userId: number,
  comment: string,
  isInternal: boolean = false,
  attachments?: string[] | null
) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!ticket) throw new NotFoundError("Ticket");

  const now = new Date();

  const [commentId] = await db("ticket_comments").insert({
    ticket_id: ticketId,
    organization_id: orgId,
    user_id: userId,
    comment,
    is_internal: isInternal,
    attachments: attachments ? JSON.stringify(attachments) : null,
    created_at: now,
    updated_at: now,
  });

  // Track first response time if this is an HR response (not the ticket raiser)
  if (userId !== ticket.raised_by && !ticket.first_response_at) {
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({ first_response_at: now, updated_at: now });
  }

  // If the ticket is awaiting_response and the raiser responds, move to in_progress
  if (ticket.status === "awaiting_response" && userId === ticket.raised_by) {
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({ status: "in_progress", updated_at: now });
  }

  return db("ticket_comments")
    .where({ "ticket_comments.id": commentId })
    .join("users", "ticket_comments.user_id", "users.id")
    .select("ticket_comments.*", "users.first_name", "users.last_name")
    .first();
}

// ---------------------------------------------------------------------------
// Resolve Ticket
// ---------------------------------------------------------------------------

export async function resolveTicket(orgId: number, ticketId: number, userId: number) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!ticket) throw new NotFoundError("Ticket");

  if (ticket.status === "closed" || ticket.status === "resolved") {
    throw new ForbiddenError("Ticket is already resolved or closed");
  }

  const now = new Date();
  await db("helpdesk_tickets")
    .where({ id: ticketId })
    .update({
      status: "resolved",
      resolved_at: now,
      updated_at: now,
    });

  // Notify ticket creator about resolution
  try {
    await createNotification(
      orgId,
      ticket.raised_by,
      "helpdesk_update",
      `Ticket Resolved: ${ticket.subject}`,
      `Your helpdesk ticket #${ticketId} has been resolved.`,
      "helpdesk_ticket",
      String(ticketId),
    );
  } catch (err) {
    logger.warn(`Failed to create notification for ticket #${ticketId} resolution`, err);
  }

  logger.info(`Ticket #${ticketId} resolved by user ${userId} in org ${orgId}`);
  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Close Ticket
// ---------------------------------------------------------------------------

export async function closeTicket(
  orgId: number,
  ticketId: number,
  userId?: number,
  isHR?: boolean,
) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!ticket) throw new NotFoundError("Ticket");

  // #1452 — Only HR or the ticket creator may close a ticket. When called
  // without a user context (legacy/internal calls) the check is skipped to
  // preserve backwards compatibility.
  if (userId !== undefined && !isHR && ticket.raised_by !== userId) {
    throw new ForbiddenError("You can only close your own tickets");
  }

  // #1385 — Block closing already-closed tickets
  if (ticket.status === "closed") {
    throw new ValidationError("Ticket is already closed");
  }

  // #1380 — Require ticket to be resolved before closing
  if (ticket.status !== "resolved") {
    throw new ValidationError("Ticket must be resolved before closing");
  }

  // #979 — Require at least one resolution comment before closing
  const [{ count }] = await db("ticket_comments")
    .where({ ticket_id: ticketId, organization_id: orgId })
    .count("id as count");
  if (Number(count) === 0) {
    throw new ValidationError("A resolution comment is required to close this ticket");
  }

  const now = new Date();
  const updateData: Record<string, any> = {
    status: "closed",
    closed_at: now,
    updated_at: now,
  };

  // If not yet resolved, mark resolved_at as well
  if (!ticket.resolved_at) {
    updateData.resolved_at = now;
  }

  await db("helpdesk_tickets").where({ id: ticketId }).update(updateData);

  // Notify ticket creator about closure
  try {
    await createNotification(
      orgId,
      ticket.raised_by,
      "helpdesk_update",
      `Ticket Closed: ${ticket.subject}`,
      `Your helpdesk ticket #${ticketId} has been closed.`,
      "helpdesk_ticket",
      String(ticketId),
    );
  } catch (err) {
    logger.warn(`Failed to create notification for ticket #${ticketId} closure`, err);
  }

  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Reopen Ticket
// ---------------------------------------------------------------------------

export async function reopenTicket(orgId: number, ticketId: number) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!ticket) throw new NotFoundError("Ticket");

  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    throw new ForbiddenError("Only resolved or closed tickets can be reopened");
  }

  await db("helpdesk_tickets")
    .where({ id: ticketId })
    .update({
      status: "reopened",
      resolved_at: null,
      closed_at: null,
      satisfaction_rating: null,
      satisfaction_comment: null,
      updated_at: new Date(),
    });

  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Rate Ticket (Satisfaction)
// ---------------------------------------------------------------------------

export async function rateTicket(
  orgId: number,
  ticketId: number,
  rating: number,
  comment?: string | null
) {
  const db = getDB();

  const ticket = await db("helpdesk_tickets")
    .where({ id: ticketId, organization_id: orgId })
    .first();
  if (!ticket) throw new NotFoundError("Ticket");

  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    throw new ForbiddenError("Can only rate resolved or closed tickets");
  }

  await db("helpdesk_tickets")
    .where({ id: ticketId })
    .update({
      satisfaction_rating: rating,
      satisfaction_comment: comment || null,
      updated_at: new Date(),
    });

  return db("helpdesk_tickets").where({ id: ticketId }).first();
}

// ---------------------------------------------------------------------------
// Get My Tickets (Employee view)
// ---------------------------------------------------------------------------

export async function getMyTickets(
  orgId: number,
  userId: number,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
    category?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("helpdesk_tickets")
    .where({ organization_id: orgId, raised_by: userId });

  if (filters?.status) query = query.where("status", filters.status);
  if (filters?.category) query = query.where("category", filters.category);

  const [{ count }] = await query.clone().count("id as count");

  const tickets = await query
    .clone()
    .select(
      "helpdesk_tickets.*",
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = helpdesk_tickets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("helpdesk_tickets.id", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { tickets, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Dashboard Stats (HR view)
// ---------------------------------------------------------------------------

export async function getHelpdeskDashboard(orgId: number) {
  const db = getDB();
  const now = new Date();

  // Status counts
  const statusCounts = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .select("status")
    .count("id as count")
    .groupBy("status");

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = Number(row.count);
  }

  // Overdue tickets (SLA breached — still open and past resolution due)
  const [{ count: overdueCount }] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .whereIn("status", ["open", "in_progress", "awaiting_response", "reopened"])
    .where("sla_resolution_due", "<", now)
    .count("id as count");

  // Resolved today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [{ count: resolvedToday }] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .where("resolved_at", ">=", todayStart)
    .count("id as count");

  // SLA compliance: resolved tickets where resolved_at <= sla_resolution_due
  const [{ count: totalResolved }] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .whereNotNull("resolved_at")
    .count("id as count");

  const [{ count: withinSLA }] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .whereNotNull("resolved_at")
    .whereRaw("resolved_at <= sla_resolution_due")
    .count("id as count");

  const slaCompliance =
    Number(totalResolved) > 0
      ? Math.round((Number(withinSLA) / Number(totalResolved)) * 100)
      : 100;

  // Average resolution time (in hours)
  const [avgResult] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .whereNotNull("resolved_at")
    .select(
      db.raw(
        "AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours"
      )
    );
  const avgResolutionHours = avgResult?.avg_hours
    ? Math.round(Number(avgResult.avg_hours))
    : 0;

  // Category breakdown
  const categoryBreakdown = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .select("category")
    .count("id as count")
    .groupBy("category")
    .orderBy("count", "desc");

  // Recent tickets
  const recentTickets = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .select(
      "helpdesk_tickets.*",
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = helpdesk_tickets.raised_by) as raised_by_name`
      ),
      db.raw(
        `(SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM users u2 WHERE u2.id = helpdesk_tickets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("created_at", "desc")
    .limit(10);

  // Average satisfaction rating
  const [satResult] = await db("helpdesk_tickets")
    .where({ organization_id: orgId })
    .whereNotNull("satisfaction_rating")
    .select(db.raw("AVG(satisfaction_rating) as avg_rating, COUNT(*) as rated_count"));

  // Total open = all non-resolved, non-closed statuses
  const totalOpen = (statusMap.open || 0) +
    (statusMap.in_progress || 0) +
    (statusMap.awaiting_response || 0) +
    (statusMap.reopened || 0);

  return {
    total_open: totalOpen,
    open: statusMap.open || 0,
    in_progress: statusMap.in_progress || 0,
    awaiting_response: statusMap.awaiting_response || 0,
    resolved: statusMap.resolved || 0,
    closed: statusMap.closed || 0,
    reopened: statusMap.reopened || 0,
    overdue: Number(overdueCount),
    resolved_today: Number(resolvedToday),
    sla_compliance: slaCompliance,
    avg_resolution_hours: avgResolutionHours,
    avg_satisfaction: satResult?.avg_rating ? Number(Number(satResult.avg_rating).toFixed(1)) : null,
    rated_count: satResult?.rated_count ? Number(satResult.rated_count) : 0,
    category_breakdown: categoryBreakdown.map((r: any) => ({
      category: r.category,
      count: Number(r.count),
    })),
    recent_tickets: recentTickets,
  };
}

// ---------------------------------------------------------------------------
// Knowledge Base — Create Article
// ---------------------------------------------------------------------------

export async function createArticle(
  orgId: number,
  authorId: number,
  data: {
    title: string;
    content: string;
    category: string;
    slug?: string;
    is_published?: boolean;
    is_featured?: boolean;
  }
) {
  const db = getDB();

  // Generate slug from title if not provided
  const slug =
    data.slug ||
    data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Ensure slug uniqueness within org
  const existing = await db("knowledge_base_articles")
    .where({ organization_id: orgId, slug })
    .first();

  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const now = new Date();
  const [id] = await db("knowledge_base_articles").insert({
    organization_id: orgId,
    title: data.title,
    slug: finalSlug,
    content: data.content,
    category: data.category,
    is_published: data.is_published ?? false,
    is_featured: data.is_featured ?? false,
    author_id: authorId,
    created_at: now,
    updated_at: now,
  });

  logger.info(`KB article #${id} created by user ${authorId} in org ${orgId}`);
  return db("knowledge_base_articles").where({ id }).first();
}

// ---------------------------------------------------------------------------
// Knowledge Base — List Articles
// ---------------------------------------------------------------------------

export async function listArticles(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    category?: string;
    search?: string;
    published_only?: boolean;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("knowledge_base_articles")
    .where({ "knowledge_base_articles.organization_id": orgId });

  if (filters?.published_only !== false) {
    query = query.where("knowledge_base_articles.is_published", true);
  }

  if (filters?.category) {
    query = query.where("knowledge_base_articles.category", filters.category);
  }

  if (filters?.search) {
    query = query.where(function () {
      this.where("knowledge_base_articles.title", "like", `%${filters.search}%`)
        .orWhere("knowledge_base_articles.content", "like", `%${filters.search}%`);
    });
  }

  const [{ count }] = await query.clone().count("knowledge_base_articles.id as count");

  const articles = await query
    .clone()
    .select(
      "knowledge_base_articles.*",
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = knowledge_base_articles.author_id) as author_name`
      )
    )
    .orderBy("knowledge_base_articles.is_featured", "desc")
    .orderBy("knowledge_base_articles.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { articles, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Knowledge Base — Get Article
// ---------------------------------------------------------------------------

export async function getArticle(orgId: number, idOrSlug: string) {
  const db = getDB();

  const isNumeric = /^\d+$/.test(idOrSlug);

  let query = db("knowledge_base_articles")
    .where({ "knowledge_base_articles.organization_id": orgId });

  if (isNumeric) {
    query = query.where("knowledge_base_articles.id", parseInt(idOrSlug, 10));
  } else {
    query = query.where("knowledge_base_articles.slug", idOrSlug);
  }

  const article = await query
    .select(
      "knowledge_base_articles.*",
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = knowledge_base_articles.author_id) as author_name`
      )
    )
    .first();

  if (!article) throw new NotFoundError("Article");

  // Increment view count
  await db("knowledge_base_articles")
    .where({ id: article.id })
    .increment("view_count", 1);

  return { ...article, view_count: article.view_count + 1 };
}

// ---------------------------------------------------------------------------
// Knowledge Base — Update Article
// ---------------------------------------------------------------------------

export async function updateArticle(
  orgId: number,
  articleId: number,
  data: {
    title?: string;
    content?: string;
    category?: string;
    slug?: string;
    is_published?: boolean;
    is_featured?: boolean;
  }
) {
  const db = getDB();

  const existing = await db("knowledge_base_articles")
    .where({ id: articleId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Article");

  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.is_published !== undefined) updateData.is_published = data.is_published;
  if (data.is_featured !== undefined) updateData.is_featured = data.is_featured;

  await db("knowledge_base_articles").where({ id: articleId }).update(updateData);
  return db("knowledge_base_articles").where({ id: articleId }).first();
}

// ---------------------------------------------------------------------------
// Knowledge Base — Delete (Unpublish) Article
// ---------------------------------------------------------------------------

export async function deleteArticle(orgId: number, articleId: number) {
  const db = getDB();

  const existing = await db("knowledge_base_articles")
    .where({ id: articleId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Article");

  await db("knowledge_base_articles")
    .where({ id: articleId })
    .update({ is_published: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Knowledge Base — Rate Article Helpfulness
// ---------------------------------------------------------------------------

export async function rateArticle(orgId: number, articleId: number, helpful: boolean, userId?: number) {
  const db = getDB();

  const existing = await db("knowledge_base_articles")
    .where({ id: articleId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Article");

  // Check if user already rated this article (prevent duplicate votes)
  if (userId) {
    // Ensure the ratings table exists
    const hasTable = await db.schema.hasTable("kb_article_ratings");
    if (hasTable) {
      const existingRating = await db("kb_article_ratings")
        .where({ article_id: articleId, user_id: userId })
        .first();

      if (existingRating) {
        // User already voted — if same vote, do nothing; if different, swap
        // Use !! to coerce MySQL TINYINT(1) to boolean for correct comparison
        if (!!existingRating.helpful === helpful) {
          return db("knowledge_base_articles").where({ id: articleId }).first();
        }
        // Swap vote: decrement old (using GREATEST to prevent BIGINT UNSIGNED underflow), increment new
        if (helpful) {
          await db("knowledge_base_articles").where({ id: articleId }).increment("helpful_count", 1);
          await db("knowledge_base_articles").where({ id: articleId }).update({ not_helpful_count: db.raw("GREATEST(not_helpful_count - 1, 0)") });
        } else {
          await db("knowledge_base_articles").where({ id: articleId }).increment("not_helpful_count", 1);
          await db("knowledge_base_articles").where({ id: articleId }).update({ helpful_count: db.raw("GREATEST(helpful_count - 1, 0)") });
        }
        await db("kb_article_ratings")
          .where({ article_id: articleId, user_id: userId })
          .update({ helpful, updated_at: new Date() });

        return db("knowledge_base_articles").where({ id: articleId }).first();
      }

      // First vote — record it and increment count
      await db("kb_article_ratings").insert({
        article_id: articleId,
        user_id: userId,
        organization_id: orgId,
        helpful,
        created_at: new Date(),
        updated_at: new Date(),
      });

      if (helpful) {
        await db("knowledge_base_articles").where({ id: articleId }).increment("helpful_count", 1);
      } else {
        await db("knowledge_base_articles").where({ id: articleId }).increment("not_helpful_count", 1);
      }

      return db("knowledge_base_articles").where({ id: articleId }).first();
    }
  }

  // Fallback for anonymous votes (no userId or no ratings table)
  if (helpful) {
    await db("knowledge_base_articles").where({ id: articleId }).increment("helpful_count", 1);
  } else {
    await db("knowledge_base_articles").where({ id: articleId }).increment("not_helpful_count", 1);
  }

  return db("knowledge_base_articles").where({ id: articleId }).first();
}
