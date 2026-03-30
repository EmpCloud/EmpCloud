// =============================================================================
// EMP CLOUD — Anonymous Feedback Service
// =============================================================================

import crypto from "crypto";
import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";

// A fixed salt for hashing — prevents rainbow table attacks while keeping
// the hash deterministic per user so they can retrieve their own feedback.
// In production you would load this from an env var.
const ANON_SALT = process.env.FEEDBACK_ANON_SALT || "empcloud-anon-feedback-salt-v1";

function hashUserId(userId: number): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${ANON_SALT}`)
    .digest("hex");
}

// Categories that default to negative sentiment
const NEGATIVE_CATEGORIES = new Set(["harassment", "safety"]);
const POSITIVE_CATEGORIES = new Set(["suggestion"]);

function inferSentiment(
  category: string,
  explicit?: string | null
): string {
  if (explicit) return explicit;
  if (NEGATIVE_CATEGORIES.has(category)) return "negative";
  if (POSITIVE_CATEGORIES.has(category)) return "positive";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Submit Feedback (any authenticated user)
// ---------------------------------------------------------------------------

export async function submitFeedback(
  orgId: number,
  userId: number,
  data: {
    category: string;
    subject: string;
    message: string;
    sentiment?: string | null;
    is_urgent?: boolean;
  }
) {
  const db = getDB();
  const anonymousHash = hashUserId(userId);
  const sentiment = inferSentiment(data.category, data.sentiment);

  const [id] = await db("anonymous_feedback").insert({
    organization_id: orgId,
    category: data.category,
    subject: data.subject,
    message: data.message,
    sentiment,
    status: "new",
    is_urgent: data.is_urgent || false,
    anonymous_hash: anonymousHash,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("anonymous_feedback")
    .where({ id, organization_id: orgId })
    .first();
}

// ---------------------------------------------------------------------------
// My Feedback — user retrieves their own submissions via hash
// ---------------------------------------------------------------------------

export async function getMyFeedback(
  orgId: number,
  userId: number,
  params?: { page?: number; perPage?: number }
) {
  const db = getDB();
  const anonymousHash = hashUserId(userId);
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  const baseQuery = db("anonymous_feedback").where({
    organization_id: orgId,
    anonymous_hash: anonymousHash,
  });

  const [{ count }] = await baseQuery.clone().count("id as count");

  const feedback = await baseQuery
    .clone()
    .select(
      "id",
      "category",
      "subject",
      "message",
      "sentiment",
      "status",
      "admin_response",
      "responded_at",
      "is_urgent",
      "created_at",
      "updated_at"
    )
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { feedback, total: Number(count) };
}

// ---------------------------------------------------------------------------
// List All Feedback (HR only) — NO user identity revealed
// ---------------------------------------------------------------------------

export async function listFeedback(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    category?: string;
    status?: string;
    sentiment?: string;
    is_urgent?: boolean;
    search?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("anonymous_feedback").where({
    "anonymous_feedback.organization_id": orgId,
  });

  if (filters?.category) {
    query = query.where("category", filters.category);
  }
  if (filters?.status) {
    query = query.where("status", filters.status);
  }
  if (filters?.sentiment) {
    query = query.where("sentiment", filters.sentiment);
  }
  if (filters?.is_urgent !== undefined) {
    query = query.where("is_urgent", filters.is_urgent);
  }
  if (filters?.search) {
    const term = `%${filters.search}%`;
    query = query.where(function () {
      this.where("subject", "like", term).orWhere("message", "like", term);
    });
  }

  const [{ count }] = await query.clone().count("id as count");

  // IMPORTANT: Never select anonymous_hash in HR-facing queries
  const feedback = await query
    .clone()
    .select(
      "id",
      "category",
      "subject",
      "message",
      "sentiment",
      "status",
      "admin_response",
      "responded_by",
      "responded_at",
      "is_urgent",
      "created_at",
      "updated_at"
    )
    .orderByRaw("is_urgent DESC, created_at DESC")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { feedback, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Check if user owns the feedback (via anonymous hash)
// ---------------------------------------------------------------------------

export async function isOwner(
  orgId: number,
  feedbackId: number,
  userId: number
): Promise<boolean> {
  const db = getDB();
  const anonymousHash = hashUserId(userId);
  const row = await db("anonymous_feedback")
    .where({ id: feedbackId, organization_id: orgId, anonymous_hash: anonymousHash })
    .first("id");
  return !!row;
}

// ---------------------------------------------------------------------------
// Get Single Feedback (HR or owner)
// ---------------------------------------------------------------------------

export async function getFeedbackById(orgId: number, feedbackId: number) {
  const db = getDB();

  const feedback = await db("anonymous_feedback")
    .where({ id: feedbackId, organization_id: orgId })
    .select(
      "id",
      "category",
      "subject",
      "message",
      "sentiment",
      "status",
      "admin_response",
      "responded_by",
      "responded_at",
      "is_urgent",
      "created_at",
      "updated_at"
    )
    .first();

  if (!feedback) throw new NotFoundError("Feedback");
  return feedback;
}

// ---------------------------------------------------------------------------
// Respond to Feedback (HR only)
// ---------------------------------------------------------------------------

export async function respondToFeedback(
  orgId: number,
  feedbackId: number,
  response: string,
  respondedBy: number
) {
  const db = getDB();

  const existing = await db("anonymous_feedback")
    .where({ id: feedbackId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Feedback");

  await db("anonymous_feedback")
    .where({ id: feedbackId })
    .update({
      admin_response: response,
      responded_by: respondedBy,
      responded_at: new Date(),
      status: existing.status === "new" ? "acknowledged" : existing.status,
      updated_at: new Date(),
    });

  return getFeedbackById(orgId, feedbackId);
}

// ---------------------------------------------------------------------------
// Update Status (HR only)
// ---------------------------------------------------------------------------

export async function updateStatus(
  orgId: number,
  feedbackId: number,
  status: string
) {
  const db = getDB();

  const existing = await db("anonymous_feedback")
    .where({ id: feedbackId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Feedback");

  await db("anonymous_feedback")
    .where({ id: feedbackId })
    .update({ status, updated_at: new Date() });

  return getFeedbackById(orgId, feedbackId);
}

// ---------------------------------------------------------------------------
// Dashboard Stats (HR only)
// ---------------------------------------------------------------------------

export async function getFeedbackDashboard(orgId: number) {
  const db = getDB();

  const base = { organization_id: orgId };

  // Total count
  const [{ total }] = await db("anonymous_feedback")
    .where(base)
    .count("id as total");

  // By category
  const byCategory = await db("anonymous_feedback")
    .where(base)
    .select("category")
    .count("id as count")
    .groupBy("category");

  // By sentiment
  const bySentiment = await db("anonymous_feedback")
    .where(base)
    .select("sentiment")
    .count("id as count")
    .groupBy("sentiment");

  // By status
  const byStatus = await db("anonymous_feedback")
    .where(base)
    .select("status")
    .count("id as count")
    .groupBy("status");

  // Urgent count
  const [{ urgentCount }] = await db("anonymous_feedback")
    .where({ ...base, is_urgent: true })
    .count("id as urgentCount");

  // Response rate
  const [{ respondedCount }] = await db("anonymous_feedback")
    .where(base)
    .whereNotNull("admin_response")
    .count("id as respondedCount");

  const responseRate =
    Number(total) > 0
      ? Math.round((Number(respondedCount) / Number(total)) * 100)
      : 0;

  // Recent feedback (last 5)
  const recent = await db("anonymous_feedback")
    .where(base)
    .select(
      "id",
      "category",
      "subject",
      "sentiment",
      "status",
      "is_urgent",
      "created_at"
    )
    .orderByRaw("is_urgent DESC, created_at DESC")
    .limit(5);

  return {
    total: Number(total),
    urgentCount: Number(urgentCount),
    responseRate,
    byCategory: byCategory.map((r: any) => ({
      category: r.category,
      count: Number(r.count),
    })),
    bySentiment: bySentiment.map((r: any) => ({
      sentiment: r.sentiment,
      count: Number(r.count),
    })),
    byStatus: byStatus.map((r: any) => ({
      status: r.status,
      count: Number(r.count),
    })),
    recent,
  };
}
