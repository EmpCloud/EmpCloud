import { logger } from "../../utils/logger.js";
import { expireTrials } from "./trial-expiration.service.js";

let intervalHandle: NodeJS.Timeout | null = null;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Start the background trial-expiration check. Runs once at startup so a
 * server restart catches any trials that expired while down, then every
 * hour after that. Hourly cadence gives at most ~1h slack on the day-14
 * transition, which is fine for a 14-day window.
 *
 * Mirrors the health-check interval pattern (single instance, no overlap,
 * errors logged but never rethrown).
 */
export function startTrialExpirationInterval(): void {
  if (intervalHandle) return;

  expireTrials().catch((err) => {
    logger.error("Initial trial expiration sweep failed", { error: err?.message });
  });

  intervalHandle = setInterval(() => {
    expireTrials().catch((err) => {
      logger.error("Background trial expiration sweep failed", { error: err?.message });
    });
  }, ONE_HOUR_MS);

  logger.info("Trial expiration interval started (hourly)");
}

export function stopTrialExpirationInterval(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
