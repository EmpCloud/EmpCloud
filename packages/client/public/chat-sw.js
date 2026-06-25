/* =============================================================================
 * EMP Cloud — Chat notification Service Worker
 * Enables INLINE REPLY from a desktop chat notification (Chrome/Edge: type a
 * reply in the notification; other browsers fall back to click-to-open).
 *
 * It reads the auth token + API origin from IndexedDB (the page syncs them via
 * src/realtime/sw-bridge.ts — the SW can't read localStorage), then POSTs the
 * reply to the chat send-message endpoint.
 * ========================================================================== */

const DB_NAME = "empcloud-chat-sw";
const STORE = "kv";

// --- tiny IndexedDB key/value helper (no libs in a SW) -----------------------
function idbGet(key) {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    };
    open.onerror = () => resolve(null);
  });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  const notif = event.notification;
  const data = notif.data || {};
  const conversationId = data.conversationId;
  const replyText = (event.reply || "").trim(); // present only for the inline reply action

  notif.close();

  // Inline reply: send it to the chat API, then notify the page so it can
  // refresh the thread if it's open.
  if (event.action === "reply" && replyText && conversationId) {
    event.waitUntil(sendReply(conversationId, replyText, data.origin));
    return;
  }

  // Otherwise (click body, or a browser without inline reply): focus/open the app
  // on that conversation.
  const target = (data.origin || self.location.origin) + "/messages/" + (conversationId ?? "");
  event.waitUntil(focusOrOpen(target));
});

async function sendReply(conversationId, body, origin) {
  const token = await idbGet("accessToken");
  const apiBase = (origin || self.location.origin) + "/api/v1";
  try {
    const res = await fetch(`${apiBase}/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      // Token may be stale / chat disabled — fall back to opening the app so the
      // user can resend in-context rather than silently losing the message.
      await focusOrOpen((origin || self.location.origin) + "/messages/" + conversationId);
      return;
    }
    // Tell any open tab to refetch the thread + conversation list.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "chat:reply-sent", conversationId });
  } catch {
    await focusOrOpen((origin || self.location.origin) + "/messages/" + conversationId);
  }
}

async function focusOrOpen(url) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clients) {
    // Reuse an existing tab on the same origin.
    if ("focus" in c) {
      c.navigate?.(url).catch(() => {});
      return c.focus();
    }
  }
  return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
}
