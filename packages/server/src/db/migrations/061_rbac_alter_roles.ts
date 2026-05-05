// =============================================================================
// MIGRATION 061 — RBAC v1: alter `roles` table for the custom-roles feature
//
// The `roles` and `user_roles` tables were created in 001_identity_schema.ts
// but were never wired into application code. This migration:
//   - widens `permissions` (was TEXT) into JSON so we can index / query the
//     contained keys
//   - adds `description` for the role-builder UI
//   - adds `created_by` for audit
//   - adds an index on (organization_id, type) to speed list queries
// Idempotent.
// =============================================================================

import { Knex } from "knex";

const TABLE = "roles";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;

  // Some MySQL versions don't allow ALTER TABLE … MODIFY through Knex's
  // schema builder for TEXT → JSON in a single column-type change, so we
  // use raw SQL guarded by an information_schema lookup.
  const [colInfo] = (await knex.raw(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'permissions'`,
    [TABLE],
  )) as [Array<{ DATA_TYPE: string }>, unknown];
  const dataType = colInfo[0]?.DATA_TYPE?.toLowerCase();

  if (dataType && dataType !== "json") {
    // Widen to JSON. Existing rows will be NULL or empty TEXT; coerce safely.
    // First normalize NULL / non-JSON content to '[]' to satisfy NOT NULL.
    await knex.raw(
      `UPDATE ?? SET permissions = '[]'
       WHERE permissions IS NULL OR TRIM(permissions) = '' OR JSON_VALID(permissions) = 0`,
      [TABLE],
    );
    await knex.raw(`ALTER TABLE ?? MODIFY COLUMN permissions JSON NOT NULL`, [TABLE]);
  }

  const hasDescription = await knex.schema.hasColumn(TABLE, "description");
  const hasCreatedBy = await knex.schema.hasColumn(TABLE, "created_by");
  if (!hasDescription || !hasCreatedBy) {
    await knex.schema.alterTable(TABLE, (t) => {
      if (!hasDescription) t.string("description", 500).nullable();
      if (!hasCreatedBy) {
        t.bigInteger("created_by")
          .unsigned()
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL");
      }
    });
  }

  // Index for "list all roles for org" queries (system + custom).
  // Knex doesn't expose `IF NOT EXISTS` for indexes uniformly, so guard via
  // information_schema.
  const [idxRows] = (await knex.raw(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_roles_org_type'`,
    [TABLE],
  )) as [Array<{ INDEX_NAME: string }>, unknown];
  if (idxRows.length === 0) {
    await knex.raw(`CREATE INDEX idx_roles_org_type ON ?? (organization_id, type)`, [TABLE]);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse only the additive changes; leave the JSON widening in place
  // (downgrading TEXT → JSON cleanly is messy and we never want to lose
  // permission data).
  if (!(await knex.schema.hasTable(TABLE))) return;

  await knex.raw(`DROP INDEX IF EXISTS idx_roles_org_type ON ??`, [TABLE]);

  const hasDescription = await knex.schema.hasColumn(TABLE, "description");
  const hasCreatedBy = await knex.schema.hasColumn(TABLE, "created_by");
  if (hasDescription || hasCreatedBy) {
    await knex.schema.alterTable(TABLE, (t) => {
      if (hasCreatedBy) t.dropColumn("created_by");
      if (hasDescription) t.dropColumn("description");
    });
  }
}
