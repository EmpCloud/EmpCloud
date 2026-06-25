// =============================================================================
// MIGRATION 093 — Backfill emp-biometrics seats from existing face enrollments
//
// Why:
//   Face enrollment runs through the legacy kiosk path (/api/v3/biometric/
//   update-user), which historically never touched the seat/billing tables.
//   So orgs enrolled faces well past their purchased emp-biometrics seats
//   while org_subscriptions.used_seats stayed 0 and they were billed nothing
//   (e.g. org 7: 31 faces enrolled on a 10-seat plan, used_seats = 0). The
//   seat counter ("0 / 10") was technically accurate but disconnected from
//   reality, and revenue for the over-enrolled users was never captured.
//
// What this migration does (one-time):
//   For every org with an active/trial emp-biometrics subscription, create an
//   org_module_seats row for every user who already has an enrolled face
//   (biometric_legacy_credentials.face_url IS NOT NULL) and doesn't yet have a
//   seat. Then resync used_seats to the real count and AUTO-EXPAND total_seats
//   to cover any overage — so billing (price_per_seat * total_seats) charges
//   for actual usage rather than capping or under-billing. total_seats is only
//   ever grown, never shrunk below what the org already purchased.
//
// Going forward (code change in biometric-legacy.service.ts):
//   updateBiometricUser() now calls ensureBiometricSeat() on enrollment (which
//   auto-expands), and deleteFaceImage() calls releaseBiometricSeat().
//
// Idempotent: re-runs on a fully-backfilled org insert zero rows.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  for (const t of ["org_subscriptions", "org_module_seats", "modules", "users", "biometric_legacy_credentials"]) {
    if (!(await knex.schema.hasTable(t))) return; // pre-modules / pre-biometric schema — nothing to do
  }

  const bioModule = await knex("modules").where({ slug: "emp-biometrics" }).first();
  if (!bioModule) {
    // eslint-disable-next-line no-console
    console.log("[migration 093] emp-biometrics module not found — skipping backfill");
    return;
  }

  const subs: Array<{ id: number; organization_id: number; total_seats: number }> = await knex(
    "org_subscriptions",
  )
    .where({ module_id: bioModule.id })
    .whereIn("status", ["active", "trial"])
    .select("id", "organization_id", "total_seats");

  if (subs.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[migration 093] no active emp-biometrics subscriptions — nothing to backfill");
    return;
  }

  let totalInserted = 0;
  let totalExpanded = 0;
  const now = new Date();

  for (const sub of subs) {
    // Users in this org with an enrolled face but no biometric seat yet.
    const candidates: Array<{ id: number }> = await knex("biometric_legacy_credentials as c")
      .join("users as u", "u.id", "c.user_id")
      .leftJoin("org_module_seats as s", function () {
        this.on("s.user_id", "u.id").andOn("s.module_id", knex.raw("?", [bioModule.id]));
      })
      .where("c.organization_id", sub.organization_id)
      .whereNotNull("c.face_url")
      .whereNot("c.face_url", "")
      .where("u.status", 1)
      .whereNull("s.id")
      .distinct("u.id")
      .select("u.id");

    if (candidates.length > 0) {
      // assigned_by: an org/hr admin for a meaningful audit trail, else self.
      const orgAdmin = await knex("users")
        .where({ organization_id: sub.organization_id })
        .whereIn("role", ["org_admin", "hr_admin"])
        .orderBy("id", "asc")
        .first();

      const rows = candidates.map((u) => ({
        subscription_id: sub.id,
        organization_id: sub.organization_id,
        module_id: bioModule.id,
        user_id: u.id,
        assigned_by: orgAdmin?.id ?? u.id,
        assigned_at: now,
      }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await knex("org_module_seats").insert(rows.slice(i, i + CHUNK));
      }
      totalInserted += rows.length;
    }

    // Resync used_seats to the actual seat count and auto-expand total_seats to
    // cover it (bill actual). total_seats is only grown, never reduced.
    const [{ count }] = await knex("org_module_seats")
      .where({ subscription_id: sub.id })
      .count<{ count: number | string }[]>("* as count");
    const seats = Number(count);
    const newTotal = Math.max(Number(sub.total_seats), seats);
    if (newTotal > Number(sub.total_seats)) totalExpanded += 1;

    await knex("org_subscriptions")
      .where({ id: sub.id })
      .update({ used_seats: seats, total_seats: newTotal, updated_at: now });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[migration 093] Backfilled ${totalInserted} emp-biometrics seat(s) across ${subs.length} subscription(s); auto-expanded total_seats on ${totalExpanded}.`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // No-op. Reverting would mass-revoke biometric seats we just reconciled to
  // real enrolled faces — the same broken (under-billed) state we're fixing.
}
