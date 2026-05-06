// =============================================================================
// scripts/backfill-billing-sync.ts
// -----------------------------------------------------------------------------
// One-shot CLI: walk every existing org_subscriptions row in the EmpCloud
// DB and emit a `subscription.created` webhook to emp-billing for any
// subscription that isn't yet present in `billing_subscription_mappings`.
// Idempotent on both ends -- this script skips already-mapped rows, and
// emp-billing's webhook handler also dedupes via the
// `metadata.empcloud_subscription_id` lookup, so re-running is safe and
// will only attempt the missing tail.
//
// Use:
//   pnpm --filter @empcloud/server exec tsx scripts/backfill-billing-sync.ts
//
// Reads the same .env as the server (DB_HOST, BILLING_MODULE_URL,
// BILLING_API_KEY, etc.) and exits non-zero if any subscription failed
// to provision so the operator notices.
// =============================================================================

import { initDB, closeDB } from "../src/db/connection.js";
import { backfillBillingFromExistingSubscriptions } from "../src/services/billing/empcloud-webhook-emitter.js";
import { logger } from "../src/utils/logger.js";

async function main(): Promise<number> {
  await initDB();
  try {
    const result = await backfillBillingFromExistingSubscriptions();
    logger.info(
      `Backfill done: scanned=${result.scanned} attempted=${result.attempted} succeeded=${result.succeeded} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result.failed > 0 ? 1 : 0;
  } finally {
    await closeDB();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    logger.error("Backfill crashed", { error: err?.message, stack: err?.stack });
    process.exit(2);
  });
