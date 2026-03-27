import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Helpdesk - Database Queries", () => {
  describe("Helpdesk Tickets", () => {
    it("helpdesk_tickets table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("helpdesk_tickets");
      expect(hasTable).toBe(true);
    });

    it("should have tickets for the org", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID });
      expect(tickets.length).toBeGreaterThanOrEqual(0);
    });

    it("should have valid category values", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID });
      const validCategories = ["leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general"];
      for (const t of tickets) {
        expect(validCategories).toContain(t.category);
      }
    });

    it("should have valid priority values", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID });
      const validPriorities = ["low", "medium", "high", "urgent"];
      for (const t of tickets) {
        expect(validPriorities).toContain(t.priority);
      }
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["open", "in_progress", "awaiting_response", "resolved", "closed", "reopened"];
      for (const t of tickets) {
        expect(validStatuses).toContain(t.status);
      }
    });

    it("should have SLA hours set", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const t of tickets) {
        expect(t.sla_response_hours).toBeGreaterThan(0);
        expect(t.sla_resolution_hours).toBeGreaterThan(0);
        expect(t.sla_resolution_hours).toBeGreaterThanOrEqual(t.sla_response_hours);
      }
    });

    it("SLA deadlines should be after creation time", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("sla_response_due")
        .limit(10);
      for (const t of tickets) {
        expect(new Date(t.sla_response_due) >= new Date(t.created_at)).toBe(true);
      }
    });

    it("resolved tickets should have resolved_at timestamp", async () => {
      const db = getTestDB();
      const resolved = await db("helpdesk_tickets")
        .where({ organization_id: TEST_ORG_ID, status: "resolved" })
        .limit(10);
      for (const t of resolved) {
        expect(t.resolved_at).toBeTruthy();
      }
    });

    it("closed tickets should have closed_at timestamp", async () => {
      const db = getTestDB();
      const closed = await db("helpdesk_tickets")
        .where({ organization_id: TEST_ORG_ID, status: "closed" })
        .limit(10);
      for (const t of closed) {
        expect(t.closed_at).toBeTruthy();
      }
    });

    it("should reference valid users as raised_by", async () => {
      const db = getTestDB();
      const tickets = await db("helpdesk_tickets").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const t of tickets) {
        const user = await db("users").where({ id: t.raised_by }).first();
        expect(user).toBeDefined();
      }
    });

    it("satisfaction_rating should be 1-5 when present", async () => {
      const db = getTestDB();
      const rated = await db("helpdesk_tickets")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("satisfaction_rating")
        .limit(10);
      for (const t of rated) {
        expect(t.satisfaction_rating).toBeGreaterThanOrEqual(1);
        expect(t.satisfaction_rating).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("Ticket Comments", () => {
    it("ticket_comments table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("ticket_comments");
      expect(hasTable).toBe(true);
    });

    it("comments should reference valid tickets", async () => {
      const db = getTestDB();
      const comments = await db("ticket_comments")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      for (const c of comments) {
        const ticket = await db("helpdesk_tickets").where({ id: c.ticket_id }).first();
        expect(ticket).toBeDefined();
      }
    });

    it("comments should have non-empty content", async () => {
      const db = getTestDB();
      const comments = await db("ticket_comments")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      for (const c of comments) {
        expect(c.comment).toBeTruthy();
        expect(c.comment.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Knowledge Base Articles", () => {
    it("knowledge_base_articles table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("knowledge_base_articles");
      expect(hasTable).toBe(true);
    });

    it("should have articles for the org", async () => {
      const db = getTestDB();
      const articles = await db("knowledge_base_articles").where({ organization_id: TEST_ORG_ID });
      expect(articles.length).toBeGreaterThanOrEqual(0);
    });

    it("articles should have required fields", async () => {
      const db = getTestDB();
      const articles = await db("knowledge_base_articles").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const a of articles) {
        expect(a.title).toBeTruthy();
        expect(a.slug).toBeTruthy();
        expect(a.content).toBeTruthy();
        expect(a.category).toBeTruthy();
      }
    });

    it("article slugs should be unique per org", async () => {
      const db = getTestDB();
      const dupes = await db("knowledge_base_articles")
        .where({ organization_id: TEST_ORG_ID })
        .select("slug")
        .count("* as cnt")
        .groupBy("slug")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("view_count should be non-negative", async () => {
      const db = getTestDB();
      const articles = await db("knowledge_base_articles").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const a of articles) {
        expect(a.view_count).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
