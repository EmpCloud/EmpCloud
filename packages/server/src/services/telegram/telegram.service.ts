// =============================================================================
// EMP CLOUD — Telegram Bot Service
//
// One global platform bot (token from TELEGRAM_BOT_TOKEN). Two jobs:
//   1. Reply to /start with the chat's ID, so an admin can paste it into
//      Attendance Settings to receive the daily report (works in a private
//      chat OR a group the bot has been added to).
//   2. Deliver messages (the nightly attendance report) to configured chats.
//
// When no token is configured the bot stays inert — no polling, sends no-op —
// so a dev box without a token simply skips Telegram entirely.
// =============================================================================

import { Telegraf } from "telegraf";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

let bot: Telegraf | null = null;

const TELEGRAM_MAX = 4096;
// Leave headroom for the <pre></pre> wrapper we add per chunk.
const CHUNK_LIMIT = 3800;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Split already-formatted text into Telegram-sized chunks on line boundaries,
 * so a large org's report is never truncated. A single line longer than the
 * limit is hard-split as a last resort.
 */
function chunkOnLines(text: string, limit = CHUNK_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const piece = line.length > limit ? line.slice(0, limit) : line;
    if (current.length + piece.length + 1 > limit) {
      if (current) chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

/**
 * Start the bot: register the /start handler and begin long-polling. Non-
 * blocking — launch() runs until stop(), so we don't await it. Safe to call
 * once at boot; a second call is a no-op.
 */
export function initTelegramBot(): void {
  if (bot) return;
  const token = config.telegram.botToken;
  if (!token) {
    logger.info("Telegram bot disabled (TELEGRAM_BOT_TOKEN not set)");
    return;
  }

  bot = new Telegraf(token);

  // /start → reply with the chat id for this conversation/group.
  bot.start(async (ctx) => {
    const chatId = ctx.chat?.id;
    const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    await ctx.reply(
      `👋 EMP Cloud Attendance Bot\n\n` +
        `This ${isGroup ? "group's" : "chat's"} ID is:\n` +
        `${chatId}\n\n` +
        `Add this ID under Attendance Settings → Telegram Report to receive the daily attendance report here.`,
    );
  });

  // A generic /chatid alias, handy if /start was already consumed.
  bot.command("chatid", async (ctx) => {
    await ctx.reply(`Chat ID: ${ctx.chat?.id}`);
  });

  bot.catch((err) => {
    logger.error("Telegram bot error", { error: (err as Error)?.message });
  });

  // Fire-and-forget: launch() resolves only when the bot stops.
  bot
    .launch()
    .then(() => logger.info("Telegram bot stopped"))
    .catch((err) => {
      logger.error("Telegram bot failed to launch", { error: err?.message });
      bot = null;
    });

  logger.info("Telegram bot started (long-polling)");
}

export function stopTelegramBot(): void {
  if (bot) {
    try {
      bot.stop("SIGTERM");
    } catch {
      /* already stopping */
    }
    bot = null;
  }
}

export function isTelegramConfigured(): boolean {
  return !!config.telegram.botToken;
}

/**
 * Send a (possibly long) message to one chat, as monospace HTML so tabular
 * reports stay column-aligned. Auto-chunks over Telegram's 4096-char limit.
 * Returns true on full success; logs and returns false on any failure so a
 * single bad chat id never aborts the whole broadcast.
 */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  if (!bot) {
    logger.warn("sendTelegramMessage called but Telegram bot is not running");
    return false;
  }
  const chunks = chunkOnLines(text);
  try {
    for (const chunk of chunks) {
      await bot.telegram.sendMessage(chatId, `<pre>${escapeHtml(chunk)}</pre>`, {
        parse_mode: "HTML",
      });
    }
    return true;
  } catch (err: any) {
    logger.error("Failed to send Telegram message", {
      chatId: String(chatId),
      error: err?.message,
    });
    return false;
  }
}
