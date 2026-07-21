import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOL_NAMES, openAITools } from "../services/assistant/tools.js";

const EXPECTED = [
  "search_employees", "count_employees", "get_attendance", "get_leave_balance",
  "get_pending_leave_requests", "get_pending_attendance_regularizations",
  "get_shift_schedule", "get_salary_structure", "get_net_pay", "get_payroll_run_totals",
  "get_productivity_summary", "get_application_usage", "get_website_usage",
  "get_timesheet_details", "get_keystrokes", "get_employee_wise_ai_usage",
  "get_organization_wise_ai_usage", "get_organization_wise_x_application_usage",
  "get_organization_wise_x_website_usage", "get_employee_wise_x_application_usage",
  "get_employee_wise_x_website_usage",
];

describe("assistant tool registry", () => {
  it("exposes exactly the approved tools", () => {
    expect(ASSISTANT_TOOL_NAMES).toEqual(EXPECTED);
  });

  it("publishes closed JSON schemas for Chat Completions function calling", () => {
    const definitions = openAITools();
    expect(definitions).toHaveLength(EXPECTED.length);
    for (const definition of definitions) {
      expect(definition.type).toBe("function");
      expect(definition.function.parameters).toMatchObject({ type: "object", additionalProperties: false });
    }
  });

  it("exposes department and location filters for employee search and count", () => {
    const definitions = openAITools();
    for (const name of ["search_employees", "count_employees"]) {
      const definition = definitions.find((item) => item.function.name === name);
      expect(definition?.function.parameters).toMatchObject({
        properties: {
          department: { type: "string" },
          location: { type: "string" },
        },
      });
    }
  });

  it("exposes read-only pending-request tools with employee, department, location, search, and date filters", () => {
    const definitions = openAITools();
    for (const name of ["get_pending_leave_requests", "get_pending_attendance_regularizations"]) {
      const definition = definitions.find((item) => item.function.name === name);
      expect(definition?.function.parameters).toMatchObject({
        properties: {
          employee_id: { type: "integer" }, department: { type: "string" }, location: { type: "string" },
          search: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      });
    }
  });

  it("exposes explicit direct-report control on Monitor scope tools", () => {
    const definitions = openAITools();
    for (const definition of definitions.filter((item) => item.function.name.startsWith("get_") && item.function.parameters.properties?.scope)) {
      expect(definition.function.parameters).toMatchObject({
        properties: { direct_reports_only: { type: "boolean" } },
      });
    }
  });
});
