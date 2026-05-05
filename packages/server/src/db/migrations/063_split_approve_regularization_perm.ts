// =============================================================================
// MIGRATION 063 — RBAC v1: split attendance:approve_regularization into
// _team and _all variants
//
// The original key was scope-agnostic; we now distinguish team-scope vs
// org-wide approval. Existing rows that have the old key get rewritten:
//   - System role 'manager' (org-scoped overrides) -> _team
//   - System role 'hr_admin' / 'org_admin' (org-scoped overrides) -> _all
//   - Custom roles (type=1) -> _all (preserve original behaviour, since the
//     old key was effectively scope-agnostic and the safer migration is to
//     widen rather than narrow). Org admins can dial back to _team via the
//     UI if they want.
//
// Idempotent: skips rows already migrated (no occurrences of the old key).
// =============================================================================

import { Knex } from "knex";

const OLD_KEY = "attendance:approve_regularization";
const TEAM_KEY = "attendance:approve_regularization_team";
const ALL_KEY = "attendance:approve_regularization_all";

function migratePermissions(perms: string[], rule: "team" | "all"): string[] {
  if (!perms.includes(OLD_KEY)) return perms;
  const replacement = rule === "team" ? TEAM_KEY : ALL_KEY;
  const next = perms.filter((p) => p !== OLD_KEY);
  if (!next.includes(replacement)) next.push(replacement);
  return next;
}

function parsePerms(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("roles"))) return;

  const rows: Array<{ id: number; name: string; type: number; permissions: unknown }> = await knex(
    "roles",
  ).select("id", "name", "type", "permissions");

  for (const row of rows) {
    const perms = parsePerms(row.permissions);
    if (!perms.includes(OLD_KEY)) continue;

    let rule: "team" | "all";
    if (row.type === 0) {
      // System role row
      rule = row.name === "manager" ? "team" : "all";
    } else {
      // Custom role — preserve permissive default (admin can edit later)
      rule = "all";
    }

    const next = migratePermissions(perms, rule);
    await knex("roles")
      .where({ id: row.id })
      .update({ permissions: JSON.stringify(next), updated_at: new Date() });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse: collapse both new keys back into the single old key. Lossy on
  // the team-vs-all distinction, but that's the nature of a downgrade.
  if (!(await knex.schema.hasTable("roles"))) return;

  const rows: Array<{ id: number; permissions: unknown }> = await knex("roles").select(
    "id",
    "permissions",
  );

  for (const row of rows) {
    const perms = parsePerms(row.permissions);
    const hasTeam = perms.includes(TEAM_KEY);
    const hasAll = perms.includes(ALL_KEY);
    if (!hasTeam && !hasAll) continue;
    const next = perms.filter((p) => p !== TEAM_KEY && p !== ALL_KEY);
    if (!next.includes(OLD_KEY)) next.push(OLD_KEY);
    await knex("roles")
      .where({ id: row.id })
      .update({ permissions: JSON.stringify(next), updated_at: new Date() });
  }
}
