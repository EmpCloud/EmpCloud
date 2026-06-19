// =============================================================================
// EMP CLOUD — Render message body with highlighted @-mentions (full names)
// =============================================================================

import { Fragment } from "react";
import type { ChatParticipant } from "@empcloud/shared";

interface Hit {
  start: number;
  end: number; // exclusive
  /** The mentioned user's id; 0 for @everyone/@all (not clickable). */
  userId: number;
}

/**
 * Split a message body into text + highlighted @mention chips. Mentions are
 * full names (e.g. "@Rahul Sharma") plus @everyone/@all. We match participant
 * names (longest first) so multi-word names highlight as a single chip, and
 * never overlap. When `onMentionClick` is supplied, a person mention renders as
 * a clickable chip that opens that user's direct chat.
 */
export function renderWithMentions(
  body: string,
  participants: ChatParticipant[],
  _mentionedIds: number[] | undefined,
  mine: boolean,
  onMentionClick?: (userId: number) => void,
): React.ReactNode {
  if (!body) return body;

  const lower = body.toLowerCase();
  const hits: Hit[] = [];

  const addHits = (needle: string, userId: number) => {
    let from = 0;
    while (true) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const before = at === 0 ? " " : body[at - 1];
      const afterIdx = at + needle.length;
      const after = afterIdx >= body.length ? " " : body[afterIdx];
      const boundaryOk =
        /\s/.test(before) &&
        (/\s/.test(after) || /[.,!?;:]/.test(after) || afterIdx >= body.length);
      if (boundaryOk) hits.push({ start: at, end: afterIdx, userId });
      from = at + needle.length;
    }
  };

  // @everyone / @all (userId 0 = not clickable)
  for (const word of ["@everyone", "@all"]) addHits(word, 0);
  // Full names, longest first.
  const sorted = [...participants].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) addHits(`@${p.name.toLowerCase()}`, p.user_id);

  if (hits.length === 0) return body;

  // Sort + drop overlaps (a longer match already covers a shorter inner one).
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const clean: Hit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start >= lastEnd) {
      clean.push(h);
      lastEnd = h.end;
    }
  }

  const baseChip = mine
    ? "font-semibold text-white underline underline-offset-2 decoration-white/50"
    : "font-semibold text-brand-700";

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const h of clean) {
    if (h.start > cursor) {
      parts.push(<Fragment key={`t${key++}`}>{body.slice(cursor, h.start)}</Fragment>);
    }
    const text = body.slice(h.start, h.end);
    // A person mention with a click handler becomes a clickable chip; @everyone
    // (userId 0) stays a plain highlight.
    if (h.userId > 0 && onMentionClick) {
      const uid = h.userId;
      parts.push(
        <span
          key={`m${key++}`}
          role="button"
          tabIndex={0}
          title={`Open chat with ${text.slice(1)}`}
          onClick={(e) => {
            e.stopPropagation();
            onMentionClick(uid);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onMentionClick(uid);
            }
          }}
          className={`${baseChip} cursor-pointer hover:opacity-80`}
        >
          {text}
        </span>,
      );
    } else {
      parts.push(
        <span key={`m${key++}`} className={baseChip}>
          {text}
        </span>,
      );
    }
    cursor = h.end;
  }
  if (cursor < body.length) {
    parts.push(<Fragment key={`t${key++}`}>{body.slice(cursor)}</Fragment>);
  }
  return parts;
}
