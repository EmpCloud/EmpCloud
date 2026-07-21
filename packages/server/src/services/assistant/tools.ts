import { z } from "zod";
import { getDB } from "../../db/connection.js";
import { getBalances } from "../leave/leave-balance.service.js";
import { getSchedule } from "../attendance/shift.service.js";
import { ValidationError } from "../../utils/errors.js";
import {
  assertTargetAccess,
  getTeamUserIds,
  hasPermission,
  resolveMonitorScope,
  visibleEmployeeIds,
  type AssistantContext,
} from "./scope-resolver.js";
import { monitorGet, payrollGet } from "./module-client.js";

type JsonSchema = Record<string, unknown>;
interface AssistantTool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  parameters: JsonSchema;
  execute: (ctx: AssistantContext, args: any) => Promise<unknown>;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scopeSchema = z.enum(["own", "team", "organization"]).default("own");
const scopeProperties = {
  scope: { type: "string", enum: ["own", "team", "organization"], description: "Data scope; defaults to own." },
  employee_id: { type: "integer", description: "EmpCloud user id for own/employee scope." },
  direct_reports_only: { type: "boolean", description: "For explicit direct-report requests. Prevents admin team scope from falling back to organization scope when no direct reports exist." },
};
const objectSchema = (properties: JsonSchema, required: string[] = []): JsonSchema => ({
  type: "object", properties, required, additionalProperties: false,
});
const tool = (value: AssistantTool) => value;

function rangeFromDays(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
}

const HR_ROLES = new Set(["hr_admin", "org_admin", "super_admin"]);

async function pendingRequestScope(
  ctx: AssistantContext,
  domain: "leave" | "attendance",
): Promise<number[] | null> {
  if (HR_ROLES.has(ctx.role)) return null;
  if (domain === "leave") {
    if (["leave:view_all", "leave:approve", "leave:manage_policies", "leave:override_balance"].some((permission) => hasPermission(ctx, permission))) return null;
    if (hasPermission(ctx, "leave:view_team")) return await getTeamUserIds(ctx);
    if (hasPermission(ctx, "leave:view")) return [ctx.userId];
    throw new ValidationError("Leave request visibility permission is required");
  }
  if (["attendance:view_all", "attendance:manage", "attendance:approve_regularization_all"].some((permission) => hasPermission(ctx, permission))) return null;
  if (hasPermission(ctx, "attendance:approve_regularization_team") || hasPermission(ctx, "attendance:view_team")) return await getTeamUserIds(ctx);
  if (hasPermission(ctx, "attendance:view")) return [ctx.userId];
  throw new ValidationError("Attendance regularization visibility permission is required");
}

function applyVisibleUsers(query: any, column: string, visible: number[] | null) {
  if (visible === null) return query;
  return visible.length > 0 ? query.whereIn(column, visible) : query.whereRaw("1 = 0");
}

function applyEmployeeFilters(query: any, args: any) {
  if (args.department) query.whereRaw("LOWER(d.name) LIKE ?", [`%${args.department.toLowerCase()}%`]);
  if (args.location) query.whereRaw("LOWER(l.name) LIKE ?", [`%${args.location.toLowerCase()}%`]);
  if (args.search) {
    const term = `%${args.search.toLowerCase()}%`;
    query.where(function (this: any) {
      this.whereRaw("LOWER(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) LIKE ?", [term])
        .orWhereRaw("LOWER(u.email) LIKE ?", [term])
        .orWhereRaw("LOWER(u.emp_code) LIKE ?", [term]);
    });
  }
  return query;
}

