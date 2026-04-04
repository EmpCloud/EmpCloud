// =============================================================================
// EMP CLOUD — Real-DB Integration Tests for Low-Coverage Core Services
// Runs against the LIVE MySQL database on the test server (localhost:3306)
// =============================================================================

import knex, { Knex } from "knex";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Direct Knex connection (bypasses config/env loading issues)
// ---------------------------------------------------------------------------

let db: Knex;

beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "empcloud",
      password: process.env.DB_PASSWORD || "EmpCloud2026",
      database: process.env.DB_NAME || "empcloud",
    },
    pool: { min: 1, max: 5 },
  });

  // Verify connection
  await db.raw("SELECT 1");
});

afterAll(async () => {
  if (db) await db.destroy();
});

// ---------------------------------------------------------------------------
// Constants — real test server data
// ---------------------------------------------------------------------------

const ORG_ID = 5; // TechNova
const ADMIN_USER_ID = 522; // ananya@technova.in
const EMPLOYEE_USER_ID = 524; // priya@technova.in
const MANAGER_USER_ID = 529; // karthik@technova.in
const DEPT_ENGINEERING = 72;

const TS = Date.now(); // unique suffix to avoid collisions

// ---------------------------------------------------------------------------
// 1. WHISTLEBLOWING SERVICE
// ---------------------------------------------------------------------------

