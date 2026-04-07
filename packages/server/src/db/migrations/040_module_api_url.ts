// =============================================================================
// MIGRATION 040 — Add api_url to modules for cross-module sync
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("modules", "api_url"))) {
    await knex.schema.alterTable("modules", (t) => {
      t.string("api_url", 512).nullable(); // Internal API endpoint for sync calls
    });
  }

  // Seed api_url for known modules (local dev defaults)
  const moduleApis: Record<string, string> = {
    "emp-payroll": "http://localhost:4000/api/v1",
    "emp-monitor": "http://localhost:5000/api/v3",
    "emp-recruit": "http://localhost:4500/api/v1",
    "emp-performance": "http://localhost:4300/api/v1",
    "emp-exit": "http://localhost:4400/api/v1",
    "emp-rewards": "http://localhost:4600/api/v1",
    "emp-lms": "http://localhost:4700/api/v1",
    "emp-field": "http://localhost:4800/api/v1",
    "emp-projects": "http://localhost:9000/v1",
    "emp-biometrics": "",
  };

  for (const [slug, apiUrl] of Object.entries(moduleApis)) {
    if (apiUrl) {
      await knex("modules").where({ slug }).update({ api_url: apiUrl });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("modules", "api_url")) {
    await knex.schema.alterTable("modules", (t) => {
      t.dropColumn("api_url");
    });
  }
}
