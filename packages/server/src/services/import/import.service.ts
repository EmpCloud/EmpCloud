// =============================================================================
// EMP CLOUD — Bulk Import Service
//
// Spreadsheet schema (CSV or XLSX):
//   first_name, last_name, email, password, role, emp_code, designation,
//   department_name, location_name, reporting_manager_email,
//   reporting_manager_code, reporting_manager_name, employment_type,
//   date_of_joining, date_of_birth, date_of_exit, gender, contact_number, address
//
// Only first_name, last_name and email are required. Department / location /
// reporting manager are resolved by human-readable name, email or emp_code
// — not numeric ID. Reporting manager can be specified by email, emp_code or
// full name (first + last); resolution priority is email → code → name.
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
  // Reporting manager can be specified by email, employee code, or full name.
  // Resolution priority: email → emp_code → full name. The first non-empty
  // value wins and the others are ignored.
  reporting_manager_email?: string;
  reporting_manager_code?: string;
  reporting_manager_name?: string;
  // Primary reporting manager (the first resolved value from the cell).
  // Stored on users.reporting_manager_id for backward compatibility.
  reporting_manager_id?: number;
  // Additional managers resolved from the same cell — stored in the
  // user_additional_managers junction table during executeImport.
  _additional_manager_ids?: number[];
  // Transient flag: the referenced primary manager isn't an existing user but
  // is being imported in the same batch under this email. Set during validation
  // and resolved during executeImport() in a second pass after bulkCreateUsers
  // has inserted everyone. Never persisted.
  _pending_manager_email?: string;
  // Same idea but for additional managers whose target is another row in the
  // same import. Each entry is the target user's email.
  _pending_additional_manager_emails?: string[];
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

/**
 * Human-friendly values that people actually write in spreadsheets, mapped
 * to the canonical EmploymentType enum. The comparison is case- and
 * whitespace-insensitive. Anything not listed here and not already a valid
 * enum value falls through to a descriptive row-level error.
 */
const EMPLOYMENT_TYPE_SYNONYMS: Record<string, string> = {
  // full_time
  permanent: "full_time",
  regular: "full_time",
  fulltime: "full_time",
  full: "full_time",
  "full-time": "full_time",
  ft: "full_time",
  // part_time
  parttime: "part_time",
  "part-time": "part_time",
  pt: "part_time",
  // contract
  contractor: "contract",
  contractual: "contract",
  consultant: "contract",
  consultancy: "contract",
  freelance: "contract",
  freelancer: "contract",
  temporary: "contract",
  temp: "contract",
  // intern
  internship: "intern",
  trainee: "intern",
  apprentice: "intern",
};

/** Normalize a user-provided employment type (case + whitespace + synonyms). */
function normalizeEmploymentType(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  // Direct match against canonical values (full_time, part_time, contract, intern)
  if (VALID_EMPLOYMENT_TYPES.has(key)) return key;
  // Space → underscore and retry (handles "full time" → "full_time")
  const underscored = key.replace(/\s+/g, "_");
  if (VALID_EMPLOYMENT_TYPES.has(underscored)) return underscored;
  // Synonym map
  return EMPLOYMENT_TYPE_SYNONYMS[key] || EMPLOYMENT_TYPE_SYNONYMS[underscored] || key;
}

/**
 * Normalize a person's name for lookup: collapse runs of whitespace
 * (including Excel's non-breaking U+00A0), trim, lowercase. This makes
 * "  Sourav   Patra " and "Sourav\u00A0Patra" both match "sourav patra".
 */
function normalizeName(raw: string): string {
  return raw.replace(/[\s\u00A0]+/g, " ").trim().toLowerCase();
}

/**
 * Split a reporting-manager cell that may contain multiple managers.
 * We accept '/', '\', ',', ';', '|' and '&' as delimiters (with optional
 * whitespace on either side). These are all safe characters inside a
 * single valid email, employee code, or human name, so a multi-value cell
 * always uses one of them between tokens.
 *
 * Returns an array of trimmed non-empty tokens in the order they appear.
 */
