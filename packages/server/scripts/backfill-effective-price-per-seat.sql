-- =============================================================================
-- BACKFILL: org_subscriptions.price_per_seat → effective per-cycle
--
-- Before this migration day, EmpCloud stored price_per_seat as the MONTHLY
-- base. After the dynamic-pricing rewrite, price_per_seat means the
-- effective per-seat per-cycle amount the customer agreed to. For
-- subscriptions created BEFORE the deploy, the stored value is the old
-- monthly base; emp-billing now treats whatever EmpCloud sends as
-- per-cycle, so quarterly subs would be charged 1/3 of the right amount
-- and annual subs 1/12. Run this once after the deploy to heal them.
--
-- WHAT THIS DOES
--   For every active / trial / suspended / past_due subscription:
--     1. Resolve the matching plan_pricing row for the sub's
--        (plan_tier, currency, seat band, effective date).
--     2. Resolve the cycle's discount and (currency-matched) override.
--     3. Compute the effective per-cycle price using the same rules the
--        live code uses (override_amount_per_seat if currency matches,
--        otherwise monthly_base × (1 - discount_pct/100) × months_in_cycle).
--     4. UPDATE price_per_seat to the new value if it differs.
--   Cancelled / expired subscriptions are LEFT ALONE.
--
-- DESIGN
--   This is a two-pass pattern:
--     - Pass 1 (a temp preview table) shows every row that WOULD change
--       and the before/after numbers. Inspect this carefully before
--       committing the UPDATE.
--     - Pass 2 (the UPDATE) writes the new prices in a single statement.
--   Wrapped in a transaction. ROLLBACK; until you've eyeballed the
--   preview, then COMMIT;.
--
-- IDEMPOTENT
--   Re-running with no changes is a no-op (UPDATE sees no diff). Safe to
--   re-run if the preview SELECT exposes a row you want to ignore --
--   just narrow the WHERE clause in the UPDATE.
-- =============================================================================

START TRANSACTION;

-- ─── Pass 1: preview ─────────────────────────────────────────────────────
DROP TEMPORARY TABLE IF EXISTS _backfill_preview;

CREATE TEMPORARY TABLE _backfill_preview AS
SELECT
  s.id                              AS subscription_id,
  s.organization_id,
  s.module_id,
  s.plan_tier,
  s.status,
  s.billing_cycle,
  s.currency,
  s.total_seats,
  s.price_per_seat                  AS old_price_per_seat,
  -- Resolve the matching plan_pricing row's monthly base.
  -- ORDER BY effective_from DESC LIMIT 1 → newest applicable row wins,
  -- exactly matching getPricePerSeatFor()'s pick logic.
  (
    SELECT pp.price_per_seat
      FROM plan_pricing pp
      JOIN plan_tiers   t  ON t.id = pp.tier_id
                          AND t.is_active = 1
     WHERE t.slug             = s.plan_tier
       AND pp.currency        = s.currency
       AND pp.effective_from <= CURDATE()
       AND s.total_seats     >= pp.min_seats
       AND (pp.max_seats IS NULL OR s.total_seats <= pp.max_seats)
     ORDER BY pp.effective_from DESC
     LIMIT 1
  ) AS resolved_monthly_base,
  bcd.discount_pct,
  bcd.months_in_cycle,
  bcd.override_amount_per_seat,
  bcd.override_currency
FROM org_subscriptions s
LEFT JOIN billing_cycle_discounts bcd
       ON bcd.cycle      = s.billing_cycle
      AND bcd.is_active  = 1
WHERE s.status IN ('active', 'trial', 'suspended', 'past_due')
  -- Skip rows where the org is the platform sentinel (id=0).
  AND s.organization_id > 0;

-- Calculate the new (correct) price_per_seat using the same rules the
-- live getEffectivePricePerSeat() applies:
--   - if override_amount_per_seat > 0 AND override_currency matches → use override
--   - else round(monthly_base × (1 - discount_pct/100) × months_in_cycle)
-- Stored back into the preview table for review.
ALTER TABLE _backfill_preview
  ADD COLUMN new_price_per_seat BIGINT NULL,
  ADD COLUMN delta              BIGINT NULL,
  ADD COLUMN action             VARCHAR(20) NULL;

UPDATE _backfill_preview SET
  new_price_per_seat = CASE
    WHEN override_amount_per_seat IS NOT NULL
      AND override_amount_per_seat > 0
      AND UPPER(override_currency) = UPPER(currency)
    THEN override_amount_per_seat
    WHEN resolved_monthly_base IS NULL
    THEN old_price_per_seat -- can't resolve → keep current
    ELSE ROUND(
      resolved_monthly_base
      * (1 - COALESCE(discount_pct, 0) / 100)
      * COALESCE(months_in_cycle, 1)
    )
  END;

UPDATE _backfill_preview SET
  delta = new_price_per_seat - old_price_per_seat,
  action = CASE
    WHEN new_price_per_seat = old_price_per_seat THEN 'unchanged'
    WHEN new_price_per_seat IS NULL              THEN 'unresolved'
    WHEN new_price_per_seat > old_price_per_seat THEN 'increase'
    ELSE                                              'decrease'
  END;

-- ─── REVIEW: how many rows will change, broken out by action ─────────────
SELECT
  action,
  COUNT(*)           AS rows_affected,
  COALESCE(SUM(delta * total_seats), 0) AS net_currency_unit_change
FROM _backfill_preview
GROUP BY action
ORDER BY action;

-- ─── REVIEW: the actual rows that will change ────────────────────────────
-- Inspect each line. If anything looks wrong (a real customer at an
-- unexpected price, an unresolved row that shouldn't have been on this
-- plan, etc.), ROLLBACK; before committing.
SELECT
  subscription_id,
  organization_id,
  module_id,
  plan_tier,
  status,
  billing_cycle,
  currency,
  total_seats,
  old_price_per_seat,
  new_price_per_seat,
  delta,
  action
FROM _backfill_preview
WHERE action <> 'unchanged'
ORDER BY organization_id, module_id;

-- ─── Pass 2: apply ───────────────────────────────────────────────────────
UPDATE org_subscriptions s
  JOIN _backfill_preview p ON p.subscription_id = s.id
   SET s.price_per_seat = p.new_price_per_seat,
       s.updated_at     = NOW()
 WHERE p.action IN ('increase', 'decrease');

-- ─── REVIEW: confirm the writes landed ───────────────────────────────────
SELECT ROW_COUNT() AS rows_updated_in_this_transaction;

-- ─── Cleanup ─────────────────────────────────────────────────────────────
DROP TEMPORARY TABLE IF EXISTS _backfill_preview;

-- Inspect the rows-updated count. If it matches what you saw in the
-- "rows_affected" SELECT above (sum of increase + decrease), commit. If
-- something is off, roll back.
COMMIT;
-- ROLLBACK;
