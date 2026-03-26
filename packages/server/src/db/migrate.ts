// =============================================================================
// EMP CLOUD — Migration Runner
// Run with: pnpm migrate
// =============================================================================

import { initDB, closeDB, getDB } from "./connection.js";
import { runAllMigrations } from "./run-migrations.js";
import { logger } from "../utils/logger.js";

async function run() {
  await initDB();
  const db = getDB();

  logger.info("Running migrations...");
  await runAllMigrations(db);
  logger.info("All migrations complete");

  await closeDB();
}

run().catch((err) => {
  logger.error("Migration failed", err);
  process.exit(1);
});
