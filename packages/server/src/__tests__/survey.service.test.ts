import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));

import {
  createSurvey,
  getSurvey,
  updateSurvey,
  publishSurvey,
  closeSurvey,
  deleteSurvey,
  submitResponse,
  getSurveyResults,
  getActiveSurveys,
  getSurveyDashboard,
  calculateENPS,
} from "../services/survey/survey.service.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((arg?: any) => {
    if (typeof arg === "function") arg.call(chain);
    return chain;
  });
  chain.whereIn = vi.fn(() => chain);
  chain.whereNull = vi.fn(() => chain);
  chain.whereNotNull = vi.fn(() => chain);
  chain.orWhere = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.join = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.insert = vi.fn(() => [1]);
  chain.update = vi.fn(() => 1);
  chain.delete = vi.fn(() => 1);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.count = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.clone = vi.fn(() => chain);
  chain.increment = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string) => sql);
  return { db, chain };
}

describe("survey.service", () => {
  let db: any;
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockDB();
    db = mock.db;
    chain = mock.chain;
    mockedGetDB.mockReturnValue(db);
  });

  // -----------------------------------------------------------------------
  // createSurvey
  // -----------------------------------------------------------------------
  describe("createSurvey", () => {
    it("throws ValidationError when end_date before start_date", async () => {
      await expect(
        createSurvey(1, 10, {
          title: "Survey",
          start_date: "2026-06-01",
          end_date: "2026-05-01",
        } as any)
      ).rejects.toThrow("end_date cannot be before start_date");
    });

    it("creates survey with questions", async () => {
      chain.insert.mockReturnValue([5]);
      chain._firstResult = { id: 5, title: "Survey", target_ids: null };
      chain._result = []; // questions

      await createSurvey(1, 10, {
        title: "Survey",
        questions: [
          { question_text: "How are you?", question_type: "rating_1_5" },
        ],
      } as any);

      // insert called twice: once for survey, once for questions
      expect(chain.insert).toHaveBeenCalledTimes(2);
    });

    it("defaults is_anonymous to true", async () => {
      chain.insert.mockReturnValue([6]);
      chain._firstResult = { id: 6, target_ids: null };
      chain._result = [];

      await createSurvey(1, 10, { title: "Test" } as any);

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.is_anonymous).toBe(true);
      expect(insertArgs.status).toBe("draft");
      expect(insertArgs.type).toBe("pulse");
    });
  });

  // -----------------------------------------------------------------------
  // updateSurvey
  // -----------------------------------------------------------------------
  describe("updateSurvey", () => {
    it("throws NotFoundError when survey missing", async () => {
      chain._firstResult = undefined;
      await expect(updateSurvey(1, 999, {} as any)).rejects.toThrow("Survey");
    });

    it("throws ForbiddenError when survey is not draft", async () => {
      chain._firstResult = { id: 1, status: "active" };
      await expect(updateSurvey(1, 1, { title: "X" } as any)).rejects.toThrow(
        "Only draft surveys can be edited"
      );
    });

    it("validates end_date against existing start_date", async () => {
      chain._firstResult = { id: 1, status: "draft", start_date: "2026-06-01", end_date: "2026-07-01" };

      await expect(
        updateSurvey(1, 1, { end_date: "2026-05-01" } as any)
      ).rejects.toThrow("end_date cannot be before start_date");
    });

    it("replaces questions when provided", async () => {
      // First call = existing survey (draft), second call = getSurvey
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "draft", start_date: null, end_date: null };
        return { id: 1, target_ids: null };
      });
      chain._result = []; // questions list

      await updateSurvey(1, 1, {
        questions: [{ question_text: "New Q" }],
      } as any);

      // delete old questions then insert new
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.insert).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // publishSurvey
  // -----------------------------------------------------------------------
  describe("publishSurvey", () => {
    it("throws NotFoundError when survey missing", async () => {
      chain._firstResult = undefined;
      await expect(publishSurvey(1, 999)).rejects.toThrow("Survey");
    });

    it("throws ForbiddenError when survey is active", async () => {
      chain._firstResult = { id: 1, status: "active" };
      await expect(publishSurvey(1, 1)).rejects.toThrow("Only draft or closed");
    });

    it("throws ValidationError when no questions exist", async () => {
      chain._firstResult = { id: 1, status: "draft" };
      chain._result = [{ count: 0 }];

      await expect(publishSurvey(1, 1)).rejects.toThrow(
        "Survey must have at least one question"
      );
    });

    it("publishes draft survey with questions", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "draft", start_date: null };
        return { id: 1, target_ids: null };
      });
      chain._result = [{ count: 3 }]; // has questions

      await publishSurvey(1, 1);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // closeSurvey
  // -----------------------------------------------------------------------
  describe("closeSurvey", () => {
    it("throws ForbiddenError when not active", async () => {
      chain._firstResult = { id: 1, status: "draft" };
      await expect(closeSurvey(1, 1)).rejects.toThrow("Only active surveys can be closed");
    });

    it("closes an active survey", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active" };
        return { id: 1, status: "closed", target_ids: null };
      });
      chain._result = [];

      await closeSurvey(1, 1);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "closed" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteSurvey
  // -----------------------------------------------------------------------
  describe("deleteSurvey", () => {
    it("throws ForbiddenError when not draft", async () => {
      chain._firstResult = { id: 1, status: "active" };
      await expect(deleteSurvey(1, 1)).rejects.toThrow("Only draft surveys can be deleted");
    });

    it("deletes draft survey", async () => {
      chain._firstResult = { id: 1, status: "draft" };
      await deleteSurvey(1, 1);
      expect(chain.delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // submitResponse
  // -----------------------------------------------------------------------
  describe("submitResponse", () => {
    it("throws NotFoundError when survey not active", async () => {
      chain._firstResult = undefined;
      await expect(submitResponse(1, 999, 10, [])).rejects.toThrow("Active survey");
    });

    it("throws ForbiddenError when survey expired", async () => {
      chain._firstResult = {
        id: 1,
        status: "active",
        is_anonymous: true,
        end_date: "2020-01-01",
      };
      await expect(submitResponse(1, 1, 10, [])).rejects.toThrow("expired");
    });

    it("throws ForbiddenError on duplicate anonymous response", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", is_anonymous: true, end_date: null };
        return { id: 99 }; // existing response
      });

      await expect(submitResponse(1, 1, 10, [])).rejects.toThrow("already responded");
    });

    it("throws ForbiddenError on duplicate non-anonymous response", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", is_anonymous: false, end_date: null };
        return { id: 99 }; // existing response
      });

      await expect(submitResponse(1, 1, 10, [])).rejects.toThrow("already responded");
    });

    it("throws ValidationError when required questions missing", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", is_anonymous: true, end_date: null };
        return undefined; // no existing response
      });
      chain._result = [{ id: 100, is_required: true, question_type: "rating_1_5" }];

      await expect(submitResponse(1, 1, 10, [])).rejects.toThrow("Missing answers");
    });

    it("submits response with anonymous hashing", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", is_anonymous: true, end_date: null };
        return undefined; // no existing response
      });
      chain._result = []; // no required questions
      chain.insert.mockReturnValue([200]);

      const result = await submitResponse(1, 1, 10, [
        { question_id: 5, rating_value: 4 },
      ]);

      expect(result.response_id).toBe(200);
      expect(chain.increment).toHaveBeenCalledWith("response_count", 1);
    });
  });

  // -----------------------------------------------------------------------
  // getSurveyResults
  // -----------------------------------------------------------------------
  describe("getSurveyResults", () => {
    it("throws NotFoundError when survey missing", async () => {
      chain._firstResult = undefined;
      await expect(getSurveyResults(1, 999)).rejects.toThrow("Survey");
    });

    it("throws ForbiddenError for non-admin viewing active survey results", async () => {
      chain._firstResult = { id: 1, status: "active", response_count: 5 };
      await expect(getSurveyResults(1, 1, "employee")).rejects.toThrow(
        "results are not available"
      );
    });

    it("allows admin to view active survey results", async () => {
      chain._firstResult = { id: 1, status: "active", response_count: 0, type: "pulse" };
      chain._result = []; // no questions

      const result = await getSurveyResults(1, 1, "org_admin");
      expect(result.survey_id).toBe(1);
    });

    it("returns results with rating aggregation", async () => {
      chain._firstResult = { id: 1, status: "closed", response_count: 3, type: "pulse" };
      chain._result = [
        { id: 10, question_text: "Rate us", question_type: "rating_1_5", options: null, sort_order: 0 },
      ];

      // Override the join-select for answers
      chain.then.mockImplementation((resolve: any) => {
        return resolve(chain._result);
      });

      const result = await getSurveyResults(1, 1);
      expect(result.questions).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // calculateENPS
  // -----------------------------------------------------------------------
  describe("calculateENPS", () => {
    it("returns null when survey not found", async () => {
      chain._firstResult = undefined;
      const result = await calculateENPS(999);
      expect(result).toBeNull();
    });

    it("returns null when no enps or rating question exists", async () => {
      // First call: survey found
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1 }; // survey
        return undefined; // no enps_0_10 question
      });

      // fallback also returns undefined
      const result = await calculateENPS(1);
      // Will return null since no rating question found
      expect(result).toBeNull();
    });

    it("calculates eNPS correctly from ratings", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1 }; // survey
        return { id: 50 }; // enps question found
      });
      // answers
      chain._result = [
        { rating_value: 10 }, // promoter
        { rating_value: 9 },  // promoter
        { rating_value: 8 },  // passive
        { rating_value: 5 },  // detractor
        { rating_value: 3 },  // detractor
      ];

      const result = await calculateENPS(1);
      expect(result).not.toBeNull();
      // 2 promoters (40%), 2 detractors (40%) => score = 0
      expect(result!.promoters).toBe(2);
      expect(result!.detractors).toBe(2);
      expect(result!.passives).toBe(1);
      expect(result!.score).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getSurveyDashboard
  // -----------------------------------------------------------------------
  describe("getSurveyDashboard", () => {
    it("returns dashboard stats", async () => {
      // Multiple chained queries all return from _result
      chain._result = [{ active_count: 2, total_count: 5, draft_count: 1, closed_count: 2, total_responses: 20, count: 2, user_count: 10 }];
      chain._firstResult = undefined; // no latest eNPS survey

      const result = await getSurveyDashboard(1);
      expect(result).toHaveProperty("active_count");
      expect(result).toHaveProperty("total_count");
      expect(result).toHaveProperty("avg_response_rate");
    });
  });
});
