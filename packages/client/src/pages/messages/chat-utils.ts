// =============================================================================
// EMP CLOUD — Chat helpers
// =============================================================================

/**
 * Whether a message body is purely emoji (1–3 of them), so it can render large
 * and bubble-less like WhatsApp/iMessage "jumbo emoji". Returns the emoji count
 * (0 = not emoji-only). Uses Unicode property escapes to match emoji + their
 * modifiers/ZWJ sequences, ignoring surrounding whitespace.
 */
export function emojiOnlyCount(body: string): number {
  const text = (body ?? "").trim();
  if (!text) return 0;

  // Reject anything containing a non-emoji visible character (letters, digits,
  // punctuation). Allow emoji, plus the joiners/selectors/skin-tones that form
  // composite emoji, plus whitespace.
  const allowed = /^[\s\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}#*0-9⃣]*$/u;
  // (digits/#/* are only allowed because keycap emoji like 1️⃣ use them; a bare
  // "123" still fails below because it has no pictographic char.)
  if (!allowed.test(text)) return 0;
  if (!/\p{Extended_Pictographic}/u.test(text)) return 0;

  // Count grapheme clusters (so a ZWJ sequence like 👨‍💻 counts as one).
  // Intl.Segmenter isn't in the configured TS lib, so reference it dynamically.
  let count: number;
  const SegmenterCtor = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        opts?: { granularity?: "grapheme" | "word" | "sentence" },
      ) => { segment(s: string): Iterable<unknown> };
    }
  ).Segmenter;
  const bare = text.replace(/\s/g, "");
  if (SegmenterCtor) {
    const seg = new SegmenterCtor(undefined, { granularity: "grapheme" });
    count = [...seg.segment(bare)].length;
  } else {
    // Fallback: collapse joiners/selectors/modifiers, then count base emoji.
    const stripped = bare.replace(/[‍️\u{1F3FB}-\u{1F3FF}]/gu, "");
    count = (stripped.match(/\p{Extended_Pictographic}/gu) || []).length;
  }
  return count >= 1 && count <= 3 ? count : 0;
}

/** Split a display name into first/last parts for avatar initials. */
export function splitName(name: string | null | undefined): { first: string; last: string } {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first, last };
}

/** Compact relative time for the conversation list (e.g. "5m", "2h", "Mar 3"). */
export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Clock time shown beside a message bubble (e.g. "9:41 AM"). */
export function clockTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "last seen" label from a timestamp (e.g. "last seen just now", "5m ago"). */
export function lastSeenLabel(dateStr: string | null): string {
  if (!dateStr) return "offline";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "offline";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "last seen just now";
  if (diff < 3600) return `last seen ${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `last seen ${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `last seen ${days}d ago`;
  return `last seen ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Human-readable file size (e.g. "843 B", "1.2 MB"). */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Day label for grouping messages by date (e.g. "Today", "Yesterday", "Mar 3"). */
export function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
