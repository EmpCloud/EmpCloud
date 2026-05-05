// =============================================================================
// MIGRATION 058 — Linked-organisation emails on biometric_legacy_credentials
//
// Customers with multiple EmpCloud orgs (e.g. one company split into two
// orgs because each runs its own payroll) want a single biometric kiosk
// device to serve both orgs' employees. We store the linking as an array
// of "admin emails of other orgs" on the kiosk-owner credential row.
// At /api/v3/biometric/auth the JWT now carries organization_ids: [primary,
// ...resolved linked orgs]; existing single-org kiosks see no change
// (organization_id is still set, organization_ids defaults to [primary]).
//
// JSON column over a join table because:
//   - the array is short (a kiosk owner typically links 1–2 orgs)
//   - reads always happen alongside the row itself (kioskAuth)
//   - removing or renaming a linked email is a single UPDATE
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("biometric_legacy_credentials"))) return;
  if (await knex.schema.hasColumn("biometric_legacy_credentials", "linked_emails")) return;
  await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
    t.json("linked_emails").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("biometric_legacy_credentials"))) return;
  if (!(await knex.schema.hasColumn("biometric_legacy_credentials", "linked_emails"))) return;
  await knex.schema.alterTable("biometric_legacy_credentials", (t) => {
    t.dropColumn("linked_emails");
  });
}
