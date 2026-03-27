import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Data Integrity - Database Verification", () => {
  describe("User Integrity", () => {
    it("no duplicate emails in users table", async () => {
      const db = getTestDB();
      const dupes = await db("users")
        .select("email")
        .count("* as cnt")
        .groupBy("email")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("all users belong to valid organizations", async () => {
      const db = getTestDB();
      const orphans = await db("users")
        .leftJoin("organizations", "users.organization_id", "organizations.id")
        .whereNull("organizations.id")
        .select("users.id", "users.email");
      expect(orphans).toHaveLength(0);
    });

    it("all department_id references are valid", async () => {
      const db = getTestDB();
      const orphans = await db("users")
        .whereNotNull("department_id")
        .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
        .whereNull("organization_departments.id")
        .select("users.id");
      expect(orphans).toHaveLength(0);
    });

    it("all location_id references are valid", async () => {
      const db = getTestDB();
      const orphans = await db("users")
        .whereNotNull("location_id")
        .leftJoin("organization_locations", "users.location_id", "organization_locations.id")
        .whereNull("organization_locations.id")
        .select("users.id");
      expect(orphans).toHaveLength(0);
    });

    it("all reporting_manager_id references are valid users", async () => {
      const db = getTestDB();
      const orphans = await db("users as u")
        .whereNotNull("u.reporting_manager_id")
        .leftJoin("users as m", "u.reporting_manager_id", "m.id")
        .whereNull("m.id")
        .select("u.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Leave Integrity", () => {
    it("all leave_balances reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("leave_balances")
        .leftJoin("users", "leave_balances.user_id", "users.id")
        .whereNull("users.id")
        .select("leave_balances.id");
      expect(orphans).toHaveLength(0);
    });

    it("all leave_balances reference valid leave_types", async () => {
      const db = getTestDB();
      const orphans = await db("leave_balances")
        .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
        .whereNull("leave_types.id")
        .select("leave_balances.id");
      expect(orphans).toHaveLength(0);
    });

    it("all leave_applications reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("leave_applications")
        .leftJoin("users", "leave_applications.user_id", "users.id")
        .whereNull("users.id")
        .select("leave_applications.id");
      expect(orphans).toHaveLength(0);
    });

    it("all leave_applications reference valid leave_types", async () => {
      const db = getTestDB();
      const orphans = await db("leave_applications")
        .leftJoin("leave_types", "leave_applications.leave_type_id", "leave_types.id")
        .whereNull("leave_types.id")
        .select("leave_applications.id");
      expect(orphans).toHaveLength(0);
    });

    it("all leave_policies reference valid leave_types", async () => {
      const db = getTestDB();
      const orphans = await db("leave_policies")
        .leftJoin("leave_types", "leave_policies.leave_type_id", "leave_types.id")
        .whereNull("leave_types.id")
        .select("leave_policies.id");
      expect(orphans).toHaveLength(0);
    });

    it("leave_approvals reference valid leave_applications", async () => {
      const db = getTestDB();
      const orphans = await db("leave_approvals")
        .leftJoin("leave_applications", "leave_approvals.leave_application_id", "leave_applications.id")
        .whereNull("leave_applications.id")
        .select("leave_approvals.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Attendance Integrity", () => {
    it("all attendance_records reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("attendance_records")
        .leftJoin("users", "attendance_records.user_id", "users.id")
        .whereNull("users.id")
        .select("attendance_records.id");
      expect(orphans).toHaveLength(0);
    });

    it("all shift_assignments reference valid shifts", async () => {
      const db = getTestDB();
      const orphans = await db("shift_assignments")
        .leftJoin("shifts", "shift_assignments.shift_id", "shifts.id")
        .whereNull("shifts.id")
        .select("shift_assignments.id");
      expect(orphans).toHaveLength(0);
    });

    it("all shift_assignments reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("shift_assignments")
        .leftJoin("users", "shift_assignments.user_id", "users.id")
        .whereNull("users.id")
        .select("shift_assignments.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Document Integrity", () => {
    it("all employee_documents reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("employee_documents")
        .leftJoin("users", "employee_documents.user_id", "users.id")
        .whereNull("users.id")
        .select("employee_documents.id");
      expect(orphans).toHaveLength(0);
    });

    it("all employee_documents reference valid categories", async () => {
      const db = getTestDB();
      const orphans = await db("employee_documents")
        .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
        .whereNull("document_categories.id")
        .select("employee_documents.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Announcement Integrity", () => {
    it("all announcements reference valid creators", async () => {
      const db = getTestDB();
      const orphans = await db("announcements")
        .leftJoin("users", "announcements.created_by", "users.id")
        .whereNull("users.id")
        .select("announcements.id");
      expect(orphans).toHaveLength(0);
    });

    it("all announcement_reads reference valid announcements", async () => {
      const db = getTestDB();
      const orphans = await db("announcement_reads")
        .leftJoin("announcements", "announcement_reads.announcement_id", "announcements.id")
        .whereNull("announcements.id")
        .select("announcement_reads.id");
      expect(orphans).toHaveLength(0);
    });

    it("all announcement_reads reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("announcement_reads")
        .leftJoin("users", "announcement_reads.user_id", "users.id")
        .whereNull("users.id")
        .select("announcement_reads.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Subscription Integrity", () => {
    it("all org_subscriptions reference valid organizations", async () => {
      const db = getTestDB();
      const orphans = await db("org_subscriptions")
        .leftJoin("organizations", "org_subscriptions.organization_id", "organizations.id")
        .whereNull("organizations.id")
        .select("org_subscriptions.id");
      expect(orphans).toHaveLength(0);
    });

    it("all org_subscriptions reference valid modules", async () => {
      const db = getTestDB();
      const orphans = await db("org_subscriptions")
        .leftJoin("modules", "org_subscriptions.module_id", "modules.id")
        .whereNull("modules.id")
        .select("org_subscriptions.id");
      expect(orphans).toHaveLength(0);
    });

    it("all org_module_seats reference valid subscriptions", async () => {
      const db = getTestDB();
      const orphans = await db("org_module_seats")
        .leftJoin("org_subscriptions", "org_module_seats.subscription_id", "org_subscriptions.id")
        .whereNull("org_subscriptions.id")
        .select("org_module_seats.id");
      expect(orphans).toHaveLength(0);
    });

    it("used_seats should match actual seat assignments", async () => {
      const db = getTestDB();
      const subs = await db("org_subscriptions").where({ organization_id: TEST_ORG_ID }).limit(5);
      for (const s of subs) {
        const actualSeats = await db("org_module_seats")
          .where({ subscription_id: s.id })
          .count("* as cnt")
          .first();
        expect(s.used_seats).toBe(Number(actualSeats?.cnt || 0));
      }
    });
  });

  describe("Module Integrity", () => {
    it("modules should have unique slugs", async () => {
      const db = getTestDB();
      const dupes = await db("modules")
        .select("slug")
        .count("* as cnt")
        .groupBy("slug")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("all module_features reference valid modules", async () => {
      const db = getTestDB();
      const orphans = await db("module_features")
        .leftJoin("modules", "module_features.module_id", "modules.id")
        .whereNull("modules.id")
        .select("module_features.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Survey Integrity", () => {
    it("all survey_questions reference valid surveys", async () => {
      const db = getTestDB();
      const orphans = await db("survey_questions")
        .leftJoin("surveys", "survey_questions.survey_id", "surveys.id")
        .whereNull("surveys.id")
        .select("survey_questions.id");
      expect(orphans).toHaveLength(0);
    });

    it("all survey_responses reference valid surveys", async () => {
      const db = getTestDB();
      const orphans = await db("survey_responses")
        .leftJoin("surveys", "survey_responses.survey_id", "surveys.id")
        .whereNull("surveys.id")
        .select("survey_responses.id");
      expect(orphans).toHaveLength(0);
    });

    it("all survey_answers reference valid responses", async () => {
      const db = getTestDB();
      const orphans = await db("survey_answers")
        .leftJoin("survey_responses", "survey_answers.response_id", "survey_responses.id")
        .whereNull("survey_responses.id")
        .select("survey_answers.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Helpdesk Integrity", () => {
    it("all ticket_comments reference valid tickets", async () => {
      const db = getTestDB();
      const orphans = await db("ticket_comments")
        .leftJoin("helpdesk_tickets", "ticket_comments.ticket_id", "helpdesk_tickets.id")
        .whereNull("helpdesk_tickets.id")
        .select("ticket_comments.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Asset Integrity", () => {
    it("all assets with category_id reference valid categories", async () => {
      const db = getTestDB();
      const orphans = await db("assets")
        .whereNotNull("category_id")
        .leftJoin("asset_categories", "assets.category_id", "asset_categories.id")
        .whereNull("asset_categories.id")
        .select("assets.id");
      expect(orphans).toHaveLength(0);
    });

    it("all asset_history entries reference valid assets", async () => {
      const db = getTestDB();
      const orphans = await db("asset_history")
        .leftJoin("assets", "asset_history.asset_id", "assets.id")
        .whereNull("assets.id")
        .select("asset_history.id");
      expect(orphans).toHaveLength(0);
    });
  });

  describe("Position Integrity", () => {
    it("all position_assignments reference valid positions", async () => {
      const db = getTestDB();
      const orphans = await db("position_assignments")
        .leftJoin("positions", "position_assignments.position_id", "positions.id")
        .whereNull("positions.id")
        .select("position_assignments.id");
      expect(orphans).toHaveLength(0);
    });

    it("all position_assignments reference valid users", async () => {
      const db = getTestDB();
      const orphans = await db("position_assignments")
        .leftJoin("users", "position_assignments.user_id", "users.id")
        .whereNull("users.id")
        .select("position_assignments.id");
      expect(orphans).toHaveLength(0);
    });
  });
});
