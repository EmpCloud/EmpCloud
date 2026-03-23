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
    { name: "001_identity_schema", mod: await import("./migrations/001_identity_schema.js") },
    { name: "002_modules_subscriptions", mod: await import("./migrations/002_modules_subscriptions.js") },
    { name: "003_oauth2", mod: await import("./migrations/003_oauth2.js") },
    { name: "004_audit_invitations", mod: await import("./migrations/004_audit_invitations.js") },
    { name: "005_employee_profiles", mod: await import("./migrations/005_employee_profiles.js") },
    { name: "006_attendance", mod: await import("./migrations/006_attendance.js") },
    { name: "007_leave", mod: await import("./migrations/007_leave.js") },
    { name: "008_documents", mod: await import("./migrations/008_documents.js") },
    { name: "009_announcements", mod: await import("./migrations/009_announcements.js") },
    { name: "010_policies", mod: await import("./migrations/010_policies.js") },
    { name: "011_notifications", mod: await import("./migrations/011_notifications.js") },
    { name: "012_billing_integration", mod: await import("./migrations/012_billing_integration.js") },
    { name: "013_onboarding", mod: await import("./migrations/013_onboarding.js") },
    { name: "014_fix_subscription_pricing", mod: await import("./migrations/014_fix_subscription_pricing.js") },
  ];

  for (const { name, mod } of migrations) {
    try {
      await mod.up(db);
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