const pendingRequestSchema = z.object({
  employee_id: z.number().int().positive().optional(),
  department: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  search: z.string().min(1).max(120).optional(),
  start_date: date.optional(),
  end_date: date.optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).refine((value) => Boolean(value.start_date) === Boolean(value.end_date), {
  message: "Both start_date and end_date are required when filtering by date",
}).refine((value) => !value.start_date || !value.end_date || value.start_date <= value.end_date, {
  message: "start_date must be on or before end_date",
});

const pendingRequestParameters = objectSchema({
  employee_id: { type: "integer", description: "Optional EmpCloud user id." },
  department: { type: "string", description: "Department name, matched case-insensitively." },
  location: { type: "string", description: "Location name, matched case-insensitively." },
  search: { type: "string", description: "Employee name, email, or employee code." },
  start_date: { type: "string", format: "date" },
  end_date: { type: "string", format: "date" },
  limit: { type: "integer", minimum: 1, maximum: 50 },
});

function validatedMonitorRange(args: { start_date?: string; end_date?: string; days?: number }) {
  if (Boolean(args.start_date) !== Boolean(args.end_date)) {
    throw new ValidationError("Both start_date and end_date are required for an explicit EmpMonitor range");
  }
  if (!args.start_date || !args.end_date) return rangeFromDays(args.days || 31);
  const start = new Date(`${args.start_date}T00:00:00Z`);
  const end = new Date(`${args.end_date}T00:00:00Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const earliest = new Date(todayUtc);
  earliest.setUTCDate(earliest.getUTCDate() - 164);
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (start > end) throw new ValidationError("EmpMonitor start_date must be on or before end_date");
  if (start < earliest || end > todayUtc) throw new ValidationError("EmpMonitor queries must fall within the last 165 days and cannot include future dates");
  if (inclusiveDays > 31) throw new ValidationError("EmpMonitor date ranges cannot exceed 31 days");
  return { start_date: args.start_date, end_date: args.end_date };
}

async function monitorParams(ctx: AssistantContext, args: any) {
  let resolved: Awaited<ReturnType<typeof resolveMonitorScope>>;
  try {
    resolved = await resolveMonitorScope(ctx, args.scope, args.employee_id);
  } catch (error) {
    const canUseOrganizationFallback = args.scope === "team"
      && args.direct_reports_only !== true
      && ["hr_admin", "org_admin", "super_admin"].includes(ctx.role)
      && hasPermission(ctx, "monitor:view_all")
      && error instanceof Error
      && error.message === "No direct reports are available for team scope";
    if (!canUseOrganizationFallback) throw error;
    resolved = await resolveMonitorScope(ctx, "organization");
  }
  return {
    ...(resolved.employeeId ? { empcloud_user_id: resolved.employeeId } : {}),
    ...(resolved.employeeIds ? { empcloud_user_ids: resolved.employeeIds.join(",") } : {}),
  };
}

const tools: AssistantTool[] = [
  tool({
    name: "search_employees",
    description: "Search visible employees by name, email, or employee code, optionally filtered by department and location. Use this first to resolve people to employee_id.",
    schema: z.object({ query: z.string().min(1), department: z.string().min(1).optional(), location: z.string().min(1).optional(), limit: z.number().int().min(1).max(20).default(10) }),
    parameters: objectSchema({ query: { type: "string" }, department: { type: "string" }, location: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } }, ["query"]),
    execute: async (ctx, args) => {
      const visible = await visibleEmployeeIds(ctx);
      let query = getDB()("users as u")
        .leftJoin("organization_departments as d", function () { this.on("d.id", "u.department_id").andOn("d.organization_id", "u.organization_id"); })
        .leftJoin("organization_locations as l", function () { this.on("l.id", "u.location_id").andOn("l.organization_id", "u.organization_id"); })
        .where({ "u.organization_id": ctx.orgId, "u.status": 1 })
        .where(function () {
          const q = `%${args.query.toLowerCase()}%`;
          this.whereRaw("LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE ?", [q])
            .orWhereRaw("LOWER(u.email) LIKE ?", [q])
            .orWhereRaw("LOWER(u.emp_code) LIKE ?", [q]);
        });
      if (visible) query = query.whereIn("u.id", visible);
      if (args.department) query = query.whereRaw("LOWER(d.name) LIKE ?", [`%${args.department.toLowerCase()}%`]);
      if (args.location) query = query.whereRaw("LOWER(l.name) LIKE ?", [`%${args.location.toLowerCase()}%`]);
      const employees = await query.limit(args.limit).select("u.id as employee_id", "u.first_name", "u.last_name", "u.emp_code", "u.email", "u.designation", "d.name as department", "l.name as location");
      return { employees, count: employees.length };
    },
  }),
  tool({
    name: "count_employees",
    description: "Count employees visible to the caller, optionally filtered by active status or department.",
    schema: z.object({ status: z.enum(["active", "inactive", "all"]).default("active"), department: z.string().min(1).optional(), location: z.string().min(1).optional() }),
    parameters: objectSchema({ status: { type: "string", enum: ["active", "inactive", "all"] }, department: { type: "string" }, location: { type: "string" } }),
    execute: async (ctx, args) => {
      const visible = await visibleEmployeeIds(ctx);
      let query = getDB()("users as u")
        .leftJoin("organization_departments as d", function () { this.on("d.id", "u.department_id").andOn("d.organization_id", "u.organization_id"); })
        .leftJoin("organization_locations as l", function () { this.on("l.id", "u.location_id").andOn("l.organization_id", "u.organization_id"); })
        .where("u.organization_id", ctx.orgId);
      if (visible) query = query.whereIn("u.id", visible);
      if (args.status !== "all") query = query.where("u.status", args.status === "active" ? 1 : 0);
      if (args.department) query = query.whereRaw("LOWER(d.name) LIKE ?", [`%${args.department.toLowerCase()}%`]);
      if (args.location) query = query.whereRaw("LOWER(l.name) LIKE ?", [`%${args.location.toLowerCase()}%`]);
      const row = await query.countDistinct("u.id as count").first();
      return { count: Number(row?.count || 0), scope: visible ? "restricted" : "organization" };
    },
  }),
  tool({
    name: "get_attendance",
    description: "Get an employee's attendance records for a date range. employee_id defaults to the caller.",
    schema: z.object({ employee_id: z.number().int().positive().optional(), start_date: date, end_date: date }),
    parameters: objectSchema({ employee_id: { type: "integer" }, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" } }, ["start_date", "end_date"]),
    execute: async (ctx, args) => {
      const employeeId = args.employee_id || ctx.userId;
      await assertTargetAccess(ctx, employeeId, "attendance:view", "attendance:view_team", "attendance:view_all");
      const records = await getDB()("attendance_records").where({ organization_id: ctx.orgId, user_id: employeeId }).whereBetween("date", [args.start_date, args.end_date]).orderBy("date", "desc").select("date", "status", "check_in", "check_out", "worked_minutes", "late_minutes", "overtime_minutes");
      return { employee_id: employeeId, start_date: args.start_date, end_date: args.end_date, records };
    },
  }),
  tool({
    name: "get_leave_balance",
    description: "Get current leave balances for an employee. employee_id defaults to the caller.",
    schema: z.object({ employee_id: z.number().int().positive().optional(), fiscal_year: z.number().int().optional() }),
    parameters: objectSchema({ employee_id: { type: "integer" }, fiscal_year: { type: "integer" } }),
    execute: async (ctx, args) => {
      const employeeId = args.employee_id || ctx.userId;
      await assertTargetAccess(ctx, employeeId, "leave:view", "leave:view_team", "leave:view_all");
      return { employee_id: employeeId, balances: await getBalances(ctx.orgId, employeeId, args.fiscal_year) };
    },
  }),
  tool({
    name: "get_pending_leave_requests",
    description: "List pending leave requests visible to the caller, with optional employee, department, location, search, and overlapping date-range filters.",
    schema: pendingRequestSchema,
    parameters: pendingRequestParameters,
    execute: async (ctx, args) => {
      const visible = await pendingRequestScope(ctx, "leave");
      let query = getDB()("leave_applications as la")
        .join("users as u", function () { this.on("u.id", "la.user_id").andOn("u.organization_id", "la.organization_id"); })
        .leftJoin("leave_types as lt", function () { this.on("lt.id", "la.leave_type_id").andOn("lt.organization_id", "la.organization_id"); })
        .leftJoin("organization_departments as d", function () { this.on("d.id", "u.department_id").andOn("d.organization_id", "la.organization_id"); })
        .leftJoin("organization_locations as l", function () { this.on("l.id", "u.location_id").andOn("l.organization_id", "la.organization_id"); })
        .where({ "la.organization_id": ctx.orgId, "la.status": "pending" });
      query = applyVisibleUsers(query, "la.user_id", visible);
      if (args.employee_id) query.where("la.user_id", args.employee_id);
      applyEmployeeFilters(query, args);
      if (args.start_date) query.where("la.end_date", ">=", args.start_date).where("la.start_date", "<=", args.end_date);
      const totalRow = await query.clone().countDistinct("la.id as count").first();
      const requests = await query
        .orderBy("la.created_at", "desc")
        .limit(args.limit)
        .select(
          "la.id as request_id", "la.user_id as employee_id", "u.first_name", "u.last_name", "u.emp_code",
          "d.name as department", "l.name as location", "lt.name as leave_type", "la.start_date", "la.end_date",
          "la.days_count as total_days", "la.reason", "la.status", "la.created_at",
        );
      return { status: "pending", requests, count: requests.length, total: Number(totalRow?.count || 0), limit: args.limit };
    },
  }),
  tool({
    name: "get_pending_attendance_regularizations",
    description: "List pending attendance regularization requests visible to the caller, with optional employee, department, location, search, and request-date filters.",
    schema: pendingRequestSchema,
    parameters: pendingRequestParameters,
    execute: async (ctx, args) => {
      const visible = await pendingRequestScope(ctx, "attendance");
      let query = getDB()("attendance_regularizations as ar")
        .join("users as u", function () { this.on("u.id", "ar.user_id").andOn("u.organization_id", "ar.organization_id"); })
        .leftJoin("organization_departments as d", function () { this.on("d.id", "u.department_id").andOn("d.organization_id", "ar.organization_id"); })
        .leftJoin("organization_locations as l", function () { this.on("l.id", "u.location_id").andOn("l.organization_id", "ar.organization_id"); })
        .where({ "ar.organization_id": ctx.orgId, "ar.status": "pending" });
      query = applyVisibleUsers(query, "ar.user_id", visible);
      if (args.employee_id) query.where("ar.user_id", args.employee_id);
      applyEmployeeFilters(query, args);
      if (args.start_date) query.whereBetween("ar.date", [args.start_date, args.end_date]);
      const totalRow = await query.clone().countDistinct("ar.id as count").first();
      const requests = await query
        .orderBy("ar.created_at", "desc")
        .limit(args.limit)
        .select(
          "ar.id as request_id", "ar.user_id as employee_id", "u.first_name", "u.last_name", "u.emp_code",
          "d.name as department", "l.name as location", "ar.date", "ar.original_check_in", "ar.original_check_out",
          "ar.requested_check_in", "ar.requested_check_out", "ar.reason", "ar.status", "ar.created_at",
        );
      return { status: "pending", requests, count: requests.length, total: Number(totalRow?.count || 0), limit: args.limit };
    },
  }),
  tool({
    name: "get_shift_schedule",
    description: "Get shift assignments for an employee over a date range.",
    schema: z.object({ employee_id: z.number().int().positive().optional(), start_date: date, end_date: date }),
    parameters: objectSchema({ employee_id: { type: "integer" }, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" } }, ["start_date", "end_date"]),
    execute: async (ctx, args) => {
      const employeeId = args.employee_id || ctx.userId;
      await assertTargetAccess(ctx, employeeId, "attendance:view", "attendance:view_team", "attendance:view_all");
      const schedule = await getSchedule(ctx.orgId, { start_date: args.start_date, end_date: args.end_date });
      return schedule.find((row: any) => Number(row.user_id) === employeeId) || { employee_id: employeeId, assignments: [] };
    },
  }),
  tool({
    name: "get_salary_structure",
    description: "Get an employee's active salary structure from EMP Payroll.",
    schema: z.object({ employee_id: z.number().int().positive(), effective_on: date.optional() }),
    parameters: objectSchema({ employee_id: { type: "integer" }, effective_on: { type: "string", format: "date" } }, ["employee_id"]),
    execute: async (ctx, args) => {
      await assertTargetAccess(ctx, args.employee_id, "salary:view", null, "salary:view_all");
      return payrollGet(ctx.orgId, `internal/assistant/employees/${args.employee_id}/salary`, { effective_on: args.effective_on });
    },
  }),
  tool({
    name: "get_net_pay",
    description: "Get the real net pay, gross pay, earnings, and line-item deduction breakdown for one employee and month from EMP Payroll.",
    schema: z.object({ employee_id: z.number().int().positive(), month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(2100) }),
    parameters: objectSchema({ employee_id: { type: "integer" }, month: { type: "integer", minimum: 1, maximum: 12 }, year: { type: "integer" } }, ["employee_id", "month", "year"]),
    execute: async (ctx, args) => {
      await assertTargetAccess(ctx, args.employee_id, "payroll:view_own", null, "payroll:view_all");
      return payrollGet(ctx.orgId, `internal/assistant/employees/${args.employee_id}/net-pay`, { month: args.month, year: args.year });
    },
  }),
  tool({
    name: "get_payroll_run_totals",
    description: "Get org payroll run totals by run id or month/year.",
    schema: z.object({ run_id: z.string().optional(), month: z.number().int().min(1).max(12).optional(), year: z.number().int().optional() }),
    parameters: objectSchema({ run_id: { type: "string" }, month: { type: "integer", minimum: 1, maximum: 12 }, year: { type: "integer" } }),
    execute: async (ctx, args) => {
      if (!hasPermission(ctx, "payroll:view_reports") && !hasPermission(ctx, "payroll:view_all")) throw new ValidationError("payroll:view_reports permission is required");
      return payrollGet(ctx.orgId, "internal/assistant/payroll-runs/totals", args);
    },
  }),
  tool({
    name: "get_productivity_summary",
    description: "Get productivity totals for own, team, or organization scope from EMP Monitor.",
    schema: z.object({ scope: scopeSchema, employee_id: z.number().int().positive().optional(), direct_reports_only: z.boolean().default(false), start_date: date.optional(), end_date: date.optional(), days: z.number().int().min(1).max(31).default(31) }),
    parameters: objectSchema({ ...scopeProperties, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" }, days: { type: "integer", minimum: 1, maximum: 31 } }),
    execute: async (ctx, args) => monitorGet(ctx.orgId, "internal-service/productivity-summary", { ...(await monitorParams(ctx, args)), ...validatedMonitorRange(args) }),
  }),
];

const monitorUsageTools: Array<{ name: string; path: string; description: string; kind?: string; orgOnly?: boolean; employeeOnly?: boolean }> = [
  { name: "get_application_usage", path: "internal-service/usage", kind: "app", description: "Get application usage for own, team, or organization scope." },
  { name: "get_website_usage", path: "internal-service/usage", kind: "website", description: "Get website usage for own, team, or organization scope." },
  { name: "get_timesheet_details", path: "internal-service/timesheet", description: "Get tracked timesheet details for own, team, or organization scope." },
  { name: "get_keystrokes", path: "internal-service/keystrokes", description: "Get aggregate keystroke counts; never returns typed text." },
  { name: "get_employee_wise_ai_usage", path: "internal-service/ai-usage", description: "Get AI-tool usage for one visible employee.", employeeOnly: true },
  { name: "get_organization_wise_ai_usage", path: "internal-service/ai-usage", description: "Get organization-wide AI-tool usage.", orgOnly: true },
  { name: "get_organization_wise_x_application_usage", path: "internal-service/x-usage", kind: "app", description: "Get organization users of a named application.", orgOnly: true },
  { name: "get_organization_wise_x_website_usage", path: "internal-service/x-usage", kind: "website", description: "Get organization users of a named website.", orgOnly: true },
  { name: "get_employee_wise_x_application_usage", path: "internal-service/x-usage", kind: "app", description: "Get one employee's usage of a named application.", employeeOnly: true },
  { name: "get_employee_wise_x_website_usage", path: "internal-service/x-usage", kind: "website", description: "Get one employee's usage of a named website.", employeeOnly: true },
];

for (const item of monitorUsageTools) {
  const needsName = item.path.endsWith("x-usage");
  const schema = z.object({
    scope: scopeSchema,
    employee_id: z.number().int().positive().optional(),
    direct_reports_only: z.boolean().default(false),
    start_date: date.optional(), end_date: date.optional(), days: z.number().int().min(1).max(31).default(30),
    name: needsName ? z.string().min(1) : z.string().optional(),
    limit: z.number().int().min(1).max(25).default(10),
  });
  tools.push(tool({
    name: item.name,
    description: item.description,
    schema,
    parameters: objectSchema({ ...scopeProperties, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" }, days: { type: "integer", minimum: 1, maximum: 31 }, name: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 25 } }, needsName ? ["name"] : []),
    execute: async (ctx, args) => {
      if (item.orgOnly) args.scope = "organization";
      if (item.employeeOnly) args.scope = "own";
      const range = validatedMonitorRange(args);
      return monitorGet(ctx.orgId, item.path, { ...(await monitorParams(ctx, args)), ...range, days: args.days, type: item.kind, name: args.name, limit: args.limit });
    },
  }));
}

const registry = new Map(tools.map((entry) => [entry.name, entry]));

export function openAITools() {
  return tools.map((entry) => ({ type: "function" as const, function: { name: entry.name, description: entry.description, parameters: entry.parameters } }));
}

export const ASSISTANT_TOOL_NAMES = tools.map((entry) => entry.name) as readonly string[];

export async function executeAssistantTool(ctx: AssistantContext, name: string, rawArgs: unknown): Promise<string> {
  const entry = registry.get(name);
  if (!entry) return JSON.stringify({ error: `Unknown tool: ${name}` });
  try {
    const args = entry.schema.parse(rawArgs);
    const result = await entry.execute(ctx, args);
    const json = JSON.stringify(result);
    return json.length > 12_000 ? `${json.slice(0, 12_000)}\n...truncated` : json;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed";
    return JSON.stringify({ error: message });
  }
}
