// =============================================================================
// EMP CLOUD -- Agentic AI Tool Definitions
// Each tool wraps a real database query that the LLM can invoke via tool_use.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (
    orgId: number,
    userId: number,
    params: Record<string, unknown>
  ) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RESULT_LENGTH = 5000;

function truncate(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  if (json.length <= MAX_RESULT_LENGTH) return json;
  return json.slice(0, MAX_RESULT_LENGTH) + "\n... (truncated)";
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

async function fetchModule(port: number, path: string, orgId: number): Promise<any> {
  try {
    const url = `http://localhost:${port}${path}${path.includes("?") ? "&" : "?"}organization_id=${orgId}`;
    const resp = await fetch(url, {
      headers: { "X-Internal-Service": "empcloud-dashboard" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return { error: `API returned ${resp.status}` };
    const data = await resp.json() as Record<string, unknown>;
    return data.data || data;
  } catch (err: any) {
    return { error: `Module unavailable: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// SQL Safety validator (for run_sql_query)
// ---------------------------------------------------------------------------

const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE|CALL|SET|LOCK|UNLOCK|RENAME|LOAD|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i;

function validateSelectQuery(query: string): string | null {
  const trimmed = query.trim().replace(/;\s*$/, "");
  if (!trimmed.toUpperCase().startsWith("SELECT")) {
    return "Only SELECT queries are allowed.";
  }
  if (FORBIDDEN_SQL.test(trimmed)) {
    return "Query contains forbidden SQL keywords. Only read-only SELECT queries are allowed.";
  }
  // Disallow multiple statements
  if (trimmed.includes(";")) {
    return "Multiple statements are not allowed.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const tools: ToolDefinition[] = [
  // ---- Employee / Organization ----
  {
    name: "get_employee_count",
    description:
      "Get the total number of active employees in the organization.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const [row] = await db("users")
        .where({ organization_id: orgId, status: 1 })
        .count("id as count");
      return { total_employees: Number(row.count) };
    },
  },

  {
    name: "get_employee_details",
    description:
      "Search for employees by name or email. Returns profile details including designation, department, phone, and email.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "Name or email to search for",
        required: true,
      },
    ],
    execute: async (orgId, _userId, { query }) => {
      const db = getDB();
      const q = String(query).toLowerCase();
      const employees = await db("users as u")
        .leftJoin("employee_profiles as ep", function () {
          this.on("ep.user_id", "=", "u.id").andOn(
            "ep.organization_id",
            "=",
            "u.organization_id"
          );
        })
        .where("u.organization_id", orgId)
        .where("u.status", 1)
        .where(function () {
          this.whereRaw("LOWER(u.first_name) LIKE ?", [`%${q}%`])
            .orWhereRaw("LOWER(u.last_name) LIKE ?", [`%${q}%`])
            .orWhereRaw("LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE ?", [`%${q}%`])
            .orWhereRaw("LOWER(u.email) LIKE ?", [`%${q}%`]);
        })
        .limit(10)
        .select(
          "u.id",
          "u.first_name",
          "u.last_name",
          "u.email",
          "ep.phone",
          "ep.designation",
          "ep.department",
          "ep.date_of_joining",
          "ep.employee_id"
        );
      return { employees, count: employees.length };
    },
  },

  {
    name: "get_department_list",
    description:
      "List all departments in the organization with employee counts.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const departments = await db("departments as d")
        .where("d.organization_id", orgId)
        .leftJoin("users as u", function () {
          this.on("u.organization_id", "=", "d.organization_id")
            .andOnVal("u.status", "=", 1);
        })
        .leftJoin("employee_profiles as ep", function () {
          this.on("ep.user_id", "=", "u.id")
            .andOn("ep.organization_id", "=", "u.organization_id")
            .andOn("ep.department", "=", "d.name");
        })
        .groupBy("d.id", "d.name")
        .select("d.id", "d.name")
        .count("ep.id as employee_count");

      return {
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name,
          employee_count: Number(d.employee_count),
        })),
        total_departments: departments.length,
      };
    },
  },

  // ---- Attendance ----
  {
    name: "get_attendance_today",
    description:
      "Get today's attendance summary for the organization: total present, absent, late, and on leave.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const date = todayStr();

      const totalUsers = await db("users")
        .where({ organization_id: orgId, status: 1 })
        .count("id as count")
        .first();

      const records = await db("attendance_records")
        .where({ organization_id: orgId, date })
        .select("status")
        .count("id as count")
        .groupBy("status");

      const statusMap: Record<string, number> = {};
      for (const r of records) {
        statusMap[String(r.status)] = Number(r.count);
      }

      const total = Number(totalUsers?.count ?? 0);
      const present = statusMap["present"] || 0;
      const late = statusMap["late"] || 0;
      const halfDay = statusMap["half_day"] || 0;
      const absent = statusMap["absent"] || 0;
      const checkedIn = present + late + halfDay;
      const notCheckedIn = total - checkedIn - absent;

      return {
        date,
        total_employees: total,
        present,
        late,
        half_day: halfDay,
        absent,
        not_checked_in: notCheckedIn,
        attendance_rate:
          total > 0 ? `${Math.round((checkedIn / total) * 100)}%` : "N/A",
      };
    },
  },

  {
    name: "get_attendance_for_employee",
    description:
      "Get attendance records for a specific employee over a number of days.",
    parameters: [
      {
        name: "employee_name",
        type: "string",
        description: "Employee name to search for",
        required: true,
      },
      {
        name: "days",
        type: "number",
        description: "How many days back to look (default 7)",
        required: false,
        default: 7,
      },
    ],
    execute: async (orgId, _userId, { employee_name, days }) => {
      const db = getDB();
      const numDays = Number(days) || 7;
      const name = String(employee_name).toLowerCase();

      // Find the employee
      const user = await db("users")
        .where("organization_id", orgId)
        .where(function () {
          this.whereRaw("LOWER(CONCAT(first_name, ' ', last_name)) LIKE ?", [
            `%${name}%`,
          ]);
        })
        .first();

      if (!user) return { error: `No employee found matching "${employee_name}"` };

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);

      const records = await db("attendance_records")
        .where({ organization_id: orgId, user_id: user.id })
        .where("date", ">=", startDate.toISOString().split("T")[0])
        .orderBy("date", "desc")
        .select("date", "status", "check_in", "check_out", "total_hours");

      return {
        employee: `${user.first_name} ${user.last_name}`,
        period: `Last ${numDays} days`,
        records: records.map((r) => ({
          date: r.date,
          status: r.status,
          check_in: r.check_in || null,
          check_out: r.check_out || null,
          hours: r.total_hours ? Number(r.total_hours).toFixed(1) : null,
        })),
        total_records: records.length,
      };
    },
  },

  {
    name: "get_attendance_by_department",
    description:
      "Get attendance summary for a specific department on a given date.",
    parameters: [
      {
        name: "department",
        type: "string",
        description: "Department name",
        required: true,
      },
      {
        name: "date",
        type: "string",
        description: "Date in YYYY-MM-DD format (default: today)",
        required: false,
        default: "today",
      },
    ],
    execute: async (orgId, _userId, { department, date }) => {
      const db = getDB();
      const dateStr = date === "today" || !date ? todayStr() : String(date);
      const dept = String(department);

      const employees = await db("users as u")
        .join("employee_profiles as ep", function () {
          this.on("ep.user_id", "=", "u.id").andOn(
            "ep.organization_id",
            "=",
            "u.organization_id"
          );
        })
        .where("u.organization_id", orgId)
        .where("u.status", 1)
        .whereRaw("LOWER(ep.department) LIKE ?", [`%${dept.toLowerCase()}%`])
        .select("u.id", "u.first_name", "u.last_name");

      if (employees.length === 0) {
        return { error: `No employees found in department "${department}"` };
      }

      const userIds = employees.map((e) => e.id);
      const records = await db("attendance_records")
        .where({ organization_id: orgId, date: dateStr })
        .whereIn("user_id", userIds)
        .select("user_id", "status", "check_in", "check_out");

      const recordMap = new Map(records.map((r) => [r.user_id, r]));

      const summary = employees.map((e) => {
        const rec = recordMap.get(e.id);
        return {
          name: `${e.first_name} ${e.last_name}`,
          status: rec?.status || "not_checked_in",
        };
      });

      const statusCounts: Record<string, number> = {};
      for (const s of summary) {
        statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
      }

      return {
        department: dept,
        date: dateStr,
        total_employees: employees.length,
        status_summary: statusCounts,
        details: summary,
      };
    },
  },

  {
    name: "get_my_attendance",
    description:
      "Get the current user's attendance for today including check-in/out times and status.",
    parameters: [],
    execute: async (orgId, userId) => {
      const db = getDB();
      const date = todayStr();

      const record = await db("attendance_records")
        .where({ organization_id: orgId, user_id: userId, date })
        .first();

      if (!record) {
        return { date, status: "not_checked_in", message: "No attendance record for today." };
      }

      return {
        date,
        status: record.status,
        check_in: record.check_in || null,
        check_out: record.check_out || null,
        total_hours: record.total_hours ? Number(record.total_hours).toFixed(1) : "In progress",
      };
    },
  },

  // ---- Leave ----
  {
    name: "get_leave_balance",
    description:
      "Get leave balance for a specific employee (by name) or for the current user if no name given.",
    parameters: [
      {
        name: "employee_name",
        type: "string",
        description: "Employee name to look up. Leave empty for the current user.",
        required: false,
      },
    ],
    execute: async (orgId, userId, { employee_name }) => {
      const db = getDB();
      let targetUserId = userId;

      if (employee_name) {
        const name = String(employee_name).toLowerCase();
        const user = await db("users")
          .where("organization_id", orgId)
          .where(function () {
            this.whereRaw(
              "LOWER(CONCAT(first_name, ' ', last_name)) LIKE ?",
              [`%${name}%`]
            );
          })
          .first();
        if (!user) return { error: `No employee found matching "${employee_name}"` };
        targetUserId = user.id;
      }

      const balances = await db("leave_balances as lb")
        .join("leave_types as lt", function () {
          this.on("lt.id", "=", "lb.leave_type_id").andOn(
            "lt.organization_id",
            "=",
            "lb.organization_id"
          );
        })
        .where({ "lb.organization_id": orgId, "lb.user_id": targetUserId })
        .select(
          "lt.name as leave_type",
          "lb.total_allocated",
          "lb.total_used",
          "lb.total_carry_forward",
          "lb.balance"
        );

      if (balances.length === 0) {
        return { message: "No leave balances found for this user." };
      }

      return { balances };
    },
  },

  {
    name: "get_pending_leave_requests",
    description:
      "Get all pending leave requests awaiting approval in the organization.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const requests = await db("leave_applications as la")
        .join("users as u", function () {
          this.on("u.id", "=", "la.user_id").andOn(
            "u.organization_id",
            "=",
            "la.organization_id"
          );
        })
        .join("leave_types as lt", function () {
          this.on("lt.id", "=", "la.leave_type_id").andOn(
            "lt.organization_id",
            "=",
            "la.organization_id"
          );
        })
        .where({ "la.organization_id": orgId, "la.status": "pending" })
        .orderBy("la.created_at", "desc")
        .limit(20)
        .select(
          "la.id",
          "u.first_name",
          "u.last_name",
          "lt.name as leave_type",
          "la.start_date",
          "la.end_date",
          "la.reason",
          "la.created_at"
        );

      return { pending_requests: requests, count: requests.length };
    },
  },

  {
    name: "get_leave_calendar",
    description:
      "Get employees who are on leave for a given date range.",
    parameters: [
      {
        name: "start_date",
        type: "string",
        description: "Start date YYYY-MM-DD (default: today)",
        required: false,
        default: "today",
      },
      {
        name: "end_date",
        type: "string",
        description: "End date YYYY-MM-DD (default: 7 days from start)",
        required: false,
      },
    ],
    execute: async (orgId, _userId, { start_date, end_date }) => {
      const db = getDB();
      const start =
        start_date === "today" || !start_date
          ? todayStr()
          : String(start_date);
      let end = end_date ? String(end_date) : null;
      if (!end) {
        const d = new Date(start);
        d.setDate(d.getDate() + 7);
        end = d.toISOString().split("T")[0];
      }

      const leaves = await db("leave_applications as la")
        .join("users as u", function () {
          this.on("u.id", "=", "la.user_id").andOn(
            "u.organization_id",
            "=",
            "la.organization_id"
          );
        })
        .join("leave_types as lt", function () {
          this.on("lt.id", "=", "la.leave_type_id").andOn(
            "lt.organization_id",
            "=",
            "la.organization_id"
          );
        })
        .where({ "la.organization_id": orgId, "la.status": "approved" })
        .where("la.start_date", "<=", end)
        .where("la.end_date", ">=", start)
        .orderBy("la.start_date", "asc")
        .limit(50)
        .select(
          "u.first_name",
          "u.last_name",
          "lt.name as leave_type",
          "la.start_date",
          "la.end_date"
        );

      return { start_date: start, end_date: end, on_leave: leaves, count: leaves.length };
    },
  },

  // ---- Announcements ----
  {
    name: "get_announcements",
    description:
      "Get recent company announcements. Returns title, priority, and publish date.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Number of announcements to return (default 5)",
        required: false,
        default: 5,
      },
    ],
    execute: async (orgId, _userId, { limit }) => {
      const db = getDB();
      const lim = Math.min(Number(limit) || 5, 20);
      const announcements = await db("announcements")
        .where({ organization_id: orgId })
        .whereIn("status", ["published", "active"])
        .orderBy("published_at", "desc")
        .limit(lim)
        .select("id", "title", "priority", "published_at", "content");

      return {
        announcements: announcements.map((a) => ({
          ...a,
          content: a.content ? String(a.content).slice(0, 300) : null,
        })),
        count: announcements.length,
      };
    },
  },

  // ---- Policies ----
  {
    name: "get_company_policies",
    description:
      "Get active company policies, optionally filtered by category.",
    parameters: [
      {
        name: "category",
        type: "string",
        description: "Policy category to filter by (optional)",
        required: false,
      },
    ],
    execute: async (orgId, _userId, { category }) => {
      const db = getDB();
      let q = db("company_policies")
        .where({ organization_id: orgId, is_active: true })
        .orderBy("created_at", "desc")
        .limit(20)
        .select("id", "title", "category", "version", "effective_date");

      if (category) {
        q = q.whereRaw("LOWER(category) LIKE ?", [
          `%${String(category).toLowerCase()}%`,
        ]);
      }

      const policies = await q;
      return { policies, count: policies.length };
    },
  },

  // ---- Helpdesk ----
  {
    name: "get_helpdesk_stats",
    description:
      "Get helpdesk ticket statistics: open, in progress, resolved, and overdue counts.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("helpdesk_tickets");
      if (!hasTable) return { message: "Helpdesk module is not set up." };

      const stats = await db("helpdesk_tickets")
        .where({ organization_id: orgId })
        .select("status")
        .count("id as count")
        .groupBy("status");

      const result: Record<string, number> = {};
      for (const s of stats) {
        result[String(s.status)] = Number(s.count);
      }

      // Check overdue
      const overdue = await db("helpdesk_tickets")
        .where({ organization_id: orgId })
        .whereNotIn("status", ["resolved", "closed"])
        .where("due_date", "<", new Date())
        .count("id as count")
        .first();

      return { ...result, overdue: Number(overdue?.count ?? 0) };
    },
  },

  // ---- Events ----
  {
    name: "get_upcoming_events",
    description:
      "Get upcoming company events including title, date, and location.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Number of events to return (default 5)",
        required: false,
        default: 5,
      },
    ],
    execute: async (orgId, _userId, { limit }) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("events");
      if (!hasTable) return { message: "Events module is not set up." };

      const lim = Math.min(Number(limit) || 5, 20);
      const events = await db("events")
        .where({ organization_id: orgId })
        .where("start_date", ">=", todayStr())
        .orderBy("start_date", "asc")
        .limit(lim)
        .select("id", "title", "description", "start_date", "end_date", "location");

      return { events, count: events.length };
    },
  },

  // ---- Organization Stats ----
  {
    name: "get_org_stats",
    description:
      "Get organization overview: total users, departments, locations, and active module subscriptions.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();

      const [users] = await db("users")
        .where({ organization_id: orgId, status: 1 })
        .count("id as count");

      const [depts] = await db("organization_departments")
        .where({ organization_id: orgId })
        .count("id as count");

      const [locs] = await db("locations")
        .where({ organization_id: orgId })
        .count("id as count");

      const modules = await db("subscriptions as s")
        .join("modules as m", "m.id", "s.module_id")
        .where({ "s.organization_id": orgId })
        .whereIn("s.status", ["active", "trial"])
        .select("m.name", "s.status", "s.seats_purchased");

      return {
        total_users: Number(users.count),
        total_departments: Number(depts.count),
        total_locations: Number(locs.count),
        active_modules: modules,
        module_count: modules.length,
      };
    },
  },

  // ---- Knowledge Base ----
  {
    name: "search_knowledge_base",
    description:
      "Search HR knowledge base articles by keyword.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "Search keyword or phrase",
        required: true,
      },
    ],
    execute: async (orgId, _userId, { query }) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("kb_articles");
      if (!hasTable) return { message: "Knowledge base is not set up.", articles: [] };

      const q = String(query).toLowerCase();
      const articles = await db("kb_articles")
        .where({ organization_id: orgId, is_published: true })
        .where(function () {
          this.whereRaw("LOWER(title) LIKE ?", [`%${q}%`]).orWhereRaw(
            "LOWER(content) LIKE ?",
            [`%${q}%`]
          );
        })
        .orderBy("view_count", "desc")
        .limit(10)
        .select("id", "title", "category", "view_count");

      return { articles, count: articles.length };
    },
  },

  // ---- Assets ----
  {
    name: "get_asset_summary",
    description:
      "Get asset inventory summary: total, assigned, available, and under maintenance.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("assets");
      if (!hasTable) return { message: "Asset management is not set up." };

      const stats = await db("assets")
        .where({ organization_id: orgId })
        .select("status")
        .count("id as count")
        .groupBy("status");

      const result: Record<string, number> = {};
      let total = 0;
      for (const s of stats) {
        const cnt = Number(s.count);
        result[String(s.status)] = cnt;
        total += cnt;
      }

      return { total_assets: total, by_status: result };
    },
  },

  // ---- Positions / Vacancies ----
  {
    name: "get_position_vacancies",
    description:
      "Get open position vacancies including title, department, and number of openings.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("positions");
      if (!hasTable) return { message: "Position management is not set up." };

      const positions = await db("positions")
        .where({ organization_id: orgId, status: "open" })
        .orderBy("created_at", "desc")
        .limit(20)
        .select("id", "title", "department", "location", "openings", "created_at");

      return { vacancies: positions, count: positions.length };
    },
  },

  // ---- Surveys ----
  {
    name: "get_survey_results",
    description:
      "Get employee survey results including eNPS scores and participation rates.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("surveys");
      if (!hasTable) return { message: "Surveys module is not set up." };

      const surveys = await db("surveys")
        .where({ organization_id: orgId })
        .orderBy("created_at", "desc")
        .limit(5)
        .select("id", "title", "type", "status", "response_count", "created_at");

      return { surveys, count: surveys.length };
    },
  },

  // ---- Wellness ----
  {
    name: "get_wellness_dashboard",
    description:
      "Get organization wellness metrics: average mood score and participation data.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("wellness_checkins");
      if (!hasTable) return { message: "Wellness module is not set up." };

      const today = todayStr();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const stats = await db("wellness_checkins")
        .where({ organization_id: orgId })
        .where("created_at", ">=", weekAgo.toISOString())
        .avg("mood_score as avg_mood")
        .count("id as checkin_count")
        .first();

      const totalUsers = await db("users")
        .where({ organization_id: orgId, status: 1 })
        .count("id as count")
        .first();

      return {
        period: "Last 7 days",
        avg_mood: stats?.avg_mood ? Number(Number(stats.avg_mood).toFixed(1)) : null,
        total_checkins: Number(stats?.checkin_count ?? 0),
        total_employees: Number(totalUsers?.count ?? 0),
      };
    },
  },

  // ---- Anonymous Feedback ----
  {
    name: "get_recent_feedback",
    description:
      "Get recent anonymous feedback submissions (admin only). Returns feedback text and category.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Number of feedback entries (default 10)",
        required: false,
        default: 10,
      },
    ],
    execute: async (orgId, _userId, { limit }) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("anonymous_feedback");
      if (!hasTable) return { message: "Anonymous feedback is not set up." };

      const lim = Math.min(Number(limit) || 10, 20);
      const feedback = await db("anonymous_feedback")
        .where({ organization_id: orgId })
        .orderBy("created_at", "desc")
        .limit(lim)
        .select("id", "category", "content", "status", "created_at");

      return { feedback, count: feedback.length };
    },
  },

  // ---- Whistleblower ----
  {
    name: "get_whistleblower_stats",
    description:
      "Get whistleblower report statistics: total, open, investigating, and resolved counts.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("whistleblower_reports");
      if (!hasTable) return { message: "Whistleblower module is not set up." };

      const stats = await db("whistleblower_reports")
        .where({ organization_id: orgId })
        .select("status")
        .count("id as count")
        .groupBy("status");

      const result: Record<string, number> = {};
      let total = 0;
      for (const s of stats) {
        const cnt = Number(s.count);
        result[String(s.status)] = cnt;
        total += cnt;
      }

      return { total_reports: total, by_status: result };
    },
  },

  // ---- Module Subscriptions ----
  {
    name: "get_module_subscriptions",
    description:
      "Get active module subscriptions with seat usage information.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();
      const subs = await db("subscriptions as s")
        .join("modules as m", "m.id", "s.module_id")
        .where({ "s.organization_id": orgId })
        .select(
          "m.name as module_name",
          "m.slug",
          "s.status",
          "s.plan",
          "s.seats_purchased",
          "s.seats_used",
          "s.current_period_start",
          "s.current_period_end"
        );

      return { subscriptions: subs, count: subs.length };
    },
  },

  // ---- Billing ----
  {
    name: "get_billing_summary",
    description:
      "Get billing summary: active subscriptions, total MRR, and recent invoices.",
    parameters: [],
    execute: async (orgId) => {
      const db = getDB();

      const subs = await db("subscriptions")
        .where({ organization_id: orgId })
        .whereIn("status", ["active", "trial"])
        .select("plan", "price_per_seat", "seats_purchased", "status");

      let totalMRR = 0;
      for (const s of subs) {
        totalMRR += (Number(s.price_per_seat) || 0) * (Number(s.seats_purchased) || 0);
      }

      const hasInvoices = await db.schema.hasTable("invoices");
      let recentInvoices: unknown[] = [];
      if (hasInvoices) {
        recentInvoices = await db("invoices")
          .where({ organization_id: orgId })
          .orderBy("created_at", "desc")
          .limit(5)
          .select("id", "amount", "status", "due_date", "created_at");
      }

      return {
        active_subscriptions: subs.length,
        total_mrr: totalMRR,
        recent_invoices: recentInvoices,
      };
    },
  },

  // ---- Holidays ----
  {
    name: "get_upcoming_holidays",
    description:
      "Get upcoming holidays from the leave calendar.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Number of holidays to return (default 10)",
        required: false,
        default: 10,
      },
    ],
    execute: async (orgId, _userId, { limit }) => {
      const db = getDB();
      const hasTable = await db.schema.hasTable("leave_calendar");
      if (!hasTable) return { message: "No holiday calendar configured.", holidays: [] };

      const lim = Math.min(Number(limit) || 10, 30);
      const holidays = await db("leave_calendar")
        .where({ organization_id: orgId })
        .where("date", ">=", todayStr())
        .orderBy("date", "asc")
        .limit(lim)
        .select("name", "date", "type");

      return { holidays, count: holidays.length };
    },
  },

  // ---- Custom SQL ----
  {
    name: "run_sql_query",
    description:
      "Run a read-only SQL SELECT query on the empcloud database for custom analytics. Only SELECT queries are allowed. The query MUST include a WHERE clause filtering by organization_id for data isolation. Use this as a last resort when no other tool can answer the question.",
    parameters: [
      {
        name: "query",
        type: "string",
        description:
          "SQL SELECT query. Must include WHERE organization_id = <org_id>. No INSERT/UPDATE/DELETE/DROP allowed.",
        required: true,
      },
    ],
    execute: async (orgId, _userId, { query }) => {
      const db = getDB();
      const sql = String(query).trim();

      // Validate safety
      const error = validateSelectQuery(sql);
      if (error) return { error };

      // Ensure organization_id filter is present
      if (!sql.toLowerCase().includes("organization_id")) {
        return {
          error:
            "Query must include organization_id filter for data isolation. Add WHERE organization_id = " +
            orgId,
        };
      }

      try {
        const results = await db.raw(sql);
        // MySQL returns [rows, fields] from raw
        const rows = Array.isArray(results) ? results[0] : results;
        const data = Array.isArray(rows) ? rows.slice(0, 100) : rows;
        return { rows: data, count: Array.isArray(data) ? data.length : 0 };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Query execution failed";
        logger.error("SQL tool error:", { sql, error: msg });
        return { error: `Query failed: ${msg}` };
      }
    },
  },

  // ==========================================================================
  // Cross-Module Tools (HTTP calls to external EMP modules)
  // ==========================================================================

  // ---- Payroll (port 4000) ----
  {
    name: "get_payroll_summary",
    description:
      "Get the latest payroll run summary including total gross, deductions, net pay, and employee count",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4000, "/api/v1/payroll/runs?limit=1&sort=created_at:desc", orgId),
  },

  {
    name: "get_employee_salary",
    description:
      "Get salary details for a specific employee including CTC, components, and deductions",
    parameters: [
      {
        name: "employee_name",
        type: "string",
        description: "Employee name to search",
        required: true,
      },
    ],
    execute: async (orgId, _userId, { employee_name }) => {
      const db = getDB();
      const user = await db("users")
        .where({ organization_id: orgId, status: 1 })
        .where(function () {
          this.whereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [
            `%${employee_name}%`,
          ]).orWhere("first_name", "like", `%${employee_name}%`);
        })
        .first();
      if (!user) return { error: "Employee not found" };
      return fetchModule(4000, `/api/v1/salaries/employee/${user.id}`, orgId);
    },
  },

  {
    name: "get_payroll_analytics",
    description:
      "Get payroll cost analytics — total cost trends, department-wise breakdown",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4000, "/api/v1/analytics/cost-summary", orgId),
  },

  // ---- Recruitment (port 4500) ----
  {
    name: "get_open_jobs",
    description:
      "Get current open job postings with title, department, and applicant count",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4500, "/api/v1/jobs?status=open&limit=20", orgId),
  },

  {
    name: "get_hiring_pipeline",
    description:
      "Get recruitment pipeline summary — candidates by stage (applied, screened, interview, offer, hired)",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4500, "/api/v1/analytics/pipeline", orgId),
  },

  {
    name: "get_recruitment_stats",
    description:
      "Get recruitment metrics — total candidates, time to hire, source effectiveness, offer acceptance rate",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4500, "/api/v1/analytics/overview", orgId),
  },

  // ---- Performance (port 4300) ----
  {
    name: "get_review_cycle_status",
    description:
      "Get active performance review cycles with completion percentage and pending reviews",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4300, "/api/v1/review-cycles?status=active", orgId),
  },

  {
    name: "get_goals_summary",
    description:
      "Get OKR/goals summary — total goals, completion rate, on-track vs at-risk",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4300, "/api/v1/analytics/overview", orgId),
  },

  {
    name: "get_team_performance",
    description:
      "Get team performance overview — average ratings, top performers, performance distribution",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4300, "/api/v1/analytics/overview", orgId),
  },

  // ---- Rewards (port 4600) ----
  {
    name: "get_kudos_summary",
    description:
      "Get recent kudos/recognition summary — total kudos, top recognized employees, trending categories",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4600, "/api/v1/analytics/overview", orgId),
  },

  {
    name: "get_recognition_leaderboard",
    description:
      "Get the employee recognition leaderboard — top employees by points",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4600, "/api/v1/leaderboard?period=monthly&limit=10", orgId),
  },

  // ---- Exit (port 4400) ----
  {
    name: "get_active_exits",
    description:
      "Get employees currently in the offboarding/exit process with their status and reason",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4400, "/api/v1/exits?status=in_progress", orgId),
  },

  {
    name: "get_attrition_analytics",
    description:
      "Get attrition analytics — attrition rate, top reasons for leaving, department trends",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4400, "/api/v1/analytics/attrition", orgId),
  },

  // ---- LMS (port 4700) ----
  {
    name: "get_course_catalog",
    description:
      "Get available training courses with enrollment counts and completion rates",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4700, "/api/v1/courses?limit=20", orgId),
  },

  {
    name: "get_training_compliance",
    description:
      "Get compliance training status — mandatory courses, overdue employees, completion percentage",
    parameters: [],
    execute: async (orgId) =>
      fetchModule(4700, "/api/v1/analytics/overview", orgId),
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

const toolMap = new Map(tools.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function getToolSchemas() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Execute a tool by name with safety truncation.
 */
export async function executeTool(
  name: string,
  orgId: number,
  userId: number,
  params: Record<string, unknown>
): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

  try {
    const result = await tool.execute(orgId, userId, params);
    return truncate(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Tool execution failed";
    logger.error(`Tool ${name} execution error:`, { error: msg, params });
    return JSON.stringify({ error: msg });
  }
}
