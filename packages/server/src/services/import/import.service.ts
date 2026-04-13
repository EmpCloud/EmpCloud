// =============================================================================
// EMP CLOUD — Bulk Import Service
//
// Spreadsheet schema (CSV or XLSX):
//   first_name, last_name, email, password, role, emp_code, designation,
//   department_name, location_name, reporting_manager_email, employment_type,
//   date_of_joining, date_of_birth, date_of_exit, gender, contact_number, address
//
// Only first_name, last_name and email are required. Department / location /
// reporting manager are resolved by human-readable name or email, not ID.
// Dates accept any reasonable format — see parseDate() below.
// =============================================================================

import * as XLSX from "xlsx";
import { getDB } from "../../db/connection.js";
import { bulkCreateUsers } from "../user/user.service.js";
import { UserRole, EmploymentType } from "@empcloud/shared";

export interface ImportRow {
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  role?: string;
  emp_code?: string;
  designation?: string;
  department_name?: string;
  department_id?: number;
  location_name?: string;
  location_id?: number;
  reporting_manager_email?: string;
  reporting_manager_id?: number;
  employment_type?: string;
  date_of_joining?: string;
  date_of_birth?: string;
  date_of_exit?: string;
  gender?: string;
  contact_number?: string;
  address?: string;
}

export interface ImportError {
  row: number;
  data: ImportRow;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set<string>(Object.values(UserRole));
const VALID_EMPLOYMENT_TYPES = new Set<string>(Object.values(EmploymentType));

/** Pick the first non-empty value among aliases. */
function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

/**
 * Normalize any reasonable date representation to YYYY-MM-DD.
 *
 * Accepts:
 * - Excel serial numbers (e.g. 45678) — xlsx gives these as numbers
 * - JS Date objects (from xlsx cellDates: true)
 * - ISO strings: 2026-01-15, 2026-01-15T00:00:00Z
 * - Slash/dot separated: 15/01/2026, 15-01-2026, 15.01.2026 (day-first, India default)
 * - US style: 01/15/2026 — only when the first part is clearly > 12
 * - Human: "15 Jan 2026", "Jan 15, 2026"
 *
 * Returns null if the input can't be interpreted — the caller reports
 * a friendly row-level error.
 */
function parseDate(input: unknown): string | null {
  if (input === undefined || input === null || input === "") return null;

  // Already a Date object (xlsx with cellDates: true returns these)
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return toISODate(input);
  }

  // Excel serial number — days since 1899-12-30
  if (typeof input === "number" && Number.isFinite(input)) {
    // Excel 1900 epoch with the leap-year bug baked in
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + input * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return toISODate(d);
  }

  const str = String(input).trim();
  if (!str) return null;

