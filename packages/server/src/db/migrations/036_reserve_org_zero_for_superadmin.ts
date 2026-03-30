// =============================================================================
// MIGRATION 036 — Reserve organization_id=0 for Super Admin platform accounts
//
// org_id=0 is a special reserved ID that no real organization will ever get
// (MySQL auto_increment starts from 1). Super admin accounts are assigned
// org_id=0 to keep them out of any organization's user lists.
//
// This migration:
// 1. Ensures auto_increment starts at 1 (not 0)
// 2. Moves any super_admin users to org_id=0
// 3. Updates org user counts
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Ensure auto_increment on organizations starts at 1 (default, but explicit)
  await knex.raw(
    "ALTER TABLE organizations AUTO_INCREMENT = 1"
  ).catch(() => {});

  // Move all super_admin users to org_id=0
  await knex.raw(
    "SET FOREIGN_KEY_CHECKS = 0"
  );

  await knex("users")
    .where("role", "super_admin")
    .update({ organization_id: 0 });

  await knex.raw(
    "SET FOREIGN_KEY_CHECKS = 1"
  );

  // Recalculate user counts for all orgs
  const orgs = await knex("organizations").select("id");
  for (const org of orgs) {
    const [{ count }] = await knex("users")
      .where({ organization_id: org.id, status: 1 })
      .count("* as count");
    await knex("organizations")
      .where({ id: org.id })
      .update({ current_user_count: Number(count) });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Move super_admin users back to org 5 (or first org)
  const firstOrg = await knex("organizations").orderBy("id").first();
  if (firstOrg) {
    await knex.raw("SET FOREIGN_KEY_CHECKS = 0");
    await knex("users")
      .where("role", "super_admin")
      .update({ organization_id: firstOrg.id });
    await knex.raw("SET FOREIGN_KEY_CHECKS = 1");
  }
}
