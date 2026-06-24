// =============================================================================
// EMP CLOUD — Chat presence (online / last-seen)
// =============================================================================
//
// Authoritative "online" is the socket gateway's actual room membership (which
// can't drift across reconnects); this module only persists `last_seen` and
// resolves it for the presence query. The gateway passes an `isOnline` checker
// (backed by the adapter rooms) into getPresence so a multi-tab user stays
// online until their LAST socket truly drops.
// In a PM2 cluster, full cross-instance accuracy needs the Redis adapter.

import { getDB } from "../../db/connection.js";

/** Stamp the user's last_seen (called when their last socket drops). */
export async function markOffline(userId: number): Promise<void> {
  try {
    await getDB()("users").where({ id: userId }).update({ last_seen: new Date() });
  } catch {
    /* best-effort */
  }
}

export interface PresenceInfo {
  user_id: number;
  online: boolean;
  last_seen: string | null;
}

/**
 * Presence for a set of users: online flag (from the gateway's authoritative
 * `isOnline` checker) + persisted last_seen.
 *
 * SECURITY: `last_seen` is resolved ONLY for users in `orgId`. Requests for
 * ids outside the caller's org are dropped from the result entirely — without
 * the org filter a client could harvest any other tenant's last-seen activity
 * by enumerating user ids (cross-org isolation break). The online flag is
 * already org-scoped by `isOnline` (it checks the caller-org room).
 */
export async function getPresence(
  orgId: number,
  userIds: number[],
  isOnline: (userId: number) => boolean,
): Promise<PresenceInfo[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const rows = await getDB()("users")
    .where({ organization_id: orgId })
    .whereIn("id", ids)
    .select("id", "last_seen");
  // Only same-org ids survive — any cross-org id requested is silently omitted.
  const lastSeen = new Map<number, string | null>(rows.map((r: any) => [r.id, r.last_seen]));
  const allowed = new Set(rows.map((r: any) => r.id as number));
  return ids
    .filter((id) => allowed.has(id))
    .map((id) => ({
      user_id: id,
      online: isOnline(id),
      last_seen: lastSeen.get(id) ?? null,
    }));
}
