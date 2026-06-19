// =============================================================================
// EMP CLOUD — Employee Chat / Private Messaging Service
// 1-on-1 and group conversations between employees, scoped to an organization.
// Read state / unread counts derive from
// conversation_participants.last_read_message_id.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { getDB } from "../../db/connection.js";
import type { Knex } from "knex";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import { sanitizePlainText } from "../../utils/sanitize-html.js";
import { createNotification } from "../notification/notification.service.js";
import { emitMessageNew } from "./chat-events.js";
import { logger } from "../../utils/logger.js";
import type {
  ConversationSummary,
  ChatMessage,
  ChatAttachment,
  ChatParticipant,
  CreateGroupConversationInput,
  TickStatus,
  MessageTick,
  MessageReceiptBreakdown,
  ChatMessageReceipt,
  ReplyQuote,
  MessageSearchResult,
  MessageReaction,
} from "@empcloud/shared";

// Stable key for a direct conversation between two users (order-independent).
function directKey(a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}:${hi}`;
}

function fullName(first?: string | null, last?: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim() || "Unknown";
}

// Build the client-facing attachment object from a chat_messages row. Returns
// null when the row has no attachment. The `url` points at the authenticated
// serving route — the raw filesystem path is never exposed.
function attachmentFromRow(row: {
  id: number;
  conversation_id: number;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_mime?: string | null;
}): ChatAttachment | null {
  if (!row.attachment_path) return null;
  const mime = row.attachment_mime ?? "application/octet-stream";
  return {
    name: row.attachment_name ?? "file",
    size: Number(row.attachment_size ?? 0),
    mime,
    url: `/api/v1/chat/conversations/${row.conversation_id}/messages/${row.id}/attachment`,
    is_image: mime.startsWith("image/"),
  };
}

// ---------------------------------------------------------------------------
// Tick computation (delivery / read receipts)
// ---------------------------------------------------------------------------

/**
 * The delivered/read high-water markers of the OTHER active participants in a
 * conversation (everyone except `selfId`). Drives the aggregate tick for every
 * message the caller sent. Returns the min delivered/read across recipients and
 * the recipient count — O(participants), no per-message ledger read.
 */
interface RecipientMarkers {
  total: number;
  minDelivered: number; // min last_delivered_message_id across active recipients
  minRead: number; // min last_read_message_id across active recipients
}

async function recipientMarkers(
  db: Knex,
  conversationId: number,
  selfId: number,
): Promise<RecipientMarkers> {
  const rows = await db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .andWhereNot({ user_id: selfId })
    .select("last_delivered_message_id", "last_read_message_id");

  if (rows.length === 0) return { total: 0, minDelivered: 0, minRead: 0 };

  let minDelivered = Infinity;
  let minRead = Infinity;
  for (const r of rows) {
    minDelivered = Math.min(minDelivered, Number(r.last_delivered_message_id ?? 0));
    minRead = Math.min(minRead, Number(r.last_read_message_id ?? 0));
  }
  return { total: rows.length, minDelivered, minRead };
}

/**
 * Resolve a single message's tick from pre-fetched recipient markers.
 * Empty-recipient guard: with zero active recipients the tick is always "sent"
 * (never auto-blue). Read implies delivered, so read is checked first.
 */
function tickFor(messageId: number, m: RecipientMarkers): TickStatus {
  if (m.total === 0) return "sent";
  if (m.minRead >= messageId) return "read";
  if (m.minDelivered >= messageId) return "delivered";
  return "sent";
}

// Build a compact reply-quote for a set of messages: maps message id -> the
// quoted-message snippet. Fetches the referenced messages + their sender names
// in one query. Quoted bodies are truncated.
async function replyQuotesByMessageId(
  replyToIds: number[],
): Promise<Map<number, ReplyQuote>> {
  const map = new Map<number, ReplyQuote>();
  const ids = [...new Set(replyToIds.filter((id) => id > 0))];
  if (ids.length === 0) return map;

  const db = getDB();
  const rows = await db("chat_messages as m")
    .leftJoin("users as u", "u.id", "m.sender_id")
    .whereIn("m.id", ids)
    .select(
      "m.id as id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "m.body as body",
      "m.is_deleted as is_deleted",
      "m.attachment_path as attachment_path",
    );

  for (const r of rows) {
    const body = r.is_deleted ? "" : (r.body ?? "");
    map.set(r.id, {
      id: r.id,
      sender_name: fullName(r.first_name, r.last_name),
      body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      has_attachment: !!r.attachment_path,
      is_deleted: Boolean(r.is_deleted),
    });
  }
  return map;
}

/**
 * Aggregate reactions for a set of messages into per-emoji tallies, keyed by
 * message id. `viewerId` flags which the current user reacted to. Reactor names
 * are included (capped) for the hover tooltip.
 */
async function reactionsByMessageId(
  messageIds: number[],
  viewerId: number,
): Promise<Map<number, MessageReaction[]>> {
  const map = new Map<number, MessageReaction[]>();
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) return map;

  const db = getDB();
  const rows = await db("chat_message_reactions as r")
    .leftJoin("users as u", "u.id", "r.user_id")
    .whereIn("r.message_id", ids)
    .select(
      "r.message_id as message_id",
      "r.emoji as emoji",
      "r.user_id as user_id",
      "u.first_name as first_name",
      "u.last_name as last_name",
    )
    .orderBy("r.id", "asc");

  // message_id -> emoji -> { count, reacted, names }
  const byMsg = new Map<number, Map<string, MessageReaction>>();
  for (const r of rows) {
    let emojis = byMsg.get(r.message_id);
    if (!emojis) {
      emojis = new Map();
      byMsg.set(r.message_id, emojis);
    }
    let agg = emojis.get(r.emoji);
    if (!agg) {
      agg = { emoji: r.emoji, count: 0, reacted: false, names: [] };
      emojis.set(r.emoji, agg);
    }
    agg.count += 1;
    if (r.user_id === viewerId) agg.reacted = true;
    if (agg.names.length < 20) agg.names.push(fullName(r.first_name, r.last_name));
  }
  for (const [msgId, emojis] of byMsg) {
    map.set(msgId, [...emojis.values()]);
  }
  return map;
}

// Confirm a user is an active participant in a conversation in their org, and
// return the conversation row. Used as the access gate on every operation.
async function requireParticipant(orgId: number, userId: number, conversationId: number) {
  const db = getDB();
  const convo = await db("conversations")
    .where({ id: conversationId, organization_id: orgId })
    .first();
  if (!convo) throw new NotFoundError("Conversation");

  const part = await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId, is_active: true })
    .first();
  if (!part) throw new ForbiddenError("You are not a participant in this conversation");

  return { convo, part };
}

/**
 * Public participant guard — throws NotFound/Forbidden unless `userId` is an
 * active participant of `conversationId` in `orgId`. Used to authorize an
 * attachment upload BEFORE multer writes the file to disk (so a non-participant
 * can never plant a file in any conversation's upload directory).
 */
export async function assertParticipant(
  orgId: number,
  userId: number,
  conversationId: number,
): Promise<void> {
  await requireParticipant(orgId, userId, conversationId);
}

// Fetch the participants of a set of conversations, keyed by conversation id.
async function participantsByConversation(
  conversationIds: number[],
): Promise<Map<number, ChatParticipant[]>> {
  const db = getDB();
  const map = new Map<number, ChatParticipant[]>();
  if (conversationIds.length === 0) return map;

  const rows = await db("conversation_participants as cp")
    .join("users as u", "u.id", "cp.user_id")
    .whereIn("cp.conversation_id", conversationIds)
    .where("cp.is_active", true)
    .select(
      "cp.conversation_id as conversation_id",
      "u.id as user_id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "u.email as email",
      "u.designation as designation",
      "u.photo_path as photo_path",
    );

  for (const r of rows) {
    const list = map.get(r.conversation_id) ?? [];
    list.push({
      user_id: r.user_id,
      name: fullName(r.first_name, r.last_name),
      email: r.email ?? null,
      designation: r.designation ?? null,
      photo_path: r.photo_path ?? null,
    });
    map.set(r.conversation_id, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** List the current user's conversations, most-recently-active first. */
export async function listConversations(
  orgId: number,
  userId: number,
): Promise<ConversationSummary[]> {
  const db = getDB();

  const convos = await db("conversations as c")
    .join("conversation_participants as me", function () {
      this.on("me.conversation_id", "=", "c.id")
        .andOn("me.user_id", "=", db.raw("?", [userId]))
        .andOn("me.is_active", "=", db.raw("?", [true]));
    })
    .leftJoin("chat_messages as lm", "lm.id", "c.last_message_id")
    .where("c.organization_id", orgId)
    .select(
      "c.id as id",
      "c.type as type",
      "c.name as name",
      "c.created_by as created_by",
      "c.last_message_at as last_message_at",
      "lm.body as last_message_body",
      "lm.is_deleted as last_message_deleted",
      "lm.attachment_mime as last_message_attachment_mime",
      "me.last_read_message_id as last_read_message_id",
      "me.muted_until as muted_until",
    )
    .orderByRaw("c.last_message_at IS NULL, c.last_message_at DESC, c.id DESC");

  if (convos.length === 0) return [];

  const ids = convos.map((c) => c.id);
  const partsMap = await participantsByConversation(ids);

  // Unread counts: messages newer than my last_read_message_id, not mine.
  const unreadRows = await db("chat_messages as m")
    .join("conversation_participants as me", function () {
      this.on("me.conversation_id", "=", "m.conversation_id").andOn(
        "me.user_id",
        "=",
        db.raw("?", [userId]),
      );
    })
    .whereIn("m.conversation_id", ids)
    .where("m.sender_id", "!=", userId)
    .where("m.is_deleted", false)
    .where("m.is_system", false)
    .whereRaw("m.id > COALESCE(me.last_read_message_id, 0)")
    .groupBy("m.conversation_id")
    .select("m.conversation_id as conversation_id")
    .count("* as cnt");
  const unreadMap = new Map<number, number>(
    unreadRows.map((r: any) => [r.conversation_id, Number(r.cnt)]),
  );

  return convos.map((c) => {
    const participants = partsMap.get(c.id) ?? [];
    const counterpart =
      c.type === "direct" ? participants.find((p) => p.user_id !== userId) ?? null : null;
    const title = c.type === "group" ? c.name ?? "Group" : counterpart?.name ?? "Direct message";
    // Preview text: deleted > body > attachment placeholder.
    let lastMessage: string | null;
    if (c.last_message_deleted) {
      lastMessage = "This message was deleted";
    } else if (c.last_message_body) {
      lastMessage = c.last_message_body;
    } else if (c.last_message_attachment_mime) {
      lastMessage = String(c.last_message_attachment_mime).startsWith("image/")
        ? "📷 Photo"
        : "📎 Attachment";
    } else {
      lastMessage = null;
    }
    return {
      id: c.id,
      type: c.type,
      created_by: c.created_by,
      title,
      counterpart,
      participants,
      last_message: lastMessage,
      last_message_at: c.last_message_at ?? null,
      unread_count: unreadMap.get(c.id) ?? 0,
      is_muted: c.muted_until != null && new Date(c.muted_until) > new Date(),
    };
  });
}

/** Get one conversation's summary (used after creating / opening). */
export async function getConversation(
  orgId: number,
  userId: number,
  conversationId: number,
): Promise<ConversationSummary> {
  await requireParticipant(orgId, userId, conversationId);
  const all = await listConversations(orgId, userId);
  const found = all.find((c) => c.id === conversationId);
  if (!found) throw new NotFoundError("Conversation");
  return found;
}

/** Start a direct conversation with another employee (idempotent per pair). */
export async function startDirect(
  orgId: number,
  userId: number,
  otherUserId: number,
): Promise<ConversationSummary> {
  const db = getDB();
  if (otherUserId === userId) {
    throw new ValidationError("You cannot start a conversation with yourself");
  }

  // The other user must exist in the same org.
  const other = await db("users")
    .where({ id: otherUserId, organization_id: orgId })
    .first();
  if (!other) throw new NotFoundError("Employee");

  const key = directKey(userId, otherUserId);
  const existing = await db("conversations")
    .where({ organization_id: orgId, direct_key: key })
    .first();
  if (existing) {
    return getConversation(orgId, userId, existing.id);
  }

  const [conversationId] = await db("conversations").insert({
    organization_id: orgId,
    type: "direct",
    direct_key: key,
    created_by: userId,
  });
  await db("conversation_participants").insert([
    { conversation_id: conversationId, user_id: userId },
    { conversation_id: conversationId, user_id: otherUserId },
  ]);

  return getConversation(orgId, userId, conversationId);
}

/**
 * Post a system event message into a conversation ("X left the group", etc.).
 * `actorId` is who triggered it (stored as sender_id for reference; the client
 * renders it author-less). Advances the conversation's last_message and emits
 * `message:new` so it appears live. Best-effort: never throws to the caller.
 */
async function postSystemMessage(
  orgId: number,
  conversationId: number,
  actorId: number,
  text: string,
): Promise<void> {
  try {
    const db = getDB();
    const now = new Date();
    const [id] = await db("chat_messages").insert({
      conversation_id: conversationId,
      sender_id: actorId,
      body: text,
      is_system: true,
    });
    await db("conversations")
      .where({ id: conversationId })
      .update({ last_message_id: id, last_message_at: now, updated_at: now });

    emitMessageNew(orgId, {
      id,
      conversation_id: conversationId,
      sender_id: actorId,
      sender_name: "",
      body: text,
      is_deleted: false,
      is_mine: false,
      attachment: null,
      tick_status: null,
      reactions: [],
      is_system: true,
      created_at: now.toISOString(),
      edited_at: null,
    });
  } catch (err) {
    logger.error("Failed to post chat system message", err);
  }
}

/** Create a named group conversation with 2+ other members. */
export async function createGroup(
  orgId: number,
  userId: number,
  input: CreateGroupConversationInput,
): Promise<ConversationSummary> {
  const db = getDB();

  const memberIds = [...new Set(input.member_ids.filter((id) => id !== userId))];
  if (memberIds.length < 2) {
    throw new ValidationError("A group needs at least 2 other members");
  }

  // All members must belong to the same org.
  const valid = await db("users")
    .where({ organization_id: orgId })
    .whereIn("id", memberIds)
    .pluck("id");
  if (valid.length !== memberIds.length) {
    throw new ValidationError("One or more members are not in your organization");
  }

  const groupName = sanitizePlainText(input.name);
  if (!groupName) throw new ValidationError("Group name can't be empty");
  const [conversationId] = await db("conversations").insert({
    organization_id: orgId,
    type: "group",
    name: groupName,
    created_by: userId,
  });
  await db("conversation_participants").insert(
    [userId, ...memberIds].map((id) => ({ conversation_id: conversationId, user_id: id })),
  );

  const creator = await db("users").where({ id: userId }).first();
  await postSystemMessage(
    orgId,
    conversationId,
    userId,
    `${fullName(creator?.first_name, creator?.last_name)} created the group`,
  );

  return getConversation(orgId, userId, conversationId);
}

/**
 * Remove a member from a group. Only the group creator may remove members,
 * the creator can't be removed (they'd have to delete the group instead), and
 * it only applies to group conversations. Returns the updated summary.
 */
export async function removeMember(
  orgId: number,
  userId: number,
  conversationId: number,
  memberId: number,
): Promise<ConversationSummary> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);

  if (convo.type !== "group") {
    throw new ValidationError("Members can only be removed from group conversations");
  }
  if (convo.created_by !== userId) {
    throw new ForbiddenError("Only the group admin can remove members");
  }
  if (memberId === convo.created_by) {
    throw new ValidationError("The group admin cannot be removed");
  }

  const db = getDB();
  const target = await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: memberId, is_active: true })
    .first();
  if (!target) throw new NotFoundError("Member");

  // System notice before deactivating (names the actor + removed member).
  const [actor, removed] = await Promise.all([
    db("users").where({ id: userId }).first(),
    db("users").where({ id: memberId }).first(),
  ]);
  await postSystemMessage(
    orgId,
    conversationId,
    userId,
    `${fullName(actor?.first_name, actor?.last_name)} removed ${fullName(removed?.first_name, removed?.last_name)}`,
  );

  // Soft-remove: keep the row for history, mark inactive so they drop out of
  // the participant list, unread counts, and stop seeing the conversation.
  await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: memberId })
    .update({ is_active: false });

  return getConversation(orgId, userId, conversationId);
}

/**
 * Add one or more members to a group. Creator-only. Re-adding a previously
 * removed member reactivates their row (preserving history); brand-new members
 * get a fresh row. All targets must be in the same org. Returns the updated
 * summary.
 */
export async function addMembers(
  orgId: number,
  userId: number,
  conversationId: number,
  memberIds: number[],
): Promise<ConversationSummary> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);
  if (convo.type !== "group") {
    throw new ValidationError("Members can only be added to group conversations");
  }
  if (convo.created_by !== userId) {
    throw new ForbiddenError("Only the group admin can add members");
  }

  const db = getDB();
  const wanted = [...new Set(memberIds.filter((id) => id > 0))];
  if (wanted.length === 0) throw new ValidationError("No members to add");

  // All must belong to the same org.
  const valid = await db("users")
    .where({ organization_id: orgId })
    .whereIn("id", wanted)
    .pluck("id");
  if (valid.length !== wanted.length) {
    throw new ValidationError("One or more users are not in your organization");
  }

  // Existing participant rows (active or soft-removed) for these users.
  const existing = await db("conversation_participants")
    .where({ conversation_id: conversationId })
    .whereIn("user_id", wanted)
    .select("user_id", "is_active");
  const existingMap = new Map<number, boolean>(existing.map((r) => [r.user_id, !!r.is_active]));

  const toReactivate: number[] = [];
  const toInsert: number[] = [];
  for (const id of wanted) {
    if (!existingMap.has(id)) toInsert.push(id);
    else if (existingMap.get(id) === false) toReactivate.push(id);
    // already-active members are silently skipped (idempotent)
  }

  // New/re-added members start "caught up": their read marker is set to the
  // conversation's current latest message so pre-membership history isn't shown
  // as unread (they were not a member when those messages were sent).
  const latest = await db("chat_messages")
    .where({ conversation_id: conversationId })
    .max("id as maxId")
    .first();
  const latestId = Number(latest?.maxId ?? 0);

  if (toReactivate.length > 0) {
    await db("conversation_participants")
      .where({ conversation_id: conversationId })
      .whereIn("user_id", toReactivate)
      .update({ is_active: true, last_read_message_id: latestId, joined_at: new Date() });
  }
  if (toInsert.length > 0) {
    await db("conversation_participants").insert(
      toInsert.map((id) => ({
        conversation_id: conversationId,
        user_id: id,
        last_read_message_id: latestId,
      })),
    );
  }

  // System notice naming the actor + the newly-added members.
  const addedIds = [...toReactivate, ...toInsert];
  if (addedIds.length > 0) {
    const [actor, addedUsers] = await Promise.all([
      db("users").where({ id: userId }).first(),
      db("users").whereIn("id", addedIds).select("first_name", "last_name"),
    ]);
    const names = addedUsers.map((u) => fullName(u.first_name, u.last_name)).join(", ");
    await postSystemMessage(
      orgId,
      conversationId,
      userId,
      `${fullName(actor?.first_name, actor?.last_name)} added ${names}`,
    );
  }

  return getConversation(orgId, userId, conversationId);
}

/**
 * Leave a group (self-service). Any active participant except the creator may
 * leave; the creator must remove members / delete the group instead. Returns
 * void (the caller no longer sees the conversation).
 */
export async function leaveGroup(
  orgId: number,
  userId: number,
  conversationId: number,
): Promise<void> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);
  if (convo.type !== "group") {
    throw new ValidationError("You can only leave group conversations");
  }
  if (convo.created_by === userId) {
    throw new ValidationError(
      "The group admin can't leave — remove members or delete the group instead",
    );
  }
  const db = getDB();
  // System notice before the leaver loses access (remaining members see it).
  const leaver = await db("users").where({ id: userId }).first();
  await postSystemMessage(
    orgId,
    conversationId,
    userId,
    `${fullName(leaver?.first_name, leaver?.last_name)} left the group`,
  );

  await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId })
    .update({ is_active: false });
}

/**
 * Delete a group (creator only). Soft-delete: deactivates ALL participants so
 * the group disappears from everyone's conversation list (listConversations
 * filters on is_active). Message history is preserved for audit — consistent
 * with the rest of the HRMS — and there's no risk of FK-cascade ordering
 * issues. Returns the active participant ids so the caller can notify them.
 */
export async function deleteGroup(
  orgId: number,
  userId: number,
  conversationId: number,
): Promise<number[]> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);
  if (convo.type !== "group") {
    throw new ValidationError("Only group conversations can be deleted");
  }
  if (convo.created_by !== userId) {
    throw new ForbiddenError("Only the group admin can delete the group");
  }

  const db = getDB();
  const affected: number[] = await db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .pluck("user_id");

  await db("conversation_participants")
    .where({ conversation_id: conversationId })
    .update({ is_active: false });

  return affected;
}

/**
 * Mute or unmute a conversation for the caller. `muted = true` mutes it
 * "indefinitely" (stored as a far-future timestamp); `false` clears the mute.
 * Muting only suppresses notifications — unread counts still accrue. Returns the
 * updated conversation summary.
 */
export async function setMute(
  orgId: number,
  userId: number,
  conversationId: number,
  muted: boolean,
): Promise<ConversationSummary> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  // "Forever" = a far-future date that still fits MySQL's TIMESTAMP range
  // (which ends at 2038-01-19 — the Unix epoch limit), so use 2037.
  const until = muted ? new Date("2037-12-31T00:00:00Z") : null;
  await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId })
    .update({ muted_until: until });
  return getConversation(orgId, userId, conversationId);
}

/**
 * Rename a group (creator only). Updates conversations.name and posts a system
 * notice ("X renamed the group to Y"). Returns the updated conversation summary.
 */
export async function renameGroup(
  orgId: number,
  userId: number,
  conversationId: number,
  name: string,
): Promise<ConversationSummary> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);
  if (convo.type !== "group") {
    throw new ValidationError("Only group conversations can be renamed");
  }
  if (convo.created_by !== userId) {
    throw new ForbiddenError("Only the group admin can rename the group");
  }
  const clean = sanitizePlainText(name);
  if (!clean) throw new ValidationError("Group name can't be empty");
  if (clean === convo.name) {
    // No change — return the current summary without a noisy system message.
    return getConversation(orgId, userId, conversationId);
  }

  const db = getDB();
  await db("conversations")
    .where({ id: conversationId })
    .update({ name: clean, updated_at: new Date() });

  const actor = await db("users").where({ id: userId }).first();
  await postSystemMessage(
    orgId,
    conversationId,
    userId,
    `${fullName(actor?.first_name, actor?.last_name)} renamed the group to "${clean}"`,
  );

  return getConversation(orgId, userId, conversationId);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** List messages in a conversation (newest-first paginated; `before` = id). */
export async function listMessages(
  orgId: number,
  userId: number,
  conversationId: number,
  opts: { before?: number; limit: number },
): Promise<ChatMessage[]> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();

  let q = db("chat_messages as m")
    .join("users as u", "u.id", "m.sender_id")
    .where("m.conversation_id", conversationId)
    .select(
      "m.id as id",
      "m.conversation_id as conversation_id",
      "m.sender_id as sender_id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "m.body as body",
      "m.is_deleted as is_deleted",
      "m.attachment_path as attachment_path",
      "m.attachment_name as attachment_name",
      "m.attachment_size as attachment_size",
      "m.attachment_mime as attachment_mime",
      "m.mentioned_user_ids as mentioned_user_ids",
      "m.reply_to_message_id as reply_to_message_id",
      "m.forwarded_from_name as forwarded_from_name",
      "m.is_system as is_system",
      "m.pinned_at as pinned_at",
      "m.created_at as created_at",
      "m.edited_at as edited_at",
    )
    .orderBy("m.id", "desc")
    .limit(opts.limit);
  if (opts.before) q = q.where("m.id", "<", opts.before);

  const rows = await q;

  // Recipient markers once for the whole page; used to tick MY messages.
  const markers = await recipientMarkers(db, conversationId, userId);
  // Batch-fetch reply quotes for the page.
  const quoteMap = await replyQuotesByMessageId(
    rows.map((r) => r.reply_to_message_id).filter(Boolean),
  );
  // Batch-fetch reactions for the page.
  const reactionMap = await reactionsByMessageId(
    rows.filter((r) => !r.is_deleted).map((r) => r.id),
    userId,
  );

  // Return chronological (oldest-first) for rendering.
  return rows.reverse().map((r) => {
    // System messages are never "mine" (they're author-less event notices).
    const mine = r.sender_id === userId && !r.is_system;
    return {
      id: r.id,
      conversation_id: r.conversation_id,
      sender_id: r.sender_id,
      sender_name: fullName(r.first_name, r.last_name),
      body: r.is_deleted ? "" : r.body,
      is_deleted: Boolean(r.is_deleted),
      is_mine: mine,
      // Deleted messages drop their attachment too.
      attachment: r.is_deleted ? null : attachmentFromRow(r),
      // Ticks are sender-only; deleted messages show none.
      // System messages carry no ticks (they aren't author-owned).
      tick_status: mine && !r.is_deleted && !r.is_system ? tickFor(r.id, markers) : null,
      mentioned_user_ids: r.is_deleted ? [] : parseMentionIds(r.mentioned_user_ids),
      reply_to: r.reply_to_message_id ? quoteMap.get(r.reply_to_message_id) ?? null : null,
      reactions: r.is_deleted ? [] : reactionMap.get(r.id) ?? [],
      forwarded_from: r.is_deleted ? null : r.forwarded_from_name ?? null,
      is_system: Boolean(r.is_system),
      is_pinned: r.pinned_at != null,
      created_at: r.created_at,
      edited_at: r.edited_at ?? null,
    };
  });
}

// MySQL JSON columns come back as a string (mysql2) or an already-parsed array
// depending on driver/version — normalize to a number[].
function parseMentionIds(raw: unknown): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** A file uploaded alongside a message (already persisted to disk by multer). */
export interface MessageAttachmentInput {
  /** Relative path stored in the DB, e.g. uploads/chat/{org}/{convo}/{file}. */
  path: string;
  /** Original filename. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type. */
  mime: string;
}

/**
 * Send a message into a conversation. A message must carry a non-empty body, an
 * attachment, or both. The optional `attachment` is a file multer has already
 * written to disk.
 */
export async function sendMessage(
  orgId: number,
  userId: number,
  conversationId: number,
  body: string,
  attachment?: MessageAttachmentInput | null,
  clientMsgId?: string | null,
  mentionedUserIds?: number[] | null,
  replyToMessageId?: number | null,
): Promise<ChatMessage> {
  const { convo } = await requireParticipant(orgId, userId, conversationId);
  const db = getDB();

  // Chat bodies are plain text — strip any HTML AND angle brackets so nothing
  // can ever render as markup (defense-in-depth; the client renders text).
  const clean = sanitizePlainText(body) ?? "";
  if (!clean && !attachment) {
    throw new ValidationError("Add a message or an attachment to send");
  }

  // Validate the reply target belongs to THIS conversation (else ignore it).
  let replyTo: number | null = null;
  if (replyToMessageId) {
    const parent = await db("chat_messages")
      .where({ id: replyToMessageId, conversation_id: conversationId })
      .first();
    if (parent) replyTo = replyToMessageId;
  }

  // Resolve mentions to a clean list of *other* active participant ids. A `0`
  // means @everyone → expand to all active members except the sender. Anyone
  // not actually in the group is dropped (no notifying outsiders).
  const mentions = await resolveMentions(db, conversationId, userId, mentionedUserIds);

  const now = new Date();
  // Atomic: insert the message and advance the conversation + sender markers
  // together, so a sender never sees their own message as undelivered to self
  // and the conversation's last_message_id can't point at a half-written row.
  const messageId = await db.transaction(async (trx) => {
    const [id] = await trx("chat_messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: clean,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_mime: attachment?.mime ?? null,
      reply_to_message_id: replyTo,
      // Store the @everyone sentinel as-is when used, else the resolved ids.
      mentioned_user_ids:
        mentionedUserIds && mentionedUserIds.includes(0)
          ? JSON.stringify([0])
          : mentions.length > 0
            ? JSON.stringify(mentions)
            : null,
    });
    await trx("conversations")
      .where({ id: conversationId })
      .update({ last_message_id: id, last_message_at: now, updated_at: now });
    // The sender has implicitly read AND received their own message.
    await trx("conversation_participants")
      .where({ conversation_id: conversationId, user_id: userId })
      .update({
        last_read_message_id: id,
        last_delivered_message_id: id,
        last_read_at: now,
        last_delivered_at: now,
      });
    return id;
  });

  const sender = await db("users").where({ id: userId }).first();
  const senderName = fullName(sender?.first_name, sender?.last_name);

  // Notify mentioned users (fire-and-forget; never block the send).
  if (mentions.length > 0) {
    void notifyMentions(orgId, conversationId, messageId, senderName, convo, mentions, clean).catch(
      (err) => logger.error("Failed to notify chat mentions", err),
    );
  }

  const replyQuote = replyTo ? (await replyQuotesByMessageId([replyTo])).get(replyTo) ?? null : null;

  return {
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    sender_name: senderName,
    body: clean,
    is_deleted: false,
    is_mine: true,
    attachment: attachment
      ? attachmentFromRow({
          id: messageId,
          conversation_id: conversationId,
          attachment_path: attachment.path,
          attachment_name: attachment.name,
          attachment_size: attachment.size,
          attachment_mime: attachment.mime,
        })
      : null,
    // A freshly-sent message is "sent" until recipients ack delivery/read.
    tick_status: "sent",
    client_msg_id: clientMsgId ?? null,
    mentioned_user_ids:
      mentionedUserIds && mentionedUserIds.includes(0) ? [0] : mentions,
    reply_to: replyQuote,
    created_at: now.toISOString(),
    edited_at: null,
  };
}

/**
 * Resolve a raw mention list to the actual *other* active participant ids to
 * notify. `0` (=@everyone) expands to every active member except the sender.
 * Anyone not an active participant is dropped.
 */
async function resolveMentions(
  db: Knex,
  conversationId: number,
  senderId: number,
  raw?: number[] | null,
): Promise<number[]> {
  if (!raw || raw.length === 0) return [];
  const active: number[] = await db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .andWhereNot({ user_id: senderId })
    .pluck("user_id");
  const activeSet = new Set(active);

  if (raw.includes(0)) return active; // @everyone

  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of raw) {
    if (id !== senderId && activeSet.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Create an in-app notification for each mentioned user. */
async function notifyMentions(
  orgId: number,
  conversationId: number,
  messageId: number,
  senderName: string,
  convo: { type: string; name?: string | null },
  mentionedIds: number[],
  body: string,
): Promise<void> {
  const where = convo.type === "group" && convo.name ? `in ${convo.name}` : "in a chat";
  const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body || "(attachment)";
  // Don't notify users who muted this conversation (they still get unread badges).
  const db = getDB();
  const mutedRows = await db("conversation_participants")
    .where({ conversation_id: conversationId })
    .whereIn("user_id", mentionedIds)
    .whereNotNull("muted_until")
    .where("muted_until", ">", new Date())
    .pluck("user_id");
  const mutedSet = new Set<number>(mutedRows);
  for (const targetId of mentionedIds) {
    if (mutedSet.has(targetId)) continue;
    await createNotification(
      orgId,
      targetId,
      "chat_mention",
      `${senderName} mentioned you`,
      `${where}: ${snippet}`,
      "chat_conversation",
      String(conversationId),
    );
  }
}

/**
 * Fetch an attachment's file metadata for the serving route. Verifies the caller
 * is a participant, the message belongs to the conversation, isn't deleted, and
 * actually has an attachment. Returns the on-disk path + display name + mime.
 */
export async function getAttachment(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<{ path: string; name: string; mime: string }> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg || msg.is_deleted || !msg.attachment_path) {
    throw new NotFoundError("Attachment");
  }
  return {
    path: msg.attachment_path,
    name: msg.attachment_name ?? "file",
    mime: msg.attachment_mime ?? "application/octet-stream",
  };
}

/** Soft-delete one of the caller's own messages. Returns the updated message. */
export async function deleteMessage(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<ChatMessage> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg) throw new NotFoundError("Message");
  if (msg.sender_id !== userId) {
    throw new ForbiddenError("You can only delete your own messages");
  }
  await db("chat_messages").where({ id: messageId }).update({ is_deleted: true });

  // Best-effort: remove the attachment file from disk so deleted messages don't
  // leave orphaned uploads growing forever. Stays scoped under uploads/ (the
  // stored path is relative) to avoid touching anything outside it.
  if (msg.attachment_path) {
    try {
      const uploadsBase = path.resolve(process.cwd(), "uploads");
      const abs = path.resolve(process.cwd(), msg.attachment_path);
      if (abs.startsWith(uploadsBase) && !msg.attachment_path.includes("..")) {
        fs.unlink(abs, () => {});
      }
    } catch (err) {
      logger.error("Failed to unlink deleted chat attachment", err);
    }
  }

  const sender = await db("users").where({ id: userId }).first();
  return {
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    sender_name: fullName(sender?.first_name, sender?.last_name),
    body: "",
    is_deleted: true,
    is_mine: true,
    attachment: null,
    tick_status: null,
    mentioned_user_ids: [],
    created_at: msg.created_at,
    edited_at: msg.edited_at ?? null,
  };
}

/**
 * Pin or unpin a message in a conversation. Any participant may pin/unpin
 * (flat chat permissions). Returns the affected message id.
 */
export async function setPinned(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
  pinned: boolean,
): Promise<void> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg || msg.is_deleted || msg.is_system) {
    throw new NotFoundError("Message");
  }
  await db("chat_messages")
    .where({ id: messageId })
    .update(
      pinned
        ? { pinned_at: new Date(), pinned_by: userId }
        : { pinned_at: null, pinned_by: null },
    );
}

/** The pinned messages of a conversation (newest pin first), for the pin bar. */
export async function getPinnedMessages(
  orgId: number,
  userId: number,
  conversationId: number,
): Promise<ChatMessage[]> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const rows = await db("chat_messages as m")
    .leftJoin("users as u", "u.id", "m.sender_id")
    .where("m.conversation_id", conversationId)
    .whereNotNull("m.pinned_at")
    .where("m.is_deleted", false)
    .orderBy("m.pinned_at", "desc")
    .select(
      "m.id as id",
      "m.sender_id as sender_id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "m.body as body",
      "m.attachment_path as attachment_path",
      "m.created_at as created_at",
    );
  return rows.map((r: any) => ({
    id: r.id,
    conversation_id: conversationId,
    sender_id: r.sender_id,
    sender_name: fullName(r.first_name, r.last_name),
    body: r.body ?? "",
    is_deleted: false,
    is_mine: r.sender_id === userId,
    attachment: null,
    tick_status: null,
    mentioned_user_ids: [],
    is_pinned: true,
    created_at: r.created_at,
    edited_at: null,
  }));
}

/**
 * Edit one of the caller's own (non-deleted) messages. Re-sanitizes the body,
 * stamps `edited_at`, and returns the updated message. Attachment-only messages
 * can't be edited to empty. Mentions are re-resolved so newly-added @tags work.
 */
export async function editMessage(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
  body: string,
  mentionedUserIds?: number[] | null,
): Promise<ChatMessage> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg) throw new NotFoundError("Message");
  if (msg.sender_id !== userId) {
    throw new ForbiddenError("You can only edit your own messages");
  }
  if (msg.is_deleted) throw new ValidationError("You can't edit a deleted message");

  const clean = sanitizePlainText(body) ?? "";
  if (!clean && !msg.attachment_path) {
    throw new ValidationError("A message can't be edited to empty");
  }

  const isEveryone = !!mentionedUserIds && mentionedUserIds.includes(0);
  const mentions = await resolveMentions(db, conversationId, userId, mentionedUserIds);
  const now = new Date();
  await db("chat_messages")
    .where({ id: messageId })
    .update({
      body: clean,
      edited_at: now,
      mentioned_user_ids: isEveryone
        ? JSON.stringify([0])
        : mentions.length > 0
          ? JSON.stringify(mentions)
          : null,
    });

  // Notify any NEWLY-added mentions (best-effort). If the message ALREADY had
  // @everyone before this edit, don't re-notify the whole group again — the
  // stored sentinel [0] expands to every member, so without this guard every
  // edit of an @everyone message would re-ping everyone.
  const prevMentions = parseMentionIds(msg.mentioned_user_ids);
  const prevWasEveryone = prevMentions.includes(0);
  const newlyMentioned =
    isEveryone && prevWasEveryone
      ? [] // unchanged @everyone — nobody is "newly" mentioned
      : mentions.filter((id) => !prevMentions.includes(id));
  if (newlyMentioned.length > 0) {
    const { convo } = await requireParticipant(orgId, userId, conversationId);
    const sender = await db("users").where({ id: userId }).first();
    void notifyMentions(
      orgId,
      conversationId,
      messageId,
      fullName(sender?.first_name, sender?.last_name),
      convo,
      newlyMentioned,
      clean,
    ).catch((err) => logger.error("Failed to notify edit mentions", err));
  }

  const sender = await db("users").where({ id: userId }).first();
  return {
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    sender_name: fullName(sender?.first_name, sender?.last_name),
    body: clean,
    is_deleted: false,
    is_mine: true,
    attachment: attachmentFromRow(msg),
    tick_status: null, // recomputed by listMessages/poll
    mentioned_user_ids:
      mentionedUserIds && mentionedUserIds.includes(0) ? [0] : mentions,
    created_at: msg.created_at,
    edited_at: now.toISOString(),
  };
}

/**
 * Forward a message into one or more target conversations. The caller must be a
 * participant of BOTH the source and every target. The forwarded copy carries
 * the body + attachment reference (same file, not re-uploaded) and a
 * "Forwarded from {original sender}" provenance label. Returns the created
 * messages (one per target) so the route can fan each out over the socket.
 */
export async function forwardMessage(
  orgId: number,
  userId: number,
  sourceConversationId: number,
  messageIds: number[],
  targetConversationIds: number[],
): Promise<ChatMessage[]> {
  await requireParticipant(orgId, userId, sourceConversationId);
  const db = getDB();

  // Load the source messages (chronological order = id order), skipping any
  // that are missing or deleted. Forwarding nothing valid is an error.
  const wantedIds = [...new Set(messageIds.filter((id) => id > 0))];
  if (wantedIds.length === 0) throw new ValidationError("No messages to forward");
  const srcRows = await db("chat_messages")
    .where({ conversation_id: sourceConversationId })
    .whereIn("id", wantedIds)
    .andWhere("is_deleted", false)
    .orderBy("id", "asc");
  if (srcRows.length === 0) throw new NotFoundError("Message");

  // Resolve provenance per source (re-forward keeps the ORIGINAL author).
  const senderCache = new Map<number, string>();
  const provenanceFor = async (row: any): Promise<string> => {
    if (row.forwarded_from_name) return row.forwarded_from_name;
    if (senderCache.has(row.sender_id)) return senderCache.get(row.sender_id)!;
    const u = await db("users").where({ id: row.sender_id }).first();
    const name = fullName(u?.first_name, u?.last_name);
    senderCache.set(row.sender_id, name);
    return name;
  };

  const me = await db("users").where({ id: userId }).first();
  const myName = fullName(me?.first_name, me?.last_name);

  const targets = [...new Set(targetConversationIds.filter((id) => id > 0))];
  const out: ChatMessage[] = [];
  let anyTargetValid = false;

  for (const targetId of targets) {
    // Must be a participant of the target too (skip any that fail the gate).
    try {
      await requireParticipant(orgId, userId, targetId);
    } catch {
      continue;
    }
    anyTargetValid = true;

    // Forward each source message in order into this target.
    for (const src of srcRows) {
      const origSender = await provenanceFor(src);
      const now = new Date();
      const newId = await db.transaction(async (trx) => {
        const [id] = await trx("chat_messages").insert({
          conversation_id: targetId,
          sender_id: userId,
          body: src.body,
          attachment_path: src.attachment_path,
          attachment_name: src.attachment_name,
          attachment_size: src.attachment_size,
          attachment_mime: src.attachment_mime,
          forwarded_from_name: origSender,
        });
        await trx("conversations")
          .where({ id: targetId })
          .update({ last_message_id: id, last_message_at: now, updated_at: now });
        await trx("conversation_participants")
          .where({ conversation_id: targetId, user_id: userId })
          .update({
            last_read_message_id: id,
            last_delivered_message_id: id,
            last_read_at: now,
            last_delivered_at: now,
          });
        return id;
      });

      out.push({
        id: newId,
        conversation_id: targetId,
        sender_id: userId,
        sender_name: myName,
        body: src.body,
        is_deleted: false,
        is_mine: true,
        attachment: attachmentFromRow({
          id: newId,
          conversation_id: targetId,
          attachment_path: src.attachment_path,
          attachment_name: src.attachment_name,
          attachment_size: src.attachment_size,
          attachment_mime: src.attachment_mime,
        }),
        tick_status: "sent",
        reactions: [],
        forwarded_from: origSender,
        created_at: now.toISOString(),
        edited_at: null,
      });
    }
  }

  if (!anyTargetValid) {
    throw new ForbiddenError("You aren't a participant of any of the target conversations");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/**
 * Toggle the caller's emoji reaction on a message. Adds the reaction if absent,
 * removes it if already present (idempotent via the UNIQUE constraint). Any
 * participant may react to any non-deleted message. Returns the message's fresh
 * aggregated reactions (from the CALLER's perspective).
 */
export async function toggleReaction(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
  emoji: string,
): Promise<{ message_id: number; reactions: MessageReaction[] }> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();

  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg) throw new NotFoundError("Message");
  if (msg.is_deleted) throw new ValidationError("You can't react to a deleted message");

  const existing = await db("chat_message_reactions")
    .where({ message_id: messageId, user_id: userId, emoji })
    .first();

  if (existing) {
    await db("chat_message_reactions").where({ id: existing.id }).del();
  } else {
    await db("chat_message_reactions").insert({
      message_id: messageId,
      conversation_id: conversationId,
      user_id: userId,
      emoji,
    });
  }

  const map = await reactionsByMessageId([messageId], userId);
  return { message_id: messageId, reactions: map.get(messageId) ?? [] };
}

/**
 * Aggregated reactions for one message, from `forUserId`'s perspective — used by
 * the socket layer to push a per-recipient `reaction:update`.
 */
export async function getReactionsForMessage(
  messageId: number,
  forUserId: number,
): Promise<MessageReaction[]> {
  const map = await reactionsByMessageId([messageId], forUserId);
  return map.get(messageId) ?? [];
}

// ---------------------------------------------------------------------------
// Delivery / read state
// ---------------------------------------------------------------------------

/**
 * Lazily UPSERT a receipt row for one (message, recipient), stamping delivered
 * and/or read. Idempotent on UNIQUE(message_id, recipient_id) with COALESCE so
 * duplicate/late/out-of-order events never regress a timestamp. Read implies
 * delivered. Only stamps real messages from OTHER senders (never the recipient's
 * own, never deleted). `upToId` names the single message the ledger records for
 * the group per-name panel (the aggregate tick comes from the markers, not here).
 */
async function upsertReceipt(
  db: Knex,
  conversationId: number,
  recipientId: number,
  messageId: number,
  kind: "delivered" | "read",
  now: Date,
): Promise<void> {
  // Skip if the message doesn't exist, is the recipient's own, or is deleted.
  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg || msg.sender_id === recipientId || msg.is_deleted) return;

  const deliveredAt = now;
  const readAt = kind === "read" ? now : null;
  // MySQL UPSERT via INSERT ... ON DUPLICATE KEY UPDATE with COALESCE.
  await db.raw(
    `INSERT INTO chat_message_receipts
       (message_id, conversation_id, recipient_id, delivered_at, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       delivered_at = COALESCE(delivered_at, VALUES(delivered_at)),
       read_at = COALESCE(read_at, VALUES(read_at))`,
    [messageId, conversationId, recipientId, deliveredAt, readAt, now],
  );
}

/**
 * Mark a conversation DELIVERED up to a message id for the caller (a recipient).
 * Advances the per-participant high-water marker forward-only and stamps a
 * ledger row for the named message. Returns whether anything changed (so the
 * socket layer can emit a tick to senders) — true when the marker moved.
 */
// Clamp a client-supplied read/delivered marker to the conversation's actual
// latest message id, so a caller can't poison their high-water mark with an
// arbitrary (e.g. cross-conversation) id. Returns the clamped value (0 if the
// conversation has no messages).
async function clampToLatestMessageId(
  db: Knex,
  conversationId: number,
  candidate: number,
): Promise<number> {
  const row = await db("chat_messages")
    .where({ conversation_id: conversationId })
    .max("id as maxId")
    .first();
  const maxId = Number(row?.maxId ?? 0);
  return Math.min(candidate, maxId);
}

export async function markDelivered(
  orgId: number,
  userId: number,
  conversationId: number,
  upToMessageIdRaw: number,
): Promise<boolean> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const now = new Date();
  const upToMessageId = await clampToLatestMessageId(db, conversationId, upToMessageIdRaw);
  if (upToMessageId <= 0) return false;

  const updated = await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId })
    .whereRaw("COALESCE(last_delivered_message_id, 0) < ?", [upToMessageId])
    .update({ last_delivered_message_id: upToMessageId, last_delivered_at: now });

  // Ledger the named message for the group panel (best-effort, lazy).
  await upsertReceipt(db, conversationId, userId, upToMessageId, "delivered", now);
  return updated > 0;
}

/**
 * Mark a conversation READ up to a message id for the caller. The unread-badge
 * source of truth (last_read_message_id) behaves exactly as before; this also
 * bumps the delivered marker if behind (read implies delivered) and stamps the
 * ledger. Returns true if the read marker moved.
 */
export async function markRead(
  orgId: number,
  userId: number,
  conversationId: number,
  lastReadMessageIdRaw: number,
): Promise<boolean> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();
  const now = new Date();
  const lastReadMessageId = await clampToLatestMessageId(db, conversationId, lastReadMessageIdRaw);
  if (lastReadMessageId <= 0) return false;

  // Never move the read marker backwards (unchanged unread-badge semantics).
  const updated = await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId })
    .whereRaw("COALESCE(last_read_message_id, 0) < ?", [lastReadMessageId])
    .update({ last_read_message_id: lastReadMessageId, last_read_at: now });

  // Read implies delivered — bump the delivered marker if it's behind.
  await db("conversation_participants")
    .where({ conversation_id: conversationId, user_id: userId })
    .whereRaw("COALESCE(last_delivered_message_id, 0) < ?", [lastReadMessageId])
    .update({ last_delivered_message_id: lastReadMessageId, last_delivered_at: now });

  await upsertReceipt(db, conversationId, userId, lastReadMessageId, "read", now);
  return updated > 0;
}

/**
 * Resolve tick state for the caller's own messages at or after a cursor (the
 * lowest message id still visible client-side). Used by GET /ticks and the
 * tick:resync socket event. Only returns ticks for messages the caller sent.
 */
export async function getTicksSince(
  orgId: number,
  userId: number,
  conversationId: number,
  sinceMessageId: number,
): Promise<MessageTick[]> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();

  const mine = await db("chat_messages")
    .where({ conversation_id: conversationId, sender_id: userId, is_deleted: false })
    .andWhere("id", ">=", sinceMessageId)
    .orderBy("id", "asc")
    .pluck("id");
  if (mine.length === 0) return [];

  const markers = await recipientMarkers(db, conversationId, userId);

  // Per-message counts come from the precise per-recipient comparison so the
  // group "3 of 5 read" number is exact (the cheap MIN-marker tick is the
  // aggregate single/double/blue; counts add the partial-progress detail).
  const recips = await db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .andWhereNot({ user_id: userId })
    .select("last_delivered_message_id", "last_read_message_id");

  return mine.map((id: number) => {
    let delivered_count = 0;
    let read_count = 0;
    for (const r of recips) {
      if (Number(r.last_delivered_message_id ?? 0) >= id) delivered_count++;
      if (Number(r.last_read_message_id ?? 0) >= id) read_count++;
    }
    return {
      message_id: id,
      tick_status: tickFor(id, markers),
      agg: { delivered_count, read_count, total_recipients: markers.total },
    };
  });
}

/**
 * The per-name "Read by / Delivered to / Pending" breakdown for a single
 * message the caller sent (group panel). Reads the ledger + active participants.
 */
export async function getMessageReceipts(
  orgId: number,
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<MessageReceiptBreakdown> {
  await requireParticipant(orgId, userId, conversationId);
  const db = getDB();

  const msg = await db("chat_messages")
    .where({ id: messageId, conversation_id: conversationId })
    .first();
  if (!msg) throw new NotFoundError("Message");
  if (msg.sender_id !== userId) {
    throw new ForbiddenError("You can only see receipts for your own messages");
  }

  // Active recipients (everyone except me).
  const recipients = await db("conversation_participants as cp")
    .join("users as u", "u.id", "cp.user_id")
    .where({ "cp.conversation_id": conversationId, "cp.is_active": true })
    .andWhereNot("cp.user_id", userId)
    .select(
      "u.id as recipient_id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "u.photo_path as photo_path",
      "cp.last_delivered_message_id as last_delivered_message_id",
      "cp.last_read_message_id as last_read_message_id",
    );

  // Precise per-name timestamps from the ledger (if present).
  const ledger = await db("chat_message_receipts")
    .where({ message_id: messageId })
    .select("recipient_id", "delivered_at", "read_at");
  const ledgerByRecipient = new Map<number, { delivered_at: string | null; read_at: string | null }>(
    ledger.map((r: any) => [r.recipient_id, { delivered_at: r.delivered_at, read_at: r.read_at }]),
  );

  const read: ChatMessageReceipt[] = [];
  const delivered: ChatMessageReceipt[] = [];
  const pending: ChatMessageReceipt[] = [];

  for (const r of recipients) {
    const led = ledgerByRecipient.get(r.recipient_id);
    const isRead = Number(r.last_read_message_id ?? 0) >= messageId;
    const isDelivered = Number(r.last_delivered_message_id ?? 0) >= messageId;
    const entry: ChatMessageReceipt = {
      recipient_id: r.recipient_id,
      name: fullName(r.first_name, r.last_name),
      photo_path: r.photo_path ?? null,
      delivered_at: led?.delivered_at ?? null,
      read_at: led?.read_at ?? null,
    };
    if (isRead) read.push(entry);
    else if (isDelivered) delivered.push(entry);
    else pending.push(entry);
  }

  return { message_id: messageId, read, delivered, pending };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search message bodies across the conversations the user actively participates
 * in, within their org. Case-insensitive substring match, newest-first,
 * excludes soft-deleted messages. Returns hits that deep-link into the thread.
 */
export async function searchMessages(
  orgId: number,
  userId: number,
  query: string,
  limit: number,
): Promise<MessageSearchResult[]> {
  const db = getDB();
  const term = `%${query.trim()}%`;

  const rows = await db("chat_messages as m")
    .join("conversations as c", "c.id", "m.conversation_id")
    .join("conversation_participants as me", function () {
      this.on("me.conversation_id", "=", "m.conversation_id")
        .andOn("me.user_id", "=", db.raw("?", [userId]))
        .andOn("me.is_active", "=", db.raw("?", [true]));
    })
    .join("users as u", "u.id", "m.sender_id")
    .where("c.organization_id", orgId)
    .where("m.is_deleted", false)
    .whereRaw("m.body LIKE ?", [term])
    .orderBy("m.id", "desc")
    .limit(limit)
    .select(
      "m.id as message_id",
      "m.conversation_id as conversation_id",
      "c.type as conversation_type",
      "c.name as conversation_name",
      "u.first_name as sender_first",
      "u.last_name as sender_last",
      "m.body as body",
      "m.created_at as created_at",
    );

  if (rows.length === 0) return [];

  // For direct conversations the title is the OTHER participant's name — resolve
  // those in one query.
  const directConvoIds = rows.filter((r) => r.conversation_type === "direct").map((r) => r.conversation_id);
  const directTitle = new Map<number, string>();
  if (directConvoIds.length > 0) {
    const others = await db("conversation_participants as cp")
      .join("users as u", "u.id", "cp.user_id")
      .whereIn("cp.conversation_id", directConvoIds)
      .andWhereNot("cp.user_id", userId)
      .select("cp.conversation_id as conversation_id", "u.first_name as first_name", "u.last_name as last_name");
    for (const o of others) {
      directTitle.set(o.conversation_id, fullName(o.first_name, o.last_name));
    }
  }

  return rows.map((r) => ({
    message_id: r.message_id,
    conversation_id: r.conversation_id,
    conversation_type: r.conversation_type,
    conversation_title:
      r.conversation_type === "group"
        ? r.conversation_name ?? "Group"
        : directTitle.get(r.conversation_id) ?? "Direct message",
    sender_name: fullName(r.sender_first, r.sender_last),
    body: r.body ?? "",
    created_at: r.created_at,
  }));
}

/** Total unread message count across all the user's conversations (nav badge). */
export async function getTotalUnread(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  const row = await db("chat_messages as m")
    .join("conversations as c", "c.id", "m.conversation_id")
    .join("conversation_participants as me", function () {
      this.on("me.conversation_id", "=", "m.conversation_id")
        .andOn("me.user_id", "=", db.raw("?", [userId]))
        .andOn("me.is_active", "=", db.raw("?", [true]));
    })
    .where("c.organization_id", orgId)
    .where("m.sender_id", "!=", userId)
    .where("m.is_deleted", false)
    .where("m.is_system", false)
    .whereRaw("m.id > COALESCE(me.last_read_message_id, 0)")
    .count("* as cnt")
    .first();
  return Number((row as any)?.cnt ?? 0);
}

// ---------------------------------------------------------------------------
// Realtime gateway support (used by the socket layer; no socket import here)
// ---------------------------------------------------------------------------

/** Active participant user ids for a conversation (for room fan-out). */
export async function getActiveParticipantIds(conversationId: number): Promise<number[]> {
  const db = getDB();
  return db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .pluck("user_id");
}

/**
 * The other users who share at least one active conversation with `userId`
 * within their org — i.e. the people who should hear this user's presence.
 */
export async function getPresencePeers(orgId: number, userId: number): Promise<number[]> {
  const db = getDB();
  const rows = await db("conversation_participants as me")
    .join("conversations as c", "c.id", "me.conversation_id")
    .join("conversation_participants as other", function () {
      this.on("other.conversation_id", "=", "me.conversation_id").andOn(
        "other.is_active",
        "=",
        db.raw("?", [true]),
      );
    })
    .where("c.organization_id", orgId)
    .where("me.user_id", userId)
    .where("me.is_active", true)
    .andWhereNot("other.user_id", userId)
    .distinct("other.user_id as user_id")
    .pluck("other.user_id");
  return rows;
}

/**
 * For a tick update triggered by `actorId` (a recipient who just advanced their
 * markers), compute, per OTHER sender in the conversation, that sender's set of
 * affected ticks. The socket layer emits each list to `u:{org}:{senderId}`.
 * Returns a map senderId -> MessageTick[]. Recipient-self is excluded.
 */
export async function ticksBySenderForConversation(
  conversationId: number,
  excludeUserId: number,
): Promise<Map<number, MessageTick[]>> {
  const db = getDB();
  const out = new Map<number, MessageTick[]>();

  // --- Bulk-fetch everything once (no per-sender query loop). ---
  // All non-deleted messages (id + sender), oldest first.
  const messages: { id: number; sender_id: number }[] = await db("chat_messages")
    .where({ conversation_id: conversationId, is_deleted: false })
    .orderBy("id", "asc")
    .select("id", "sender_id");

  // All active participants' read/delivered high-water markers, with their ids.
  const participants: {
    user_id: number;
    last_delivered_message_id: number | null;
    last_read_message_id: number | null;
  }[] = await db("conversation_participants")
    .where({ conversation_id: conversationId, is_active: true })
    .select("user_id", "last_delivered_message_id", "last_read_message_id");

  // Group message ids by sender (skip the actor — they don't get ticks for
  // their own read of someone else's message).
  const msgsBySender = new Map<number, number[]>();
  for (const m of messages) {
    if (m.sender_id === excludeUserId) continue;
    const arr = msgsBySender.get(m.sender_id) ?? [];
    arr.push(m.id);
    msgsBySender.set(m.sender_id, arr);
  }

  for (const [senderId, mine] of msgsBySender) {
    // Recipients = active participants other than this sender (computed from the
    // already-fetched list — no extra query).
    const recips = participants.filter((p) => p.user_id !== senderId);
    let minDelivered = Infinity;
    let minRead = Infinity;
    for (const r of recips) {
      minDelivered = Math.min(minDelivered, Number(r.last_delivered_message_id ?? 0));
      minRead = Math.min(minRead, Number(r.last_read_message_id ?? 0));
    }
    const markers: RecipientMarkers =
      recips.length === 0
        ? { total: 0, minDelivered: 0, minRead: 0 }
        : { total: recips.length, minDelivered, minRead };

    const ticks: MessageTick[] = mine.map((id) => {
      let delivered_count = 0;
      let read_count = 0;
      for (const r of recips) {
        if (Number(r.last_delivered_message_id ?? 0) >= id) delivered_count++;
        if (Number(r.last_read_message_id ?? 0) >= id) read_count++;
      }
      return {
        message_id: id,
        tick_status: tickFor(id, markers),
        agg: { delivered_count, read_count, total_recipients: markers.total },
      };
    });
    out.set(senderId, ticks);
  }
  return out;
}
