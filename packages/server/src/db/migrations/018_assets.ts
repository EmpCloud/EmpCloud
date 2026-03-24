// =============================================================================
// MIGRATION 018 — Asset Management (IT Equipment Tracking)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Asset Categories ----
  if (!(await knex.schema.hasTable("asset_categories"))) {
    await knex.schema.createTable("asset_categories", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.text("description").nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Assets ----
  if (!(await knex.schema.hasTable("assets"))) {
    await knex.schema.createTable("assets", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("asset_tag", 50).notNullable();
      t.string("name", 200).notNullable();
      t.integer("category_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("asset_categories")
        .onDelete("SET NULL");
      t.text("description").nullable();
      t.string("serial_number", 100).nullable();
      t.string("brand", 100).nullable();
      t.string("model", 100).nullable();
      t.date("purchase_date").nullable();
      t.bigint("purchase_cost").nullable();
      t.date("warranty_expiry").nullable();
      t.enum("status", [
        "available",
        "assigned",
        "in_repair",
        "retired",
        "lost",
        "damaged",
      ])
        .notNullable()
        .defaultTo("available");
      t.enum("condition_status", ["new", "good", "fair", "poor"])
        .notNullable()
        .defaultTo("new");
      t.string("location_name", 200).nullable();
      t.integer("assigned_to")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.datetime("assigned_at").nullable();
      t.integer("assigned_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.text("notes").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["organization_id", "assigned_to"]);
      t.unique(["organization_id", "asset_tag"]);
      t.index(["organization_id", "warranty_expiry"]);
    });
  }

  // ---- Asset History ----
  if (!(await knex.schema.hasTable("asset_history"))) {
    await knex.schema.createTable("asset_history", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("asset_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("assets")
        .onDelete("CASCADE");
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.enum("action", [
        "created",
        "assigned",
        "returned",
        "repaired",
        "retired",
        "lost",
        "damaged",
        "updated",
      ]).notNullable();
      t.integer("from_user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.integer("to_user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.integer("performed_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.text("notes").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["asset_id", "created_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("asset_history");
  await knex.schema.dropTableIfExists("assets");
  await knex.schema.dropTableIfExists("asset_categories");
}
