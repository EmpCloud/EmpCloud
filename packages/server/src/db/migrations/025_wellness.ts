// =============================================================================
// MIGRATION 025 — Employee Wellness Programs
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("wellness_programs"))) {
    await knex.schema.createTable("wellness_programs", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("description").nullable();
      t.enum("program_type", [
        "fitness",
        "mental_health",
        "nutrition",
        "meditation",
        "yoga",
        "team_activity",
        "health_checkup",
        "other",
      ]).notNullable().defaultTo("other");
      t.date("start_date").nullable();
      t.date("end_date").nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.integer("max_participants").unsigned().nullable();
      t.integer("enrolled_count").unsigned().notNullable().defaultTo(0);
      t.integer("points_reward").unsigned().notNullable().defaultTo(0);
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "is_active"]);
    });
  }

  if (!(await knex.schema.hasTable("wellness_enrollments"))) {
    await knex.schema.createTable("wellness_enrollments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("program_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("wellness_programs")
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
      t.enum("status", ["enrolled", "in_progress", "completed", "dropped"])
        .notNullable()
        .defaultTo("enrolled");
      t.decimal("progress_percentage", 5, 2).notNullable().defaultTo(0);
      t.datetime("completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.unique(["program_id", "user_id"]);
      t.index(["organization_id", "user_id"]);
    });
  }

  if (!(await knex.schema.hasTable("wellness_check_ins"))) {
    await knex.schema.createTable("wellness_check_ins", (t) => {
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
      t.date("check_in_date").notNullable();
      t.enum("mood", ["great", "good", "okay", "low", "stressed"]).notNullable();
      t.tinyint("energy_level").unsigned().notNullable(); // 1-5
      t.decimal("sleep_hours", 3, 1).nullable();
      t.integer("exercise_minutes").unsigned().notNullable().defaultTo(0);
      t.text("notes").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.unique(["organization_id", "user_id", "check_in_date"]);
    });
  }

  if (!(await knex.schema.hasTable("wellness_goals"))) {
    await knex.schema.createTable("wellness_goals", (t) => {
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
      t.string("title", 255).notNullable();
      t.enum("goal_type", ["steps", "exercise", "meditation", "water", "sleep", "custom"])
        .notNullable()
        .defaultTo("custom");
      t.integer("target_value").unsigned().notNullable();
      t.integer("current_value").unsigned().notNullable().defaultTo(0);
      t.string("unit", 20).notNullable(); // steps, minutes, glasses, hours
      t.enum("frequency", ["daily", "weekly", "monthly"]).notNullable().defaultTo("daily");
      t.enum("status", ["active", "completed", "abandoned"]).notNullable().defaultTo("active");
      t.date("start_date").notNullable();
      t.date("end_date").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "user_id", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wellness_goals");
  await knex.schema.dropTableIfExists("wellness_check_ins");
  await knex.schema.dropTableIfExists("wellness_enrollments");
  await knex.schema.dropTableIfExists("wellness_programs");
}
