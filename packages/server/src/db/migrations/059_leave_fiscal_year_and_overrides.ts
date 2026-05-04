// =============================================================================
// MIGRATION 059 — Leave: fiscal year, period accrual, balance overrides, history
//
// Why:
//   - The existing `leave_policies.accrual_type` column was stored but never
//     applied — quarterly/monthly accrual surfaced as 12 days on day one.
//   - HR needed a way to grant or correct leaves for individual employees and
//     keep a paper trail.
//   - Indian customers want fiscal-year sessions (Apr–Mar) with no
//     cross-session carry-forward, while letting unused days within a session
//     roll across quarters for some leave types but not others.
//
// Schema changes:
//   1. organizations.fiscal_year_start_month  — 1-12, default 4 (April).
//   2. leave_policies.period_carry_forward    — within-fiscal-year roll-over.
//   3. leave_balances.extra_allocated         — HR-granted bonus days.
//      leave_balances.override_reason / overridden_by / overridden_at — audit.
//      leave_balances.period_used             — used in current period only.
//      leave_balances.period_key              — e.g. "2025-Q2", reset on rollover.
//   4. leave_balances_history                 — snapshot at fiscal year-end so
//                                               reset doesn't erase past data.
//
// Backwards-compat: every column is nullable or has a default. The Payroll API
// reads total_allocated/total_used/balance — those remain populated as before.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- 1. organizations.fiscal_year_start_month ----
  if (
    (await knex.schema.hasTable("organizations")) &&
    !(await knex.schema.hasColumn("organizations", "fiscal_year_start_month"))
  ) {
    await knex.schema.alterTable("organizations", (t) => {
      t.tinyint("fiscal_year_start_month").notNullable().defaultTo(4);
    });
  }

  // ---- 2. leave_policies.period_carry_forward ----
  if (
    (await knex.schema.hasTable("leave_policies")) &&
    !(await knex.schema.hasColumn("leave_policies", "period_carry_forward"))
  ) {
    await knex.schema.alterTable("leave_policies", (t) => {
      t.boolean("period_carry_forward").notNullable().defaultTo(false);
    });
  }

  // ---- 3. leave_balances additions ----
  if (await knex.schema.hasTable("leave_balances")) {
    await knex.schema.alterTable("leave_balances", (t) => {
      // columns are added in their own alterTable inside hasColumn checks
      // below — Knex doesn't accept conditional adds in a single block.
    });

    if (!(await knex.schema.hasColumn("leave_balances", "extra_allocated"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.decimal("extra_allocated", 5, 1).notNullable().defaultTo(0);
      });
    }
    if (!(await knex.schema.hasColumn("leave_balances", "override_reason"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.text("override_reason").nullable();
      });
    }
    if (!(await knex.schema.hasColumn("leave_balances", "overridden_by"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.bigInteger("overridden_by").unsigned().nullable();
      });
    }
    if (!(await knex.schema.hasColumn("leave_balances", "overridden_at"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.timestamp("overridden_at").nullable();
      });
    }
    if (!(await knex.schema.hasColumn("leave_balances", "period_used"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.decimal("period_used", 5, 1).notNullable().defaultTo(0);
      });
    }
    if (!(await knex.schema.hasColumn("leave_balances", "period_key"))) {
      await knex.schema.alterTable("leave_balances", (t) => {
        t.string("period_key", 16).nullable();
      });
    }
  }

  // ---- 4. leave_balances_history ----
  if (!(await knex.schema.hasTable("leave_balances_history"))) {
    await knex.schema.createTable("leave_balances_history", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.bigInteger("user_id").unsigned().notNullable();
      t.bigInteger("leave_type_id").unsigned().notNullable();
      t.integer("year").unsigned().notNullable();
      t.decimal("total_allocated", 5, 1).notNullable().defaultTo(0);
      t.decimal("extra_allocated", 5, 1).notNullable().defaultTo(0);
      t.decimal("total_used", 5, 1).notNullable().defaultTo(0);
      t.decimal("total_carry_forward", 5, 1).notNullable().defaultTo(0);
      t.decimal("balance", 5, 1).notNullable().defaultTo(0);
      t.string("archived_reason", 100).nullable();
      t.timestamp("archived_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id", "year"]);
      t.index(["organization_id", "year"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("leave_balances_history")) {
    await knex.schema.dropTableIfExists("leave_balances_history");
  }

  if (await knex.schema.hasTable("leave_balances")) {
    for (const col of [
      "extra_allocated",
      "override_reason",
      "overridden_by",
      "overridden_at",
      "period_used",
      "period_key",
    ]) {
      if (await knex.schema.hasColumn("leave_balances", col)) {
        await knex.schema.alterTable("leave_balances", (t) => {
          t.dropColumn(col);
        });
      }
    }
  }

  if (
    (await knex.schema.hasTable("leave_policies")) &&
    (await knex.schema.hasColumn("leave_policies", "period_carry_forward"))
  ) {
    await knex.schema.alterTable("leave_policies", (t) => {
      t.dropColumn("period_carry_forward");
    });
  }

  if (
    (await knex.schema.hasTable("organizations")) &&
    (await knex.schema.hasColumn("organizations", "fiscal_year_start_month"))
  ) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("fiscal_year_start_month");
    });
  }
}
