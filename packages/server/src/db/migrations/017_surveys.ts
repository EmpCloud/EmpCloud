// =============================================================================
// MIGRATION 017 — Employee Surveys (Pulse, eNPS, Engagement)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Surveys ----
  if (!(await knex.schema.hasTable("surveys"))) {
    await knex.schema.createTable("surveys", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("description").nullable();
      t.string("type", 20).notNullable().defaultTo("pulse");
      t.string("status", 20).notNullable().defaultTo("draft");
      t.boolean("is_anonymous").notNullable().defaultTo(true);
      t.dateTime("start_date").nullable();
      t.dateTime("end_date").nullable();
      t.string("target_type", 20).notNullable().defaultTo("all");
      t.json("target_ids").nullable();
      t.string("recurrence", 20).notNullable().defaultTo("none");
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.integer("response_count").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["created_by"]);
    });
  }

  // ---- Survey Questions ----
  if (!(await knex.schema.hasTable("survey_questions"))) {
    await knex.schema.createTable("survey_questions", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("survey_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("surveys")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.text("question_text").notNullable();
      t.string("question_type", 30).notNullable().defaultTo("rating_1_5");
      t.json("options").nullable();
      t.boolean("is_required").notNullable().defaultTo(true);
      t.integer("sort_order").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["survey_id", "sort_order"]);
    });
  }

  // ---- Survey Responses ----
  if (!(await knex.schema.hasTable("survey_responses"))) {
    await knex.schema.createTable("survey_responses", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("survey_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("surveys")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id").unsigned().nullable().references("id").inTable("users");
      t.string("anonymous_id", 64).nullable();
      t.dateTime("submitted_at").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["survey_id", "user_id"]);
      t.index(["survey_id", "anonymous_id"]);
      t.index(["organization_id"]);
    });
  }

  // ---- Survey Answers ----
  if (!(await knex.schema.hasTable("survey_answers"))) {
    await knex.schema.createTable("survey_answers", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("response_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("survey_responses")
        .onDelete("CASCADE");
      t.bigInteger("question_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("survey_questions")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.integer("rating_value").nullable();
      t.text("text_value").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["response_id"]);
      t.index(["question_id"]);
      t.index(["organization_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("survey_answers");
  await knex.schema.dropTableIfExists("survey_responses");
  await knex.schema.dropTableIfExists("survey_questions");
  await knex.schema.dropTableIfExists("surveys");
}
