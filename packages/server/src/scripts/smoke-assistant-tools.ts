import { initDB, closeDB } from "../db/connection.js";
import { ASSISTANT_TOOL_NAMES, executeAssistantTool } from "../services/assistant/tools.js";
import type { AssistantContext } from "../services/assistant/scope-resolver.js";

const orgId = Number(process.env.SMOKE_ORG_ID || 1);
const employeeId = Number(process.env.SMOKE_EMPLOYEE_ID || 3);
const startDate = process.env.SMOKE_START_DATE || "2026-06-20";
const endDate = process.env.SMOKE_END_DATE || "2026-07-20";

const permissions = new Set([
  "employees:view", "employees:view_team", "employees:view_all",
  "attendance:view", "attendance:view_team", "attendance:view_all", "attendance:manage",
  "attendance:approve_regularization_team", "attendance:approve_regularization_all",
  "leave:view", "leave:view_team", "leave:view_all", "leave:approve",
  "salary:view", "salary:view_all", "payroll:view_own", "payroll:view_all", "payroll:view_reports",
  "monitor:view_own", "monitor:view_team", "monitor:view_all",
]);
const ctx: AssistantContext = { orgId, userId: employeeId, role: "org_admin", permissions };

const args: Record<string, unknown> = {
  search_employees: { query: "Priya", limit: 10 },
  count_employees: { status: "active" },
  get_attendance: { employee_id: employeeId, start_date: startDate, end_date: endDate },
  get_leave_balance: { employee_id: employeeId, fiscal_year: 2026 },
  get_pending_leave_requests: { limit: 20 },
  get_pending_attendance_regularizations: { limit: 20 },
  get_shift_schedule: { employee_id: employeeId, start_date: startDate, end_date: endDate },
  get_salary_structure: { employee_id: employeeId, effective_on: endDate },
  get_net_pay: { employee_id: employeeId, month: 6, year: 2026 },
  get_payroll_run_totals: { month: 6, year: 2026 },
  get_productivity_summary: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate },
  get_application_usage: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, limit: 10 },
  get_website_usage: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, limit: 10 },
  get_timesheet_details: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, limit: 10 },
  get_keystrokes: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, limit: 10 },
  get_employee_wise_ai_usage: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, limit: 10 },
  get_organization_wise_ai_usage: { scope: "organization", start_date: startDate, end_date: endDate, limit: 10 },
  get_organization_wise_x_application_usage: { scope: "organization", start_date: startDate, end_date: endDate, name: "Google Chrome", limit: 10 },
  get_organization_wise_x_website_usage: { scope: "organization", start_date: startDate, end_date: endDate, name: "chatgpt.com", limit: 10 },
  get_employee_wise_x_application_usage: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, name: "Google Chrome", limit: 10 },
  get_employee_wise_x_website_usage: { scope: "own", employee_id: employeeId, start_date: startDate, end_date: endDate, name: "chatgpt.com", limit: 10 },
};

async function main() {
  await initDB();
  const results: Array<{ tool: string; status: "PASS" | "FAIL"; detail?: string }> = [];
  try {
    for (const name of ASSISTANT_TOOL_NAMES) {
      const raw = await executeAssistantTool(ctx, name, args[name] || {});
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = { error: "Invalid JSON tool response" }; }
      results.push(parsed?.error
        ? { tool: name, status: "FAIL", detail: String(parsed.error) }
        : { tool: name, status: "PASS" });
    }
  } finally {
    await closeDB();
  }
  process.stdout.write(`${JSON.stringify({ org_id: orgId, employee_id: employeeId, start_date: startDate, end_date: endDate, results }, null, 2)}\n`);
  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Smoke test failed"}\n`);
  process.exitCode = 1;
});
