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
