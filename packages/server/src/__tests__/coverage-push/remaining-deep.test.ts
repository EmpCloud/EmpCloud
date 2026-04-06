import { describe, it, expect, vi, beforeEach } from "vitest";

function buildMockDB() {
  const chain: any = {};
  const methods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","first","insert","update","delete","orderBy","limit","offset","join","leftJoin","clone","count","increment","decrement","whereNotIn","orWhere","orWhereRaw","groupBy","having","sum","max","min","avg","whereNotNull","whereBetween","as"];
  methods.forEach(m => { chain[m] = vi.fn(() => chain); });
  chain.first = vi.fn(() => Promise.resolve(null));
  chain.insert = vi.fn(() => Promise.resolve([1]));
  chain.update = vi.fn(() => Promise.resolve(1));
  chain.delete = vi.fn(() => Promise.resolve(1));
  chain.count = vi.fn(() => Promise.resolve([{ count: 0, "count(*)": 0 }]));
  chain.increment = vi.fn(() => Promise.resolve(1));
  chain.decrement = vi.fn(() => Promise.resolve(1));
  chain.sum = vi.fn(() => Promise.resolve([{ total: 0 }]));
  const db: any = vi.fn(() => chain);
  db.raw = vi.fn(() => Promise.resolve([[]]));
  db.transaction = vi.fn(async (cb: any) => cb(db));
  db._chain = chain;
  return { db, chain };
}

const { db: mockDB, chain: c } = buildMockDB();

