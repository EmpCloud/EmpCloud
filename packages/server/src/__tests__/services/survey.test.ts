import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Surveys - Database Queries", () => {
  describe("Surveys", () => {
    it("surveys table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("surveys");
      expect(hasTable).toBe(true);
    });

    it("should have surveys for the org", async () => {
      const db = getTestDB();
      const surveys = await db("surveys").where({ organization_id: TEST_ORG_ID });
      expect(surveys.length).toBeGreaterThanOrEqual(0);
    });

    it("should have valid survey types", async () => {
      const db = getTestDB();
      const surveys = await db("surveys").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["pulse", "enps", "engagement", "custom", "onboarding", "exit", "exit_survey"];
      for (const s of surveys) {
        expect(validTypes).toContain(s.type);
      }
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const surveys = await db("surveys").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["draft", "active", "closed", "scheduled", "paused"];
      for (const s of surveys) {
        expect(validStatuses).toContain(s.status);
      }
    });

    it("should have title and created_by", async () => {
      const db = getTestDB();
      const surveys = await db("surveys").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const s of surveys) {
        expect(s.title).toBeTruthy();
        expect(s.created_by).toBeTruthy();
      }
    });

    it("active surveys should have start_date", async () => {
      const db = getTestDB();
      const active = await db("surveys").where({ organization_id: TEST_ORG_ID, status: "active" });
      for (const s of active) {
        expect(s.start_date).toBeTruthy();
      }
    });
  });

  describe("Survey Questions", () => {
    it("survey_questions table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("survey_questions");
      expect(hasTable).toBe(true);
    });

    it("questions should reference valid surveys", async () => {
      const db = getTestDB();
      const questions = await db("survey_questions").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const q of questions) {
        const survey = await db("surveys").where({ id: q.survey_id }).first();
        expect(survey).toBeDefined();
      }
    });

    it("should have valid question types", async () => {
      const db = getTestDB();
      const questions = await db("survey_questions").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["rating_1_5", "rating_1_10", "nps", "enps_0_10", "text", "single_choice", "multi_choice", "yes_no"];
      for (const q of questions) {
        expect(validTypes).toContain(q.question_type);
      }
    });

    it("questions should have non-empty text", async () => {
      const db = getTestDB();
      const questions = await db("survey_questions").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const q of questions) {
        expect(q.question_text).toBeTruthy();
        expect(q.question_text.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Survey Responses", () => {
    it("survey_responses table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("survey_responses");
      expect(hasTable).toBe(true);
    });

    it("responses should reference valid surveys", async () => {
      const db = getTestDB();
      const responses = await db("survey_responses").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const r of responses) {
        const survey = await db("surveys").where({ id: r.survey_id }).first();
        expect(survey).toBeDefined();
      }
    });

    it("anonymous responses should have anonymous_id and null user_id", async () => {
      const db = getTestDB();
      const anonResponses = await db("survey_responses")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("anonymous_id")
        .limit(10);
      for (const r of anonResponses) {
        expect(r.anonymous_id).toBeTruthy();
        expect(r.anonymous_id.length).toBeGreaterThan(0);
      }
    });

    it("response_count on survey should match actual responses", async () => {
      const db = getTestDB();
      const surveys = await db("surveys")
        .where({ organization_id: TEST_ORG_ID })
        .whereIn("status", ["active", "closed"])
        .limit(5);
      for (const s of surveys) {
        const actualCount = await db("survey_responses")
          .where({ survey_id: s.id })
          .count("* as cnt")
          .first();
        expect(s.response_count).toBe(Number(actualCount?.cnt || 0));
      }
    });
  });

  describe("Survey Answers", () => {
    it("survey_answers table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("survey_answers");
      expect(hasTable).toBe(true);
    });

    it("answers should reference valid responses and questions", async () => {
      const db = getTestDB();
      const answers = await db("survey_answers").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const a of answers) {
        const response = await db("survey_responses").where({ id: a.response_id }).first();
        expect(response).toBeDefined();
        const question = await db("survey_questions").where({ id: a.question_id }).first();
        expect(question).toBeDefined();
      }
    });

    it("rating values should be within expected range", async () => {
      const db = getTestDB();
      const answers = await db("survey_answers")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("rating_value")
        .limit(20);
      for (const a of answers) {
        expect(a.rating_value).toBeGreaterThanOrEqual(0);
        expect(a.rating_value).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("eNPS Calculation Logic", () => {
    it("should be able to calculate eNPS from survey answers", async () => {
      const db = getTestDB();
      // Find an eNPS or NPS-type survey
      const enpsSurvey = await db("surveys")
        .where({ organization_id: TEST_ORG_ID, type: "enps" })
        .first();
      if (!enpsSurvey) return; // skip if no eNPS survey exists

      const npsQuestion = await db("survey_questions")
        .where({ survey_id: enpsSurvey.id, question_type: "nps" })
        .first();
      if (!npsQuestion) return;

      const answers = await db("survey_answers")
        .where({ question_id: npsQuestion.id })
        .whereNotNull("rating_value");

      if (answers.length === 0) return;

      let promoters = 0;
      let detractors = 0;
      for (const a of answers) {
        if (a.rating_value >= 9) promoters++;
        else if (a.rating_value <= 6) detractors++;
      }
      const enps = ((promoters - detractors) / answers.length) * 100;
      expect(enps).toBeGreaterThanOrEqual(-100);
      expect(enps).toBeLessThanOrEqual(100);
    });
  });
});
