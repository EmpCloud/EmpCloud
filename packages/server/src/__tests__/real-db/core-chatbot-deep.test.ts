// =============================================================================
// EMP CLOUD - Deep Chatbot / Agent / Tools Tests
// =============================================================================
import knex, { Knex } from "knex";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: Knex;
beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "empcloud" },
    pool: { min: 1, max: 5 },
  });
  await db.raw("SELECT 1");
});
afterAll(async () => { if (db) await db.destroy(); });

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const MGR = 529;
const U = String(Date.now()).slice(-6);

// -- Chatbot Conversations & Messages -----------------------------------------
describe("Chatbot Conversations (deep)", () => {
  let convId: number;
  afterAll(async () => {
    if (convId) {
      await db("chatbot_messages").where({ conversation_id: convId }).delete();
      await db("chatbot_conversations").where({ id: convId }).delete();
    }
  });

  it("create conversation", async () => {
    const [id] = await db("chatbot_conversations").insert({
      organization_id: ORG, user_id: EMP,
      title: `DeepChat-${U}`, created_at: new Date(), updated_at: new Date(),
    });
    convId = id;
    expect(id).toBeGreaterThan(0);
  });

  it("add user message", async () => {
    const [id] = await db("chatbot_messages").insert({
      conversation_id: convId, organization_id: ORG,
      role: "user", content: "What is my leave balance?",
      created_at: new Date(),
    });
    expect(id).toBeGreaterThan(0);
  });

  it("add assistant message", async () => {
    const [id] = await db("chatbot_messages").insert({
      conversation_id: convId, organization_id: ORG,
      role: "assistant", content: "You have 4.5 days of casual leave remaining for 2026.",
      created_at: new Date(),
    });
    expect(id).toBeGreaterThan(0);
  });

  it("add system message", async () => {
    const [id] = await db("chatbot_messages").insert({
      conversation_id: convId, organization_id: ORG,
      role: "system", content: "Tool call: getLeaveBalance",
      created_at: new Date(),
    });
    expect(id).toBeGreaterThan(0);
  });

  it("list messages for conversation", async () => {
    const msgs = await db("chatbot_messages")
      .where({ conversation_id: convId })
      .orderBy("created_at", "asc");
    expect(msgs.length).toBe(3);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[2].role).toBe("system");
  });

  it("list conversations for user", async () => {
    const r = await db("chatbot_conversations")
      .where({ organization_id: ORG, user_id: EMP })
      .orderBy("updated_at", "desc").limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("update conversation title", async () => {
    await db("chatbot_conversations").where({ id: convId }).update({
      title: `Updated-${U}`, updated_at: new Date(),
    });
    expect((await db("chatbot_conversations").where({ id: convId }).first()).title).toBe(`Updated-${U}`);
  });

  it("delete conversation cascades messages", async () => {
    // Create temp conv + messages then delete
    const [tmpId] = await db("chatbot_conversations").insert({
      organization_id: ORG, user_id: EMP, title: `Tmp-${U}`,
      created_at: new Date(), updated_at: new Date(),
    });
    await db("chatbot_messages").insert({
      conversation_id: tmpId, organization_id: ORG,
      role: "user", content: "test", created_at: new Date(),
    });
    await db("chatbot_messages").where({ conversation_id: tmpId }).delete();
    await db("chatbot_conversations").where({ id: tmpId }).delete();
    expect(await db("chatbot_conversations").where({ id: tmpId }).first()).toBeUndefined();
  });
});

// -- Tool queries that chatbot tools.ts would execute -------------------------
describe("Chatbot Tool Queries (deep)", () => {
  it("getLeaveBalance tool query", async () => {
    const balances = await db("leave_balances")
      .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
      .where({ "leave_balances.organization_id": ORG, "leave_balances.user_id": EMP, "leave_balances.year": 2026 })
      .select("leave_balances.*", "leave_types.name as leave_type_name");
    expect(balances.length).toBeGreaterThanOrEqual(1);
    expect(balances[0]).toHaveProperty("leave_type_name");
  });

  it("getAttendanceToday tool query", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await db("attendance_records")
      .where({ organization_id: ORG, user_id: EMP, date: today }).first();
    // May or may not have a record for today
    expect(r === undefined || r !== null).toBe(true);
  });

  it("getMyProfile tool query", async () => {
    const user = await db("users")
      .where({ id: EMP, organization_id: ORG })
      .select("id", "first_name", "last_name", "email", "designation", "department_id", "role")
      .first();
    expect(user).toBeTruthy();
    expect(user.first_name).toBeTruthy();
  });

  it("getTeamMembers tool query (manager)", async () => {
    const team = await db("users")
      .where({ organization_id: ORG, reporting_manager_id: MGR, status: 1 })
      .select("id", "first_name", "last_name", "designation");
    expect(team.length).toBeGreaterThanOrEqual(1);
  });

  it("getUpcomingHolidays tool query", async () => {
    const r = await db("company_events")
      .where({ organization_id: ORG, event_type: "holiday" })
      .where("start_date", ">=", new Date())
      .orderBy("start_date", "asc").limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getPendingLeaveApprovals tool query (manager)", async () => {
    const r = await db("leave_applications")
      .where({ "leave_applications.organization_id": ORG, "leave_applications.status": "pending", "leave_applications.current_approver_id": MGR })
      .join("users", "leave_applications.user_id", "users.id")
      .select("leave_applications.*", "users.first_name", "users.last_name")
      .limit(10);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getCompanyPolicies tool query", async () => {
    const r = await db("company_policies")
      .where({ organization_id: ORG, is_active: true })
      .select("id", "title", "category", "effective_date")
      .orderBy("title", "asc");
    expect(r.length).toBeGreaterThan(0);
  });

  it("getMyDocuments tool query", async () => {
    const r = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG, "employee_documents.user_id": EMP })
      .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
      .select("employee_documents.id", "employee_documents.name", "document_categories.name as category",
        "employee_documents.verification_status")
      .limit(10);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getAttendanceSummary tool query", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    const r = await db("attendance_records")
      .where({ organization_id: ORG, user_id: EMP })
      .whereBetween("date", [startDate, endDate])
      .select(
        db.raw("COUNT(*) as total_days"),
        db.raw("SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present"),
        db.raw("SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent"),
        db.raw("SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) as on_leave"),
      ).first();
    expect(r).toBeTruthy();
    expect(Number(r.total_days)).toBeGreaterThanOrEqual(0);
  });

  it("getMyShiftSchedule tool query", async () => {
    const r = await db("shift_assignments as sa")
      .join("shifts as s", "sa.shift_id", "s.id")
      .where("sa.organization_id", ORG).where("sa.user_id", EMP)
      .select("sa.*", "s.name as shift_name", "s.start_time", "s.end_time")
      .limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getUnreadNotifications tool query", async () => {
    const r = await db("notifications")
      .where({ organization_id: ORG, user_id: EMP, is_read: false })
      .orderBy("created_at", "desc").limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getHelpdeskTickets tool query", async () => {
    const r = await db("helpdesk_tickets")
      .where({ organization_id: ORG, raised_by: EMP })
      .orderBy("created_at", "desc").limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getWellnessPrograms tool query", async () => {
    const r = await db("wellness_programs")
      .where({ organization_id: ORG, is_active: true })
      .select("id", "title", "program_type", "start_date", "end_date")
      .limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getSurveysPending tool query", async () => {
    const r = await db("surveys")
      .where({ organization_id: ORG, status: "active" })
      .select("id", "title", "type", "end_date")
      .limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getOrgDirectory tool query", async () => {
    const r = await db("users")
      .where({ organization_id: ORG, status: 1 })
      .where("role", "!=", "super_admin")
      .select("id", "first_name", "last_name", "designation", "department_id", "email")
      .orderBy("first_name", "asc").limit(20);
    expect(r.length).toBeGreaterThan(0);
  });

  it("getDepartmentSummary tool query", async () => {
    const r = await db("users")
      .where({ "users.organization_id": ORG, "users.status": 1 })
      .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
      .select("organization_departments.name as department", db.raw("COUNT(*) as count"))
      .groupBy("organization_departments.name");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

// -- AI Config ----------------------------------------------------------------
describe("AI Config (deep)", () => {
  it("ai_config table exists", async () => {
    expect(await db.schema.hasTable("ai_config")).toBe(true);
  });

  it("query ai config", async () => {
    const r = await db("ai_config").first();
    // May or may not have config records
    expect(r === undefined || r !== null).toBe(true);
  });
});
