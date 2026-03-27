import knex, { Knex } from "knex";

let db: Knex;

/**
 * Returns a Knex connection to the test database.
 *
 * Default host is "localhost" — intended to be run ON the test server (163.227.174.141).
 * MySQL 3306 is not open to the internet, so from a local machine you must either:
 *   1. SSH tunnel:  ssh -L 3306:localhost:3306 empcloud-development@163.227.174.141
 *   2. Override:    TEST_DB_HOST=127.0.0.1 npx vitest run
 */
export function getTestDB(): Knex {
  if (!db) {
    db = knex({
      client: "mysql2",
      connection: {
        host: process.env.TEST_DB_HOST || "localhost",
        port: Number(process.env.TEST_DB_PORT || 3306),
        user: process.env.TEST_DB_USER || "empcloud",
        password: process.env.TEST_DB_PASSWORD || "EmpCloud2026",
        database: process.env.TEST_DB_NAME || "empcloud",
        connectTimeout: 30000,
      },
      pool: { min: 1, max: 5 },
      acquireConnectionTimeout: 30000,
    });
  }
  return db;
}

export async function cleanupTestDB() {
  if (db) await db.destroy();
}

// Test org — use the existing TechNova org (org_id=5)
export const TEST_ORG_ID = 5;
export const TEST_ADMIN_ID = 522; // ananya
export const TEST_EMPLOYEE_ID = 524; // priya

// Second org for isolation tests — GlobalTech (org_id=9)
export const OTHER_ORG_ID = 9;
