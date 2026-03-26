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
