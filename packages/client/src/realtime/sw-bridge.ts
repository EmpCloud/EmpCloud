// =============================================================================
// EMP Cloud — Chat Service Worker bridge (page side)
// Registers /chat-sw.js and mirrors the auth token + origin into IndexedDB so
// the SW can authenticate the inline-reply POST (a SW can't read localStorage).
// Notification action buttons (inline reply) require a Service Worker; this is
// what makes "reply from the notification" possible in Chrome/Edge.
// =============================================================================

const DB_NAME = "empcloud-chat-sw";
const STORE = "kv";

const SW_SUPPORTED =
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  typeof indexedDB !== "undefined";

let registration: ServiceWorkerRegistration | null = null;

function idbSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    open.onerror = () => resolve();
  });
}

/** Register the chat SW (idempotent). Returns the registration or null. */
export async function registerChatServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!SW_SUPPORTED) return null;
  if (registration) return registration;
  try {
    registration = await navigator.serviceWorker.register("/chat-sw.js", { scope: "/" });
    await idbSet("origin", window.location.origin);
    return registration;
  } catch {
    return null;
  }
}

/** Keep the SW's copy of the access token fresh (call on login + token refresh). */
export async function syncTokenToServiceWorker(token: string | null): Promise<void> {
  if (!SW_SUPPORTED) return;
  await idbSet("accessToken", token ?? "");
}

/** The active registration, if registered. */
export function getChatSwRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

export const chatServiceWorkerSupported = SW_SUPPORTED;
