import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("kb_article_ratings"))) {
    await knex.schema.createTable("kb_article_ratings", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("article_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("knowledge_base_articles")
        .onDelete("CASCADE");
      t.integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.boolean("helpful").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["article_id", "user_id"]);
      t.index(["organization_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("kb_article_ratings");
}
