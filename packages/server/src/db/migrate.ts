// =============================================================================
// EMP CLOUD — Migration Runner
// Run with: pnpm migrate
// =============================================================================

import { initDB, closeDB, getDB } from "./connection.js";
import { logger } from "../utils/logger.js";

async function run() {
  await initDB();
  const db = getDB();

  logger.info("Running migrations...");

  // Import and run each migration in order
  const migrations = [
    await import("./migrations/001_identity_schema.js"),
    await import("./migrations/002_modules_subscriptions.js"),
    await import("./migrations/003_oauth2.js"),
    await import("./migrations/004_audit_invitations.js"),
  ];

  for (let i = 0; i < migrations.length; i++) {
    const name = `00${i + 1}`;
    try {
      await migrations[i].up(db);
      logger.info(`Migration ${name} applied`);
    } catch (err: any) {
      // If table already exists, skip gracefully
      if (err.code === "ER_TABLE_EXISTS_ERROR") {
        logger.info(`Migration ${name} skipped (tables exist)`);
      } else {
        throw err;
      }
    }
  }

  logger.info("All migrations complete");
  await closeDB();
}

run().catch((err) => {
  logger.error("Migration failed", err);
  process.exit(1);
});
