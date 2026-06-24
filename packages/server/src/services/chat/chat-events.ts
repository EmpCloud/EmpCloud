// =============================================================================
// EMP CLOUD — Chat realtime event emitter (decoupling seam)
// =============================================================================
//
// The REST/service layer calls these after a DB write to push realtime updates.
// The socket.io gateway (realtime/io.ts) registers the actual emitter via
// `setChatEmitter`. Until it does — and in tests, or when WebSockets are
// disabled — every function here is a safe no-op, so the chat works perfectly
// over REST + polling alone. This keeps the service layer free of any socket.io
// import.

import type { ChatMessage, MessageTick } from "@empcloud/shared";

export interface ChatEmitter {
  /** Fan a new message out to recipients + open viewers. */
  messageNew(orgId: number, message: ChatMessage): void;
  /**
   * Fan an UPDATED message (edited or deleted) out to a conversation so open
   * viewers patch their copy instead of waiting for the next poll.
   */
  messageUpdate(orgId: number, conversationId: number, message: ChatMessage): void;
  /**
   * Push updated reactions for a message to a conversation. Because `reacted`
   * is per-viewer, the emitter recomputes the aggregate per recipient.
   */
  reactionUpdate(orgId: number, conversationId: number, messageId: number): Promise<void>;
  /** Nudge a single user's sidebar to refresh (e.g. added to a group). */
  conversationBump(orgId: number, userId: number, conversationId: number): void;
  /**
   * Tell the senders in a conversation that `actorId` (a recipient) just
   * advanced their delivered/read markers, so their ticks should update.
   * The emitter computes per-sender ticks and pushes `message:tick`.
   */
  tickUpdate(orgId: number, conversationId: number, actorId: number): Promise<void>;
  /** Push a precomputed set of ticks to a single sender (resync helper). */
  ticksTo?(orgId: number, userId: number, conversationId: number, ticks: MessageTick[]): void;
}

let emitter: ChatEmitter | null = null;

/** Registered by the socket gateway on boot. Pass null to detach (shutdown). */
export function setChatEmitter(e: ChatEmitter | null): void {
  emitter = e;
}

export function emitMessageNew(orgId: number, message: ChatMessage): void {
  emitter?.messageNew(orgId, message);
}

export function emitMessageUpdate(
  orgId: number,
  conversationId: number,
  message: ChatMessage,
): void {
  emitter?.messageUpdate(orgId, conversationId, message);
}

export async function emitTickUpdate(
  orgId: number,
  conversationId: number,
  actorId: number,
): Promise<void> {
  if (emitter) await emitter.tickUpdate(orgId, conversationId, actorId);
}

export async function emitReactionUpdate(
  orgId: number,
  conversationId: number,
  messageId: number,
): Promise<void> {
  if (emitter) await emitter.reactionUpdate(orgId, conversationId, messageId);
}

export function emitConversationBump(
  orgId: number,
  userId: number,
  conversationId: number,
): void {
  emitter?.conversationBump(orgId, userId, conversationId);
}
