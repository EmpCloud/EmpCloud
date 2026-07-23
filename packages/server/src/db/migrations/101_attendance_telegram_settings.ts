import type { Knex } from "knex";

// Daily attendance report over Telegram — per-org config on attendance_settings.
//   • telegram_enabled     — master switch for the nightly report.
//   • telegram_chat_ids    — CSV of Telegram chat IDs that receive the report
//     (multiple allowed: DMs and/or groups). A user gets their chat id by
//     sending /start to the platform bot.
// The bot token itself is a single global secret (TELEGRAM_BOT_TOKEN env), not
// stored per org.
export async function up(knex: Knex): Promise<void> {
  const hasEnabled = await knex.schema.hasColumn("attendance_settings", "telegram_enabled");
  const hasChatIds = await knex.schema.hasColumn("attendance_settings", "telegram_chat_ids");
  await knex.schema.alterTable("attendance_settings", (t) => {
    if (!hasEnabled) t.boolean("telegram_enabled").notNullable().defaultTo(false);
    if (!hasChatIds) t.text("telegram_chat_ids").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEnabled = await knex.schema.hasColumn("attendance_settings", "telegram_enabled");
  const hasChatIds = await knex.schema.hasColumn("attendance_settings", "telegram_chat_ids");
  await knex.schema.alterTable("attendance_settings", (t) => {
    if (hasEnabled) t.dropColumn("telegram_enabled");
    if (hasChatIds) t.dropColumn("telegram_chat_ids");
  });
}
