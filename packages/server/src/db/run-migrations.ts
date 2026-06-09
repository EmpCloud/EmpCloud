// =============================================================================
// EMP CLOUD — Auto-Discovery Migration Runner
//
// Scans the migrations directory and runs each numbered migration's up() ONCE,
// recording the file name in the `_migration_state` table after a successful
// run. On subsequent boots, anything already recorded is skipped.
//
// Before this tracking landed, the runner re-ran every migration on every
// boot. That broke migrations whose up() mutates user data (e.g. 036
// "reserve organization_id=0 for super_admin" -- it kept reverting any super
// admin's org_id back to 0 on every restart, breaking inserts that had set
// a real org id). Each migration's up() should still be idempotent for
// safety, but it will no longer be repeatedly invoked.
// =============================================================================

import { Knex } from "knex";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_TABLE = "_migration_state";

async function ensureStateTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(STATE_TABLE);
  if (!exists) {
    await db.schema.createTable(STATE_TABLE, (t) => {
      t.string("key", 191).primary();
      t.dateTime("applied_at").notNullable();
    });
  }
}

async function getAppliedKeys(db: Knex): Promise<Set<string>> {
  const rows = await db(STATE_TABLE).select("key");
  return new Set(rows.map((r: any) => String(r.key)));
}

async function markApplied(db: Knex, key: string): Promise<void> {
  // ON DUPLICATE-safe insert. Some migrations record themselves (see
  // 071_backfill_regularization_tz) so the row may already be there.
  await db.raw(
    `INSERT INTO ${STATE_TABLE} (\`key\`, applied_at) VALUES (?, ?) ` +
      `ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at)`,
    [key, new Date()],
  );
}

export async function runAllMigrations(db: Knex): Promise<void> {
  await ensureStateTable(db);
  const applied = await getAppliedKeys(db);

  const migrationsDir = path.join(__dirname, "migrations");

  // In compiled JS output, files will be .js; in ts-node they may be .ts
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.*\.(ts|js)$/.test(f))
    // Deduplicate: if both .ts and .js exist for the same base name, prefer .js
    .reduce((acc, f) => {
      const base = f.replace(/\.(ts|js)$/, "");
      const ext = f.endsWith(".js") ? ".js" : ".ts";
      if (!acc.has(base) || ext === ".js") {
        acc.set(base, f);
      }
      return acc;
    }, new Map<string, string>())
    .values();

  const sortedFiles = Array.from(files).sort();

  let ranCount = 0;
  let skippedCount = 0;
  for (const file of sortedFiles) {
    const key = file.replace(/\.(ts|js)$/, "");
    if (applied.has(key)) {
      skippedCount++;
      continue;
    }
    try {
      const modulePath = path.join(migrationsDir, file);
      // Use file:// URL for ESM dynamic import on Windows
      const moduleUrl = `file:///${modulePath.replace(/\\/g, "/")}`;
      const migration = await import(moduleUrl);
      if (migration.up) {
        await migration.up(db);
      }
      await markApplied(db, key);
      ranCount++;
    } catch (err: any) {
      // Gracefully handle tables that already exist (legacy DBs where the
      // schema is in place but the migration was never recorded). Mark as
      // applied so we don't keep retrying the same skip on every boot.
      if (err.code === "ER_TABLE_EXISTS_ERROR") {
        logger.info(`Migration ${file} skipped (tables exist) — marking applied`);
        await markApplied(db, key).catch(() => {});
        skippedCount++;
      } else {
        logger.warn(`Migration ${file}: ${err.message}`);
      }
    }
  }

  logger.info(
    `Auto-migration complete (${sortedFiles.length} scanned, ${ranCount} applied, ${skippedCount} already up to date)`,
  );
}
