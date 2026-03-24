// =============================================================================
// EMP CLOUD — Bulk Import Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { bulkCreateUsers } from "../user/user.service.js";

interface ImportRow {
  first_name: string;
  last_name: string;
  email: string;
  designation?: string;
  department_name?: string;
  department_id?: number;
  role?: string;
  emp_code?: string;
  contact_number?: string;
}

interface ImportError {
  row: number;
  data: ImportRow;
  errors: string[];
}

/**
 * Parse CSV buffer into rows. Expects header row with columns:
 * first_name, last_name, email, designation, department_name
 */
export function parseCSV(fileBuffer: Buffer): ImportRow[] {
  const content = fileBuffer.toString("utf-8").trim();
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).filter((line) => line.trim()).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });

    return {
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      designation: row.designation || undefined,
      department_name: row.department_name || undefined,
      role: row.role || undefined,
      emp_code: row.emp_code || undefined,
      contact_number: row.contact_number || undefined,
    };
  });
}

/**
 * Validate import rows — check required fields, duplicate emails, valid departments.
 */
export async function validateImportData(
  orgId: number,
  rows: ImportRow[]
): Promise<{ valid: ImportRow[]; errors: ImportError[] }> {
  const db = getDB();

  // Fetch existing emails (check globally due to unique constraint on email column)
  const existingUsers = await db("users")
    .select("email");
  const existingEmails = new Set(existingUsers.map((u: any) => u.email.toLowerCase()));

  // Fetch departments for this org
  const departments = await db("organization_departments")
    .where({ organization_id: orgId })
    .select("id", "name");
  const deptMap = new Map(departments.map((d: any) => [d.name.toLowerCase(), d.id]));

  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenEmails = new Set<string>();

  rows.forEach((row, index) => {
    const rowErrors: string[] = [];

    if (!row.first_name) rowErrors.push("first_name is required");
    if (!row.last_name) rowErrors.push("last_name is required");
    if (!row.email) rowErrors.push("email is required");

    if (row.email) {
      const emailLower = row.email.toLowerCase();
      if (existingEmails.has(emailLower)) {
        rowErrors.push("Email already exists in the organization");
      }
      if (seenEmails.has(emailLower)) {
        rowErrors.push("Duplicate email in import file");
      }
      seenEmails.add(emailLower);
    }

    // Resolve department name to ID
    if (row.department_name) {
      const deptId = deptMap.get(row.department_name.toLowerCase());
      if (deptId) {
        row.department_id = deptId;
      } else {
        rowErrors.push(`Department "${row.department_name}" not found`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: index + 2, data: row, errors: rowErrors });
    } else {
      valid.push(row);
    }
  });

  return { valid, errors };
}

/**
 * Execute the import — create users in bulk.
 */
export async function executeImport(
  orgId: number,
  validRows: ImportRow[],
  importedBy: number
): Promise<{ count: number }> {
  return bulkCreateUsers(orgId, validRows, importedBy);
}
