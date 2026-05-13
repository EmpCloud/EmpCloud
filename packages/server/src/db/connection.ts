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
      // Return DATE columns as raw "YYYY-MM-DD" strings, but leave
      // DATETIME / TIMESTAMP alone (still come back as JS Date objects).
      //
      // Why DATE-only: a DATE has no time component, so mysql2's default
      // of parsing it as midnight LOCAL time causes a TZ-offset shift on
      // any server not in UTC — a row stored as 2026-05-15 arrived at the
      // client as "2026-05-14T18:30:00.000Z" on IST servers, breaking
      // schedule-grid rendering (#2044).
      //
      // Why NOT DATETIME / TIMESTAMP: those carry meaningful time
      // components. The frontend was built around receiving them as ISO
      // strings (e.g. attendance check_in display via `new Date(str)
      // .toLocaleTimeString()`). Returning them as raw "YYYY-MM-DD
      // HH:MM:SS" strings drops the implicit UTC parsing and made
      // check-in display 5h30m off on IST servers. Keep the Date-object
      // path for these so toISOString() still emits a proper Z-suffixed
      // string the browser can re-parse correctly.
      //
      // dateStrings: string[] is valid at runtime but missing from Knex's
      // typings — casting through unknown bypasses without disabling
      // strict null checks anywhere else.
      dateStrings: ["DATE"] as unknown as boolean,
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