function splitManagerCell(raw: string): string[] {
  return raw
    .split(/\s*[/\\,;|&]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

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

    // Support a single `full_name` / `name` column as an alternative to
    // separate first_name/last_name columns. The split rule:
    //   first token → first_name
    //   everything else joined with spaces → last_name
    // This preserves Indian/South-Asian naming where the surname is usually
    // the last word but there are often 2-4 middle names in between. So
    // "Aishwarya Keshav Murthy Gowda" becomes first="Aishwarya",
    // last="Keshav Murthy Gowda" — still a single DB row, still recognisable,
    // and the email match still works.
    let firstName = pick(row, "first_name", "firstname") || "";
    let lastName = pick(row, "last_name", "lastname") || "";
    if (!firstName && !lastName) {
      const fullName = pick(row, "full_name", "name", "employee_name", "fullname");
      if (fullName) {
        const parts = fullName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          firstName = parts[0];
          lastName = parts.slice(1).join(" ");
        } else if (parts.length === 1) {
          // Single-word name — put it in first_name and leave last_name
          // blank so the caller sees the clear "last_name is required" error.
          firstName = parts[0];
        }
      }
    }

    return {
      first_name: firstName,
      last_name: lastName,
      email: pick(row, "email", "email_address") || "",
      password: pick(row, "password", "initial_password"),
      role: pick(row, "role", "user_role"),
      emp_code: pick(row, "emp_code", "employee_code", "empcode", "empid"),
      designation: pick(row, "designation", "title", "job_title"),
      department_name: pick(row, "department_name", "department", "dept"),
      location_name: pick(row, "location_name", "location", "office", "branch"),
      // Manager can be specified three ways — email, emp_code, or name
      reporting_manager_email: pick(
        row,
        "reporting_manager_email",
        "manager_email",
        "reports_to_email",
      ),
      reporting_manager_code: pick(
        row,
        "reporting_manager_code",
        "manager_code",
        "manager_emp_code",
        "reports_to_code",
      ),
      reporting_manager_name: pick(
        row,
        "reporting_manager_name",
        "reporting_manager",
        "manager_name",
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

  // Potential reporting managers — active users in the org. We index them
  // by three keys because the CSV can reference a manager by email,
  // employee code, OR full name (first + last).
  const managers = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id", "email", "emp_code", "first_name", "last_name");
  const managerByEmail = new Map<string, number>();
  const managerByCode = new Map<string, number>();
  const managerByName = new Map<string, number[]>();
  for (const m of managers) {
    if (m.email) managerByEmail.set(String(m.email).toLowerCase(), m.id);
    if (m.emp_code) managerByCode.set(String(m.emp_code).toLowerCase(), m.id);
    const full = normalizeName(`${m.first_name || ""} ${m.last_name || ""}`);
    if (full) {
      const bucket = managerByName.get(full) || [];
      bucket.push(m.id);
      managerByName.set(full, bucket);
    }
  }

  // Empoy codes already in use — org-scoped unique
  const empCodeRows = await db("users")
    .where({ organization_id: orgId })
    .whereNotNull("emp_code")
    .select("emp_code");
  const existingEmpCodes = new Set(
    empCodeRows.map((r: any) => String(r.emp_code).toLowerCase()),
  );

  // Cross-reference index for managers that aren't in the DB yet but ARE
  // being imported in the same batch — handles the common "import the whole
  // team at once, some employees manage others" case. Stored by email (the
  // only truly stable key across the batch) so the second pass in
  // executeImport() can look up the freshly-inserted user's real ID.
  const batchByEmail = new Map<string, string>();
  const batchByCode = new Map<string, string>();
  const batchByName = new Map<string, string[]>();
  for (const r of rows) {
    if (r.email) batchByEmail.set(r.email.toLowerCase(), r.email);
    if (r.emp_code) batchByCode.set(r.emp_code.toLowerCase(), r.email);
    const full = normalizeName(`${r.first_name || ""} ${r.last_name || ""}`);
    if (full && r.email) {
      const bucket = batchByName.get(full) || [];
      bucket.push(r.email);
      batchByName.set(full, bucket);
    }
  }

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

    // Employment type — normalize synonyms ("Permanent", "Contractor",
    // "Full-Time", etc.) into the canonical enum value before validating.
    if (row.employment_type) {
      const normalized = normalizeEmploymentType(row.employment_type);
      if (!VALID_EMPLOYMENT_TYPES.has(normalized)) {
        rowErrors.push(
          `employment_type "${row.employment_type}" is not recognized. Use one of: ${Array.from(VALID_EMPLOYMENT_TYPES).join(", ")} — or common synonyms like Permanent, Contractor, Internship.`,
        );
      } else {
        row.employment_type = normalized;
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

    // Resolve location_name → location_id.
    // Unknown locations are NOT an error — executeImport auto-creates
    // any location name that isn't already in the org (same pattern as
    // department_name above).
    if (row.location_name) {
      const locId = locMap.get(row.location_name.toLowerCase());
      if (locId) {
        row.location_id = locId;
      }
      // else: leave location_id undefined; executeImport will create
      // the location and fill it in before insert.
    }

    // ------------------------------------------------------------------
    // Resolve reporting manager → reporting_manager_id (primary) and
    // _additional_manager_ids (rest). Each cell may contain more than one
    // manager separated by / \ , ; | or & — the first resolved token is
    // the primary, anything after is additional. Missing/unresolved tokens
    // add errors.
    //
    // Priority by column: email → emp_code → name. If two columns are
    // filled at once, only the higher-priority one is used (same behavior
    // as before).
    //
    // Auto-detect: values that look like emails sitting in the NAME column
    // are reinterpreted as emails — happens when operators squash
    // everything into a single "manager"/"reports_to" field.
    // ------------------------------------------------------------------
    type ResolvedKind = "email" | "code" | "name";
    type Resolved = { id?: number; pendingEmail?: string };

    const resolvedPrimary: Resolved | null = (() => null)();
    let primary: Resolved | null = null;
    const additional: Resolved[] = [];

    const pickColumn = (): { kind: ResolvedKind; tokens: string[] } | null => {
      const raw =
        row.reporting_manager_email ||
        row.reporting_manager_code ||
        row.reporting_manager_name;
      if (!raw) return null;
      const kind: ResolvedKind = row.reporting_manager_email
        ? "email"
        : row.reporting_manager_code
          ? "code"
          : "name";
      return { kind, tokens: splitManagerCell(raw) };
    };

    const picked = pickColumn();
    if (picked) {
      for (const tokenRaw of picked.tokens) {
        const token = tokenRaw.trim();
        if (!token) continue;

        // Auto-detect: token looks like an email even though it came from
        // the name or code column → treat it as email.
        const effectiveKind: ResolvedKind =
          picked.kind !== "email" && EMAIL_RE.test(token) ? "email" : picked.kind;

        let res: Resolved | "error" | "ambiguous" = "error";
        let ambiguousCount = 0;

        if (effectiveKind === "email") {
          const key = token.toLowerCase();
          const mgrId = managerByEmail.get(key);
          if (mgrId) res = { id: mgrId };
          else if (batchByEmail.has(key)) res = { pendingEmail: batchByEmail.get(key) };
        } else if (effectiveKind === "code") {
          const key = token.toLowerCase();
          const mgrId = managerByCode.get(key);
          if (mgrId) res = { id: mgrId };
          else if (batchByCode.has(key)) res = { pendingEmail: batchByCode.get(key) };
        } else {
          const key = normalizeName(token);
          const candidates = managerByName.get(key) || [];
          if (candidates.length === 1) {
            res = { id: candidates[0] };
          } else if (candidates.length > 1) {
            res = "ambiguous";
            ambiguousCount = candidates.length;
          } else {
            const batchCandidates = batchByName.get(key) || [];
            if (batchCandidates.length === 1) {
              res = { pendingEmail: batchCandidates[0] };
            } else if (batchCandidates.length > 1) {
              res = "ambiguous";
              ambiguousCount = batchCandidates.length;
            }
          }
        }

        if (res === "error") {
          rowErrors.push(
            `Reporting manager "${token}" not found — must be an active user in your organization (or be imported in the same file).`,
          );
          continue;
        }
        if (res === "ambiguous") {
          rowErrors.push(
            `Reporting manager "${token}" is ambiguous — ${ambiguousCount} matches. Use email or employee code instead.`,
          );
          continue;
        }

        if (!primary) primary = res;
        else additional.push(res);
      }
    }

    if (primary) {
      if (primary.id) row.reporting_manager_id = primary.id;
      if (primary.pendingEmail) row._pending_manager_email = primary.pendingEmail;
    }
    if (additional.length > 0) {
      const ids: number[] = [];
      const pending: string[] = [];
      for (const r of additional) {
        if (r.id) ids.push(r.id);
        if (r.pendingEmail) pending.push(r.pendingEmail);
      }
      if (ids.length > 0) row._additional_manager_ids = ids;
      if (pending.length > 0) row._pending_additional_manager_emails = pending;
    }
    void resolvedPrimary; // keep for future use

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
): Promise<{ count: number; createdDepartments: string[]; createdLocations: string[] }> {
  const db = getDB();

  const createdDepartments: string[] = [];
  const createdLocations: string[] = [];

  // --- Auto-create any missing departments -------------------------------
  const missingDepts = new Set<string>();
  for (const row of validRows) {
    if (row.department_name && !row.department_id) {
      missingDepts.add(row.department_name.trim());
    }
  }

  if (missingDepts.size > 0) {
    // Refresh from DB in case preview and execute are separated in time
    // and someone else added departments between the two calls.
    const existing = await db("organization_departments")
      .where({ organization_id: orgId })
      .select("id", "name");
    const deptMap = new Map<string, number>(
      existing.map((d: any) => [String(d.name).toLowerCase(), d.id]),
    );

    for (const name of missingDepts) {
      const lower = name.toLowerCase();
      if (deptMap.has(lower)) continue;
      const [newId] = await db("organization_departments").insert({
        organization_id: orgId,
        name,
      });
      deptMap.set(lower, newId);
      createdDepartments.push(name);
    }

    for (const row of validRows) {
      if (row.department_name && !row.department_id) {
        row.department_id = deptMap.get(row.department_name.toLowerCase());
      }
    }
  }

  // --- Auto-create any missing locations ---------------------------------
  const missingLocs = new Set<string>();
  for (const row of validRows) {
    if (row.location_name && !row.location_id) {
      missingLocs.add(row.location_name.trim());
    }
  }

  if (missingLocs.size > 0) {
    const existing = await db("organization_locations")
      .where({ organization_id: orgId })
      .select("id", "name");
    const locMap = new Map<string, number>(
      existing.map((l: any) => [String(l.name).toLowerCase(), l.id]),
    );

    for (const name of missingLocs) {
      const lower = name.toLowerCase();
      if (locMap.has(lower)) continue;
      const [newId] = await db("organization_locations").insert({
        organization_id: orgId,
        name,
      });
      locMap.set(lower, newId);
      createdLocations.push(name);
    }

    for (const row of validRows) {
      if (row.location_name && !row.location_id) {
        row.location_id = locMap.get(row.location_name.toLowerCase());
      }
    }
  }

  const result = await bulkCreateUsers(orgId, validRows, importedBy);

  // --- Second pass: resolve in-batch manager references + write junction -
  //
  // Three things happen here, all keyed off the freshly-inserted user IDs:
  //
  // 1. Rows whose PRIMARY reporting manager was imported in the same batch
  //    had reporting_manager_id = NULL after bulkCreateUsers. We now look up
  //    the new IDs by email and UPDATE users.reporting_manager_id.
  //
  // 2. Rows whose ADDITIONAL managers were resolved at validation time
  //    (DB hits) get inserted into user_additional_managers.
  //
  // 3. Rows whose ADDITIONAL managers were in-batch pending refs get
  //    resolved the same way as #1 and inserted into the junction table.
  //
  // Everything happens in a single transaction so either all the post-
  // insert wiring lands or none of it does.
  const hasPrimaryRef = (r: ImportRow) => Boolean(r._pending_manager_email);
  const hasAdditional = (r: ImportRow) =>
    Boolean(
      (r._additional_manager_ids && r._additional_manager_ids.length > 0) ||
        (r._pending_additional_manager_emails && r._pending_additional_manager_emails.length > 0),
    );

  const needsSecondPass = validRows.some((r) => hasPrimaryRef(r) || hasAdditional(r));

  if (needsSecondPass) {
    // Collect every email we might need to look up: all imported user
    // emails (for self-id lookup) plus every in-batch pending manager email
    // referenced by any row.
    const emailSet = new Set<string>();
    for (const r of validRows) {
      emailSet.add(r.email.toLowerCase());
      if (r._pending_manager_email) emailSet.add(r._pending_manager_email.toLowerCase());
      if (r._pending_additional_manager_emails) {
        for (const e of r._pending_additional_manager_emails) {
          emailSet.add(e.toLowerCase());
        }
      }
    }

    // bulkCreateUsers lowercases the email column on insert, so a plain
    // whereIn against the lowercased list matches every freshly-created row.
    const freshUsers = await db("users")
      .where({ organization_id: orgId })
      .whereIn("email", Array.from(emailSet))
      .select("id", "email");
    const byEmail = new Map<string, number>(
      freshUsers.map((u: any) => [String(u.email).toLowerCase(), u.id]),
    );

    await db.transaction(async (trx) => {
      for (const row of validRows) {
        const selfId = byEmail.get(row.email.toLowerCase());
        if (!selfId) continue;

        // 1. Primary manager was in-batch → UPDATE users.reporting_manager_id
        if (row._pending_manager_email) {
          const mgrId = byEmail.get(row._pending_manager_email.toLowerCase());
          if (mgrId && mgrId !== selfId) {
            await trx("users")
              .where({ id: selfId, organization_id: orgId })
              .update({ reporting_manager_id: mgrId, updated_at: new Date() });
          }
        }

        // 2 + 3. Additional managers — dedupe against the primary so we
        // don't insert a (user, manager) pair that duplicates users.reporting_manager_id.
        const additionalIds = new Set<number>();
        if (row._additional_manager_ids) {
          for (const id of row._additional_manager_ids) additionalIds.add(id);
        }
        if (row._pending_additional_manager_emails) {
          for (const email of row._pending_additional_manager_emails) {
            const id = byEmail.get(email.toLowerCase());
            if (id) additionalIds.add(id);
          }
        }
        // Remove self-references and the primary (which is already on the
        // users row) to avoid unique-constraint churn.
        additionalIds.delete(selfId);
        if (row.reporting_manager_id) additionalIds.delete(row.reporting_manager_id);
        // If primary was only set via the pending path, re-derive it now.
        if (row._pending_manager_email) {
          const primaryId = byEmail.get(row._pending_manager_email.toLowerCase());
          if (primaryId) additionalIds.delete(primaryId);
        }

        if (additionalIds.size > 0) {
          const rows = Array.from(additionalIds).map((managerId) => ({
            user_id: selfId,
            manager_id: managerId,
            created_at: new Date(),
          }));
          // INSERT IGNORE equivalent — the unique(user_id, manager_id) index
          // means re-runs of the same import are idempotent.
          await trx("user_additional_managers")
            .insert(rows)
            .onConflict(["user_id", "manager_id"])
            .ignore();
        }
      }
    });
  }

  return { ...result, createdDepartments, createdLocations };
}
