// =============================================================================
// EMP CLOUD — Chat realtime socket provider
// =============================================================================
//
// Owns the single chat socket for the whole app. Mounted ABOVE the routed pages
// (wrapping DashboardLayout) so the connection survives route + conversation
// changes. The socket is a pure accelerator: react-query polling stays on as
// the durable fallback, and every socket event maps to an authoritative cache
// update. Gated behind VITE_CHAT_WS — flag off ⇒ byte-for-byte the polling chat.

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import type { ChatMessage, MessageTick, MessageReaction, ConversationSummary } from "@empcloud/shared";
import { useAuthStore } from "@/lib/auth-store";
import { queryClient } from "@/main";
import { notifyNewMessage } from "./desktop-notify";

const WS_ENABLED = import.meta.env.VITE_CHAT_WS === "true";

interface ChatSocketContextValue {
  socket: Socket | null;
  connected: boolean;
  /** Join a conversation room (server auto-marks delivered on open). */
  openConversation: (conversationId: number) => void;
  /** Leave a conversation room. */
  closeConversation: (conversationId: number) => void;
  /** Tell the server this device received messages up to an id (double tick). */
  markDelivered: (conversationId: number, upToMessageId: number) => void;
  /** Tell the server the user has read up to an id (blue tick). */
  markRead: (conversationId: number, upToMessageId: number) => void;
  /** Emit that the current user started/stopped typing in a conversation. */
  emitTyping: (conversationId: number, isTyping: boolean) => void;
  /** Names of people currently typing in a given conversation. */
  typingNames: (conversationId: number) => string[];
  /** Ask the server for presence of a set of users (refreshes the cache). */
  fetchPresence: (userIds: number[]) => void;
  /** Current known presence of a user (online + last_seen), or undefined. */
  presenceOf: (userId: number) => { online: boolean; last_seen: string | null } | undefined;
}

export interface UserPresence {
  online: boolean;
  last_seen: string | null;
}

const ChatSocketContext = createContext<ChatSocketContextValue>({
  socket: null,
  connected: false,
  openConversation: () => {},
  closeConversation: () => {},
  markDelivered: () => {},
  markRead: () => {},
  emitTyping: () => {},
  typingNames: () => [],
  fetchPresence: () => {},
  presenceOf: () => undefined,
});

export function useChatSocket() {
  return useContext(ChatSocketContext);
}

// --- cache helpers -----------------------------------------------------------

const msgKey = (cid: number) => ["chat-messages", cid] as const;

function appendMessage(cid: number, message: ChatMessage) {
  queryClient.setQueryData<ChatMessage[]>(msgKey(cid), (old) => {
    if (!old) return old; // thread not loaded yet; the poll/open will hydrate it
    // Dedupe by real id and by optimistic client_msg_id.
    if (old.some((m) => m.id === message.id)) return old;
    if (message.client_msg_id) {
      const tempIdx = old.findIndex(
        (m) => m.client_msg_id && m.client_msg_id === message.client_msg_id,
      );
      if (tempIdx >= 0) {
        const next = old.slice();
        next[tempIdx] = message;
        return next;
      }
    }
    return [...old, message];
  });
}

