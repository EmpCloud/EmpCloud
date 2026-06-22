// =============================================================================
// EMP CLOUD — Probation Tracking Service
// Manages employee probation status, confirmations, and extensions.
// =============================================================================

import type { Knex } from "knex";
import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { sanitizePlainText } from "../../utils/sanitize-html.js";
import { sendBrandedEmail } from "../email/email.service.js";
import * as emailTemplateService from "../email-template/email-template.service.js";

// ---------------------------------------------------------------------------
// Probation list filters — search, department, location, view + pagination
// ---------------------------------------------------------------------------

export interface ProbationListParams {
  page?: number;
  per_page?: number;
  search?: string;
  department_id?: number;
  location_id?: number;
  view?: "all" | "on_probation" | "extended" | "overdue" | "upcoming_30";
}

const PROBATION_SELECT = [
  "users.id",
  "users.first_name",
  "users.last_name",
  "users.email",
  "users.emp_code",
  "users.designation",
  "users.department_id",
  "users.location_id",
  "users.date_of_joining",
  "users.probation_end_date",
  "users.probation_status",
  "users.photo_path",
  "organization_departments.name as department_name",
  "organization_locations.name as location_name",
];

function normalizePage(params: ProbationListParams): { page: number; perPage: number } {
  const page = params.page && params.page > 0 ? params.page : 1;
  const perPage = params.per_page && params.per_page > 0 ? Math.min(params.per_page, 500) : 20;
  return { page, perPage };
}