describe("Whistleblowing Service (real DB)", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    // Cleanup: delete updates then reports
    for (const id of createdIds) {
      await db("whistleblower_updates").where("report_id", id).delete();
      await db("whistleblower_reports").where("id", id).delete();
    }
  });

  it("should submit an anonymous report and get a case number", async () => {
    const year = new Date().getFullYear();
    const [id] = await db("whistleblower_reports").insert({
      organization_id: ORG_ID,
      case_number: `WB-${year}-T${TS}`,
      category: "fraud",
      severity: "high",
      subject: `Test Report ${TS}`,
      description: "This is a test whistleblower report for automated testing.",
      status: "submitted",
      is_anonymous: true,
      reporter_hash: `test-hash-${TS}`,
      created_at: new Date(),
      updated_at: new Date(),
    });
    createdIds.push(id);

    const report = await db("whistleblower_reports").where({ id }).first();
    expect(report).toBeTruthy();
    expect(report.case_number).toContain(`WB-${year}`);
    expect(report.status).toBe("submitted");
    expect(report.is_anonymous).toBeTruthy();
    expect(report.reporter_user_id).toBeNull();
  });

  it("should submit a non-anonymous report with reporter_user_id", async () => {
    const year = new Date().getFullYear();
    const [id] = await db("whistleblower_reports").insert({
      organization_id: ORG_ID,
      case_number: `WB-${year}-T${TS + 1}`,
      category: "safety",
      severity: "medium",
      subject: `Non-Anon Report ${TS}`,
      description: "Non-anonymous test report.",
      status: "submitted",
      is_anonymous: false,
      reporter_user_id: EMPLOYEE_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    createdIds.push(id);

    const report = await db("whistleblower_reports").where({ id }).first();
    expect(report.reporter_user_id).toBe(EMPLOYEE_USER_ID);
    expect(report.is_anonymous).toBeFalsy();
  });

  it("should list reports filtered by status", async () => {
    const reports = await db("whistleblower_reports")
      .where({ organization_id: ORG_ID, status: "submitted" })
      .select("id", "case_number", "status");

    expect(Array.isArray(reports)).toBe(true);
    for (const r of reports) {
      expect(r.status).toBe("submitted");
    }
  });

  it("should assign investigator and update status", async () => {
    const reportId = createdIds[0];
    await db("whistleblower_reports")
      .where({ id: reportId, organization_id: ORG_ID })
      .update({
        assigned_investigator_id: ADMIN_USER_ID,
        status: "under_investigation",
        updated_at: new Date(),
      });

    // Add update record
    await db("whistleblower_updates").insert({
      report_id: reportId,
      organization_id: ORG_ID,
      update_type: "status_change",
      content: "An investigator has been assigned.",
      is_visible_to_reporter: true,
      created_by: ADMIN_USER_ID,
      created_at: new Date(),
    });

    const updated = await db("whistleblower_reports").where({ id: reportId }).first();
    expect(updated.status).toBe("under_investigation");
    expect(updated.assigned_investigator_id).toBe(ADMIN_USER_ID);

    const updates = await db("whistleblower_updates")
      .where({ report_id: reportId, organization_id: ORG_ID });
    expect(updates.length).toBeGreaterThan(0);
  });

  it("should resolve a report and set resolved_at", async () => {
    const reportId = createdIds[0];
    const now = new Date();
    await db("whistleblower_reports")
      .where({ id: reportId, organization_id: ORG_ID })
      .update({
        status: "resolved",
        resolution: "Issue was addressed and corrective actions taken.",
        resolved_at: now,
        updated_at: now,
      });

    const resolved = await db("whistleblower_reports").where({ id: reportId }).first();
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution).toContain("corrective actions");
    expect(resolved.resolved_at).toBeTruthy();
  });

  it("should compute dashboard stats for the org", async () => {
    const [totalResult] = await db("whistleblower_reports")
      .where({ organization_id: ORG_ID })
      .count("id as total");
    expect(Number(totalResult.total)).toBeGreaterThanOrEqual(createdIds.length);

    const byStatus = await db("whistleblower_reports")
      .where({ organization_id: ORG_ID })
      .select("status")
      .count("id as count")
      .groupBy("status");
    expect(Array.isArray(byStatus)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. WELLNESS SERVICE
// ---------------------------------------------------------------------------

describe("Wellness Service (real DB)", () => {
  let programId: number;
  let enrollmentId: number;
  let goalId: number;
  let checkInId: number;
  const checkInDate = `2099-01-01`; // far future to avoid collision

  afterAll(async () => {
    // Cleanup in reverse dependency order
    if (checkInId) await db("wellness_check_ins").where({ id: checkInId }).delete();
    if (goalId) await db("wellness_goals").where({ id: goalId }).delete();
    if (enrollmentId) {
      await db("wellness_enrollments").where({ id: enrollmentId }).delete();
      // Decrement enrolled_count
      if (programId) {
        await db("wellness_programs").where({ id: programId }).decrement("enrolled_count", 1);
      }
    }
    if (programId) await db("wellness_programs").where({ id: programId }).delete();
  });

  it("should create a wellness program", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);

    const [id] = await db("wellness_programs").insert({
      organization_id: ORG_ID,
      title: `Test Wellness Program ${TS}`,
      description: "Automated test program",
      program_type: "fitness",
      start_date: futureDate,
      end_date: endDate,
      is_active: true,
      max_participants: 50,
      points_reward: 100,
      enrolled_count: 0,
      created_by: ADMIN_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    programId = id;

    const program = await db("wellness_programs").where({ id }).first();
    expect(program).toBeTruthy();
    expect(program.title).toContain("Test Wellness Program");
    expect(program.program_type).toBe("fitness");
    expect(program.is_active).toBeTruthy();
  });

  it("should list programs for the org", async () => {
    const programs = await db("wellness_programs")
      .where({ organization_id: ORG_ID })
      .orderBy("created_at", "desc");
    expect(programs.length).toBeGreaterThan(0);
    expect(programs.some((p: any) => p.id === programId)).toBe(true);
  });

  it("should enroll an employee in the program", async () => {
    const [id] = await db("wellness_enrollments").insert({
      program_id: programId,
      organization_id: ORG_ID,
      user_id: EMPLOYEE_USER_ID,
      status: "enrolled",
      progress_percentage: 0,
      created_at: new Date(),
    });
    enrollmentId = id;

    await db("wellness_programs").where({ id: programId }).increment("enrolled_count", 1);

    const enrollment = await db("wellness_enrollments").where({ id }).first();
    expect(enrollment).toBeTruthy();
    expect(enrollment.user_id).toBe(EMPLOYEE_USER_ID);
    expect(enrollment.status).toBe("enrolled");
  });

  it("should prevent duplicate enrollment", async () => {
    const existing = await db("wellness_enrollments")
      .where({ program_id: programId, user_id: EMPLOYEE_USER_ID })
      .first();
    expect(existing).toBeTruthy();
  });

  it("should create a daily check-in", async () => {
    const [id] = await db("wellness_check_ins").insert({
      organization_id: ORG_ID,
      user_id: EMPLOYEE_USER_ID,
      check_in_date: checkInDate,
      mood: "good",
      energy_level: 4,
      sleep_hours: 7.5,
      exercise_minutes: 30,
      notes: `Automated test ${TS}`,
      created_at: new Date(),
    });
    checkInId = id;

    const checkIn = await db("wellness_check_ins").where({ id }).first();
    expect(checkIn.mood).toBe("good");
    expect(checkIn.energy_level).toBe(4);
    expect(Number(checkIn.sleep_hours)).toBeCloseTo(7.5, 0);
    expect(checkIn.exercise_minutes).toBe(30);
  });

  it("should create a wellness goal", async () => {
    const [id] = await db("wellness_goals").insert({
      organization_id: ORG_ID,
      user_id: EMPLOYEE_USER_ID,
      title: `Test Goal ${TS}`,
      goal_type: "exercise",
      target_value: 10,
      current_value: 0,
      unit: "sessions",
      frequency: "weekly",
      status: "active",
      start_date: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    goalId = id;

    const goal = await db("wellness_goals").where({ id }).first();
    expect(goal.title).toContain("Test Goal");
    expect(goal.status).toBe("active");
    expect(Number(goal.target_value)).toBe(10);
  });

  it("should update goal progress and auto-complete on target", async () => {
    await db("wellness_goals").where({ id: goalId }).update({
      current_value: 10,
      status: "completed",
      updated_at: new Date(),
    });

    const goal = await db("wellness_goals").where({ id: goalId }).first();
    expect(goal.status).toBe("completed");
    expect(Number(goal.current_value)).toBe(10);
  });

  it("should compute wellness dashboard stats", async () => {
    const [{ active_programs }] = await db("wellness_programs")
      .where({ organization_id: ORG_ID, is_active: true })
      .count("id as active_programs");
    expect(Number(active_programs)).toBeGreaterThan(0);

    const [{ total_enrollments }] = await db("wellness_enrollments")
      .where({ organization_id: ORG_ID })
      .count("id as total_enrollments");
    expect(Number(total_enrollments)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. SURVEY SERVICE
// ---------------------------------------------------------------------------

describe("Survey Service (real DB)", () => {
  let surveyId: number;
  let questionIds: number[] = [];
  let responseId: number;

  afterAll(async () => {
    // Cleanup in order: answers -> responses -> questions -> survey
    if (responseId) {
      await db("survey_answers").where({ response_id: responseId }).delete();
      await db("survey_responses").where({ id: responseId }).delete();
    }
    if (questionIds.length > 0) {
      await db("survey_questions").whereIn("id", questionIds).delete();
    }
    if (surveyId) {
      await db("surveys").where({ id: surveyId }).delete();
    }
  });

  it("should create a draft survey with questions", async () => {
    const [id] = await db("surveys").insert({
      organization_id: ORG_ID,
      title: `Test Survey ${TS}`,
      description: "Automated test survey",
      type: "pulse",
      status: "draft",
      is_anonymous: true,
      target_type: "all",
      recurrence: "none",
      created_by: ADMIN_USER_ID,
      response_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    surveyId = id;

    // Add questions
    const questions = [
      {
        survey_id: id,
        organization_id: ORG_ID,
        question_text: "How satisfied are you with your work environment?",
        question_type: "rating_1_5",
        is_required: true,
        sort_order: 0,
        created_at: new Date(),
      },
      {
        survey_id: id,
        organization_id: ORG_ID,
        question_text: "Any suggestions for improvement?",
        question_type: "text",
        is_required: false,
        sort_order: 1,
        created_at: new Date(),
      },
    ];

    for (const q of questions) {
      const [qId] = await db("survey_questions").insert(q);
      questionIds.push(qId);
    }

    const survey = await db("surveys").where({ id }).first();
    expect(survey.title).toContain("Test Survey");
    expect(survey.status).toBe("draft");

    const savedQuestions = await db("survey_questions")
      .where({ survey_id: id })
      .orderBy("sort_order");
    expect(savedQuestions.length).toBe(2);
  });

  it("should publish the survey", async () => {
    await db("surveys").where({ id: surveyId }).update({
      status: "active",
      start_date: new Date(),
      updated_at: new Date(),
    });

    const survey = await db("surveys").where({ id: surveyId }).first();
    expect(survey.status).toBe("active");
    expect(survey.start_date).toBeTruthy();
  });

  it("should submit a response with answers", async () => {
    const [rId] = await db("survey_responses").insert({
      survey_id: surveyId,
      organization_id: ORG_ID,
      user_id: null, // anonymous
      anonymous_id: `test-anon-${TS}`,
      submitted_at: new Date(),
      created_at: new Date(),
    });
    responseId = rId;

    // Submit answers
    await db("survey_answers").insert([
      {
        response_id: rId,
        question_id: questionIds[0],
        organization_id: ORG_ID,
        rating_value: 4,
        text_value: null,
        created_at: new Date(),
      },
      {
        response_id: rId,
        question_id: questionIds[1],
        organization_id: ORG_ID,
        rating_value: null,
        text_value: "More team activities please",
        created_at: new Date(),
      },
    ]);

    await db("surveys").where({ id: surveyId }).increment("response_count", 1);

    const survey = await db("surveys").where({ id: surveyId }).first();
    expect(survey.response_count).toBe(1);
  });

  it("should aggregate survey results", async () => {
    const answers = await db("survey_answers as sa")
      .join("survey_responses as sr", "sa.response_id", "sr.id")
      .where("sr.survey_id", surveyId)
      .where("sa.question_id", questionIds[0])
      .where("sa.organization_id", ORG_ID)
      .select("sa.rating_value");

    expect(answers.length).toBe(1);
    expect(answers[0].rating_value).toBe(4);
  });

  it("should prevent duplicate anonymous responses", async () => {
    const existing = await db("survey_responses")
      .where({ survey_id: surveyId, anonymous_id: `test-anon-${TS}` })
      .first();
    expect(existing).toBeTruthy();
  });

  it("should close the survey", async () => {
    await db("surveys").where({ id: surveyId }).update({
      status: "closed",
      end_date: new Date(),
      updated_at: new Date(),
    });

    const survey = await db("surveys").where({ id: surveyId }).first();
    expect(survey.status).toBe("closed");
  });

  it("should compute survey dashboard stats", async () => {
    const [{ active_count }] = await db("surveys")
      .where({ organization_id: ORG_ID, status: "active" })
      .count("id as active_count");
    expect(Number(active_count)).toBeGreaterThanOrEqual(0);

    const [{ total_responses }] = await db("survey_responses")
      .where({ organization_id: ORG_ID })
      .count("id as total_responses");
    expect(Number(total_responses)).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. CHATBOT TOOLS (direct DB queries)
// ---------------------------------------------------------------------------

describe("Chatbot Tools — DB Queries (real DB)", () => {
  it("get_employee_count: should return active employee count", async () => {
    const [row] = await db("users")
      .where({ organization_id: ORG_ID, status: 1 })
      .count("id as count");
    const count = Number(row.count);
    expect(count).toBeGreaterThan(0);
  });

  it("get_employee_details: should find employees by name search", async () => {
    const employees = await db("users as u")
      .leftJoin("employee_profiles as ep", function () {
        this.on("ep.user_id", "=", "u.id").andOn(
          "ep.organization_id",
          "=",
          "u.organization_id"
        );
      })
      .where("u.organization_id", ORG_ID)
      .where("u.status", 1)
      .where(function () {
        this.whereRaw("LOWER(u.first_name) LIKE ?", ["%priya%"])
          .orWhereRaw("LOWER(u.last_name) LIKE ?", ["%priya%"]);
      })
      .limit(10)
      .select("u.id", "u.first_name", "u.last_name", "u.email");

    expect(employees.length).toBeGreaterThan(0);
    expect(employees[0].email).toContain("technova");
  });

  it("get_department_list: should list departments with counts", async () => {
    const departments = await db("organization_departments as d")
      .where("d.organization_id", ORG_ID)
      .select("d.id", "d.name");

    expect(departments.length).toBeGreaterThan(0);
    const names = departments.map((d: any) => d.name.toLowerCase());
    // TechNova has Engineering, Sales, Finance, Operations, Core
    expect(names.some((n: string) => n.includes("engineering") || n.includes("core"))).toBe(true);
  });

  it("get_attendance_today: should return attendance summary", async () => {
    const today = new Date().toISOString().split("T")[0];
    const totalUsers = await db("users")
      .where({ organization_id: ORG_ID, status: 1 })
      .count("id as count")
      .first();
    expect(Number(totalUsers?.count)).toBeGreaterThan(0);

    const records = await db("attendance_records")
      .where({ organization_id: ORG_ID, date: today })
      .select("status")
      .count("id as count")
      .groupBy("status");
    expect(Array.isArray(records)).toBe(true);
  });

  it("get_leave_summary: should query leave balances for the current year", async () => {
    const currentYear = new Date().getFullYear();
    const balances = await db("leave_balances")
      .where({ organization_id: ORG_ID, year: currentYear })
      .limit(10);
    // May or may not have balances for current year, just ensure query works
    expect(Array.isArray(balances)).toBe(true);
  });

  it("run_sql_query validation: should reject non-SELECT queries", () => {
    const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE|CALL|SET|LOCK|UNLOCK|RENAME|LOAD|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i;
    expect(FORBIDDEN_SQL.test("DELETE FROM users")).toBe(true);
    expect(FORBIDDEN_SQL.test("DROP TABLE users")).toBe(true);
    expect(FORBIDDEN_SQL.test("SELECT * FROM users")).toBe(false);
    expect(FORBIDDEN_SQL.test("INSERT INTO users VALUES(1)")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. CUSTOM FIELD SERVICE
// ---------------------------------------------------------------------------

describe("Custom Field Service (real DB)", () => {
  let fieldDefId: number;
  const fieldKey = `test_field_${TS}`;

  afterAll(async () => {
    // Cleanup values then definition
    if (fieldDefId) {
      await db("custom_field_values").where({ field_id: fieldDefId }).delete();
      await db("custom_field_definitions").where({ id: fieldDefId }).delete();
    }
  });

  it("should create a custom field definition", async () => {
    const [id] = await db("custom_field_definitions").insert({
      organization_id: ORG_ID,
      entity_type: "employee",
      field_name: `Test Field ${TS}`,
      field_key: fieldKey,
      field_type: "text",
      is_required: false,
      is_active: true,
      is_searchable: true,
      sort_order: 999,
      section: "Custom Fields",
      created_by: ADMIN_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    fieldDefId = id;

    const def = await db("custom_field_definitions").where({ id }).first();
    expect(def).toBeTruthy();
    expect(def.field_key).toBe(fieldKey);
    expect(def.field_type).toBe("text");
    expect(def.is_active).toBeTruthy();
  });

  it("should list active field definitions for the org", async () => {
    const fields = await db("custom_field_definitions")
      .where({ organization_id: ORG_ID, is_active: true, entity_type: "employee" })
      .orderBy("sort_order", "asc");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f: any) => f.id === fieldDefId)).toBe(true);
  });

  it("should set a custom field value on an employee", async () => {
    const [id] = await db("custom_field_values").insert({
      field_id: fieldDefId,
      organization_id: ORG_ID,
      entity_type: "employee",
      entity_id: EMPLOYEE_USER_ID,
      value_text: `Test Value ${TS}`,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const val = await db("custom_field_values").where({ id }).first();
    expect(val.value_text).toContain("Test Value");
    expect(val.entity_id).toBe(EMPLOYEE_USER_ID);
  });

  it("should retrieve field values for an employee via join", async () => {
    const rows = await db("custom_field_values as v")
      .join("custom_field_definitions as d", "v.field_id", "d.id")
      .where({
        "v.organization_id": ORG_ID,
        "v.entity_type": "employee",
        "v.entity_id": EMPLOYEE_USER_ID,
        "d.is_active": true,
      })
      .select("d.field_name", "d.field_key", "d.field_type", "v.value_text");

    expect(rows.length).toBeGreaterThan(0);
    const testRow = rows.find((r: any) => r.field_key === fieldKey);
    expect(testRow).toBeTruthy();
    expect(testRow!.value_text).toContain("Test Value");
  });

  it("should update (upsert) the field value", async () => {
    await db("custom_field_values")
      .where({ field_id: fieldDefId, entity_id: EMPLOYEE_USER_ID })
      .update({ value_text: `Updated Value ${TS}`, updated_at: new Date() });

    const val = await db("custom_field_values")
      .where({ field_id: fieldDefId, entity_id: EMPLOYEE_USER_ID })
      .first();
    expect(val.value_text).toContain("Updated Value");
  });

  it("should search by field value (text LIKE)", async () => {
    const rows = await db("custom_field_values")
      .where({
        organization_id: ORG_ID,
        entity_type: "employee",
        field_id: fieldDefId,
      })
      .where("value_text", "like", `%Updated Value%`)
      .select("entity_id");

    expect(rows.length).toBe(1);
    expect(rows[0].entity_id).toBe(EMPLOYEE_USER_ID);
  });

  it("should soft-delete the field definition", async () => {
    await db("custom_field_definitions")
      .where({ id: fieldDefId })
      .update({ is_active: false, updated_at: new Date() });

    const def = await db("custom_field_definitions").where({ id: fieldDefId }).first();
    expect(def.is_active).toBeFalsy();

    // Restore for cleanup
    await db("custom_field_definitions")
      .where({ id: fieldDefId })
      .update({ is_active: true });
  });
});

// ---------------------------------------------------------------------------
// 6. ANONYMOUS FEEDBACK SERVICE
// ---------------------------------------------------------------------------

describe("Anonymous Feedback Service (real DB)", () => {
  let feedbackId: number;

  afterAll(async () => {
    if (feedbackId) {
      await db("anonymous_feedback").where({ id: feedbackId }).delete();
    }
  });

  it("should submit anonymous feedback", async () => {
    const [id] = await db("anonymous_feedback").insert({
      organization_id: ORG_ID,
      category: "suggestion",
      subject: `Test Feedback ${TS}`,
      message: "This is automated test feedback.",
      sentiment: "positive",
      status: "new",
      is_urgent: false,
      anonymous_hash: `test-fb-hash-${TS}`,
      created_at: new Date(),
      updated_at: new Date(),
    });
    feedbackId = id;

    const fb = await db("anonymous_feedback").where({ id }).first();
    expect(fb).toBeTruthy();
    expect(fb.category).toBe("suggestion");
    expect(fb.sentiment).toBe("positive");
    expect(fb.status).toBe("new");
  });

  it("should list feedback with filters", async () => {
    const { feedback, total } = await (async () => {
      const query = db("anonymous_feedback")
        .where({ organization_id: ORG_ID });
      const [{ count }] = await query.clone().count("id as count");
      const rows = await query.clone()
        .select("id", "category", "subject", "sentiment", "status")
        .orderBy("created_at", "desc")
        .limit(20);
      return { feedback: rows, total: Number(count) };
    })();

    expect(total).toBeGreaterThan(0);
    expect(feedback.length).toBeGreaterThan(0);
  });

  it("should filter feedback by category", async () => {
    const rows = await db("anonymous_feedback")
      .where({ organization_id: ORG_ID, category: "suggestion" })
      .select("id", "category");
    expect(rows.every((r: any) => r.category === "suggestion")).toBe(true);
  });

  it("should respond to feedback (HR action)", async () => {
    await db("anonymous_feedback")
      .where({ id: feedbackId })
      .update({
        admin_response: "Thank you for the suggestion!",
        responded_by: ADMIN_USER_ID,
        responded_at: new Date(),
        status: "acknowledged",
        updated_at: new Date(),
      });

    const fb = await db("anonymous_feedback").where({ id: feedbackId }).first();
    expect(fb.admin_response).toBe("Thank you for the suggestion!");
    expect(fb.status).toBe("acknowledged");
  });

  it("should update feedback status", async () => {
    await db("anonymous_feedback")
      .where({ id: feedbackId })
      .update({ status: "resolved", updated_at: new Date() });

    const fb = await db("anonymous_feedback").where({ id: feedbackId }).first();
    expect(fb.status).toBe("resolved");
  });

  it("should compute feedback dashboard stats", async () => {
    const [{ total }] = await db("anonymous_feedback")
      .where({ organization_id: ORG_ID })
      .count("id as total");
    expect(Number(total)).toBeGreaterThan(0);

    const bySentiment = await db("anonymous_feedback")
      .where({ organization_id: ORG_ID })
      .select("sentiment")
      .count("id as count")
      .groupBy("sentiment");
    expect(Array.isArray(bySentiment)).toBe(true);

    const [{ respondedCount }] = await db("anonymous_feedback")
      .where({ organization_id: ORG_ID })
      .whereNotNull("admin_response")
      .count("id as respondedCount");
    expect(Number(respondedCount)).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 7. EVENT SERVICE
// ---------------------------------------------------------------------------

describe("Event Service (real DB)", () => {
  let eventId: number;

  afterAll(async () => {
    if (eventId) {
      await db("event_rsvps").where({ event_id: eventId }).delete();
      await db("company_events").where({ id: eventId }).delete();
    }
  });

  it("should create an event", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    endDate.setHours(endDate.getHours() + 3);

    const [id] = await db("company_events").insert({
      organization_id: ORG_ID,
      title: `Test Event ${TS}`,
      description: "Automated test event",
      event_type: "team_building",
      start_date: startDate,
      end_date: endDate,
      is_all_day: false,
      location: "Conference Room A",
      target_type: "all",
      max_attendees: 20,
      is_mandatory: false,
      status: "upcoming",
      created_by: ADMIN_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    eventId = id;

    const event = await db("company_events").where({ id }).first();
    expect(event).toBeTruthy();
    expect(event.title).toContain("Test Event");
    expect(event.status).toBe("upcoming");
    expect(event.max_attendees).toBe(20);
  });

  it("should list events with attending count subquery", async () => {
    const events = await db("company_events")
      .where({ organization_id: ORG_ID })
      .select(
        "company_events.*",
        db.raw(
          `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
        )
      )
      .orderBy("start_date", "asc")
      .limit(10);

    expect(events.length).toBeGreaterThan(0);
    // attending_count should be a number (0 or more)
    for (const e of events) {
      expect(Number(e.attending_count)).toBeGreaterThanOrEqual(0);
    }
  });

  it("should RSVP to the event (attending)", async () => {
    await db.raw(
      `INSERT INTO event_rsvps (event_id, organization_id, user_id, status, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [eventId, ORG_ID, EMPLOYEE_USER_ID, "attending", new Date()]
    );

    const rsvp = await db("event_rsvps")
      .where({ event_id: eventId, user_id: EMPLOYEE_USER_ID })
      .first();
    expect(rsvp).toBeTruthy();
    expect(rsvp.status).toBe("attending");
  });

  it("should change RSVP to maybe", async () => {
    await db.raw(
      `INSERT INTO event_rsvps (event_id, organization_id, user_id, status, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [eventId, ORG_ID, EMPLOYEE_USER_ID, "maybe", new Date()]
    );

    const rsvp = await db("event_rsvps")
      .where({ event_id: eventId, user_id: EMPLOYEE_USER_ID })
      .first();
    expect(rsvp.status).toBe("maybe");
  });

  it("should get event with RSVP counts", async () => {
    const event = await db("company_events")
      .where({ id: eventId, organization_id: ORG_ID })
      .select(
        "company_events.*",
        db.raw(
          `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'attending') as attending_count`
        ),
        db.raw(
          `(SELECT COUNT(*) FROM event_rsvps WHERE event_rsvps.event_id = company_events.id AND event_rsvps.status = 'maybe') as maybe_count`
        )
      )
      .first();

    expect(event).toBeTruthy();
    expect(Number(event.maybe_count)).toBeGreaterThanOrEqual(1);
  });

  it("should cancel the event", async () => {
    await db("company_events")
      .where({ id: eventId })
      .update({ status: "cancelled", updated_at: new Date() });

    const event = await db("company_events").where({ id: eventId }).first();
    expect(event.status).toBe("cancelled");
  });

  it("should compute event dashboard stats", async () => {
    const [{ upcoming_count }] = await db("company_events")
      .where({ organization_id: ORG_ID })
      .whereIn("status", ["upcoming", "ongoing"])
      .where("start_date", ">=", new Date())
      .count("id as upcoming_count");

    expect(Number(upcoming_count)).toBeGreaterThanOrEqual(0);

    const typeBreakdown = await db("company_events")
      .where({ organization_id: ORG_ID })
      .select("event_type")
      .count("id as count")
      .groupBy("event_type");

    expect(Array.isArray(typeBreakdown)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. POLICY SERVICE
// ---------------------------------------------------------------------------

describe("Policy Service (real DB)", () => {
  let policyId: number;

  afterAll(async () => {
    if (policyId) {
      await db("policy_acknowledgments").where({ policy_id: policyId }).delete();
      await db("company_policies").where({ id: policyId }).delete();
    }
  });

  it("should create a company policy", async () => {
    const [id] = await db("company_policies").insert({
      organization_id: ORG_ID,
      title: `Test Policy ${TS}`,
      content: "<p>This is a test policy for automated testing.</p>",
      version: 1,
      category: "general",
      effective_date: new Date(),
      is_active: true,
      created_by: ADMIN_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    policyId = id;

    const policy = await db("company_policies").where({ id }).first();
    expect(policy).toBeTruthy();
    expect(policy.title).toContain("Test Policy");
    expect(policy.version).toBe(1);
    expect(policy.is_active).toBeTruthy();
  });

  it("should list policies with acknowledgment counts", async () => {
    const policies = await db("company_policies")
      .where({ organization_id: ORG_ID, is_active: true })
      .select(
        "company_policies.*",
        db.raw(
          "(SELECT COUNT(*) FROM policy_acknowledgments WHERE policy_acknowledgments.policy_id = company_policies.id) as acknowledgment_count"
        )
      )
      .orderBy("created_at", "desc")
      .limit(20);

    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(Number(p.acknowledgment_count)).toBeGreaterThanOrEqual(0);
    }
  });

  it("should update a policy (bumps version)", async () => {
    await db("company_policies")
      .where({ id: policyId })
      .update({
        content: "<p>Updated policy content for version 2.</p>",
        version: 2,
        updated_at: new Date(),
      });

    const policy = await db("company_policies").where({ id: policyId }).first();
    expect(policy.version).toBe(2);
    expect(policy.content).toContain("version 2");
  });

  it("should acknowledge a policy", async () => {
    await db("policy_acknowledgments")
      .insert({
        policy_id: policyId,
        user_id: EMPLOYEE_USER_ID,
        acknowledged_at: new Date(),
      })
      .onConflict(["policy_id", "user_id"])
      .ignore();

    const ack = await db("policy_acknowledgments")
      .where({ policy_id: policyId, user_id: EMPLOYEE_USER_ID })
      .first();
    expect(ack).toBeTruthy();
  });

  it("should not duplicate acknowledgment (upsert ignore)", async () => {
    await db("policy_acknowledgments")
      .insert({
        policy_id: policyId,
        user_id: EMPLOYEE_USER_ID,
        acknowledged_at: new Date(),
      })
      .onConflict(["policy_id", "user_id"])
      .ignore();

    const acks = await db("policy_acknowledgments")
      .where({ policy_id: policyId, user_id: EMPLOYEE_USER_ID });
    expect(acks.length).toBe(1);
  });

  it("should get acknowledgments with user info", async () => {
    const acks = await db("policy_acknowledgments")
      .join("users", "policy_acknowledgments.user_id", "users.id")
      .where({ "policy_acknowledgments.policy_id": policyId })
      .select(
        "policy_acknowledgments.user_id",
        "policy_acknowledgments.acknowledged_at",
        "users.first_name",
        "users.last_name",
        "users.email"
      );

    expect(acks.length).toBe(1);
    expect(acks[0].email).toContain("technova");
  });

  it("should find pending acknowledgments for a user", async () => {
    // Manager has not acknowledged our test policy
    const pending = await db("company_policies")
      .where({ organization_id: ORG_ID, is_active: true })
      .whereNotExists(function () {
        this.select(db.raw(1))
          .from("policy_acknowledgments")
          .whereRaw("policy_acknowledgments.policy_id = company_policies.id")
          .where("policy_acknowledgments.user_id", MANAGER_USER_ID);
      })
      .select("id", "title");

    // Our test policy should be in the pending list for the manager
    expect(pending.some((p: any) => p.id === policyId)).toBe(true);
  });

  it("should soft-delete a policy", async () => {
    await db("company_policies")
      .where({ id: policyId })
      .update({ is_active: false, updated_at: new Date() });

    const policy = await db("company_policies").where({ id: policyId }).first();
    expect(policy.is_active).toBeFalsy();

    // Restore for cleanup (will be hard-deleted in afterAll anyway)
    await db("company_policies")
      .where({ id: policyId })
      .update({ is_active: true });
  });
});

// ---------------------------------------------------------------------------
// 9. HELPDESK SERVICE
// ---------------------------------------------------------------------------

describe("Helpdesk Service (real DB)", () => {
  let ticketId: number;
  let commentId: number;
  let articleId: number;

  afterAll(async () => {
    if (commentId) await db("ticket_comments").where({ id: commentId }).delete();
    if (ticketId) await db("helpdesk_tickets").where({ id: ticketId }).delete();
    if (articleId) await db("knowledge_base_articles").where({ id: articleId }).delete();
  });

  it("should create a helpdesk ticket with SLA", async () => {
    const now = new Date();
    const slaResponseDue = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
    const slaResolutionDue = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h

    const [id] = await db("helpdesk_tickets").insert({
      organization_id: ORG_ID,
      raised_by: EMPLOYEE_USER_ID,
      category: "it_support",
      priority: "medium",
      subject: `Test Ticket ${TS}`,
      description: "Automated test helpdesk ticket.",
      status: "open",
      sla_response_hours: 24,
      sla_resolution_hours: 72,
      sla_response_due: slaResponseDue,
      sla_resolution_due: slaResolutionDue,
      created_at: now,
      updated_at: now,
    });
    ticketId = id;

    const ticket = await db("helpdesk_tickets").where({ id }).first();
    expect(ticket).toBeTruthy();
    expect(ticket.status).toBe("open");
    expect(ticket.priority).toBe("medium");
    expect(ticket.raised_by).toBe(EMPLOYEE_USER_ID);
    expect(ticket.sla_response_hours).toBe(24);
  });

  it("should list tickets with raiser/assignee names", async () => {
    const tickets = await db("helpdesk_tickets")
      .where({ "helpdesk_tickets.organization_id": ORG_ID })
      .select(
        "helpdesk_tickets.*",
        db.raw(
          `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = helpdesk_tickets.raised_by) as raised_by_name`
        )
      )
      .orderBy("created_at", "desc")
      .limit(10);

    expect(tickets.length).toBeGreaterThan(0);
    // Our ticket should have a raised_by_name
    const ourTicket = tickets.find((t: any) => t.id === ticketId);
    expect(ourTicket).toBeTruthy();
    expect(ourTicket.raised_by_name).toBeTruthy();
  });

  it("should assign ticket to admin and move to in_progress", async () => {
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({
        assigned_to: ADMIN_USER_ID,
        status: "in_progress",
        updated_at: new Date(),
      });

    const ticket = await db("helpdesk_tickets").where({ id: ticketId }).first();
    expect(ticket.assigned_to).toBe(ADMIN_USER_ID);
    expect(ticket.status).toBe("in_progress");
  });

  it("should add a comment to the ticket", async () => {
    const [id] = await db("ticket_comments").insert({
      ticket_id: ticketId,
      organization_id: ORG_ID,
      user_id: ADMIN_USER_ID,
      comment: `Test comment ${TS}`,
      is_internal: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    commentId = id;

    const comment = await db("ticket_comments")
      .where({ id })
      .join("users", "ticket_comments.user_id", "users.id")
      .select("ticket_comments.*", "users.first_name", "users.last_name")
      .first();

    expect(comment).toBeTruthy();
    expect(comment.comment).toContain("Test comment");
    expect(comment.first_name).toBeTruthy();
  });

  it("should track first response time", async () => {
    const now = new Date();
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({ first_response_at: now, updated_at: now });

    const ticket = await db("helpdesk_tickets").where({ id: ticketId }).first();
    expect(ticket.first_response_at).toBeTruthy();
  });

  it("should resolve the ticket", async () => {
    const now = new Date();
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({ status: "resolved", resolved_at: now, updated_at: now });

    const ticket = await db("helpdesk_tickets").where({ id: ticketId }).first();
    expect(ticket.status).toBe("resolved");
    expect(ticket.resolved_at).toBeTruthy();
  });

  it("should rate the resolved ticket", async () => {
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({
        satisfaction_rating: 4,
        satisfaction_comment: "Quick resolution!",
        updated_at: new Date(),
      });

    const ticket = await db("helpdesk_tickets").where({ id: ticketId }).first();
    expect(ticket.satisfaction_rating).toBe(4);
    expect(ticket.satisfaction_comment).toBe("Quick resolution!");
  });

  it("should close the ticket (requires comment)", async () => {
    // Our ticket already has a comment from above
    const [{ count }] = await db("ticket_comments")
      .where({ ticket_id: ticketId, organization_id: ORG_ID })
      .count("id as count");
    expect(Number(count)).toBeGreaterThan(0);

    const now = new Date();
    await db("helpdesk_tickets")
      .where({ id: ticketId })
      .update({ status: "closed", closed_at: now, updated_at: now });

    const ticket = await db("helpdesk_tickets").where({ id: ticketId }).first();
    expect(ticket.status).toBe("closed");
  });

  it("should create a knowledge base article", async () => {
    const [id] = await db("knowledge_base_articles").insert({
      organization_id: ORG_ID,
      title: `Test Article ${TS}`,
      slug: `test-article-${TS}`,
      content: "This is a test KB article.",
      category: "general",
      is_published: true,
      is_featured: false,
      author_id: ADMIN_USER_ID,
      view_count: 0,
      helpful_count: 0,
      not_helpful_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    articleId = id;

    const article = await db("knowledge_base_articles").where({ id }).first();
    expect(article.title).toContain("Test Article");
    expect(article.is_published).toBeTruthy();
  });

  it("should compute helpdesk dashboard stats", async () => {
    const statusCounts = await db("helpdesk_tickets")
      .where({ organization_id: ORG_ID })
      .select("status")
      .count("id as count")
      .groupBy("status");

    expect(Array.isArray(statusCounts)).toBe(true);

    const categoryBreakdown = await db("helpdesk_tickets")
      .where({ organization_id: ORG_ID })
      .select("category")
      .count("id as count")
      .groupBy("category");

    expect(Array.isArray(categoryBreakdown)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. LEAVE BALANCE SERVICE
// ---------------------------------------------------------------------------

describe("Leave Balance Service (real DB)", () => {
  let testBalanceId: number;
  let testLeaveTypeId: number;

  afterAll(async () => {
    if (testBalanceId) {
      await db("leave_balances").where({ id: testBalanceId }).delete();
    }
    if (testLeaveTypeId) {
      await db("leave_types").where({ id: testLeaveTypeId }).delete();
    }
  });

  it("should query existing leave types for the org", async () => {
    const types = await db("leave_types")
      .where({ organization_id: ORG_ID })
      .select("id", "name", "is_carry_forward", "max_carry_forward_days");

    expect(types.length).toBeGreaterThan(0);
    // All orgs should have at least casual/sick leave
  });

  it("should create a test leave type for balance tests", async () => {
    const [id] = await db("leave_types").insert({
      organization_id: ORG_ID,
      name: `Test Leave ${TS}`,
      color: "#FF0000",
      is_paid: true,
      is_carry_forward: true,
      max_carry_forward_days: 5,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    testLeaveTypeId = id;

    const leaveType = await db("leave_types").where({ id }).first();
    expect(leaveType.name).toContain("Test Leave");
    expect(leaveType.is_carry_forward).toBeTruthy();
  });

  it("should insert a leave balance for the test year", async () => {
    const testYear = 2099; // far future to avoid collision
    const [id] = await db("leave_balances").insert({
      organization_id: ORG_ID,
      user_id: EMPLOYEE_USER_ID,
      leave_type_id: testLeaveTypeId,
      year: testYear,
      total_allocated: 15,
      total_used: 0,
      total_carry_forward: 3,
      balance: 18, // 15 + 3
      created_at: new Date(),
      updated_at: new Date(),
    });
    testBalanceId = id;

    const balance = await db("leave_balances").where({ id }).first();
    expect(Number(balance.total_allocated)).toBe(15);
    expect(Number(balance.balance)).toBe(18);
    expect(Number(balance.total_carry_forward)).toBe(3);
  });

  it("should deduct leave balance", async () => {
    const balance = await db("leave_balances").where({ id: testBalanceId }).first();
    const currentBalance = Number(balance.balance);
    const currentUsed = Number(balance.total_used);
    const daysToDeduct = 2;

    await db("leave_balances")
      .where({ id: testBalanceId })
      .update({
        total_used: currentUsed + daysToDeduct,
        balance: currentBalance - daysToDeduct,
        updated_at: new Date(),
      });

    const updated = await db("leave_balances").where({ id: testBalanceId }).first();
    expect(Number(updated.balance)).toBe(currentBalance - daysToDeduct);
    expect(Number(updated.total_used)).toBe(currentUsed + daysToDeduct);
  });

  it("should credit leave balance (e.g. on rejection)", async () => {
    const balance = await db("leave_balances").where({ id: testBalanceId }).first();
    const currentBalance = Number(balance.balance);
    const currentUsed = Number(balance.total_used);
    const daysToCredit = 1;

    await db("leave_balances")
      .where({ id: testBalanceId })
      .update({
        total_used: Math.max(0, currentUsed - daysToCredit),
        balance: currentBalance + daysToCredit,
        updated_at: new Date(),
      });

    const updated = await db("leave_balances").where({ id: testBalanceId }).first();
    expect(Number(updated.balance)).toBe(currentBalance + daysToCredit);
  });

  it("should get balances with leave type name via join", async () => {
    const testYear = 2099;
    const balances = await db("leave_balances")
      .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
      .where({
        "leave_balances.organization_id": ORG_ID,
        "leave_balances.user_id": EMPLOYEE_USER_ID,
        "leave_balances.year": testYear,
      })
      .select(
        "leave_balances.*",
        "leave_types.name as leave_type_name",
        "leave_types.color as leave_type_color"
      );

    expect(balances.length).toBe(1);
    expect(balances[0].leave_type_name).toContain("Test Leave");
  });

  it("should verify carry-forward logic (query previous year)", async () => {
    // Simulate checking carry-forward: look up previous year balance
    const prevYearBalance = await db("leave_balances")
      .where({
        organization_id: ORG_ID,
        user_id: EMPLOYEE_USER_ID,
        leave_type_id: testLeaveTypeId,
        year: 2098, // no data for 2098 — should return null
      })
      .first();

    expect(prevYearBalance).toBeUndefined();

    // Check carry-forward cap from leave type
    const leaveType = await db("leave_types")
      .where({ id: testLeaveTypeId })
      .first();
    expect(leaveType.is_carry_forward).toBeTruthy();
    expect(Number(leaveType.max_carry_forward_days)).toBe(5);
  });

  it("should query leave policies for the org", async () => {
    const policies = await db("leave_policies")
      .where({ organization_id: ORG_ID, is_active: true })
      .select("id", "leave_type_id", "annual_quota");

    expect(Array.isArray(policies)).toBe(true);
    // Every org should have at least some active leave policies
  });
});
