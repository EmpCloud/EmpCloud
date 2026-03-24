// =============================================================================
// MIGRATION 021 — Company Events & RSVPs
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Company Events ----
  if (!(await knex.schema.hasTable("company_events"))) {
    await knex.schema.createTable("company_events", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("description").nullable();
      t.enum("event_type", [
        "meeting",
        "training",
        "celebration",
        "team_building",
        "town_hall",
        "holiday",
        "workshop",
        "social",
        "other",
      ]).notNullable().defaultTo("other");
      t.dateTime("start_date").notNullable();
      t.dateTime("end_date").nullable();
      t.boolean("is_all_day").notNullable().defaultTo(false);
      t.string("location", 255).nullable();
      t.string("virtual_link", 500).nullable();
      t.enum("target_type", ["all", "department", "role"]).notNullable().defaultTo("all");
      t.json("target_ids").nullable();
      t.integer("max_attendees").unsigned().nullable();
      t.boolean("is_mandatory").notNullable().defaultTo(false);
      t.enum("status", ["upcoming", "ongoing", "completed", "cancelled"])
        .notNullable()
        .defaultTo("upcoming");
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["organization_id", "start_date"]);
      t.index(["event_type"]);
    });
  }

  // ---- Event RSVPs ----
  if (!(await knex.schema.hasTable("event_rsvps"))) {
    await knex.schema.createTable("event_rsvps", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("event_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("company_events")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.enum("status", ["attending", "maybe", "declined"])
        .notNullable()
        .defaultTo("attending");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["event_id", "user_id"]);
      t.index(["organization_id", "event_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("event_rsvps");
  await knex.schema.dropTableIfExists("company_events");
}