vi.mock("../../db/connection", () => ({
  getDB: vi.fn(() => mockDB),
  initDB: vi.fn(),
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../utils/errors", async () => vi.importActual("../../utils/errors"));
vi.mock("../../config/index", () => ({
  config: { redis: { host: "localhost", port: 6379, password: "" }, server: { port: 3000 }, oauth: { issuer: "https://test.empcloud.com" } },
}));
vi.mock("@empcloud/shared", () => ({
  AuditAction: { USER_CREATED: "USER_CREATED", EXIT_COMPLETED: "EXIT_COMPLETED" },
  ROLE_HIERARCHY: { employee: 0, manager: 20, hr_admin: 60, org_admin: 80, super_admin: 100 },
}));
vi.mock("../audit/audit.service", () => ({ logAudit: vi.fn(() => Promise.resolve()) }));

function reset() {
  vi.clearAllMocks();
  Object.values(c).forEach((fn: any) => { if (typeof fn === "function" && fn.mockReset) fn.mockReset(); });
  const chainMethods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","orderBy","limit","offset","join","leftJoin","clone","whereNotIn","orWhere","orWhereRaw","groupBy","having","as","whereNotNull","whereBetween"];
  chainMethods.forEach(m => { c[m].mockReturnValue(c); });
  c.first.mockResolvedValue(null);
  c.insert.mockResolvedValue([1]);
  c.update.mockResolvedValue(1);
  c.delete.mockResolvedValue(1);
  c.count.mockResolvedValue([{ count: 0, "count(*)": 0 }]);
  c.increment.mockResolvedValue(1);
  c.decrement.mockResolvedValue(1);
  c.sum.mockResolvedValue([{ total: 0 }]);
}

// ===================== Forum Service =====================
import {
  listCategories, createCategory, updateCategory,
  createPost, listPosts, getPost, updatePost, deletePost,
  pinPost, lockPost, createReply, deleteReply, acceptReply,
  toggleLike, getForumDashboard, getUserLikes,
} from "../../services/forum/forum.service.js";

describe("Forum Service Coverage", () => {
  beforeEach(reset);

  describe("listCategories", () => {
    it("returns categories", async () => {
      c.orderBy.mockResolvedValueOnce([{ id: 1, name: "General" }]);
      const r = await listCategories(1);
      expect(r).toBeTruthy();
    });
  });

  describe("createCategory", () => {
    it("throws on duplicate slug", async () => {
      c.first.mockResolvedValueOnce({ id: 1 });
      await expect(createCategory(1, { name: "Test", slug: "test" } as any)).rejects.toThrow();
    });
    it("creates category", async () => {
      c.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, name: "Test" });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createCategory(1, { name: "Test", slug: "test", description: "desc" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("updateCategory", () => {
    it("throws when not found", async () => {
      await expect(updateCategory(1, 99, { name: "X" } as any)).rejects.toThrow();
    });
    it("updates", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, name: "Updated" });
      c.update.mockResolvedValue(1);
      const r = await updateCategory(1, 1, { name: "Updated" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("createPost", () => {
    it("throws when category not found", async () => {
      c.first.mockResolvedValueOnce(null);
      await expect(createPost(1, 1, { category_id: 99, title: "T", body: "B" } as any)).rejects.toThrow();
    });
    it("creates post", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, title: "T" });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createPost(1, 1, { category_id: 1, title: "T", body: "B", tags: "a,b" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("listPosts", () => {
    it("lists with filters", async () => {
      c.count.mockResolvedValueOnce([{ count: 1 }]);
      c.offset.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listPosts(1, { page: 1, per_page: 10, category_id: 1, search: "test", status: "published", sort_by: "latest" } as any);
      expect(r).toBeTruthy();
    });
    it("lists with defaults", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await listPosts(1, {} as any);
      expect(r).toBeTruthy();
    });
  });

  describe("getPost", () => {
    it("throws when not found", async () => {
      await expect(getPost(1, 99)).rejects.toThrow();
    });
    it("returns post with view increment", async () => {
      c.first.mockResolvedValueOnce({ id: 1, title: "T" });
      c.select.mockResolvedValueOnce([{ id: 1, body: "Reply" }]);
      c.update.mockResolvedValue(1);
      const r = await getPost(1, 1, true);
      expect(r).toBeTruthy();
    });
  });

  describe("updatePost", () => {
    it("throws when not found", async () => {
      await expect(updatePost(1, 1, 99, {} as any)).rejects.toThrow();
    });
    it("throws when not owner", async () => {
      c.first.mockResolvedValueOnce({ id: 1, user_id: 2 });
      await expect(updatePost(1, 1, 1, { title: "X" } as any)).rejects.toThrow();
    });
    it("updates own post", async () => {
      c.first.mockResolvedValueOnce({ id: 1, user_id: 1 }).mockResolvedValueOnce({ id: 1, title: "Updated" });
      c.select.mockResolvedValueOnce([]);
      const r = await updatePost(1, 1, 1, { title: "Updated" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("deletePost", () => {
    it("throws when not found", async () => {
      await expect(deletePost(1, 1, 99, "employee")).rejects.toThrow();
    });
    it("throws when not owner or admin", async () => {
      c.first.mockResolvedValueOnce({ id: 1, user_id: 2 });
      await expect(deletePost(1, 1, 1, "employee")).rejects.toThrow();
    });
    it("deletes as admin", async () => {
      c.first.mockResolvedValueOnce({ id: 1, user_id: 2 });
      c.delete.mockResolvedValue(1);
      await deletePost(1, 1, 1, "hr_admin");
    });
  });

  describe("pinPost", () => {
    it("throws when not found", async () => {
      await expect(pinPost(1, 99)).rejects.toThrow();
    });
    it("toggles pin", async () => {
      c.first.mockResolvedValueOnce({ id: 1, is_pinned: false }).mockResolvedValueOnce({ id: 1, is_pinned: true });
      c.select.mockResolvedValueOnce([]);
      const r = await pinPost(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("lockPost", () => {
    it("throws when not found", async () => {
      await expect(lockPost(1, 99)).rejects.toThrow();
    });
    it("toggles lock", async () => {
      c.first.mockResolvedValueOnce({ id: 1, is_locked: false }).mockResolvedValueOnce({ id: 1, is_locked: true });
      c.select.mockResolvedValueOnce([]);
      const r = await lockPost(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("createReply", () => {
    it("throws when post not found", async () => {
      await expect(createReply(1, 1, 99, { body: "R" } as any)).rejects.toThrow();
    });
    it("throws when locked", async () => {
      c.first.mockResolvedValueOnce({ id: 1, is_locked: true });
      await expect(createReply(1, 1, 1, { body: "R" } as any)).rejects.toThrow();
    });
    it("creates reply", async () => {
      c.first.mockResolvedValueOnce({ id: 1, is_locked: false }).mockResolvedValueOnce({ id: 1, body: "R" });
      c.insert.mockResolvedValueOnce([1]);
      c.increment.mockResolvedValue(1);
      const r = await createReply(1, 1, 1, { body: "Reply text" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("deleteReply", () => {
    it("throws when not found", async () => {
      await expect(deleteReply(1, 1, 99, "employee")).rejects.toThrow();
    });
    it("deletes own reply", async () => {
      c.first.mockResolvedValueOnce({ id: 1, user_id: 1, post_id: 1 });
      c.delete.mockResolvedValue(1);
      c.decrement.mockResolvedValue(1);
      await deleteReply(1, 1, 1, "employee");
    });
  });

  describe("acceptReply", () => {
    it("throws when reply not found", async () => {
      c.first.mockResolvedValueOnce(null);
      await expect(acceptReply(1, 1, 99)).rejects.toThrow();
    });
    it("throws when not post author", async () => {
      c.first.mockResolvedValueOnce({ id: 1, post_id: 1 }).mockResolvedValueOnce({ id: 1, user_id: 2 });
      await expect(acceptReply(1, 1, 1)).rejects.toThrow();
    });
    it("accepts reply", async () => {
      c.first.mockResolvedValueOnce({ id: 1, post_id: 1 }).mockResolvedValueOnce({ id: 1, user_id: 1 }).mockResolvedValueOnce({ id: 1, is_accepted: true });
      c.select.mockResolvedValueOnce([]);
      c.update.mockResolvedValue(1);
      const r = await acceptReply(1, 1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("toggleLike", () => {
    it("adds like when not existing", async () => {
      c.first.mockResolvedValueOnce(null); // no existing like
      c.insert.mockResolvedValueOnce([1]);
      c.increment.mockResolvedValue(1);
      const r = await toggleLike(1, 1, { post_id: 1 });
      expect(r.liked).toBe(true);
    });
    it("removes like when existing", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }); // existing like
      c.delete.mockResolvedValue(1);
      c.decrement.mockResolvedValue(1);
      const r = await toggleLike(1, 1, { post_id: 1 });
      expect(r.liked).toBe(false);
    });
    it("handles reply like", async () => {
      c.first.mockResolvedValueOnce(null);
      c.insert.mockResolvedValueOnce([1]);
      c.increment.mockResolvedValue(1);
      const r = await toggleLike(1, 1, { reply_id: 1 });
      expect(r.liked).toBe(true);
    });
  });

  describe("getForumDashboard", () => {
    it("returns dashboard data", async () => {
      c.count
        .mockResolvedValueOnce([{ count: 10 }])
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([{ count: 3 }]);
      c.select.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      c.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const r = await getForumDashboard(1);
      expect(r).toBeTruthy();
    });
  });

  describe("getUserLikes", () => {
    it("returns user likes", async () => {
      c.select.mockResolvedValueOnce([{ id: 1, post_id: 1 }]);
      const r = await getUserLikes(1, 1);
      expect(r).toBeTruthy();
    });
  });
});

// ===================== Nomination Service =====================
import { createNomination, listNominations } from "../../services/nomination/nomination.service.js";

describe("Nomination Service Coverage", () => {
  beforeEach(reset);

  describe("createNomination", () => {
    it("throws on self-nomination", async () => {
      await expect(createNomination(1, 1, { program_id: 1, nominee_id: 1, reason: "me" })).rejects.toThrow("yourself");
    });
    it("throws when nominee not found", async () => {
      c.first.mockResolvedValueOnce(null);
      await expect(createNomination(1, 1, { program_id: 1, nominee_id: 2, reason: "great" })).rejects.toThrow("Nominee");
    });
    it("creates nomination", async () => {
      c.first.mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ id: 1, status: "pending" });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createNomination(1, 1, { program_id: 1, nominee_id: 2, reason: "great" });
      expect(r).toBeTruthy();
    });
  });

  describe("listNominations", () => {
    it("lists with defaults", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await listNominations(1, 1);
      expect(r).toBeTruthy();
    });
    it("lists with filters", async () => {
      c.count.mockResolvedValueOnce([{ count: 1 }]);
      c.offset.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listNominations(1, 1, { page: 2, perPage: 5, status: "approved" });
      expect(r).toBeTruthy();
    });
  });
});

// ===================== Probation Service =====================
import {
  getEmployeesOnProbation, getUpcomingConfirmations, confirmProbation,
  extendProbation, getProbationDashboard,
} from "../../services/employee/probation.service.js";

describe("Probation Service Coverage", () => {
  beforeEach(reset);

  describe("getEmployeesOnProbation", () => {
    it("returns employees on probation", async () => {
      c.orderBy.mockResolvedValueOnce([{ id: 1, first_name: "A" }]);
      const r = await getEmployeesOnProbation(1);
      expect(r).toBeTruthy();
    });
  });

  describe("getUpcomingConfirmations", () => {
    it("returns upcoming", async () => {
      c.orderBy.mockResolvedValueOnce([]);
      const r = await getUpcomingConfirmations(1, 30);
      expect(r).toBeTruthy();
    });
  });

  describe("confirmProbation", () => {
    it("throws when user not found", async () => {
      await expect(confirmProbation(1, 99, 1)).rejects.toThrow();
    });
    it("throws when not on probation", async () => {
      c.first.mockResolvedValueOnce({ id: 1, probation_status: "confirmed" });
      await expect(confirmProbation(1, 1, 2)).rejects.toThrow();
    });
    it("confirms successfully", async () => {
      c.first.mockResolvedValueOnce({ id: 1, probation_status: "on_probation" });
      c.update.mockResolvedValue(1);
      c.insert.mockResolvedValue([1]);
      const r = await confirmProbation(1, 1, 2);
      expect(r).toBeTruthy();
    });
  });

  describe("extendProbation", () => {
    it("throws when user not found", async () => {
      await expect(extendProbation(1, 99, 2, { new_end_date: "2026-12-01", reason: "needs more time" })).rejects.toThrow();
    });
    it("extends successfully", async () => {
      c.first.mockResolvedValueOnce({ id: 1, probation_status: "on_probation", probation_end_date: "2026-06-01" });
      c.update.mockResolvedValue(1);
      c.insert.mockResolvedValue([1]);
      const r = await extendProbation(1, 1, 2, { new_end_date: "2026-12-01", reason: "extension needed" });
      expect(r).toBeTruthy();
    });
  });

  describe("getProbationDashboard", () => {
    it("returns dashboard data", async () => {
      c.count
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([{ count: 1 }]);
      c.orderBy.mockResolvedValueOnce([]);
      const r = await getProbationDashboard(1);
      expect(r).toBeTruthy();
    });
  });
});

// ===================== Module Webhook Service =====================
import { handleModuleWebhook } from "../../services/webhook/module-webhook.service.js";

describe("Module Webhook Service Coverage", () => {
  beforeEach(reset);

  it("handles recruit.candidate_hired", async () => {
    c.first.mockResolvedValueOnce({ id: 1 });
    c.update.mockResolvedValue(1);
    await handleModuleWebhook("recruit.candidate_hired", { employeeId: 1, candidateId: 2, jobTitle: "Dev", joiningDate: "2026-06-01" }, "emp-recruit");
  });

  it("handles exit.initiated", async () => {
    c.first.mockResolvedValueOnce({ id: 1 });
    c.update.mockResolvedValue(1);
    await handleModuleWebhook("exit.initiated", { employeeId: 1, exitDate: "2026-06-30", reason: "Resignation" }, "emp-exit");
  });

  it("handles exit.completed", async () => {
    c.first.mockResolvedValueOnce({ id: 1 });
    c.update.mockResolvedValue(1);
    await handleModuleWebhook("exit.completed", { employeeId: 1 }, "emp-exit");
  });

  it("handles performance.cycle_completed", async () => {
    await handleModuleWebhook("performance.cycle_completed", { cycleId: 1, orgId: 1 }, "emp-performance");
  });

  it("handles rewards.milestone_achieved", async () => {
    c.insert.mockResolvedValue([1]);
    await handleModuleWebhook("rewards.milestone_achieved", { userId: 1, orgId: 1, milestone: "100 points" }, "emp-rewards");
  });

  it("handles unknown event", async () => {
    await handleModuleWebhook("unknown.event", {}, "test");
  });
});

// ===================== Position Service =====================
import {
  createPosition, listPositions, getPosition, updatePosition, deletePosition,
  assignUserToPosition, removeUserFromPosition, getPositionHierarchy,
  getVacancies, createHeadcountPlan, listHeadcountPlans,
  updateHeadcountPlan, approveHeadcountPlan, rejectHeadcountPlan, getPositionDashboard,
} from "../../services/position/position.service.js";

describe("Position Service Coverage", () => {
  beforeEach(reset);

  describe("createPosition", () => {
    it("creates position", async () => {
      c.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createPosition(1, { title: "Dev", department_id: 1, level: 3, headcount_budget: 5 } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("listPositions", () => {
    it("lists with filters", async () => {
      c.count.mockResolvedValueOnce([{ count: 1 }]);
      c.offset.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listPositions(1, { page: 1, per_page: 10, department_id: 1, status: "active", search: "dev" } as any);
      expect(r).toBeTruthy();
    });
    it("lists with defaults", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await listPositions(1, {} as any);
      expect(r).toBeTruthy();
    });
  });

  describe("getPosition", () => {
    it("throws when not found", async () => {
      await expect(getPosition(1, 99)).rejects.toThrow();
    });
    it("returns position with assignments", async () => {
      c.first.mockResolvedValueOnce({ id: 1, title: "Dev" });
      c.select.mockResolvedValueOnce([{ id: 1, user_id: 1 }]);
      const r = await getPosition(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("updatePosition", () => {
    it("throws when not found", async () => {
      await expect(updatePosition(1, 99, {} as any)).rejects.toThrow();
    });
    it("updates", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, title: "Updated" });
      c.select.mockResolvedValueOnce([]);
      c.update.mockResolvedValue(1);
      const r = await updatePosition(1, 1, { title: "Updated" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("deletePosition", () => {
    it("throws when not found", async () => {
      await expect(deletePosition(1, 99)).rejects.toThrow();
    });
    it("throws when has assignments", async () => {
      c.first.mockResolvedValueOnce({ id: 1 });
      c.count.mockResolvedValueOnce([{ count: 2 }]);
      await expect(deletePosition(1, 1)).rejects.toThrow();
    });
    it("deletes", async () => {
      c.first.mockResolvedValueOnce({ id: 1 });
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.delete.mockResolvedValue(1);
      await deletePosition(1, 1);
    });
  });

  describe("assignUserToPosition", () => {
    it("throws when position not found", async () => {
      await expect(assignUserToPosition(1, { position_id: 99, user_id: 1, is_primary: true } as any)).rejects.toThrow();
    });
    it("assigns user", async () => {
      c.first.mockResolvedValueOnce({ id: 1, headcount_budget: 5, headcount_filled: 2 }).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, user_id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      c.update.mockResolvedValue(1);
      const r = await assignUserToPosition(1, { position_id: 1, user_id: 1, is_primary: true } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("removeUserFromPosition", () => {
    it("throws when not found", async () => {
      await expect(removeUserFromPosition(1, 99)).rejects.toThrow();
    });
    it("removes", async () => {
      c.first.mockResolvedValueOnce({ id: 1, position_id: 1 });
      c.delete.mockResolvedValue(1);
      c.decrement.mockResolvedValue(1);
      await removeUserFromPosition(1, 1);
    });
  });

  describe("getPositionHierarchy", () => {
    it("returns hierarchy", async () => {
      c.select.mockResolvedValueOnce([{ id: 1, title: "Dev", parent_position_id: null, level: 1 }]);
      const r = await getPositionHierarchy(1);
      expect(r).toBeTruthy();
    });
  });

  describe("getVacancies", () => {
    it("returns vacancies", async () => {
      c.having.mockResolvedValueOnce([{ id: 1, title: "Dev", vacancies: 2 }]);
      const r = await getVacancies(1);
      expect(r).toBeTruthy();
    });
  });

  describe("createHeadcountPlan", () => {
    it("creates plan", async () => {
      c.first.mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createHeadcountPlan(1, 1, { title: "Q3 Plan", department_id: 1, planned_count: 10 } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("listHeadcountPlans", () => {
    it("lists plans", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await listHeadcountPlans(1, {} as any);
      expect(r).toBeTruthy();
    });
  });

  describe("updateHeadcountPlan", () => {
    it("throws when not found", async () => {
      await expect(updateHeadcountPlan(1, 99, {} as any)).rejects.toThrow();
    });
    it("updates", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, title: "Updated" });
      c.update.mockResolvedValue(1);
      const r = await updateHeadcountPlan(1, 1, { title: "Updated" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("approveHeadcountPlan", () => {
    it("throws when not found", async () => {
      await expect(approveHeadcountPlan(1, 99, 1)).rejects.toThrow();
    });
    it("approves", async () => {
      c.first.mockResolvedValueOnce({ id: 1, status: "pending" }).mockResolvedValueOnce({ id: 1, status: "approved" });
      c.update.mockResolvedValue(1);
      const r = await approveHeadcountPlan(1, 1, 2);
      expect(r).toBeTruthy();
    });
  });

  describe("rejectHeadcountPlan", () => {
    it("throws when not found", async () => {
      await expect(rejectHeadcountPlan(1, 99, 1)).rejects.toThrow();
    });
    it("rejects", async () => {
      c.first.mockResolvedValueOnce({ id: 1, status: "pending" }).mockResolvedValueOnce({ id: 1, status: "rejected" });
      c.update.mockResolvedValue(1);
      const r = await rejectHeadcountPlan(1, 1, 2, "Budget cut");
      expect(r).toBeTruthy();
    });
  });

  describe("getPositionDashboard", () => {
    it("returns dashboard", async () => {
      c.count.mockResolvedValueOnce([{ count: 10 }]).mockResolvedValueOnce([{ count: 2 }]);
      c.first.mockResolvedValueOnce({ total_budget: 20, total_filled: 15 });
      c.select.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const r = await getPositionDashboard(1);
      expect(r).toBeTruthy();
    });
  });
});

// ===================== Attendance + Shift =====================
import {
  checkIn, checkOut, getMyToday, getMyHistory, listRecords, getDashboard, getMonthlyReport,
} from "../../services/attendance/attendance.service.js";
import {
  createShift, updateShift, getShift, listShifts, deleteShift,
  assignShift, listShiftAssignments, bulkAssignShifts,
  getSchedule, getMySchedule, createSwapRequest, listSwapRequests,
  approveSwapRequest, rejectSwapRequest,
} from "../../services/attendance/shift.service.js";

describe("Attendance Service Coverage", () => {
  beforeEach(reset);

  describe("checkIn", () => {
    it("throws when already checked in", async () => {
      c.first.mockResolvedValueOnce({ id: 1, check_out_time: null });
      await expect(checkIn(1, 1, {} as any)).rejects.toThrow();
    });
    it("checks in successfully", async () => {
      c.first.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      c.update.mockResolvedValue(1);
      const r = await checkIn(1, 1, { latitude: 12.9, longitude: 77.6 } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("checkOut", () => {
    it("throws when no active check-in", async () => {
      c.first.mockResolvedValueOnce(null);
      await expect(checkOut(1, 1, {} as any)).rejects.toThrow();
    });
    it("checks out successfully", async () => {
      c.first.mockResolvedValueOnce({ id: 1, check_in_time: new Date(Date.now() - 3600000) }).mockResolvedValueOnce({ id: 1 });
      c.update.mockResolvedValue(1);
      const r = await checkOut(1, 1, {} as any);
      expect(r).toBeTruthy();
    });
  });

  describe("getMyToday", () => {
    it("returns null when no record", async () => {
      c.first.mockResolvedValueOnce(null);
      const r = await getMyToday(1, 1);
      expect(r).toBeNull();
    });
  });

  describe("getMyHistory", () => {
    it("returns history", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await getMyHistory(1, 1, { page: 1, perPage: 10 });
      expect(r).toBeTruthy();
    });
  });

  describe("listRecords", () => {
    it("lists records", async () => {
      c.count.mockResolvedValueOnce([{ count: 0 }]);
      c.offset.mockResolvedValueOnce([]);
      const r = await listRecords(1, { page: 1, perPage: 10 });
      expect(r).toBeTruthy();
    });
  });

  describe("getDashboard", () => {
    it("returns dashboard", async () => {
      c.count
        .mockResolvedValueOnce([{ count: 100 }])
        .mockResolvedValueOnce([{ count: 80 }])
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([{ count: 15 }]);
      const r = await getDashboard(1);
      expect(r).toBeTruthy();
    });
  });

  describe("getMonthlyReport", () => {
    it("returns report", async () => {
      c.select.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const r = await getMonthlyReport(1, { month: 6, year: 2026 });
      expect(r).toBeTruthy();
    });
  });
});

describe("Shift Service Coverage", () => {
  beforeEach(reset);

  describe("createShift", () => {
    it("creates shift", async () => {
      c.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createShift(1, { name: "Morning", start_time: "09:00", end_time: "18:00" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("updateShift", () => {
    it("throws when not found", async () => {
      await expect(updateShift(1, 99, {})).rejects.toThrow();
    });
    it("updates", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, name: "Updated" });
      c.update.mockResolvedValue(1);
      const r = await updateShift(1, 1, { name: "Updated" });
      expect(r).toBeTruthy();
    });
  });

  describe("getShift", () => {
    it("throws when not found", async () => {
      await expect(getShift(1, 99)).rejects.toThrow();
    });
    it("returns shift", async () => {
      c.first.mockResolvedValueOnce({ id: 1, name: "Morning" });
      const r = await getShift(1, 1);
      expect(r.name).toBe("Morning");
    });
  });

  describe("listShifts", () => {
    it("returns shifts", async () => {
      c.orderBy.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listShifts(1);
      expect(r).toBeTruthy();
    });
  });

  describe("deleteShift", () => {
    it("deletes", async () => {
      c.delete.mockResolvedValue(1);
      await deleteShift(1, 1);
    });
  });

  describe("assignShift", () => {
    it("throws when shift not found", async () => {
      c.first.mockResolvedValueOnce(null);
      await expect(assignShift(1, { shift_id: 99, user_id: 1, start_date: "2026-06-01", end_date: "2026-06-30" } as any)).rejects.toThrow();
    });
    it("assigns shift", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      const r = await assignShift(1, { shift_id: 1, user_id: 1, start_date: "2026-06-01", end_date: "2026-06-30" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("listShiftAssignments", () => {
    it("lists assignments", async () => {
      c.select.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listShiftAssignments(1, { user_id: 1 });
      expect(r).toBeTruthy();
    });
  });

  describe("bulkAssignShifts", () => {
    it("assigns in bulk", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
      c.insert.mockResolvedValue([1]);
      const r = await bulkAssignShifts(1, { shift_id: 1, user_ids: [1, 2], start_date: "2026-06-01", end_date: "2026-06-30" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("getSchedule", () => {
    it("returns schedule", async () => {
      c.select.mockResolvedValueOnce([]);
      const r = await getSchedule(1, { start_date: "2026-06-01", end_date: "2026-06-30" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("getMySchedule", () => {
    it("returns my schedule", async () => {
      c.select.mockResolvedValueOnce([]);
      const r = await getMySchedule(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("createSwapRequest", () => {
    it("creates swap request", async () => {
      c.first.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ id: 1 });
      c.insert.mockResolvedValueOnce([1]);
      const r = await createSwapRequest(1, 1, { my_assignment_id: 1, target_assignment_id: 2, reason: "personal" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("listSwapRequests", () => {
    it("lists", async () => {
      c.select.mockResolvedValueOnce([]);
      const r = await listSwapRequests(1, {});
      expect(r).toBeTruthy();
    });
  });

  describe("approveSwapRequest", () => {
    it("throws when not found", async () => {
      await expect(approveSwapRequest(1, 99, 1)).rejects.toThrow();
    });
    it("approves", async () => {
      c.first.mockResolvedValueOnce({ id: 1, status: "pending", requester_assignment_id: 1, target_assignment_id: 2 })
        .mockResolvedValueOnce({ id: 1, shift_id: 1 })
        .mockResolvedValueOnce({ id: 2, shift_id: 2 })
        .mockResolvedValueOnce({ id: 1, status: "approved" });
      c.update.mockResolvedValue(1);
      const r = await approveSwapRequest(1, 1, 2);
      expect(r).toBeTruthy();
    });
  });

  describe("rejectSwapRequest", () => {
    it("throws when not found", async () => {
      await expect(rejectSwapRequest(1, 99, 1)).rejects.toThrow();
    });
    it("rejects", async () => {
      c.first.mockResolvedValueOnce({ id: 1, status: "pending" }).mockResolvedValueOnce({ id: 1, status: "rejected" });
      c.update.mockResolvedValue(1);
      const r = await rejectSwapRequest(1, 1, 2);
      expect(r).toBeTruthy();
    });
  });
});
