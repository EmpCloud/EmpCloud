// =============================================================================
// MIGRATION 054 — UNIQUE(organization_id, emp_code) on users
//
// Issue #1658 — emp_code must be unique per org. Migration 053 already
// suffixed any existing duplicates so this constraint can land safely.
//
// MySQL allows multiple NULLs in a UNIQUE index, so users without an
// emp_code (HR hasn't set one yet) don't collide. Once HR enters the
// code, the constraint enforces "one code per org" at the storage
// layer rather than relying on the app-level race-prone check in
// employee.service.ts.
//
// Idempotent: skipped if the index already exists.
// =============================================================================

import type { Knex } from "knex";

const INDEX_NAME = "idx_users_org_emp_code_uniq";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  const idx = await knex.raw(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE table_schema = DATABASE()
         AND table_name = 'users'
         AND index_name = ?`,
    [INDEX_NAME],
  );
  const exists = Array.isArray(idx[0]) && idx[0].length > 0;
  if (exists) return;

  await knex.raw(
    `CREATE UNIQUE INDEX ${INDEX_NAME} ON users (organization_id, emp_code)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  await knex.raw(`DROP INDEX ${INDEX_NAME} ON users`).catch(() => {});
}
