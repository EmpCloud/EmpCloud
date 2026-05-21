// =============================================================================
// EMP CLOUD — Cross-module Payroll DB Connection
// EmpCloud and emp-payroll run on the SAME MySQL server but in separate
// schemas (`empcloud` vs `emp_payroll`). A handful of identifiers — PAN, UAN —
// are entered on EITHER product's profile screen and must stay in sync. This
// gives EmpCloud a lazily-created, cached knex handle to the payroll schema so
// a profile save here can mirror those fields into the payroll side.
//
// This is deliberately best-effort: callers MUST guard usage with
// `isPayrollDBAccessible()` (or a try/catch) so a payroll-DB outage or a
// single-product deployment (no emp_payroll schema) never breaks an EmpCloud
// profile save.
// =============================================================================

import knexLib, { Knex } from "knex";
import { config } from "../config/index.js";

// emp-payroll's schema name on the shared MySQL server. Mirrors the
// MODULE_DATABASES["payroll"] entry in data-sanity.service.ts.
const PAYROLL_DB_NAME = process.env.PAYROLL_DB_NAME || "emp_payroll";

let payrollDb: Knex | null = null;

/**
 * Lazily create (and cache) a knex connection to the emp_payroll schema using
 * the same MySQL credentials EmpCloud already uses. Small pool — this handle
 * only services occasional cross-module writes, not request-path traffic.
 */
export function getPayrollDB(): Knex {
  if (payrollDb) return payrollDb;

  payrollDb = knexLib({
    client: "mysql2",
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: PAYROLL_DB_NAME,
    },
    pool: { min: 0, max: 3 },
  });

  return payrollDb;
}

/**
 * True when the emp_payroll schema is reachable and exposes the payroll
 * profile table. Returns false (never throws) for single-product deployments
 * or transient outages so the caller can skip the sync silently.
 */
export async function isPayrollDBAccessible(): Promise<boolean> {
  try {
    const conn = getPayrollDB();
    await conn.raw("SELECT 1");
    return await conn.schema.hasTable("employee_payroll_profiles");
  } catch {
    return false;
  }
}

export async function closePayrollDB(): Promise<void> {
  if (payrollDb) {
    try {
      await payrollDb.destroy();
    } catch {
      // ignore
    }
    payrollDb = null;
  }
}