function applyTicks(cid: number, ticks: MessageTick[]) {
  if (ticks.length === 0) return;
  const byId = new Map(ticks.map((t) => [t.message_id, t]));
  queryClient.setQueryData<ChatMessage[]>(msgKey(cid), (old) => {
    if (!old) return old;
    let changed = false;
    const next = old.map((m) => {
      const t = byId.get(m.id);
      if (t && m.is_mine && m.tick_status !== t.tick_status) {
        changed = true;
        return { ...m, tick_status: t.tick_status };
      }
      return m;
    });
    return changed ? next : old;
  });
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  // Keep navigate in a ref so the (stable-dep) socket effect always calls the
  // current router navigate from a notification click.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // Conversations the client wants joined — re-issued on every reconnect.
  const openRoomsRef = useRef<Set<number>>(new Set());
  // Who's typing, per conversation: convId -> (userId -> {name, timer}).
  const [typing, setTyping] = useState<Record<number, Record<number, string>>>({});
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Presence cache: userId -> { online, last_seen }.
  const [presence, setPresence] = useState<Record<number, UserPresence>>({});

  useEffect(() => {
    if (!WS_ENABLED || !accessToken || !userId) return;

    // NOTE: we deliberately do NOT auto-request notification permission here.
    // Browsers silently ignore Notification.requestPermission() unless it's
    // triggered by a user gesture, so requesting on mount fails without a prompt
    // and leaves permission stuck at "default" (no notifications ever show). The
    // user grants it via the explicit "Enable desktop alerts" button in the bell
    // dropdown instead.

    // Function-form auth re-reads the freshest token on every (re)connect.
    const socket = io("/chat", {
      path: "/socket.io",
      transports: ["websocket"],
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken ?? "" }),
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Resync: pull fresh snapshots + re-open rooms + request tick resync.
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      for (const cid of openRoomsRef.current) {
        socket.emit("conversation:open", { conversation_id: cid });
        queryClient.invalidateQueries({ queryKey: msgKey(cid) });
        // since = lowest visible id (tick state changes on old messages too).
        const msgs = queryClient.getQueryData<ChatMessage[]>(msgKey(cid));
        const since = msgs && msgs.length ? msgs[0].id : 0;
        socket.emit(
          "tick:resync",
          { conversation_id: cid, since_message_id: since },
          (ack: { ticks?: MessageTick[] }) => applyTicks(cid, ack?.ticks ?? []),
        );
      }
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("error", (e: { code?: string }) => {
      // Token expired/revoked mid-session: drop the socket; the axios refresh
      // flow + a fresh token reconnect on the next render cycle.
      if (e?.code === "TOKEN_EXPIRED" || e?.code === "UNAUTHORIZED") {
        setConnected(false);
      }
    });

    // New message → cache append + sidebar refresh + auto-ack delivery so the
    // sender's double tick reflects this device receiving it (even if the
    // thread isn't open).
    socket.on(
      "message:new",
      (p: { conversation_id: number; message: ChatMessage }) => {
        // The server emits one message object to every recipient with the
        // SENDER's perspective (is_mine=true, sender's tick_status). Re-derive
        // both from THIS viewer's identity before caching, otherwise a received
        // message would render as "mine" (right-aligned, with ticks) and the
        // auto-scroll would treat it as our own send.
        const mine = p.message.sender_id === userId;
        const message: ChatMessage = mine
          ? p.message
          : { ...p.message, is_mine: false, tick_status: null };
        appendMessage(p.conversation_id, message);
        queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
        // Don't ack delivery for — or notify about — our own messages.
        if (p.message.sender_id !== userId) {
          socket.emit("message:delivered", {
            conversation_id: p.conversation_id,
            up_to_message_id: p.message.id,
          });
          // Desktop notification — skip if the user muted this conversation.
          // Resolve a display title from the conversations cache; fall back to
          // sender.
          const convos = queryClient.getQueryData<ConversationSummary[]>(["chat-conversations"]);
          const convo = convos?.find((c) => c.id === p.conversation_id);
          if (!convo?.is_muted) {
            const title = convo?.title ?? p.message.sender_name;
            notifyNewMessage(p.message, title, () =>
              navigateRef.current(`/messages/${p.conversation_id}`),
            );
          }
        }
      },
    );

    // Edited/deleted message → patch the matching cache row in place.
    socket.on(
      "message:updated",
      (p: { conversation_id: number; message: ChatMessage }) => {
        queryClient.setQueryData<ChatMessage[]>(msgKey(p.conversation_id), (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === p.message.id
              ? // Preserve the viewer's own tick_status / is_mine perspective.
                { ...p.message, is_mine: m.is_mine, tick_status: m.tick_status }
              : m,
          );
        });
        queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      },
    );

    socket.on(
      "message:tick",
      (p: { conversation_id: number; ticks: MessageTick[] }) => {
        applyTicks(p.conversation_id, p.ticks);
      },
    );

    // Reactions changed on a message — patch that message's reactions in place.
    socket.on(
      "reaction:update",
      (p: { conversation_id: number; message_id: number; reactions: MessageReaction[] }) => {
        queryClient.setQueryData<ChatMessage[]>(msgKey(p.conversation_id), (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === p.message_id ? { ...m, reactions: p.reactions } : m,
          );
        });
      },
    );

    socket.on("conversation:bump", () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    });

    // Someone in a conversation started/stopped typing. Self-expire after ~4s
    // so a dropped "stop" doesn't leave the indicator stuck.
    socket.on(
      "typing:update",
      (p: { conversation_id: number; user_id: number; name: string; typing: boolean }) => {
        const key = `${p.conversation_id}:${p.user_id}`;
        const existing = typingTimers.current.get(key);
        if (existing) clearTimeout(existing);

        if (p.typing) {
          setTyping((prev) => ({
            ...prev,
            [p.conversation_id]: { ...(prev[p.conversation_id] ?? {}), [p.user_id]: p.name },
          }));
          const t = setTimeout(() => {
            typingTimers.current.delete(key);
            setTyping((prev) => {
              const conv = { ...(prev[p.conversation_id] ?? {}) };
              delete conv[p.user_id];
              return { ...prev, [p.conversation_id]: conv };
            });
          }, 6000); // > sender's 3s re-emit interval, so it won't flicker
          typingTimers.current.set(key, t);
        } else {
          typingTimers.current.delete(key);
          setTyping((prev) => {
            const conv = { ...(prev[p.conversation_id] ?? {}) };
            delete conv[p.user_id];
            return { ...prev, [p.conversation_id]: conv };
          });
        }
      },
    );

    // A peer came online / went offline.
    socket.on(
      "presence:update",
      (p: { user_id: number; online: boolean; last_seen: string | null }) => {
        setPresence((prev) => ({
          ...prev,
          [p.user_id]: { online: p.online, last_seen: p.last_seen ?? prev[p.user_id]?.last_seen ?? null },
        }));
      },
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
      setTyping({});
      setPresence({});
    };
    // Reconnect only on login/logout (token presence) or user change — NOT on
    // routine token refresh (function-form auth picks the new token up on the
    // next natural reconnect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(accessToken), userId]);

  // All emit/room functions use only refs, so they're STABLE (empty deps). This
  // is load-bearing: MessageThread's open/close-room effect depends on
  // openConversation/closeConversation — if these changed identity on every
  // SocketProvider render (which happens on every typing/presence update), that
  // effect would thrash (leave + rejoin the room constantly), dropping the user
  // out of the c:{id} room and making them miss inbound typing events.
  const openConversation = useCallback((cid: number) => {
    openRoomsRef.current.add(cid);
    socketRef.current?.emit("conversation:open", { conversation_id: cid });
  }, []);
  const closeConversation = useCallback((cid: number) => {
    openRoomsRef.current.delete(cid);
    socketRef.current?.emit("conversation:close", { conversation_id: cid });
  }, []);
  const markDelivered = useCallback((cid: number, upTo: number) => {
    socketRef.current?.emit("message:delivered", { conversation_id: cid, up_to_message_id: upTo });
  }, []);
  const markRead = useCallback((cid: number, upTo: number) => {
    socketRef.current?.emit("message:read", { conversation_id: cid, up_to_message_id: upTo });
  }, []);
  const emitTyping = useCallback((cid: number, isTyping: boolean) => {
    socketRef.current?.emit(isTyping ? "typing:start" : "typing:stop", { conversation_id: cid });
  }, []);
  const fetchPresence = useCallback((userIds: number[]) => {
    const s = socketRef.current;
    if (!s || userIds.length === 0) return;
    s.emit(
      "presence:get",
      { user_ids: userIds },
      (ack: { presence?: Array<{ user_id: number; online: boolean; last_seen: string | null }> }) => {
        if (!ack?.presence) return;
        setPresence((prev) => {
          const next = { ...prev };
          for (const p of ack.presence!) {
            next[p.user_id] = { online: p.online, last_seen: p.last_seen };
          }
          return next;
        });
      },
    );
  }, []);

  // State-dependent readers: change identity only when their state changes.
  const typingNames = useCallback(
    (cid: number) => Object.values(typing[cid] ?? {}),
    [typing],
  );
  const presenceOf = useCallback((userId: number) => presence[userId], [presence]);

  const value = useMemo<ChatSocketContextValue>(
    () => ({
      socket: socketRef.current,
      connected,
      openConversation,
      closeConversation,
      markDelivered,
      markRead,
      emitTyping,
      typingNames,
      fetchPresence,
      presenceOf,
    }),
    [
      connected,
      openConversation,
      closeConversation,
      markDelivered,
      markRead,
      emitTyping,
      typingNames,
      fetchPresence,
      presenceOf,
    ],
  );

  return <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>;
}
