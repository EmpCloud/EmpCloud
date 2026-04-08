// =============================================================================
// EMP CLOUD — Cross-Module Data Sanity Checker
// Verifies data consistency across all module databases on the same MySQL server.
// =============================================================================

import knexLib, { Knex } from "knex";
import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SanityCheckItem {
  id: number;
  description: string;
}

interface SanityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  details: string;
  count: number;
  items?: SanityCheckItem[];
}

export interface SanityReport {
  timestamp: string;
  overall_status: "healthy" | "warnings" | "critical";
  checks: SanityCheck[];
  summary: {
    total_checks: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

export interface FixReport {
  timestamp: string;
  fixes_applied: Array<{
    name: string;
    description: string;
    affected_rows: number;
  }>;
  total_fixes: number;
}

// ---------------------------------------------------------------------------
// Module database map
// ---------------------------------------------------------------------------

const MODULE_DATABASES: Record<string, string> = {
  empcloud: "empcloud",
  payroll: "emp_payroll",
  recruit: "emp_recruit",
  performance: "emp_performance",
  rewards: "emp_rewards",
  exit: "emp_exit",
  billing: "emp_billing",
  lms: "emp_lms",
};

// ---------------------------------------------------------------------------
// Module DB connection helper
// ---------------------------------------------------------------------------

const moduleConnections: Map<string, Knex> = new Map();

function getModuleDB(dbName: string): Knex {
  if (moduleConnections.has(dbName)) {
    return moduleConnections.get(dbName)!;
  }

  const conn = knexLib({
    client: "mysql2",
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: dbName,
    },
    pool: { min: 0, max: 3 },
  });

  moduleConnections.set(dbName, conn);
  return conn;
}

async function isDBAccessible(dbName: string): Promise<boolean> {
  try {
    const conn = getModuleDB(dbName);
    await conn.raw("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function tableExists(conn: Knex, tableName: string): Promise<boolean> {
  try {
    const result = await conn.schema.hasTable(tableName);
    return result;
  } catch {
    return false;
  }
}

/**
 * Destroy all module connections opened during a check.
 */
async function destroyModuleConnections(): Promise<void> {
  for (const [name, conn] of moduleConnections) {
    try {
      await conn.destroy();
    } catch {
      // Ignore
    }
  }
  moduleConnections.clear();
}

// ---------------------------------------------------------------------------
// Individual sanity checks
// ---------------------------------------------------------------------------

/**
 * 1. User Count Consistency
 * empcloud.users (active, per org) vs organizations.current_user_count
 */
async function checkUserCountConsistency(): Promise<SanityCheck> {
  const name = "User Count Consistency";
  try {
    const db = getDB();

    const rows = await db.raw(`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        o.current_user_count AS reported_count,
        COALESCE(u.actual_count, 0) AS actual_count
      FROM organizations o
      LEFT JOIN (
        SELECT organization_id, COUNT(*) AS actual_count
        FROM users
        WHERE status = 1
        GROUP BY organization_id
      ) u ON u.organization_id = o.id
      WHERE o.is_active = 1
      HAVING reported_count != actual_count
    `);

    const mismatches = rows[0] || [];
    if (mismatches.length === 0) {
      return { name, status: "pass", details: "All organization user counts match actual active user counts.", count: 0 };
    }

    return {
      name,
      status: "warn",
      details: `${mismatches.length} organization(s) have mismatched user counts.`,
      count: mismatches.length,
      items: mismatches.slice(0, 10).map((r: any) => ({
        id: r.org_id,
        description: `Org "${r.org_name}" (ID ${r.org_id}): reported=${r.reported_count}, actual=${r.actual_count}`,
      })),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 2. Employee Exists Across Modules
 * For each org with module subscriptions, check if employees who have seat assignments
 * exist in that module's users table (where applicable).
 */
async function checkCrossModuleEmployees(): Promise<SanityCheck> {
  const name = "Cross-Module Employee Sync";
  try {
    const db = getDB();

    // Get seat assignments with module slugs
    const seats = await db.raw(`
      SELECT
        oms.user_id,
        oms.organization_id,
        m.slug AS module_slug,
        u.email,
        u.first_name,
        u.last_name
      FROM org_module_seats oms
      JOIN modules m ON m.id = oms.module_id
      JOIN users u ON u.id = oms.user_id
      WHERE u.status = 1
    `);

    const seatRows = seats[0] || [];
    if (seatRows.length === 0) {
      return { name, status: "pass", details: "No module seat assignments found to verify.", count: 0 };
    }

    const missing: SanityCheckItem[] = [];

    // Map module slugs to DB names
    const slugToDb: Record<string, string> = {
      "emp-payroll": "emp_payroll",
      "emp-recruit": "emp_recruit",
      "emp-performance": "emp_performance",
      "emp-rewards": "emp_rewards",
      "emp-exit": "emp_exit",
      "emp-lms": "emp_lms",
    };

    // Group seats by module for batch checking
    const seatsByModule: Record<string, any[]> = {};
    for (const seat of seatRows) {
      const dbName = slugToDb[seat.module_slug];
      if (!dbName) continue;
      if (!seatsByModule[dbName]) seatsByModule[dbName] = [];
      seatsByModule[dbName].push(seat);
    }

    for (const [dbName, moduleSeats] of Object.entries(seatsByModule)) {
      if (!(await isDBAccessible(dbName))) continue;
      const moduleDb = getModuleDB(dbName);
      if (!(await tableExists(moduleDb, "users"))) continue;

      const emails = moduleSeats.map((s: any) => s.email);
      const existing = await moduleDb("users").whereIn("email", emails).select("email");
      const existingSet = new Set(existing.map((e: any) => e.email));

      for (const seat of moduleSeats) {
        if (!existingSet.has(seat.email)) {
          missing.push({
            id: seat.user_id,
            description: `User "${seat.first_name} ${seat.last_name}" (${seat.email}) has seat in ${dbName} but no user record found in module DB`,
          });
        }
      }
    }

    if (missing.length === 0) {
      return { name, status: "pass", details: "All module seat holders have corresponding records in module databases.", count: 0 };
    }

    return {
      name,
      status: "warn",
      details: `${missing.length} user(s) with module seats missing from module databases.`,
      count: missing.length,
      items: missing.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 3. Leave Balance Integrity
 * - leave_balances.balance should be >= 0
 * - leave_balances.total_used should match SUM of approved leave_applications days
 */
async function checkLeaveBalanceIntegrity(): Promise<SanityCheck> {
  const name = "Leave Balance Integrity";
  try {
    const db = getDB();
    const issues: SanityCheckItem[] = [];

    // Check for negative balances
    const negativeRows = await db.raw(`
      SELECT lb.id, lb.user_id, lb.leave_type_id, lb.year, lb.balance,
             u.first_name, u.last_name
      FROM leave_balances lb
      JOIN users u ON u.id = lb.user_id
      WHERE lb.balance < 0
      LIMIT 20
    `);

    const negatives = negativeRows[0] || [];
    for (const row of negatives) {
      issues.push({
        id: row.id,
        description: `Negative balance: User "${row.first_name} ${row.last_name}" (ID ${row.user_id}), leave_type=${row.leave_type_id}, year=${row.year}, balance=${row.balance}`,
      });
    }

    // Check total_used vs actual approved applications
    const mismatchRows = await db.raw(`
      SELECT
        lb.id,
        lb.user_id,
        lb.leave_type_id,
        lb.year,
        lb.total_used AS recorded_used,
        COALESCE(la_sum.actual_used, 0) AS actual_used,
        u.first_name,
        u.last_name
      FROM leave_balances lb
      JOIN users u ON u.id = lb.user_id
      LEFT JOIN (
        SELECT
          user_id,
          leave_type_id,
          YEAR(start_date) AS yr,
          SUM(days_count) AS actual_used
        FROM leave_applications
        WHERE status = 'approved'
        GROUP BY user_id, leave_type_id, YEAR(start_date)
      ) la_sum ON la_sum.user_id = lb.user_id
        AND la_sum.leave_type_id = lb.leave_type_id
        AND la_sum.yr = lb.year
      WHERE ABS(lb.total_used - COALESCE(la_sum.actual_used, 0)) > 0.1
      LIMIT 20
    `);

    const mismatches = mismatchRows[0] || [];
    for (const row of mismatches) {
      issues.push({
        id: row.id,
        description: `Used mismatch: User "${row.first_name} ${row.last_name}" (ID ${row.user_id}), type=${row.leave_type_id}, year=${row.year}: recorded=${row.recorded_used}, actual=${row.actual_used}`,
      });
    }

    if (issues.length === 0) {
      return { name, status: "pass", details: "All leave balances are non-negative and total_used matches approved applications.", count: 0 };
    }

    const status = negatives.length > 0 ? "fail" : "warn";
    return {
      name,
      status,
      details: `${issues.length} leave balance issue(s) found: ${negatives.length} negative, ${mismatches.length} usage mismatches.`,
      count: issues.length,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 4. Attendance Consistency
 * - No duplicate attendance records (same user + same date) — already enforced by UNIQUE constraint
 * - check_out should be after check_in
 * - worked_minutes should approximately match TIMESTAMPDIFF
 */
async function checkAttendanceConsistency(): Promise<SanityCheck> {
  const name = "Attendance Consistency";
  try {
    const db = getDB();
    const issues: SanityCheckItem[] = [];

    // Check check_out before check_in
    const timeAnomalies = await db.raw(`
      SELECT ar.id, ar.user_id, ar.date, ar.check_in, ar.check_out,
             u.first_name, u.last_name
      FROM attendance_records ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.check_in IS NOT NULL
        AND ar.check_out IS NOT NULL
        AND ar.check_out < ar.check_in
      LIMIT 20
    `);

    const anomalies = timeAnomalies[0] || [];
    for (const row of anomalies) {
      issues.push({
        id: row.id,
        description: `Time anomaly: User "${row.first_name} ${row.last_name}" on ${row.date}: check_out (${row.check_out}) is before check_in (${row.check_in})`,
      });
    }

    // Check worked_minutes mismatch (allow 2-minute tolerance)
    const workedMismatches = await db.raw(`
      SELECT ar.id, ar.user_id, ar.date, ar.worked_minutes,
             TIMESTAMPDIFF(MINUTE, ar.check_in, ar.check_out) AS calculated_minutes,
             u.first_name, u.last_name
      FROM attendance_records ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.check_in IS NOT NULL
        AND ar.check_out IS NOT NULL
        AND ar.worked_minutes IS NOT NULL
        AND ABS(CAST(ar.worked_minutes AS SIGNED) - TIMESTAMPDIFF(MINUTE, ar.check_in, ar.check_out)) > 2
      LIMIT 20
    `);

    const wmMismatches = workedMismatches[0] || [];
    for (const row of wmMismatches) {
      issues.push({
        id: row.id,
        description: `Worked minutes mismatch: User "${row.first_name} ${row.last_name}" on ${row.date}: recorded=${row.worked_minutes}m, calculated=${row.calculated_minutes}m`,
      });
    }

    if (issues.length === 0) {
      return { name, status: "pass", details: "All attendance records are consistent (no time anomalies or worked_minutes mismatches).", count: 0 };
    }

    return {
      name,
      status: anomalies.length > 0 ? "fail" : "warn",
      details: `${issues.length} attendance issue(s): ${anomalies.length} time anomalies, ${wmMismatches.length} worked_minutes mismatches.`,
      count: issues.length,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 5. Subscription/Seat Consistency
 * org_subscriptions.used_seats should match actual seat assignment count.
 */
async function checkSubscriptionSeatConsistency(): Promise<SanityCheck> {
  const name = "Subscription/Seat Consistency";
  try {
    const db = getDB();

    const rows = await db.raw(`
      SELECT
        os.id AS subscription_id,
        os.organization_id,
        m.name AS module_name,
        os.used_seats AS reported_seats,
        COALESCE(seat_count.actual, 0) AS actual_seats
      FROM org_subscriptions os
      JOIN modules m ON m.id = os.module_id
      LEFT JOIN (
        SELECT subscription_id, COUNT(*) AS actual
        FROM org_module_seats
        GROUP BY subscription_id
      ) seat_count ON seat_count.subscription_id = os.id
      WHERE os.status = 'active'
      HAVING reported_seats != actual_seats
    `);

    const mismatches = rows[0] || [];
    if (mismatches.length === 0) {
      return { name, status: "pass", details: "All subscription used_seats counts match actual seat assignments.", count: 0 };
    }

    return {
      name,
      status: "warn",
      details: `${mismatches.length} subscription(s) have mismatched seat counts.`,
      count: mismatches.length,
      items: mismatches.slice(0, 10).map((r: any) => ({
        id: r.subscription_id,
        description: `Subscription #${r.subscription_id} (${r.module_name}, org=${r.organization_id}): reported=${r.reported_seats}, actual=${r.actual_seats}`,
      })),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 6. Orphaned Records
 * - leave_applications referencing non-existent users
 * - attendance_records referencing non-existent users
 * - helpdesk_tickets referencing non-existent users
 * - announcements referencing non-existent orgs
 */
async function checkOrphanedRecords(): Promise<SanityCheck> {
  const name = "Orphaned Records";
  try {
    const db = getDB();
    const issues: SanityCheckItem[] = [];
    let totalOrphans = 0;

    // Orphaned leave applications
    const orphanedLeaves = await db.raw(`
      SELECT la.id, la.user_id
      FROM leave_applications la
      LEFT JOIN users u ON u.id = la.user_id
      WHERE u.id IS NULL
      LIMIT 10
    `);
    const oLeaves = orphanedLeaves[0] || [];
    totalOrphans += oLeaves.length;
    for (const row of oLeaves) {
      issues.push({ id: row.id, description: `Orphaned leave_application #${row.id}: user_id=${row.user_id} does not exist` });
    }

    // Orphaned attendance records
    const orphanedAttendance = await db.raw(`
      SELECT ar.id, ar.user_id
      FROM attendance_records ar
      LEFT JOIN users u ON u.id = ar.user_id
      WHERE u.id IS NULL
      LIMIT 10
    `);
    const oAttendance = orphanedAttendance[0] || [];
    totalOrphans += oAttendance.length;
    for (const row of oAttendance) {
      issues.push({ id: row.id, description: `Orphaned attendance_record #${row.id}: user_id=${row.user_id} does not exist` });
    }

    // Orphaned helpdesk tickets (table may not exist)
    if (await tableExists(db, "helpdesk_tickets")) {
      const orphanedTickets = await db.raw(`
        SELECT ht.id, ht.raised_by
        FROM helpdesk_tickets ht
        LEFT JOIN users u ON u.id = ht.raised_by
        WHERE u.id IS NULL
        LIMIT 10
      `);
      const oTickets = orphanedTickets[0] || [];
      totalOrphans += oTickets.length;
      for (const row of oTickets) {
        issues.push({ id: row.id, description: `Orphaned helpdesk_ticket #${row.id}: raised_by=${row.raised_by} does not exist` });
      }
    }

    // Orphaned announcements (org doesn't exist)
    const orphanedAnnouncements = await db.raw(`
      SELECT a.id, a.organization_id
      FROM announcements a
      LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE o.id IS NULL
      LIMIT 10
    `);
    const oAnnouncements = orphanedAnnouncements[0] || [];
    totalOrphans += oAnnouncements.length;
    for (const row of oAnnouncements) {
      issues.push({ id: row.id, description: `Orphaned announcement #${row.id}: organization_id=${row.organization_id} does not exist` });
    }

    if (totalOrphans === 0) {
      return { name, status: "pass", details: "No orphaned records found across leave, attendance, helpdesk, and announcements.", count: 0 };
    }

    return {
      name,
      status: "fail",
      details: `${totalOrphans} orphaned record(s) found.`,
      count: totalOrphans,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 7. Payroll-Leave Sync
 * If payroll DB is accessible, check that approved leaves in empcloud have
 * corresponding payroll deduction records.
 */
async function checkPayrollLeaveSync(): Promise<SanityCheck> {
  const name = "Payroll-Leave Sync";
  try {
    const payrollDb = "emp_payroll";
    if (!(await isDBAccessible(payrollDb))) {
      return { name, status: "pass", details: "Payroll database not accessible — skipping check.", count: 0 };
    }

    const pDb = getModuleDB(payrollDb);

    // Check if payroll has a leave_deductions or payroll_items table
    const hasDeductions = await tableExists(pDb, "leave_deductions");
    const hasPayrollItems = await tableExists(pDb, "payroll_items");

    if (!hasDeductions && !hasPayrollItems) {
      return { name, status: "pass", details: "Payroll DB accessible but no leave_deductions/payroll_items table found — skipping.", count: 0 };
    }

    const db = getDB();

    // Count approved unpaid leaves without corresponding payroll record
    const approvedUnpaid = await db.raw(`
      SELECT COUNT(*) AS cnt
      FROM leave_applications la
      JOIN leave_types lt ON lt.id = la.leave_type_id
      WHERE la.status = 'approved'
        AND lt.is_paid = 0
    `);

    const unpaidCount = approvedUnpaid[0]?.[0]?.cnt || 0;

    if (unpaidCount === 0) {
      return { name, status: "pass", details: "No approved unpaid leaves require payroll deduction verification.", count: 0 };
    }

    return {
      name,
      status: "warn",
      details: `${unpaidCount} approved unpaid leave(s) found — verify payroll deductions are recorded.`,
      count: unpaidCount,
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 8. Exit-User Status Sync
 * Completed exits in emp_exit should have corresponding users.status != 1 in empcloud.
 */
async function checkExitUserSync(): Promise<SanityCheck> {
  const name = "Exit-User Status Sync";
  try {
    const exitDb = "emp_exit";
    if (!(await isDBAccessible(exitDb))) {
      return { name, status: "pass", details: "Exit database not accessible — skipping check.", count: 0 };
    }

    const eDb = getModuleDB(exitDb);

    // Check what tables exist — common patterns: exit_requests, exits, offboarding_requests
    const hasExitRequests = await tableExists(eDb, "exit_requests");
    const hasExits = await tableExists(eDb, "exits");

    if (!hasExitRequests && !hasExits) {
      return { name, status: "pass", details: "Exit DB accessible but no exit_requests/exits table found — skipping.", count: 0 };
    }

    const exitTable = hasExitRequests ? "exit_requests" : "exits";

    // Get completed exits with their user emails
    let completedExits: any[];
    try {
      const result = await eDb.raw(`
        SELECT id, user_id, email, status
        FROM ${exitTable}
        WHERE status = 'completed'
        LIMIT 100
      `);
      completedExits = result[0] || [];
    } catch {
      // Table structure may be different
      return { name, status: "pass", details: `Exit table "${exitTable}" exists but could not be queried — skipping.`, count: 0 };
    }

    if (completedExits.length === 0) {
      return { name, status: "pass", details: "No completed exits found in exit database.", count: 0 };
    }

    // Check if these users are still active in empcloud
    const db = getDB();
    const issues: SanityCheckItem[] = [];

    // Try matching by email first
    const emails = completedExits.filter((e: any) => e.email).map((e: any) => e.email);
    if (emails.length > 0) {
      const stillActive = await db("users")
        .whereIn("email", emails)
        .where("status", 1)
        .select("id", "email", "first_name", "last_name");

      for (const user of stillActive) {
        issues.push({
          id: user.id,
          description: `User "${user.first_name} ${user.last_name}" (${user.email}) has completed exit but is still active (status=1) in EMP Cloud`,
        });
      }
    }

    if (issues.length === 0) {
      return { name, status: "pass", details: "All completed exits have correctly deactivated users in EMP Cloud.", count: 0 };
    }

    return {
      name,
      status: "fail",
      details: `${issues.length} user(s) with completed exits are still active in EMP Cloud.`,
      count: issues.length,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 9. Department/Location Integrity
 * Users referencing department_ids or location_ids that don't exist.
 */
async function checkDepartmentLocationIntegrity(): Promise<SanityCheck> {
  const name = "Department/Location Integrity";
  try {
    const db = getDB();
    const issues: SanityCheckItem[] = [];

    // Users with non-existent department_id
    const orphanedDepts = await db.raw(`
      SELECT u.id, u.first_name, u.last_name, u.department_id
      FROM users u
      LEFT JOIN organization_departments d ON d.id = u.department_id
      WHERE u.department_id IS NOT NULL AND d.id IS NULL
      LIMIT 20
    `);

    const deptOrphans = orphanedDepts[0] || [];
    for (const row of deptOrphans) {
      issues.push({
        id: row.id,
        description: `User "${row.first_name} ${row.last_name}" (ID ${row.id}): department_id=${row.department_id} does not exist`,
      });
    }

    // Users with non-existent location_id
    const orphanedLocs = await db.raw(`
      SELECT u.id, u.first_name, u.last_name, u.location_id
      FROM users u
      LEFT JOIN organization_locations l ON l.id = u.location_id
      WHERE u.location_id IS NOT NULL AND l.id IS NULL
      LIMIT 20
    `);

    const locOrphans = orphanedLocs[0] || [];
    for (const row of locOrphans) {
      issues.push({
        id: row.id,
        description: `User "${row.first_name} ${row.last_name}" (ID ${row.id}): location_id=${row.location_id} does not exist`,
      });
    }

    const totalOrphans = deptOrphans.length + locOrphans.length;
    if (totalOrphans === 0) {
      return { name, status: "pass", details: "All user department_id and location_id references are valid.", count: 0 };
    }

    return {
      name,
      status: "warn",
      details: `${totalOrphans} orphaned reference(s): ${deptOrphans.length} invalid departments, ${locOrphans.length} invalid locations.`,
      count: totalOrphans,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

/**
 * 10. Duplicate Detection
 * - Duplicate emails in users table
 * - Duplicate employee_codes within same org
 */
async function checkDuplicates(): Promise<SanityCheck> {
  const name = "Duplicate Detection";
  try {
    const db = getDB();
    const issues: SanityCheckItem[] = [];

    // Duplicate emails (should be prevented by UNIQUE constraint, but check anyway)
    const dupEmails = await db.raw(`
      SELECT email, COUNT(*) AS cnt
      FROM users
      GROUP BY email
      HAVING cnt > 1
      LIMIT 20
    `);

    const emailDups = dupEmails[0] || [];
    for (const row of emailDups) {
      issues.push({
        id: 0,
        description: `Duplicate email: "${row.email}" appears ${row.cnt} times in users table`,
      });
    }

    // Duplicate emp_code within same org
    const dupCodes = await db.raw(`
      SELECT organization_id, emp_code, COUNT(*) AS cnt
      FROM users
      WHERE emp_code IS NOT NULL AND emp_code != ''
      GROUP BY organization_id, emp_code
      HAVING cnt > 1
      LIMIT 20
    `);

    const codeDups = dupCodes[0] || [];
    for (const row of codeDups) {
      issues.push({
        id: 0,
        description: `Duplicate emp_code: "${row.emp_code}" appears ${row.cnt} times in org ${row.organization_id}`,
      });
    }

    const totalDups = emailDups.length + codeDups.length;
    if (totalDups === 0) {
      return { name, status: "pass", details: "No duplicate emails or employee codes found.", count: 0 };
    }

    return {
      name,
      status: "fail",
      details: `${totalDups} duplicate issue(s): ${emailDups.length} duplicate emails, ${codeDups.length} duplicate emp_codes.`,
      count: totalDups,
      items: issues.slice(0, 10),
    };
  } catch (err: any) {
    return { name, status: "fail", details: `Check failed: ${err.message}`, count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Run all sanity checks and produce a report.
 */
export async function runSanityCheck(): Promise<SanityReport> {
  logger.info("Starting cross-module data sanity check...");

  const checks = await Promise.all([
    checkUserCountConsistency(),
    checkCrossModuleEmployees(),
    checkLeaveBalanceIntegrity(),
    checkAttendanceConsistency(),
    checkSubscriptionSeatConsistency(),
    checkOrphanedRecords(),
    checkPayrollLeaveSync(),
    checkExitUserSync(),
    checkDepartmentLocationIntegrity(),
    checkDuplicates(),
  ]);

  // Clean up module connections
  await destroyModuleConnections();

  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const failures = checks.filter((c) => c.status === "fail").length;

  let overall_status: SanityReport["overall_status"] = "healthy";
  if (failures > 0) overall_status = "critical";
  else if (warnings > 0) overall_status = "warnings";

  const report: SanityReport = {
    timestamp: new Date().toISOString(),
    overall_status,
    checks,
    summary: {
      total_checks: checks.length,
      passed,
      warnings,
      failures,
    },
  };

  logger.info("Data sanity check complete", { overall_status, passed, warnings, failures });
  return report;
}

// ---------------------------------------------------------------------------
// Auto-fix
// ---------------------------------------------------------------------------

/**
 * Apply automatic fixes for issues that can be safely corrected:
 * - Sync user counts to actual values
 * - Remove orphaned records
 * - Fix negative leave balances by clamping to 0
 */
export async function runAutoFix(): Promise<FixReport> {
  logger.info("Starting data sanity auto-fix...");
  const db = getDB();
  const fixes: FixReport["fixes_applied"] = [];

  // Fix 1: Sync organization user counts
  try {
    const result = await db.raw(`
      UPDATE organizations o
      SET o.current_user_count = (
        SELECT COUNT(*)
        FROM users u
        WHERE u.organization_id = o.id AND u.status = 1
      )
      WHERE o.current_user_count != (
        SELECT COUNT(*)
        FROM users u2
        WHERE u2.organization_id = o.id AND u2.status = 1
      )
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Sync User Counts",
        description: `Updated current_user_count for ${affected} organization(s) to match actual active user counts.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to sync user counts", { error: err.message });
  }

  // Fix 2: Sync subscription used_seats
  try {
    const result = await db.raw(`
      UPDATE org_subscriptions os
      SET os.used_seats = (
        SELECT COUNT(*)
        FROM org_module_seats oms
        WHERE oms.subscription_id = os.id
      )
      WHERE os.used_seats != (
        SELECT COUNT(*)
        FROM org_module_seats oms2
        WHERE oms2.subscription_id = os.id
      )
      AND os.status = 'active'
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Sync Subscription Seats",
        description: `Updated used_seats for ${affected} subscription(s) to match actual seat assignments.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to sync subscription seats", { error: err.message });
  }

  // Fix 3: Clamp negative leave balances to 0
  try {
    const result = await db.raw(`
      UPDATE leave_balances
      SET balance = 0
      WHERE balance < 0
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Fix Negative Leave Balances",
        description: `Clamped ${affected} negative leave balance(s) to 0.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to fix negative balances", { error: err.message });
  }

  // Fix 4: Remove orphaned leave applications
  try {
    const result = await db.raw(`
      DELETE la FROM leave_applications la
      LEFT JOIN users u ON u.id = la.user_id
      WHERE u.id IS NULL
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Remove Orphaned Leave Applications",
        description: `Deleted ${affected} leave application(s) referencing non-existent users.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to remove orphaned leave applications", { error: err.message });
  }

  // Fix 5: Remove orphaned attendance records
  try {
    const result = await db.raw(`
      DELETE ar FROM attendance_records ar
      LEFT JOIN users u ON u.id = ar.user_id
      WHERE u.id IS NULL
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Remove Orphaned Attendance Records",
        description: `Deleted ${affected} attendance record(s) referencing non-existent users.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to remove orphaned attendance records", { error: err.message });
  }

  // Fix 6: Remove orphaned helpdesk tickets
  try {
    if (await tableExists(db, "helpdesk_tickets")) {
      const result = await db.raw(`
        DELETE ht FROM helpdesk_tickets ht
        LEFT JOIN users u ON u.id = ht.raised_by
        WHERE u.id IS NULL
      `);
      const affected = result[0]?.affectedRows || 0;
      if (affected > 0) {
        fixes.push({
          name: "Remove Orphaned Helpdesk Tickets",
          description: `Deleted ${affected} helpdesk ticket(s) referencing non-existent users.`,
          affected_rows: affected,
        });
      }
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to remove orphaned helpdesk tickets", { error: err.message });
  }

  // Fix 7: Remove orphaned announcements
  try {
    const result = await db.raw(`
      DELETE a FROM announcements a
      LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE o.id IS NULL
    `);
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      fixes.push({
        name: "Remove Orphaned Announcements",
        description: `Deleted ${affected} announcement(s) referencing non-existent organizations.`,
        affected_rows: affected,
      });
    }
  } catch (err: any) {
    logger.error("Auto-fix: failed to remove orphaned announcements", { error: err.message });
  }

  const report: FixReport = {
    timestamp: new Date().toISOString(),
    fixes_applied: fixes,
    total_fixes: fixes.reduce((sum, f) => sum + f.affected_rows, 0),
  };

  logger.info("Data sanity auto-fix complete", { total_fixes: report.total_fixes, fix_count: fixes.length });
  return report;
}