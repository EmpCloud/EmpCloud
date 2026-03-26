// =============================================================================
// EMP CLOUD — Auto-Discovery Migration Runner
// Scans the migrations directory and runs all numbered migrations in order.
// Each migration must be idempotent (use hasTable/hasColumn guards).
// =============================================================================

import { Knex } from "knex";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAllMigrations(db: Knex): Promise<void> {
  const migrationsDir = path.join(__dirname, "migrations");

  // In compiled JS output, files will be .js; in ts-node they may be .ts
  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3}_.*\.(ts|js)$/.test(f))
    // Deduplicate: if both .ts and .js exist for same base name, prefer .js
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

  for (const file of sortedFiles) {
    try {
      const modulePath = path.join(migrationsDir, file);
      // Use file:// URL for ESM dynamic import on Windows
      const moduleUrl = `file:///${modulePath.replace(/\\/g, "/")}`;
      const migration = await import(moduleUrl);
      if (migration.up) {
        await migration.up(db);
      }
    } catch (err: any) {
      // Gracefully handle tables that already exist
      if (err.code === "ER_TABLE_EXISTS_ERROR") {
        logger.info(`Migration ${file} skipped (tables exist)`);
      } else {
        logger.warn(`Migration ${file}: ${err.message}`);
      }
    }
  }

  logger.info(`Auto-migration complete (${sortedFiles.length} files processed)`);
}
