// =============================================================================
// EMP CLOUD — Database Connection (Knex)
// =============================================================================

import knex, { Knex } from "knex";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

let db: Knex | null = null;

export async function initDB(): Promise<Knex> {
  if (db) return db;

  db = knex({
    client: "mysql2",
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      // Return DATE / DATETIME / TIMESTAMP columns as raw strings instead
      // of JS Date objects. mysql2's default parses DATE as a Date at
      // midnight LOCAL time, which then ISO-serializes shifted by the
      // server TZ offset — so a row with effective_from = '2026-05-15'
      // shows up over the wire as "2026-05-14T18:30:00.000Z" on an IST
      // server. Every frontend that does .slice(0, 10) on the ISO string
      // to find the YYYY-MM-DD then renders the wrong day. Production
      // (UTC server) gets away with it because midnight UTC = midnight
      // UTC, but IST dev servers don't. Confirmed safe across the
      // codebase: no service or route calls methods (.toISOString,
      // .getTime, etc.) directly on date columns — everything either
      // compares as strings or re-wraps in `new Date(...)` which accepts
      // both Date and string inputs.
      dateStrings: true,
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: "./src/db/migrations",
      extension: "ts",
    },
  });

  // Slow query logging
  db.on("query", (queryData: any) => {
    queryData._startTime = Date.now();
  });

  db.on("query-response", (_response: any, queryData: any) => {
    const duration = Date.now() - (queryData._startTime || Date.now());
    if (duration > 1000) {
      logger.warn("Slow query", {
        sql: queryData.sql?.substring(0, 200),
        duration_ms: duration,
        bindings: queryData.bindings?.slice(0, 5),
      });
    }
  });

  db.on("query-error", (error: any, queryData: any) => {
    logger.error("Query error", {
      sql: queryData.sql?.substring(0, 200),
      error: error.message,
      bindings: queryData.bindings?.slice(0, 5),
    });
  });

  await db.raw("SELECT 1");
  logger.info(`Database connected (${config.db.host}:${config.db.port}/${config.db.name})`);

  return db;
}

export function getDB(): Knex {
  if (!db) {
    throw new Error("Database not initialized. Call initDB() first.");
  }
  return db;
}

export async function closeDB(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    logger.info("Database connection closed");
  }
}
