// =============================================================================
// MIGRATION 008 — Document Management
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Document Categories ----
  if (!(await knex.schema.hasTable("document_categories"))) {
    await knex.schema.createTable("document_categories", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.string("description", 500).nullable();
      t.boolean("is_mandatory").notNullable().defaultTo(false);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Employee Documents ----
  if (!(await knex.schema.hasTable("employee_documents"))) {
    await knex.schema.createTable("employee_documents", (t) => {
      t.bigIncrements("id").unsigned().primary();
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
      t.bigInteger("category_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("document_categories")
        .onDelete("CASCADE");
      t.string("name", 255).notNullable();
      t.string("file_path", 500).notNullable();
      t.bigInteger("file_size").unsigned().nullable();
      t.string("mime_type", 100).nullable();
      t.timestamp("expires_at").nullable();
      t.boolean("is_verified").notNullable().defaultTo(false);
      t.bigInteger("verified_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("verified_at").nullable();
      t.string("verification_remarks", 500).nullable();
      t.bigInteger("uploaded_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["organization_id", "category_id"]);
      t.index(["organization_id", "expires_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("employee_documents");
  await knex.schema.dropTableIfExists("document_categories");
}
