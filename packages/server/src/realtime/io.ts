// =============================================================================
// EMP CLOUD — Chat realtime gateway (socket.io)
// =============================================================================
//
// Attaches a socket.io server to the existing http.Server, authenticates each
// connection by reusing the access-token verification + revocation check, and
// runs the chat realtime protocol (message:new fan-out, delivery/read acks,
// tick broadcasts). Correctness lives in the DB (see chat.service); this layer
// is a pure accelerator over the authoritative REST/polling path.

import type { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { AccessTokenPayload, ChatMessage } from "@empcloud/shared";
import { verifyAccessToken } from "../services/oauth/jwt.service.js";
import { getDB } from "../db/connection.js";
import { makeAdapterRedis } from "../db/redis.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import * as chatService from "../services/chat/chat.service.js";
import * as presence from "../services/chat/presence.service.js";
import { setChatEmitter, type ChatEmitter } from "../services/chat/chat-events.js";

type SocketUser = AccessTokenPayload;

const MAX_SOCKETS_PER_USER = 10;
const userRoom = (org: number, userId: number) => `u:${org}:${userId}`;
const convoRoom = (conversationId: number) => `c:${conversationId}`;

let ioRef: Server | null = null;

/** Module-level accessor so non-socket code can reach io if ever needed. */
export function getIO(): Server | null {
  return ioRef;
}

export async function attachChatRealtime(server: HttpServer): Promise<Server> {
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: config.cors.allowedOrigins, credentials: true },
    pingTimeout: 25000,
    pingInterval: 20000,
  });
  ioRef = io;

  // Optional Redis adapter for multi-instance (PM2 cluster) fan-out. Default
  // off — single-instance dev/prod is correct with the in-memory adapter.
  if (process.env.CHAT_WS_REDIS_ADAPTER === "true") {
    try {
      const { pub, sub } = makeAdapterRedis();
      await Promise.all([pub.connect(), sub.connect()]);
      io.adapter(createAdapter(pub, sub));
      logger.info("Chat WS Redis adapter enabled");
    } catch (err) {
      // Surface loudly — in cluster mode this silently splits delivery across
      // workers. REST polling remains the correctness backstop meanwhile.
      logger.error("Chat WS Redis adapter unavailable — degraded to per-instance fan-out", err);
    }
  }

  const chat = io.of("/chat");

  // ---- Emitter the service/REST layer calls after DB commits ----
  const emitter: ChatEmitter = {
    messageNew(orgId: number, message: ChatMessage) {
      // Open viewers of the thread:
      chat.to(convoRoom(message.conversation_id)).emit("message:new", {
        conversation_id: message.conversation_id,
        message,
      });
      // Each recipient's user room (push + sidebar bump):
      void chatService.getActiveParticipantIds(message.conversation_id).then((ids) => {
        for (const recipientId of ids) {
          if (recipientId === message.sender_id) continue;
          chat.to(userRoom(orgId, recipientId)).emit("message:new", {
            conversation_id: message.conversation_id,
            message,
          });
          chat.to(userRoom(orgId, recipientId)).emit("conversation:bump", {
            conversation_id: message.conversation_id,
            last_message_at: message.created_at,
          });
        }
      });
    },
    messageUpdate(orgId: number, conversationId: number, message: ChatMessage) {
      // Patch open viewers + each member's user room (covers edit & delete).
      chat.to(convoRoom(conversationId)).emit("message:updated", {
        conversation_id: conversationId,
        message,
      });
      void chatService.getActiveParticipantIds(conversationId).then((ids) => {
        for (const recipientId of ids) {
          chat.to(userRoom(orgId, recipientId)).emit("message:updated", {
            conversation_id: conversationId,
            message,
          });
        }
      });
    },
    async tickUpdate(orgId: number, conversationId: number, actorId: number) {
      const bySender = await chatService.ticksBySenderForConversation(conversationId, actorId);
      for (const [senderId, ticks] of bySender) {
        if (ticks.length === 0) continue;
        chat.to(userRoom(orgId, senderId)).emit("message:tick", {
          conversation_id: conversationId,
          ticks,
        });
      }
    },
    async reactionUpdate(orgId: number, conversationId: number, messageId: number) {
      // `reacted` is per-viewer, so recompute the aggregate for each recipient
      // and push to their user room (covers all their open tabs).
      const ids = await chatService.getActiveParticipantIds(conversationId);
      for (const recipientId of ids) {
        const reactions = await chatService.getReactionsForMessage(messageId, recipientId);
        chat.to(userRoom(orgId, recipientId)).emit("reaction:update", {
          conversation_id: conversationId,
          message_id: messageId,
          reactions,
        });
      }
    },
    conversationBump(orgId: number, userId: number, conversationId: number) {
      chat.to(userRoom(orgId, userId)).emit("conversation:bump", {
        conversation_id: conversationId,
      });
    },
  };
  setChatEmitter(emitter);

  // ---- Handshake auth: reuse verifyAccessToken + revocation check ----
  chat.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: string })?.token ??
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!raw) return next(new Error("UNAUTHORIZED"));

      const decoded = verifyAccessToken(raw);
      const rec = await getDB()("oauth_access_tokens")
        .where({ jti: decoded.jti })
        .whereNull("revoked_at")
        .first();
      if (!rec) return next(new Error("UNAUTHORIZED"));

      socket.data.user = decoded as SocketUser;
      next();
    } catch (err: any) {
      next(new Error(err?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"));
    }
  });

  // Authoritative online check: a user is online iff their user room has at
  // least one live socket. Backed by the adapter, so it can't drift.
  const isUserOnline = (orgId: number, userId: number): boolean => {
    const room = chat.adapter.rooms.get(userRoom(orgId, userId));
    return !!room && room.size > 0;
  };

  chat.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    const org = user.org_id;
    const uid = user.sub;
    const isUserOnlineInOrg = (userId: number) => isUserOnline(org, userId);

    // Per-user concurrent-socket cap (WS bypasses the HTTP rate limiter).
    const existing = chat.adapter.rooms.get(userRoom(org, uid));
    if (existing && existing.size >= MAX_SOCKETS_PER_USER) {
      socket.emit("error", { code: "RATE_LIMITED" });
      socket.disconnect(true);
      return;
    }

    socket.join(userRoom(org, uid));

    // ---- Presence: mark online; if this is the user's first socket, tell their
    // conversation peers they came online. ----
    const broadcastPresence = (isOnline: boolean) => {
      void chatService.getPresencePeers(org, uid).then((peers) => {
        for (const peerId of peers) {
          chat.to(userRoom(org, peerId)).emit("presence:update", {
            user_id: uid,
            online: isOnline,
            last_seen: isOnline ? null : new Date().toISOString(),
          });
        }
      });
    };
    // Announce online on connect (idempotent for peers — they just set
    // online=true). Authoritative online status is the user room's membership.
    broadcastPresence(true);

    // Client asks for the current presence of a set of users (on opening a chat).
    // SECURITY: a caller may only resolve presence for users they actually share
    // a conversation with (plus themselves). This blocks both cross-org id
    // enumeration and same-org enumeration of arbitrary users' last_seen.
    socket.on("presence:get", async (payload, ack) => {
      try {
        const requested = Array.isArray(payload?.user_ids)
          ? payload.user_ids.map((n: unknown) => Number(n)).filter((n: number) => n > 0)
          : [];
        if (requested.length === 0) {
          ack?.({ presence: [] });
          return;
        }
        const peers = new Set(await chatService.getPresencePeers(org, uid));
        peers.add(uid); // self is always allowed
        const ids = requested.filter((id: number) => peers.has(id));
        ack?.({ presence: await presence.getPresence(org, ids, isUserOnlineInOrg) });
      } catch {
        ack?.({ presence: [] });
      }
    });

    // Disconnect when the access token expires (io.use doesn't re-run on a live
    // connection). The client refreshes + reconnects.
    const expMs = (user.exp ?? 0) * 1000 - Date.now();
    let expiryTimer: NodeJS.Timeout | null = null;
    if (expMs > 0) {
      expiryTimer = setTimeout(() => {
        socket.emit("error", { code: "TOKEN_EXPIRED" });
        socket.disconnect(true);
      }, expMs);
    }

    // ---- conversation:open — join the convo room + mark delivered ----
    socket.on("conversation:open", async (payload, ack) => {
      try {
        const conversationId = Number(payload?.conversation_id);
        if (!conversationId) return ack?.({ ok: false });
        // Re-validate participation (gates on is_active).
        await chatService.getConversation(org, uid, conversationId);
        socket.join(convoRoom(conversationId));
        const latest = await getDB()("chat_messages")
          .where({ conversation_id: conversationId })
          .max("id as maxId")
          .first();
        const maxId = Number((latest as { maxId?: number })?.maxId ?? 0);
        if (maxId > 0) {
          await chatService.markDelivered(org, uid, conversationId, maxId);
          await emitter.tickUpdate(org, conversationId, uid);
        }
        ack?.({ ok: true, last_message_id: maxId });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on("conversation:close", (payload, ack) => {
      const conversationId = Number(payload?.conversation_id);
      if (conversationId) socket.leave(convoRoom(conversationId));
      ack?.({ ok: true });
    });

    // ---- typing:start / typing:stop — relay to the rest of the room ----
    // No DB. socket.to(room) excludes the sender's own socket. The recipient
    // self-expires the indicator after a short timeout, so a missed "stop" is
    // self-healing.
    const relayTyping = (payload: { conversation_id?: number }, typing: boolean) => {
      const conversationId = Number(payload?.conversation_id);
      if (!conversationId) return;
      socket.to(convoRoom(conversationId)).emit("typing:update", {
        conversation_id: conversationId,
        user_id: uid,
        name: user.first_name || "Someone",
        typing,
      });
    };
    socket.on("typing:start", (payload) => relayTyping(payload, true));
    socket.on("typing:stop", (payload) => relayTyping(payload, false));

    // ---- message:delivered — recipient device received a message ----
    socket.on("message:delivered", async (payload, ack) => {
      try {
        const conversationId = Number(payload?.conversation_id);
        const upTo = Number(payload?.up_to_message_id);
        if (!conversationId || !upTo) return ack?.({ ok: false });
        await chatService.markDelivered(org, uid, conversationId, upTo);
        // Emit a tick even on a no-op so a reconnected sender still updates.
        await emitter.tickUpdate(org, conversationId, uid);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    // ---- message:read — recipient viewed messages ----
    socket.on("message:read", async (payload, ack) => {
      try {
        const conversationId = Number(payload?.conversation_id);
        const upTo = Number(payload?.up_to_message_id);
        if (!conversationId || !upTo) return ack?.({ ok: false });
        await chatService.markRead(org, uid, conversationId, upTo);
        await emitter.tickUpdate(org, conversationId, uid);
        ack?.({ ok: true, last_read_message_id: upTo });
      } catch {
        ack?.({ ok: false });
      }
    });

    // ---- tick:resync — sender pulls current tick state on (re)connect ----
    socket.on("tick:resync", async (payload, ack) => {
      try {
        const conversationId = Number(payload?.conversation_id);
        const since = Number(payload?.since_message_id ?? 0);
        if (!conversationId) return ack?.({ ticks: [] });
        const ticks = await chatService.getTicksSince(org, uid, conversationId, since);
        ack?.({ ticks });
      } catch {
        ack?.({ ticks: [] });
      }
    });

    socket.on("disconnect", () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      // Truth = actual room membership, not a manual counter (which can drift
      // across reconnects). By the time `disconnect` fires, this socket has
      // already left its rooms, so an empty user room means the user has no
      // other live tabs/devices → now offline. A short defer lets the adapter
      // finish the room cleanup before we read it.
      setTimeout(() => {
        const room = chat.adapter.rooms.get(userRoom(org, uid));
        const stillOnline = !!room && room.size > 0;
        if (!stillOnline) {
          void presence.markOffline(uid).then(() => broadcastPresence(false));
        }
      }, 50);
    });
  });

  logger.info("Chat realtime gateway attached (namespace /chat)");
  return io;
}
