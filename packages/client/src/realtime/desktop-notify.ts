// =============================================================================
// EMP CLOUD — Browser desktop notifications for incoming chat messages
// =============================================================================
//
// Shows an OS-level notification (sender + preview) when a new chat message
// arrives, so an employee is alerted even while focused on another app (VS Code,
// etc.). Pure client-side via the Web Notifications API — no backend or service
// worker. Requires the tab to be open somewhere (background is fine).

import type { ChatMessage } from "@empcloud/shared";
import { getChatSwRegistration } from "./sw-bridge";

const SUPPORTED = typeof window !== "undefined" && "Notification" in window;
// Only nag for permission once per session if the user dismissed it.
let askedThisSession = false;

/** Whether the browser supports + the user has granted notification permission. */
export function notificationsGranted(): boolean {
  return SUPPORTED && Notification.permission === "granted";
}

/**
 * Ask for notification permission (once). Safe to call on app load; resolves to
 * the permission string. Does nothing if already decided.
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!SUPPORTED) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  if (askedThisSession) return "default";
  askedThisSession = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Build the body preview line for a message (text / attachment / mention). */
function previewOf(message: ChatMessage): string {
  if (message.attachment) {
    return message.attachment.is_image ? "📷 Photo" : `📎 ${message.attachment.name}`;
  }
  const body = (message.body || "").trim();
  return body.length > 120 ? `${body.slice(0, 120)}…` : body || "New message";
}

// De-dupe: a single logical message can arrive via both the conversation-room
// and the user-room emits. Suppress a repeat notification for the same id.
const recentlyNotified = new Set<number>();

/**
 * Show a desktop notification for an incoming message. `conversationTitle` is
 * the group name or the sender's name (for direct chats). `onClick` is invoked
 * when the user clicks the notification (focus tab + open the conversation).
 *
 * Prefers the Service Worker's showNotification when available — that's the only
 * way to attach a "Reply" action (inline reply box in Chrome/Edge). Falls back
 * to the plain Notification (no reply action) when no SW is registered.
 */
export function notifyNewMessage(
  message: ChatMessage,
  conversationTitle: string,
  onClick: () => void,
): void {
  if (!notificationsGranted()) return;
  if (message.id > 0) {
    if (recentlyNotified.has(message.id)) return;
    recentlyNotified.add(message.id);
    // Bound the set so it can't grow forever.
    if (recentlyNotified.size > 200) {
      recentlyNotified.clear();
    }
  }

  // In a group, lead with the sender; in a direct chat the title IS the sender.
  const title =
    conversationTitle === message.sender_name
      ? message.sender_name
      : `${message.sender_name} · ${conversationTitle}`;
  const body = previewOf(message);
  const tag = `chat-${message.conversation_id}`;

  // --- Preferred path: SW notification with an inline "Reply" action ---
  const reg = getChatSwRegistration();
  if (reg) {
    reg
      .showNotification(title, {
        body,
        tag,
        icon: "/favicon.ico",
        // Carry what the SW needs to send the reply / open the right thread.
        data: { conversationId: message.conversation_id, origin: window.location.origin },
        // `actions`/`renotify` exist at runtime but aren't all in the TS lib type.
        actions: [{ action: "reply", type: "text", title: "Reply", placeholder: "Type a reply…" }],
        renotify: true,
        // Keep it on screen until the user acts — without this Windows/Chrome can
        // auto-dismiss (or suppress) the popup, especially while the tab is
        // focused, which makes the reply box easy to miss.
        requireInteraction: true,
      } as NotificationOptions & {
        actions?: { action: string; type?: string; title: string; placeholder?: string }[];
        renotify?: boolean;
        requireInteraction?: boolean;
      })
      .catch(() => fallbackNotification(title, body, tag, onClick));
    return;
  }

  // --- Fallback: plain Notification (no reply action) ---
  fallbackNotification(title, body, tag, onClick);
}

function fallbackNotification(title: string, body: string, tag: string, onClick: () => void): void {
  try {
    const n = new Notification(title, {
      body,
      tag,
      renotify: true,
      icon: "/favicon.ico",
    } as NotificationOptions & { renotify?: boolean });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
    setTimeout(() => n.close(), 6000);
  } catch {
    /* notification construction can throw on some platforms — ignore */
  }
}
