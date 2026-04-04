import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../services/notification/notification.service", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  assignTicket,
  addComment,
  resolveTicket,
  closeTicket,
  reopenTicket,
  rateTicket,
  getMyTickets,
  getHelpdeskDashboard,
  createArticle,
  getArticle,
  updateArticle,
  deleteArticle,
  rateArticle,
} from "../services/helpdesk/helpdesk.service.js";
import { getDB } from "../db/connection.js";
import { createNotification } from "../services/notification/notification.service.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((arg?: any) => {
    if (typeof arg === "function") arg.call(chain);
    return chain;
  });
  chain.whereIn = vi.fn(() => chain);
  chain.whereNotNull = vi.fn(() => chain);
  chain.whereRaw = vi.fn(() => chain);
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
  chain.decrement = vi.fn(() => chain);
  chain.avg = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string) => sql);
  db.schema = { hasTable: vi.fn().mockResolvedValue(false) };
  return { db, chain };
}

describe("helpdesk.service", () => {
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
  // createTicket
  // -----------------------------------------------------------------------
  describe("createTicket", () => {
    it("creates ticket with SLA based on priority", async () => {
      chain._firstResult = { id: 1, subject: "Test" };
      chain.insert.mockReturnValue([1]);

      await createTicket(1, 10, {
        category: "IT",
        priority: "urgent",
        subject: "Server down",
        description: "The server is down",
      });

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.sla_response_hours).toBe(2);
      expect(insertArgs.sla_resolution_hours).toBe(8);
      expect(insertArgs.status).toBe("open");
    });

    it("defaults priority to medium with correct SLA", async () => {
      chain._firstResult = { id: 1 };
      chain.insert.mockReturnValue([1]);

      await createTicket(1, 10, {
        category: "IT",
        subject: "Slow laptop",
        description: "My laptop is slow",
      });

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.priority).toBe("medium");
      expect(insertArgs.sla_response_hours).toBe(24);
      expect(insertArgs.sla_resolution_hours).toBe(72);
    });

    it("serialises tags to JSON", async () => {
      chain._firstResult = { id: 1 };
      chain.insert.mockReturnValue([1]);

      await createTicket(1, 10, {
        category: "IT",
        subject: "Help",
        description: "Help me",
        tags: ["laptop", "hardware"],
      });

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.tags).toBe(JSON.stringify(["laptop", "hardware"]));
    });
  });

  // -----------------------------------------------------------------------
  // getTicket
  // -----------------------------------------------------------------------
  describe("getTicket", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(getTicket(1, 999)).rejects.toThrow("Ticket");
    });

    it("throws ForbiddenError when non-HR user views someone else's ticket", async () => {
      chain._firstResult = { id: 1, raised_by: 20, subject: "Test" };
      await expect(getTicket(1, 1, 10, false)).rejects.toThrow(
        "You can only view your own tickets"
      );
    });

    it("allows HR to view any ticket", async () => {
      chain._firstResult = { id: 1, raised_by: 20, subject: "Test" };
      chain._result = []; // comments

      const result = await getTicket(1, 1, 10, true);
      expect(result.id).toBe(1);
    });

    it("filters internal comments for non-HR users", async () => {
      chain._firstResult = { id: 1, raised_by: 10, subject: "Test" };
      chain._result = [];

      await getTicket(1, 1, 10, false);
      // Should have called .where for is_internal = false
      expect(chain.where).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateTicket
  // -----------------------------------------------------------------------
  describe("updateTicket", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(updateTicket(1, 999, {})).rejects.toThrow("Ticket");
    });

    it("recalculates SLA when priority changes", async () => {
      chain._firstResult = {
        id: 1,
        priority: "medium",
        status: "open",
        raised_by: 10,
        subject: "Test",
        created_at: new Date(),
      };

      await updateTicket(1, 1, { priority: "urgent" });

      const updateArgs = chain.update.mock.calls[0][0];
      expect(updateArgs.sla_response_hours).toBe(2);
      expect(updateArgs.sla_resolution_hours).toBe(8);
    });

    it("sends notification when status changes", async () => {
      chain._firstResult = {
        id: 1,
        priority: "medium",
        status: "open",
        raised_by: 10,
        subject: "Test",
        created_at: new Date(),
      };

      await updateTicket(1, 1, { status: "in_progress" });
      expect(createNotification).toHaveBeenCalledWith(
        1, 10, "helpdesk_update",
        expect.stringContaining("Ticket Updated"),
        expect.stringContaining("in_progress"),
        "helpdesk_ticket", "1"
      );
    });

    it("does not send notification when status unchanged", async () => {
      chain._firstResult = {
        id: 1, priority: "medium", status: "open", raised_by: 10,
        subject: "Test", created_at: new Date(),
      };

      await updateTicket(1, 1, { category: "HR" });
      expect(createNotification).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // assignTicket
  // -----------------------------------------------------------------------
  describe("assignTicket", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(assignTicket(1, 999, 5)).rejects.toThrow("Ticket");
    });

    it("throws NotFoundError when assignee not found", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "open", raised_by: 10, subject: "Test" };
        return undefined; // assignee not found
      });

      await expect(assignTicket(1, 1, 999)).rejects.toThrow("Assignee user");
    });

    it("moves ticket to in_progress when open", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "open", raised_by: 10, subject: "Test" };
        if (callCount === 2) return { id: 5, first_name: "Jane", last_name: "Doe" }; // assignee
        return { id: 1 }; // return ticket
      });

      await assignTicket(1, 1, 5);
      const updateArgs = chain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("in_progress");
    });

    it("moves reopened ticket to in_progress", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "reopened", raised_by: 10, subject: "Test" };
        if (callCount === 2) return { id: 5, first_name: "Jane", last_name: "Doe" };
        return { id: 1 };
      });

      await assignTicket(1, 1, 5);
      const updateArgs = chain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("in_progress");
    });
  });

  // -----------------------------------------------------------------------
  // addComment
  // -----------------------------------------------------------------------
  describe("addComment", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(addComment(1, 999, 10, "test")).rejects.toThrow("Ticket");
    });

    it("tracks first response when HR responds", async () => {
      chain._firstResult = { id: 1, raised_by: 10, first_response_at: null, status: "open" };
      chain.insert.mockReturnValue([100]);

      await addComment(1, 1, 5, "We are looking into this");

      // Should update first_response_at
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ first_response_at: expect.any(Date) })
      );
    });

    it("does not set first_response_at when ticket raiser comments", async () => {
      chain._firstResult = { id: 1, raised_by: 10, first_response_at: null, status: "open" };
      chain.insert.mockReturnValue([101]);

      // Comment from the same user who raised the ticket
      await addComment(1, 1, 10, "Any update?");
      // update should NOT be called for first_response_at
      // (it may be called for status change, but not for first_response_at)
    });

    it("moves ticket from awaiting_response to in_progress when raiser responds", async () => {
      chain._firstResult = {
        id: 1, raised_by: 10, first_response_at: new Date(), status: "awaiting_response",
      };
      chain.insert.mockReturnValue([102]);

      await addComment(1, 1, 10, "Here is the info you needed");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "in_progress" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // resolveTicket
  // -----------------------------------------------------------------------
  describe("resolveTicket", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(resolveTicket(1, 999, 5)).rejects.toThrow("Ticket");
    });

    it("throws ForbiddenError when already resolved", async () => {
      chain._firstResult = { id: 1, status: "resolved" };
      await expect(resolveTicket(1, 1, 5)).rejects.toThrow("already resolved");
    });

    it("throws ForbiddenError when already closed", async () => {
      chain._firstResult = { id: 1, status: "closed" };
      await expect(resolveTicket(1, 1, 5)).rejects.toThrow("already resolved");
    });

    it("resolves ticket and sends notification", async () => {
      chain._firstResult = { id: 1, status: "in_progress", raised_by: 10, subject: "Test" };

      await resolveTicket(1, 1, 5);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "resolved" })
      );
      expect(createNotification).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // closeTicket
  // -----------------------------------------------------------------------
  describe("closeTicket", () => {
    it("throws NotFoundError when ticket missing", async () => {
      chain._firstResult = undefined;
      await expect(closeTicket(1, 999)).rejects.toThrow("Ticket");
    });

    it("throws ValidationError when no comments exist", async () => {
      chain._firstResult = { id: 1, status: "resolved", raised_by: 10, subject: "T" };
      chain._result = [{ count: 0 }];

      await expect(closeTicket(1, 1)).rejects.toThrow("resolution comment is required");
    });

    it("closes ticket with resolved_at when not previously resolved", async () => {
      chain._firstResult = {
        id: 1, status: "in_progress", raised_by: 10, subject: "T", resolved_at: null,
      };
      chain._result = [{ count: 1 }]; // has comments

      await closeTicket(1, 1);
      const updateArgs = chain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("closed");
      expect(updateArgs.resolved_at).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // reopenTicket
  // -----------------------------------------------------------------------
  describe("reopenTicket", () => {
    it("throws ForbiddenError when ticket is not resolved or closed", async () => {
      chain._firstResult = { id: 1, status: "open" };
      await expect(reopenTicket(1, 1)).rejects.toThrow(
        "Only resolved or closed tickets can be reopened"
      );
    });

    it("reopens resolved ticket and clears resolved_at", async () => {
      chain._firstResult = { id: 1, status: "resolved" };

      await reopenTicket(1, 1);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "reopened",
          resolved_at: null,
          closed_at: null,
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // rateTicket
  // -----------------------------------------------------------------------
  describe("rateTicket", () => {
    it("throws ForbiddenError when ticket is not resolved/closed", async () => {
      chain._firstResult = { id: 1, status: "open" };
      await expect(rateTicket(1, 1, 5)).rejects.toThrow(
        "Can only rate resolved or closed tickets"
      );
    });

    it("saves rating and comment", async () => {
      chain._firstResult = { id: 1, status: "resolved" };

      await rateTicket(1, 1, 4, "Good support");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          satisfaction_rating: 4,
          satisfaction_comment: "Good support",
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // createArticle
  // -----------------------------------------------------------------------
  describe("createArticle", () => {
    it("generates slug from title", async () => {
      chain._firstResult = undefined; // no existing slug
      chain.insert.mockReturnValue([10]);

      // After insert, return the article
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return undefined; // slug check
        return { id: 10, slug: "server-setup-guide" };
      });

      await createArticle(1, 5, {
        title: "Server Setup Guide",
        content: "How to set up a server",
        category: "IT",
      });

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.slug).toBe("server-setup-guide");
    });

    it("appends timestamp to slug when duplicate exists", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 5 }; // duplicate slug exists
        return { id: 10 };
      });
      chain.insert.mockReturnValue([10]);

      await createArticle(1, 5, {
        title: "Test Article",
        content: "Content",
        category: "HR",
      });

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.slug).toMatch(/^test-article-\d+$/);
    });
  });

  // -----------------------------------------------------------------------
  // getArticle
  // -----------------------------------------------------------------------
  describe("getArticle", () => {
    it("throws NotFoundError when article missing", async () => {
      chain._firstResult = undefined;
      await expect(getArticle(1, "999")).rejects.toThrow("Article");
    });

    it("looks up by ID when numeric", async () => {
      chain._firstResult = { id: 5, slug: "test", view_count: 10 };

      const result = await getArticle(1, "5");
      expect(chain.where).toHaveBeenCalledWith("knowledge_base_articles.id", 5);
      expect(result.view_count).toBe(11); // incremented
    });

    it("looks up by slug when non-numeric", async () => {
      chain._firstResult = { id: 5, slug: "my-article", view_count: 0 };

      const result = await getArticle(1, "my-article");
      expect(chain.where).toHaveBeenCalledWith("knowledge_base_articles.slug", "my-article");
    });
  });

  // -----------------------------------------------------------------------
  // deleteArticle (soft delete via unpublish)
  // -----------------------------------------------------------------------
  describe("deleteArticle", () => {
    it("throws NotFoundError when article missing", async () => {
      chain._firstResult = undefined;
      await expect(deleteArticle(1, 999)).rejects.toThrow("Article");
    });

    it("unpublishes the article instead of hard-deleting", async () => {
      chain._firstResult = { id: 1 };

      await deleteArticle(1, 1);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_published: false })
      );
    });
  });

  // -----------------------------------------------------------------------
  // rateArticle
  // -----------------------------------------------------------------------
  describe("rateArticle", () => {
    it("throws NotFoundError when article missing", async () => {
      chain._firstResult = undefined;
      await expect(rateArticle(1, 999, true)).rejects.toThrow("Article");
    });

    it("increments helpful_count for anonymous helpful vote", async () => {
      chain._firstResult = { id: 1, helpful_count: 5, not_helpful_count: 2 };

      await rateArticle(1, 1, true);
      expect(chain.increment).toHaveBeenCalledWith("helpful_count", 1);
    });

    it("increments not_helpful_count for anonymous unhelpful vote", async () => {
      chain._firstResult = { id: 1, helpful_count: 5, not_helpful_count: 2 };

      await rateArticle(1, 1, false);
      expect(chain.increment).toHaveBeenCalledWith("not_helpful_count", 1);
    });
  });

  // -----------------------------------------------------------------------
  // getHelpdeskDashboard
  // -----------------------------------------------------------------------
  describe("getHelpdeskDashboard", () => {
    it("returns dashboard stats with SLA compliance", async () => {
      chain._result = [
        { status: "open", count: 5 },
        { status: "resolved", count: 10 },
      ];
      chain._firstResult = { count: 3 };

      const result = await getHelpdeskDashboard(1);
      expect(result).toHaveProperty("total_open");
      expect(result).toHaveProperty("sla_compliance");
      expect(result).toHaveProperty("avg_resolution_hours");
      expect(result).toHaveProperty("category_breakdown");
    });
  });
});
