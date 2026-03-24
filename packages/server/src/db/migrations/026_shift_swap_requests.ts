// =============================================================================
// MIGRATION 026 — Shift Swap Requests + Document Status Enhancement
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Shift Swap Requests ----
  if (!(await knex.schema.hasTable("shift_swap_requests"))) {
    await knex.schema.createTable("shift_swap_requests", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("requester_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("target_employee_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("shift_assignment_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("shift_assignments")
        .onDelete("CASCADE");
      t.bigInteger("target_shift_assignment_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("shift_assignments")
        .onDelete("CASCADE");
      t.date("date").notNullable();
      t.text("reason").notNullable();
      t.string("status", 20).notNullable().defaultTo("pending");
      t.bigInteger("approved_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["requester_id"]);
      t.index(["target_employee_id"]);
    });
  }

  // ---- Add verification_status and rejection_reason to employee_documents ----
  if (await knex.schema.hasTable("employee_documents")) {
    const hasStatus = await knex.schema.hasColumn("employee_documents", "verification_status");
    if (!hasStatus) {
      await knex.schema.alterTable("employee_documents", (t) => {
        t.string("verification_status", 20).notNullable().defaultTo("pending");
        t.text("rejection_reason").nullable();
      });
      // Migrate existing data: if is_verified = true, set status to verified
      await knex("employee_documents")
        .where({ is_verified: true })
        .update({ verification_status: "verified" });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("shift_swap_requests");

  if (await knex.schema.hasTable("employee_documents")) {
    const hasStatus = await knex.schema.hasColumn("employee_documents", "verification_status");
    if (hasStatus) {
      await knex.schema.alterTable("employee_documents", (t) => {
        t.dropColumn("verification_status");
        t.dropColumn("rejection_reason");
      });
    }
  }
}
