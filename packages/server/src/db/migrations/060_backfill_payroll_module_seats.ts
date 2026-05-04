// =============================================================================
// MIGRATION 060 — Backfill org_module_seats for emp-payroll
//
// Why:
//   Product wants payroll access on by default for every employee in any
//   org that subscribes to emp-payroll. Today HR has to flip each user's
//   payroll toggle in Module Access individually — large orgs end up with
//   most users missing access, so they don't appear in the payroll app's
//   employee list.
//
// What this migration does:
//   For every org with an active or trial emp-payroll subscription, insert
//   a row in org_module_seats for every active user that doesn't already
//   have one. The seat-limit on org_subscriptions.total_seats is
//   intentionally NOT enforced here — this is a one-time backfill of the
//   "should already be true" state, and per #1976 the philosophy is that
//   orgs with paid subscriptions shouldn't be capped on existing users.
//
// After backfill:
//   - org_module_seats has one row per (active user, payroll subscription)
//   - org_subscriptions.used_seats is updated to match the actual count
//
// Going forward (separate code change in user.service.ts):
//   createUser() and acceptInvitation() will auto-assign a payroll seat
//   when the org has an active emp-payroll subscription.
//
// Idempotent: re-runs on a fully-backfilled org insert zero rows.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // The two tables this migration writes to ship in 002. If either is
  // missing we're on a pre-modules schema — nothing to do.
  if (!(await knex.schema.hasTable("org_subscriptions"))) return;
  if (!(await knex.schema.hasTable("org_module_seats"))) return;
  if (!(await knex.schema.hasTable("modules"))) return;
  if (!(await knex.schema.hasTable("users"))) return;

  const payrollModule = await knex("modules").where({ slug: "emp-payroll" }).first();
  if (!payrollModule) {
    // eslint-disable-next-line no-console
    console.log("[migration 060] emp-payroll module not found — skipping backfill");
    return;
  }

  // Active or trial emp-payroll subscriptions across all orgs.
  const subs: Array<{ id: number; organization_id: number }> = await knex(
    "org_subscriptions",
  )
    .where({ module_id: payrollModule.id })
    .whereIn("status", ["active", "trial"])
    .select("id", "organization_id");

  if (subs.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[migration 060] no active emp-payroll subscriptions — nothing to backfill");
    return;
  }

  let totalInserted = 0;
  const now = new Date();

  for (const sub of subs) {
    // Active users in this org that don't yet have a seat for emp-payroll.
    // Skip super_admin — they're not a real employee, just a platform role.
    const candidates: Array<{ id: number }> = await knex("users as u")
      .leftJoin("org_module_seats as s", function () {
        this.on("s.user_id", "u.id").andOn(
          "s.module_id",
          knex.raw("?", [payrollModule.id]),
        );
      })
      .where("u.organization_id", sub.organization_id)
      .where("u.status", 1)
      .whereNot("u.role", "super_admin")
      .whereNull("s.id")
      .select("u.id");

    if (candidates.length === 0) continue;

    // Pick an org_admin / hr_admin in the org to act as `assigned_by` so
    // the audit trail is meaningful. Fall back to the user themselves
    // (the column is NOT NULL but doesn't have a self-reference rule).
    const orgAdmin = await knex("users")
      .where({ organization_id: sub.organization_id })
      .whereIn("role", ["org_admin", "hr_admin"])
      .orderBy("id", "asc")
      .first();

    const rows = candidates.map((u) => ({
      subscription_id: sub.id,
      organization_id: sub.organization_id,
      module_id: payrollModule.id,
      user_id: u.id,
      assigned_by: orgAdmin?.id ?? u.id,
      assigned_at: now,
    }));

    // Bulk insert in chunks to avoid packet-size issues on large tenants.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await knex("org_module_seats").insert(rows.slice(i, i + CHUNK));
    }
    totalInserted += rows.length;

    // Resync used_seats to the actual row count so the seat counter UI
    // and the assignSeat() limit math agree on reality.
    const [{ count }] = await knex("org_module_seats")
      .where({ subscription_id: sub.id })
      .count<{ count: number | string }[]>("* as count");
    await knex("org_subscriptions")
      .where({ id: sub.id })
      .update({ used_seats: Number(count), updated_at: now });
  }

  if (totalInserted > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[migration 060] Assigned emp-payroll seats to ${totalInserted} user(s) across ${subs.length} subscription(s)`,
    );
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op. Reverting would mass-revoke payroll access from every employee
  // we just enabled — same destructive footprint as the bad state we're
  // fixing. If a specific org needs to revoke, do it via the Module
  // Access UI per-user.
}