  // Already ISO YYYY-MM-DD (or with time component) — fast path
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (day-first default — India)
  const dayFirst = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dayFirst) {
    let [, a, b, y] = dayFirst;
    let year = parseInt(y, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let day = parseInt(a, 10);
    let month = parseInt(b, 10);
    // If "day" > 12, it's unambiguously day-first. If "month" > 12, treat
    // as US-style (month-first) and swap.
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${String(parseInt(m, 10)).padStart(2, "0")}-${String(parseInt(d, 10)).padStart(2, "0")}`;
  }

  // Last resort: let Date do its best (handles "15 Jan 2026", "Jan 15 2026", etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return toISODate(parsed);
  }

  return null;
}

function toISODate(d: Date): string {
  // Use LOCAL components so "15 Jan 2026" (parsed as local midnight) stays
  // as calendar day 15, not UTC-shifted to the 14th in timezones behind UTC.
  // The import service is only interested in the calendar date, never the
  // time-of-day, so using local components is correct here.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a CSV or XLSX file buffer into ImportRow[]. Uses the xlsx library
 * which handles both formats transparently (plus Excel date serials, merged
 * cells, etc.). Header row is case-insensitive and supports common aliases
 * (firstname/first_name, phone/contact_number, etc.).
 */
export function parseFile(fileBuffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true, raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  // defval ensures missing cells come through as "" instead of undefined so
  // the header→key mapping stays stable. raw keeps Date objects as Dates.
  const records = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: "",
    raw: true,
  });

  return records.map((record) => {
    // Normalize header keys: lowercase, trim, no surrounding punctuation.
    const row: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      const normalized = String(key).trim().toLowerCase().replace(/\s+/g, "_");
      row[normalized] = value;
    }

    return {
      first_name: pick(row, "first_name", "firstname") || "",
      last_name: pick(row, "last_name", "lastname") || "",
      email: pick(row, "email", "email_address") || "",
      password: pick(row, "password", "initial_password"),
      role: pick(row, "role", "user_role"),
      emp_code: pick(row, "emp_code", "employee_code", "empcode", "empid"),
      designation: pick(row, "designation", "title", "job_title"),
      department_name: pick(row, "department_name", "department", "dept"),
      location_name: pick(row, "location_name", "location", "office", "branch"),
      reporting_manager_email: pick(
        row,
        "reporting_manager_email",
        "manager_email",
        "manager",
        "reports_to",
      ),
      employment_type: pick(row, "employment_type", "emp_type", "type"),
      // Dates are captured as raw strings here; validateImportData normalizes
      // them via parseDate() and flags anything unparseable.
      date_of_joining: rawDate(row, "date_of_joining", "doj", "joining_date", "start_date"),
      date_of_birth: rawDate(row, "date_of_birth", "dob", "birth_date"),
      date_of_exit: rawDate(row, "date_of_exit", "exit_date", "end_date"),
      gender: pick(row, "gender"),
      contact_number: pick(row, "contact_number", "phone", "mobile", "phone_number"),
      address: pick(row, "address", "street_address"),
    };
  });
}

/** Preserve raw cell value (Date/number/string) for later date parsing. */
function rawDate(row: Record<string, any>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      // Keep Date objects as ISO strings so they survive the server boundary
      if (value instanceof Date) return value.toISOString();
      return String(value).trim();
    }
  }
  return undefined;
}

/** Back-compat export — the old parseCSV name is still used by the route handler. */
export const parseCSV = parseFile;

/**
 * Validate parsed rows against the database. Resolves department / location /
 * reporting-manager by human-readable name/email into their numeric IDs.
 * Returns `valid` rows ready for insert and `errors` with human-readable
 * messages per row.
 *
 * - Checks email uniqueness (both within the file and against existing users).
 * - Enforces DOB ≥ 18 and DOE > DOJ when provided.
 * - Fails fast on the total headcount against the org's seat limit.
 */
export async function validateImportData(
  orgId: number,
  rows: ImportRow[],
): Promise<{ valid: ImportRow[]; errors: ImportError[] }> {
  const db = getDB();

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    throw new Error("Organization not found");
  }

  // Globally unique email — check across all users
  const existingUsers = await db("users").select("email");
  const existingEmails = new Set(existingUsers.map((u: any) => u.email.toLowerCase()));

  // Departments & locations (scoped to org)
  const departments = await db("organization_departments")
    .where({ organization_id: orgId })
    .select("id", "name");
  const deptMap = new Map<string, number>(
    departments.map((d: any) => [d.name.toLowerCase(), d.id]),
  );

  const locations = await db("organization_locations")
    .where({ organization_id: orgId })
    .select("id", "name");
  const locMap = new Map<string, number>(
    locations.map((l: any) => [l.name.toLowerCase(), l.id]),
  );

  // Potential reporting managers — active users in the org
  const managers = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id", "email");
  const managerMap = new Map<string, number>(
    managers.map((m: any) => [m.email.toLowerCase(), m.id]),
  );

  // Empoy codes already in use — org-scoped unique
  const empCodeRows = await db("users")
    .where({ organization_id: orgId })
    .whereNotNull("emp_code")
    .select("emp_code");
  const existingEmpCodes = new Set(
    empCodeRows.map((r: any) => String(r.emp_code).toLowerCase()),
  );

  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenEmails = new Set<string>();
  const seenEmpCodes = new Set<string>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eighteenYearsAgo = new Date(today);
  eighteenYearsAgo.setFullYear(today.getFullYear() - 18);

  rows.forEach((row, index) => {
    const rowErrors: string[] = [];

    // Required fields
    if (!row.first_name) rowErrors.push("first_name is required");
    if (!row.last_name) rowErrors.push("last_name is required");
    if (!row.email) {
      rowErrors.push("email is required");
    } else if (!EMAIL_RE.test(row.email)) {
      rowErrors.push("email format is invalid");
    }

    // Email uniqueness
    if (row.email) {
      const emailLower = row.email.toLowerCase();
      if (existingEmails.has(emailLower)) {
        rowErrors.push("Email already exists in the system");
      }
      if (seenEmails.has(emailLower)) {
        rowErrors.push("Duplicate email in import file");
      }
      seenEmails.add(emailLower);
    }

    // Password (optional, but must meet policy if provided)
    if (row.password && row.password.length > 0) {
      if (row.password.length < 8) {
        rowErrors.push("password must be at least 8 characters");
      }
      if (row.password.length > 128) {
        rowErrors.push("password must be at most 128 characters");
      }
    }

    // Role
    if (row.role) {
      const roleLower = row.role.toLowerCase();
      if (!VALID_ROLES.has(roleLower)) {
        rowErrors.push(
          `role must be one of: ${Array.from(VALID_ROLES).join(", ")}`,
        );
      } else {
        row.role = roleLower;
      }
    }

    // Employment type
    if (row.employment_type) {
      const etLower = row.employment_type.toLowerCase();
      if (!VALID_EMPLOYMENT_TYPES.has(etLower)) {
        rowErrors.push(
          `employment_type must be one of: ${Array.from(VALID_EMPLOYMENT_TYPES).join(", ")}`,
        );
      } else {
        row.employment_type = etLower;
      }
    }

    // emp_code (org-scoped unique)
    if (row.emp_code) {
      const codeLower = row.emp_code.toLowerCase();
      if (existingEmpCodes.has(codeLower)) {
        rowErrors.push(`emp_code "${row.emp_code}" already in use`);
      }
      if (seenEmpCodes.has(codeLower)) {
        rowErrors.push(`Duplicate emp_code "${row.emp_code}" in import file`);
      }
      seenEmpCodes.add(codeLower);
    }

    // Date normalization — parseDate() accepts Excel serials, Date objects,
    // ISO, DD/MM/YYYY, DD-MM-YYYY, "15 Jan 2026", etc. Anything it can't
    // interpret becomes a row-level error.
    if (row.date_of_birth) {
      const normalized = parseDate(row.date_of_birth);
      if (!normalized) {
        rowErrors.push(`date_of_birth "${row.date_of_birth}" is not a valid date`);
      } else {
        row.date_of_birth = normalized;
        const dob = new Date(normalized);
        if (dob > today) {
          rowErrors.push("date_of_birth must be in the past");
        } else if (dob > eighteenYearsAgo) {
          rowErrors.push("employee must be at least 18 years old");
        }
      }
    }
    if (row.date_of_joining) {
      const normalized = parseDate(row.date_of_joining);
      if (!normalized) {
        rowErrors.push(`date_of_joining "${row.date_of_joining}" is not a valid date`);
      } else {
        row.date_of_joining = normalized;
      }
    }
    if (row.date_of_exit) {
      const normalized = parseDate(row.date_of_exit);
      if (!normalized) {
        rowErrors.push(`date_of_exit "${row.date_of_exit}" is not a valid date`);
      } else {
        row.date_of_exit = normalized;
        if (row.date_of_joining && new Date(normalized) <= new Date(row.date_of_joining)) {
          rowErrors.push("date_of_exit must be after date_of_joining");
        }
      }
    }

    // Resolve department_name → department_id.
    // Unknown departments are NOT an error — executeImport auto-creates
    // any department name that isn't already in the org.
    if (row.department_name) {
      const deptId = deptMap.get(row.department_name.toLowerCase());
      if (deptId) {
        row.department_id = deptId;
      }
      // else: leave department_id undefined; executeImport will create
      // the department and fill it in before insert.
    }

    // Resolve location_name → location_id
    if (row.location_name) {
      const locId = locMap.get(row.location_name.toLowerCase());
      if (locId) {
        row.location_id = locId;
      } else {
        rowErrors.push(`Location "${row.location_name}" not found`);
      }
    }

    // Resolve reporting_manager_email → reporting_manager_id
    if (row.reporting_manager_email) {
      const mgrId = managerMap.get(row.reporting_manager_email.toLowerCase());
      if (mgrId) {
        row.reporting_manager_id = mgrId;
      } else {
        rowErrors.push(
          `Reporting manager "${row.reporting_manager_email}" not found or not active`,
        );
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: index + 2, data: row, errors: rowErrors });
    } else {
      valid.push(row);
    }
  });

  // Headcount / seat limit — fail fast on the total, not per row
  if (org.seat_limit && valid.length > 0) {
    const available = org.seat_limit - (org.current_user_count || 0);
    if (valid.length > available) {
      errors.push({
        row: 0,
        data: {} as ImportRow,
        errors: [
          `Org seat limit exceeded — ${valid.length} new users requested but only ${available} seats available`,
        ],
      });
      return { valid: [], errors };
    }
  }

  return { valid, errors };
}

/**
 * Execute the import — creates users in bulk via the user service.
 * Privilege-escalation check (can this importer assign super_admin?) is done
 * in the route handler before this is called.
 *
 * Auto-creates any department referenced by name that doesn't already exist
 * in the org. The newly created IDs are written back onto the rows before
 * they're passed to bulkCreateUsers.
 */
export async function executeImport(
  orgId: number,
  validRows: ImportRow[],
  importedBy: number,
): Promise<{ count: number; createdDepartments: string[] }> {
  const db = getDB();

  // Collect department names that were referenced but not resolved during
  // validation — these need to be created first.
  const missing = new Set<string>();
  for (const row of validRows) {
    if (row.department_name && !row.department_id) {
      missing.add(row.department_name.trim());
    }
  }

  const createdDepartments: string[] = [];

  if (missing.size > 0) {
    // Look up existing departments one more time (case-insensitive), in case
    // preview and execute are separated in time and someone else added them.
    const existing = await db("organization_departments")
      .where({ organization_id: orgId })
      .select("id", "name");
    const existingMap = new Map<string, number>(
      existing.map((d: any) => [String(d.name).toLowerCase(), d.id]),
    );

    // Create anything still missing
    for (const name of missing) {
      const lower = name.toLowerCase();
      if (existingMap.has(lower)) continue;
      const [newId] = await db("organization_departments").insert({
        organization_id: orgId,
        name,
      });
      existingMap.set(lower, newId);
      createdDepartments.push(name);
    }

    // Fill department_id on each row that needed it
    for (const row of validRows) {
      if (row.department_name && !row.department_id) {
        row.department_id = existingMap.get(row.department_name.toLowerCase());
      }
    }
  }

  const result = await bulkCreateUsers(orgId, validRows, importedBy);
  return { ...result, createdDepartments };
}
