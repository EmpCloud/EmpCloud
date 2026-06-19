// =============================================================================
// EMP CLOUD — @-mention helpers for the chat composer
// =============================================================================

import type { ChatParticipant } from "@empcloud/shared";

/** A pickable mention target: a group member, or the special @everyone. */
export interface MentionTarget {
  /** 0 = @everyone; otherwise the member's user_id. */
  id: number;
  /** The token inserted into the text after "@" — the member's FULL name (or "everyone"). */
  token: string;
  /** Display label in the dropdown. */
  label: string;
  /** Subtitle (designation) for disambiguation. */
  sub?: string | null;
  photo_path?: string | null;
}

/** First word of a name (used for matching the typed query). */
export function firstNameOf(name: string): string {
  return (name.trim().split(/\s+/)[0] || name).trim();
}

/**
 * Detect an in-progress "@query" immediately before the caret. Returns the
 * query (text after @, may be empty) and the @'s start index, or null when the
 * caret isn't in a mention context. The @ must start the text or follow
 * whitespace, and the query may not contain whitespace.
 */
export function getMentionQuery(
  text: string,
  caret: number,
): { query: string; atIndex: number } | null {
  // Walk back from the caret to find an @ not preceded by a non-space.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const before = i === 0 ? " " : text[i - 1];
      if (/\s/.test(before) || i === 0) {
        const query = text.slice(i + 1, caret);
        // A mention query can't contain whitespace (that ends the token).
        if (/\s/.test(query)) return null;
        return { query, atIndex: i };
      }
      return null;
    }
    if (/\s/.test(ch)) return null; // hit whitespace before an @ → not a mention
    i--;
  }
  return null;
}

/**
 * Build the mention candidate list for a group, filtered by a query. Always
 * offers @everyone first (when the query matches), then members whose first or
 * full name starts with / contains the query. Excludes the current user.
 */
export function mentionCandidates(
  participants: ChatParticipant[],
  meId: number | undefined,
  query: string,
): MentionTarget[] {
  const q = query.toLowerCase();
  const out: MentionTarget[] = [];

  if ("everyone".startsWith(q) || "all".startsWith(q) || q === "") {
    out.push({ id: 0, token: "everyone", label: "Everyone", sub: "Notify the whole group" });
  }

  for (const p of participants) {
    if (p.user_id === meId) continue;
    const name = p.name.toLowerCase();
    const first = firstNameOf(p.name).toLowerCase();
    if (q === "" || name.includes(q) || first.startsWith(q)) {
      out.push({
        id: p.user_id,
        token: p.name, // insert the FULL name
        label: p.name,
        sub: p.designation,
        photo_path: p.photo_path,
      });
    }
  }
  return out.slice(0, 8); // cap the dropdown
}

/**
 * Find which participants are @-mentioned in a body by matching their FULL name
 * after an "@". Because full names contain spaces, we can't use a simple
 * `@word` regex — instead we scan for "@" + the exact participant name (longest
 * names first, so "@Rahul Sharma" wins over a hypothetical "@Rahul"). Also
 * detects @everyone / @all. Returns the set of matched ids (0 = everyone).
 */
export function findMentionsInBody(
  body: string,
  participants: ChatParticipant[],
): Set<number> {
  const ids = new Set<number>();
  const lower = body.toLowerCase();

  // @everyone / @all (must be a standalone token).
  if (/(^|\s)@(everyone|all)\b/i.test(body)) ids.add(0);

  // Match full names, longest first so a longer name isn't shadowed by a prefix.
  const sorted = [...participants].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const needle = `@${p.name.toLowerCase()}`;
    let from = 0;
    while (true) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      // The "@" must start the text or follow whitespace, and the name must end
      // at a word boundary (end of string or whitespace/punctuation).
      const before = at === 0 ? " " : body[at - 1];
      const afterIdx = at + needle.length;
      const after = afterIdx >= body.length ? " " : body[afterIdx];
      if (/\s/.test(before) && (/\s/.test(after) || /[.,!?;:]/.test(after) || afterIdx >= body.length)) {
        ids.add(p.user_id);
      }
      from = at + needle.length;
    }
  }
  return ids;
}
