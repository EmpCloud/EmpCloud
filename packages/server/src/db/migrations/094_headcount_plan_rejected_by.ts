// =============================================================================
// MIGRATION 094 — Add rejected_by / rejected_at to headcount_plans
// =============================================================================
// rejectHeadcountPlan() previously stored the rejecting user in `approved_by`,
// mislabeling the rejecter as the approver — so reports could not tell genuine
// approvals from rejections. Add dedicated columns so rejection is attributed
// correctly and `approved_by` is reserved for real approvals.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasRejectedBy = await knex.schema.hasColumn("headcount_plans", "rejected_by");
  const hasRejectedAt = await knex.schema.hasColumn("headcount_plans", "rejected_at");
  if (hasRejectedBy && hasRejectedAt) return;

  await knex.schema.alterTable("headcount_plans", (t) => {
    if (!hasRejectedBy) {
      t.bigInteger("rejected_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users");
    }
    if (!hasRejectedAt) {
      t.timestamp("rejected_at").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasRejectedBy = await knex.schema.hasColumn("headcount_plans", "rejected_by");
  const hasRejectedAt = await knex.schema.hasColumn("headcount_plans", "rejected_at");
  if (!hasRejectedBy && !hasRejectedAt) return;

  await knex.schema.alterTable("headcount_plans", (t) => {
    if (hasRejectedBy) t.dropColumn("rejected_by");
    if (hasRejectedAt) t.dropColumn("rejected_at");
  });
}