// Apply the shared search / department / location / view filters. Mutates and
// returns the query builder so it can be reused for both the data and count
// queries.
function applyProbationFilters(query: Knex.QueryBuilder, params: ProbationListParams) {
  if (params.search) {
    const s = `%${params.search}%`;
    query.where((b) => {
      b.where("users.first_name", "like", s)
        .orWhere("users.last_name", "like", s)
        .orWhere("users.email", "like", s)
        .orWhere("users.emp_code", "like", s)
        .orWhere("users.designation", "like", s)
        .orWhereRaw("CONCAT(users.first_name, ' ', users.last_name) LIKE ?", [s]);
    });
  }
  if (params.department_id) query.where("users.department_id", params.department_id);
  if (params.location_id) query.where("users.location_id", params.location_id);

  switch (params.view) {
    case "on_probation":
      query.where("users.probation_status", "on_probation");
      break;
    case "extended":
      query.where("users.probation_status", "extended");
      break;
    case "overdue":
      query.whereRaw("users.probation_end_date < CURDATE()");
      break;
    case "upcoming_30":
      query
        .whereRaw("users.probation_end_date >= CURDATE()")
        .whereRaw("users.probation_end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
      break;
    // "all" / undefined → no extra status/date predicate
  }
  return query;
}

// ---------------------------------------------------------------------------
// Get employees currently on probation (search / filters / pagination)
// ---------------------------------------------------------------------------

export async function getEmployeesOnProbation(orgId: number, params: ProbationListParams = {}) {
  const db = getDB();
  const { page, perPage } = normalizePage(params);

  const base = () =>
    db("users")
      .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
      .leftJoin("organization_locations", "users.location_id", "organization_locations.id")
      .where({ "users.organization_id": orgId, "users.status": 1 })
      .whereIn("users.probation_status", ["on_probation", "extended"])
      .whereNotNull("users.probation_end_date");

  const data = await applyProbationFilters(base(), params)
    .select(
      ...PROBATION_SELECT,
      db.raw("DATEDIFF(users.probation_end_date, CURDATE()) as days_remaining"),
    )
    .orderBy("users.probation_end_date", "asc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ count }] = await applyProbationFilters(base(), params).count("users.id as count");

  return { data, total: Number(count), page, per_page: perPage };
}

// ---------------------------------------------------------------------------
// Get upcoming confirmations (within N days)
// ---------------------------------------------------------------------------

export async function getUpcomingConfirmations(orgId: number, days: number = 30) {
  const db = getDB();

  return db("users")
    .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
    .where({
      "users.organization_id": orgId,
      "users.status": 1,
    })
    .whereIn("users.probation_status", ["on_probation", "extended"])
    .whereNotNull("users.probation_end_date")
    .whereRaw("users.probation_end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)", [days])
    .whereRaw("users.probation_end_date >= CURDATE()")
    .select(
      "users.id",
      "users.first_name",
      "users.last_name",
      "users.email",
      "users.emp_code",
      "users.designation",
      "users.department_id",
      "users.date_of_joining",
      "users.probation_end_date",
      "users.probation_status",
      "users.photo_path",
      "organization_departments.name as department_name",
      db.raw("DATEDIFF(users.probation_end_date, CURDATE()) as days_remaining")
    )
    .orderBy("users.probation_end_date", "asc");
}

// ---------------------------------------------------------------------------
// #1419 — Get employees confirmed in the current calendar month
// (search / department / location filters + pagination)
// ---------------------------------------------------------------------------

export async function getConfirmedThisMonth(orgId: number, params: ProbationListParams = {}) {
  const db = getDB();
  const { page, perPage } = normalizePage(params);
  // No `view` here — every row is already "confirmed"; only the text/department/
  // location filters apply.
  const filters: ProbationListParams = {
    search: params.search,
    department_id: params.department_id,
    location_id: params.location_id,
  };

  const base = () =>
    db("users")
      .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
      .leftJoin("organization_locations", "users.location_id", "organization_locations.id")
      .where({ "users.organization_id": orgId, "users.probation_status": "confirmed" })
      .whereRaw("users.probation_confirmed_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");

  const data = await applyProbationFilters(base(), filters)
    .select(
      ...PROBATION_SELECT,
      "users.probation_confirmed_at as actual_confirmation_date",
      db.raw("DATEDIFF(users.probation_end_date, CURDATE()) as days_remaining"),
    )
    .orderBy("users.probation_confirmed_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ count }] = await applyProbationFilters(base(), filters).count("users.id as count");

  return { data, total: Number(count), page, per_page: perPage };
}

// ---------------------------------------------------------------------------
// Probation confirmation email helpers
// ---------------------------------------------------------------------------

const PROBATION_TEMPLATE_KEY = "probation_confirmation";

function formatEmailDate(d: string | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Build the {{placeholder}} values for an employee's probation-confirmation
 * email — name, designation, company, manager, and the relevant dates.
 */
async function buildProbationEmailVars(orgId: number, employeeId: number) {
  const db = getDB();
  const user = await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("Employee");

  const org = await db("organizations").where({ id: orgId }).select("name").first();

  let managerName = "";
  if (user.reporting_manager_id) {
    const mgr = await db("users")
      .where({ id: user.reporting_manager_id })
      .select("first_name", "last_name")
      .first();
    if (mgr) managerName = `${mgr.first_name || ""} ${mgr.last_name || ""}`.trim();
  }

  return {
    email: user.email || "",
    employee_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    designation: user.designation || "",
    emp_code: user.emp_code || "",
    company_name: org?.name || "",
    manager_name: managerName,
    date_of_joining: formatEmailDate(user.date_of_joining),
    probation_end_date: formatEmailDate(user.probation_end_date),
    confirmation_date: formatEmailDate(new Date()),
  };
}

/**
 * The confirmation email rendered for a specific employee, using the org's
 * customized template (or the built-in default). Used to pre-fill the confirm
 * dialog so HR can tweak it per-employee before sending.
 */
export async function getProbationConfirmationEmail(orgId: number, employeeId: number) {
  const vars = await buildProbationEmailVars(orgId, employeeId);
  const tpl = await emailTemplateService.getTemplateOrDefault(orgId, PROBATION_TEMPLATE_KEY);
  const rendered = emailTemplateService.renderTemplate(tpl, vars);
  return {
    to: vars.email,
    subject: rendered.subject,
    body: rendered.body,
    template_is_default: tpl.is_default,
    employee_name: vars.employee_name,
  };
}

// ---------------------------------------------------------------------------
// Confirm probation
// ---------------------------------------------------------------------------

export interface ConfirmProbationOptions {
  sendEmail?: boolean;
  subject?: string;
  body?: string;
}

export async function confirmProbation(
  orgId: number,
  employeeId: number,
  confirmedBy: number,
  opts: ConfirmProbationOptions = {},
) {
  const db = getDB();

  const user = await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .first();

  if (!user) throw new NotFoundError("Employee");
  if (user.probation_status === "confirmed") {
    throw new ValidationError("Employee probation is already confirmed");
  }

  await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .update({
      probation_status: "confirmed",
      probation_confirmed_by: confirmedBy,
      probation_confirmed_at: new Date(),
      updated_at: new Date(),
    });

  // Also update employee_profiles confirmation_date if profile exists
  const profile = await db("employee_profiles")
    .where({ user_id: employeeId, organization_id: orgId })
    .first();

  if (profile) {
    await db("employee_profiles")
      .where({ id: profile.id })
      .update({
        confirmation_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date(),
      });
  }

  // In-app notification to the employee (best-effort — never block confirm).
  try {
    await db("notifications").insert({
      organization_id: orgId,
      user_id: employeeId,
      type: "probation_update",
      title: "Probation Confirmed",
      body: "Congratulations! Your probation has been confirmed.",
      reference_type: "probation",
      reference_id: String(employeeId),
      is_read: false,
      created_at: new Date(),
    });
  } catch {
    // notifications are non-critical
  }

  // Optional confirmation email. Uses the HR-edited subject/body when provided,
  // otherwise renders the org template (or default) for this employee.
  let emailSent = false;
  if (opts.sendEmail && user.email) {
    let subject = opts.subject?.trim();
    let body = opts.body;
    if (!subject || !body) {
      const rendered = await getProbationConfirmationEmail(orgId, employeeId);
      subject = subject || rendered.subject;
      body = body || rendered.body;
    }
    const safeSubject = sanitizePlainText(subject) || "Probation Confirmation";
    emailSent = await sendBrandedEmail({
      to: user.email,
      subject: safeSubject,
      message: body || "",
    });
  }

  const result = await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .select("id", "first_name", "last_name", "probation_status", "probation_confirmed_by", "probation_confirmed_at")
    .first();

  return { ...result, email_sent: emailSent };
}

// ---------------------------------------------------------------------------
// Extend probation
// ---------------------------------------------------------------------------

export async function extendProbation(
  orgId: number,
  employeeId: number,
  newEndDate: string,
  reason: string
) {
  const db = getDB();

  const user = await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .first();

  if (!user) throw new NotFoundError("Employee");
  if (user.probation_status === "confirmed") {
    throw new ValidationError("Cannot extend probation for a confirmed employee");
  }

  const parsedDate = new Date(newEndDate);
  if (isNaN(parsedDate.getTime())) {
    throw new ValidationError("Invalid date format for new end date");
  }

  await db("users")
    .where({ id: employeeId, organization_id: orgId })
    .update({
      probation_end_date: newEndDate,
      probation_status: "extended",
      probation_extension_reason: reason,
      updated_at: new Date(),
    });

  // Also update employee_profiles if profile exists
  const profile = await db("employee_profiles")
    .where({ user_id: employeeId, organization_id: orgId })
    .first();

  if (profile) {
    await db("employee_profiles")
      .where({ id: profile.id })
      .update({
        probation_end_date: newEndDate,
        updated_at: new Date(),
      });
  }

  return db("users")
    .where({ id: employeeId, organization_id: orgId })
    .select("id", "first_name", "last_name", "probation_status", "probation_end_date", "probation_extension_reason")
    .first();
}

// ---------------------------------------------------------------------------
// Probation Dashboard stats
// ---------------------------------------------------------------------------

export async function getProbationDashboard(orgId: number) {
  const db = getDB();

  // On probation count
  const [onProbation] = await db("users")
    .where({
      organization_id: orgId,
      status: 1,
      probation_status: "on_probation",
    })
    .whereNotNull("probation_end_date")
    .count("id as count");

  // Extended count
  const [extended] = await db("users")
    .where({
      organization_id: orgId,
      status: 1,
      probation_status: "extended",
    })
    .whereNotNull("probation_end_date")
    .count("id as count");

  // Confirmed this month
  const [confirmedThisMonth] = await db("users")
    .where({
      organization_id: orgId,
      probation_status: "confirmed",
    })
    .whereRaw("probation_confirmed_at >= DATE_FORMAT(NOW(), '%Y-%m-01')")
    .count("id as count");

  // Upcoming in next 30 days (on_probation or extended, end date within 30 days and >= today)
  const [upcoming30] = await db("users")
    .where({
      organization_id: orgId,
      status: 1,
    })
    .whereIn("probation_status", ["on_probation", "extended"])
    .whereNotNull("probation_end_date")
    .whereRaw("probation_end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)")
    .whereRaw("probation_end_date >= CURDATE()")
    .count("id as count");

  // Overdue (on_probation or extended, end date < today)
  const [overdue] = await db("users")
    .where({
      organization_id: orgId,
      status: 1,
    })
    .whereIn("probation_status", ["on_probation", "extended"])
    .whereNotNull("probation_end_date")
    .whereRaw("probation_end_date < CURDATE()")
    .count("id as count");

  return {
    on_probation: Number(onProbation.count) + Number(extended.count),
    confirmed_this_month: Number(confirmedThisMonth.count),
    upcoming_30_days: Number(upcoming30.count),
    overdue: Number(overdue.count),
  };
}
