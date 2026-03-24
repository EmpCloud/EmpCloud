// =============================================================================
// MIGRATION 016 — HR Helpdesk / Case Management
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Helpdesk Tickets ----
  if (!(await knex.schema.hasTable("helpdesk_tickets"))) {
    await knex.schema.createTable("helpdesk_tickets", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.integer("raised_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.enum("category", [
        "leave",
        "payroll",
        "benefits",
        "it",
        "facilities",
        "onboarding",
        "policy",
        "general",
      ]).notNullable();
      t.enum("priority", ["low", "medium", "high", "urgent"])
        .notNullable()
        .defaultTo("medium");
      t.string("subject", 255).notNullable();
      t.text("description").notNullable();
      t.enum("status", [
        "open",
        "in_progress",
        "awaiting_response",
        "resolved",
        "closed",
        "reopened",
      ])
        .notNullable()
        .defaultTo("open");
      t.integer("assigned_to")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.integer("department_id").unsigned().nullable();
      t.integer("sla_response_hours").unsigned().notNullable().defaultTo(24);
      t.integer("sla_resolution_hours").unsigned().notNullable().defaultTo(72);
      t.datetime("sla_response_due").nullable();
      t.datetime("sla_resolution_due").nullable();
      t.datetime("first_response_at").nullable();
      t.datetime("resolved_at").nullable();
      t.datetime("closed_at").nullable();
      t.tinyint("satisfaction_rating").unsigned().nullable();
      t.text("satisfaction_comment").nullable();
      t.json("tags").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["organization_id", "assigned_to"]);
      t.index(["organization_id", "raised_by"]);
      t.index(["organization_id", "category"]);
    });
  }

  // ---- Ticket Comments ----
  if (!(await knex.schema.hasTable("ticket_comments"))) {
    await knex.schema.createTable("ticket_comments", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("ticket_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("helpdesk_tickets")
        .onDelete("CASCADE");
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.text("comment").notNullable();
      t.boolean("is_internal").notNullable().defaultTo(false);
      t.json("attachments").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["ticket_id", "created_at"]);
    });
  }

  // ---- Knowledge Base Articles ----
  if (!(await knex.schema.hasTable("knowledge_base_articles"))) {
    await knex.schema.createTable("knowledge_base_articles", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.string("slug", 255).notNullable();
      t.specificType("content", "LONGTEXT").notNullable();
      t.enum("category", [
        "leave",
        "payroll",
        "benefits",
        "it",
        "facilities",
        "onboarding",
        "policy",
        "general",
      ]).notNullable();
      t.boolean("is_published").notNullable().defaultTo(false);
      t.boolean("is_featured").notNullable().defaultTo(false);
      t.integer("view_count").unsigned().notNullable().defaultTo(0);
      t.integer("helpful_count").unsigned().notNullable().defaultTo(0);
      t.integer("not_helpful_count").unsigned().notNullable().defaultTo(0);
      t.integer("author_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_published", "category"]);
      t.unique(["organization_id", "slug"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("knowledge_base_articles");
  await knex.schema.dropTableIfExists("ticket_comments");
  await knex.schema.dropTableIfExists("helpdesk_tickets");
}
