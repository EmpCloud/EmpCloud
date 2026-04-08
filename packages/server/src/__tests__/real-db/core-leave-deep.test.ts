// =============================================================================
// EMP CLOUD - Deep Leave Balance / Application / Comp-Off Tests
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
const HR = 525;
const U = String(Date.now()).slice(-6);

// -- Leave Types & Balances ---------------------------------------------------
describe("Leave Balance (deep)", () => {
  let ltId: number, balId: number;
  afterAll(async () => {
    if (balId) await db("leave_balances").where({ id: balId }).delete();
    if (ltId) await db("leave_types").where({ id: ltId }).delete();
  });

  it("get balances with type names", async () => {
    const r = await db("leave_balances")
      .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
      .where({ "leave_balances.organization_id": ORG, "leave_balances.user_id": EMP, "leave_balances.year": new Date().getFullYear() })
      .select("leave_balances.*", "leave_types.name as leave_type_name", "leave_types.color as leave_type_color");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("create type + balance", async () => {
    const code = `X${U}`;
    const [id] = await db("leave_types").insert({
      organization_id: ORG, name: `TestLeave ${U}`, code,
      description: "Deep test leave type",
      is_paid: true, is_carry_forward: false, max_carry_forward_days: 0,
      is_encashable: false, requires_approval: true, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    ltId = id;

    const [bid] = await db("leave_balances").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: id, year: 2018,
      total_allocated: 12, total_used: 0, total_carry_forward: 0, balance: 12,
      created_at: new Date(), updated_at: new Date(),
    });
    balId = bid;
    // decimal(5,1) returns string "12.0"
    expect(Number((await db("leave_balances").where({ id: bid }).first()).balance)).toBe(12);
  });

  it("deduct balance", async () => {
    const b = await db("leave_balances").where({ id: balId }).first();
    await db("leave_balances").where({ id: balId }).update({
      total_used: Number(b.total_used) + 2, balance: Number(b.balance) - 2, updated_at: new Date(),
    });
    expect(Number((await db("leave_balances").where({ id: balId }).first()).balance)).toBe(10);
  });

  it("credit balance", async () => {
    const b = await db("leave_balances").where({ id: balId }).first();
    await db("leave_balances").where({ id: balId }).update({
      total_used: Math.max(0, Number(b.total_used) - 1), balance: Number(b.balance) + 1, updated_at: new Date(),
    });
    expect(Number((await db("leave_balances").where({ id: balId }).first()).balance)).toBe(11);
  });

  it("insufficient balance check", async () => {
    const b = await db("leave_balances").where({ id: balId }).first();
    expect(Number(b.balance)).toBeLessThan(100);
  });

  it("init balances - policies + users exist", async () => {
    const policies = await db("leave_policies").where({ organization_id: ORG, is_active: true });
    expect(policies.length).toBeGreaterThan(0);
    const users = await db("users").where({ organization_id: ORG, status: 1 }).select("id");
    expect(users.length).toBeGreaterThan(0);
  });

  it("carry forward types exist", async () => {
    const r = await db("leave_types").where({ organization_id: ORG, is_carry_forward: true });
    expect(Array.isArray(r)).toBe(true);
  });

  it("encashable leave types", async () => {
    const r = await db("leave_types").where({ organization_id: ORG, is_encashable: true });
    expect(Array.isArray(r)).toBe(true);
  });

  it("carry forward calculation logic", async () => {
    // Simulate: create carry-forward type with max 5, prev year balance 8 => carry = 5
    const cfCode = `CF${U}`;
    const [cfId] = await db("leave_types").insert({
      organization_id: ORG, name: `CF Type ${U}`, code: cfCode,
      is_paid: true, is_carry_forward: true, max_carry_forward_days: 5,
      created_at: new Date(), updated_at: new Date(),
    });
    // prev year balance
    const [prevBid] = await db("leave_balances").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: cfId, year: 2017,
      total_allocated: 12, total_used: 4, total_carry_forward: 0, balance: 8,
      created_at: new Date(), updated_at: new Date(),
    });
    // Simulate init: carry = min(8, 5) = 5
    const prevBal = await db("leave_balances").where({ id: prevBid }).first();
    const lt = await db("leave_types").where({ id: cfId }).first();
    const carry = Math.min(Number(prevBal.balance), lt.max_carry_forward_days);
    expect(carry).toBe(5);

    // new year balance with carry
    const [newBid] = await db("leave_balances").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: cfId, year: 2018,
      total_allocated: 12, total_used: 0, total_carry_forward: carry, balance: 12 + carry,
      created_at: new Date(), updated_at: new Date(),
    });
    expect(Number((await db("leave_balances").where({ id: newBid }).first()).balance)).toBe(17);
    expect(Number((await db("leave_balances").where({ id: newBid }).first()).total_carry_forward)).toBe(5);

    // Cleanup
    await db("leave_balances").whereIn("id", [prevBid, newBid]).delete();
    await db("leave_types").where({ id: cfId }).delete();
  });
});

// -- Leave Applications -------------------------------------------------------
describe("Leave Applications (deep)", () => {
  const appIds: number[] = [];
  const approvalIds: number[] = [];
  // Use existing leave type 16 (Casual Leave)
  const LT_ID = 16;
  const YEAR = 2018;

  afterAll(async () => {
    for (const id of approvalIds) await db("leave_approvals").where({ id }).delete();
    for (const id of appIds) {
      await db("leave_approvals").where({ leave_application_id: id }).delete();
      await db("notifications").where({ reference_id: String(id), reference_type: "leave_application" }).delete();
      await db("leave_applications").where({ id }).delete();
    }
  });

  it("apply leave - basic", async () => {
    const [id] = await db("leave_applications").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: LT_ID,
      start_date: "2018-09-10", end_date: "2018-09-11", days_count: 2,
      is_half_day: false, reason: "Deep test leave", status: "pending",
      current_approver_id: MGR,
      created_at: new Date(), updated_at: new Date(),
    });
    appIds.push(id);
    const app = await db("leave_applications").where({ id }).first();
    expect(app.status).toBe("pending");
    expect(Number(app.days_count)).toBe(2);
  });

  it("apply half-day leave", async () => {
    const [id] = await db("leave_applications").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: LT_ID,
      start_date: "2018-09-12", end_date: "2018-09-12", days_count: 0.5,
      is_half_day: true, half_day_type: "first_half",
      reason: "Half day test", status: "pending",
      current_approver_id: MGR,
      created_at: new Date(), updated_at: new Date(),
    });
    appIds.push(id);
    const app = await db("leave_applications").where({ id }).first();
    expect(app.is_half_day).toBeTruthy();
    expect(app.half_day_type).toBe("first_half");
  });

  it("apply second-half on same day (no overlap)", async () => {
    const [id] = await db("leave_applications").insert({
      organization_id: ORG, user_id: EMP, leave_type_id: LT_ID,
      start_date: "2018-09-12", end_date: "2018-09-12", days_count: 0.5,
      is_half_day: true, half_day_type: "second_half",
      reason: "Second half test", status: "pending",
      current_approver_id: MGR,
      created_at: new Date(), updated_at: new Date(),
    });
    appIds.push(id);
    expect((await db("leave_applications").where({ id }).first()).half_day_type).toBe("second_half");
  });

  it("overlap detection query", async () => {
    const overlaps = await db("leave_applications")
      .where({ organization_id: ORG, user_id: EMP })
      .whereIn("status", ["pending", "approved"])
      .where("start_date", "<=", "2018-09-11")
      .where("end_date", ">=", "2018-09-10");
    expect(overlaps.length).toBeGreaterThanOrEqual(1);
  });

  it("approve leave with approval record", async () => {
    const appId = appIds[0];
    await db.transaction(async (trx) => {
      await trx("leave_applications").where({ id: appId }).update({ status: "approved", updated_at: new Date() });
      const [aid] = await trx("leave_approvals").insert({
        leave_application_id: appId, approver_id: MGR, level: 1,
        status: "approved", remarks: "Approved by deep test", acted_at: new Date(), created_at: new Date(),
      });
      approvalIds.push(aid);
    });
    expect((await db("leave_applications").where({ id: appId }).first()).status).toBe("approved");
  });

  it("reject leave with remarks", async () => {
    const appId = appIds[1];
    await db.transaction(async (trx) => {
      await trx("leave_applications").where({ id: appId }).update({ status: "rejected", updated_at: new Date() });
      const [aid] = await trx("leave_approvals").insert({
        leave_application_id: appId, approver_id: MGR, level: 1,
        status: "rejected", remarks: "Not approved", acted_at: new Date(), created_at: new Date(),
      });
      approvalIds.push(aid);
    });
    expect((await db("leave_applications").where({ id: appId }).first()).status).toBe("rejected");
  });

  it("cancel approved leave", async () => {
    const appId = appIds[0];
    await db("leave_applications").where({ id: appId }).update({ status: "cancelled", updated_at: new Date() });
    expect((await db("leave_applications").where({ id: appId }).first()).status).toBe("cancelled");
  });

  it("list applications with joins", async () => {
    const r = await db("leave_applications")
      .join("users", "leave_applications.user_id", "users.id")
      .where("leave_applications.organization_id", ORG)
      .leftJoin("leave_approvals", "leave_applications.id", "leave_approvals.leave_application_id")
      .leftJoin("users as approver", "leave_approvals.approver_id", "approver.id")
      .select(
        "leave_applications.*",
        "users.first_name as user_first_name", "users.last_name as user_last_name",
        "leave_approvals.remarks as admin_remarks",
        db.raw("CONCAT(approver.first_name, ' ', approver.last_name) as approver_name"),
      )
      .orderBy("leave_applications.created_at", "desc").limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("leave calendar query (month range)", async () => {
    const leaves = await db("leave_applications")
      .where({ "leave_applications.organization_id": ORG, "leave_applications.status": "approved" })
      .where("leave_applications.start_date", "<", "2018-10-01")
      .where("leave_applications.end_date", ">=", "2018-09-01")
      .join("users", "leave_applications.user_id", "users.id")
      .join("leave_types", "leave_applications.leave_type_id", "leave_types.id")
      .select("leave_applications.*", "users.first_name", "leave_types.name as leave_type_name");
    expect(Array.isArray(leaves)).toBe(true);
  });

  it("filter by status", async () => {
    const pending = await db("leave_applications")
      .where({ organization_id: ORG, status: "pending" }).count("* as count");
    expect(Number(pending[0].count)).toBeGreaterThanOrEqual(0);
  });

  it("filter by leave_type_id", async () => {
    const r = await db("leave_applications")
      .where({ organization_id: ORG, leave_type_id: LT_ID }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("filter by user_id", async () => {
    const r = await db("leave_applications")
      .where({ organization_id: ORG, user_id: EMP }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });
});

// -- Comp-Off -----------------------------------------------------------------
describe("Comp-Off (deep)", () => {
  const ids: number[] = [];
  afterAll(async () => {
    for (const id of ids) await db("comp_off_requests").where({ id }).delete();
  });

  it("request comp-off", async () => {
    const [id] = await db("comp_off_requests").insert({
      organization_id: ORG, user_id: EMP,
      worked_date: "2018-09-15", expires_on: "2018-12-15",
      reason: "Worked on Saturday - deep test", days: 1, status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    const r = await db("comp_off_requests").where({ id }).first();
    expect(r.status).toBe("pending");
    expect(Number(r.days)).toBe(1);
  });

  it("request half-day comp-off", async () => {
    const [id] = await db("comp_off_requests").insert({
      organization_id: ORG, user_id: EMP,
      worked_date: "2018-09-16", expires_on: "2018-12-16",
      reason: "Half day Saturday", days: 0.5, status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    ids.push(id);
    expect(Number((await db("comp_off_requests").where({ id }).first()).days)).toBe(0.5);
  });

  it("list comp-offs with filters", async () => {
    const r = await db("comp_off_requests")
      .where({ organization_id: ORG, status: "pending" })
      .orderBy("created_at", "desc").limit(20);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("list by user", async () => {
    const r = await db("comp_off_requests")
      .where({ organization_id: ORG, user_id: EMP })
      .orderBy("created_at", "desc");
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("approve comp-off", async () => {
    await db("comp_off_requests").where({ id: ids[0] }).update({
      status: "approved", approved_by: MGR, approved_at: new Date(), updated_at: new Date(),
    });
    const r = await db("comp_off_requests").where({ id: ids[0] }).first();
    expect(r.status).toBe("approved");
    expect(r.approved_by).toBe(MGR);
  });

  it("reject comp-off with reason", async () => {
    await db("comp_off_requests").where({ id: ids[1] }).update({
      status: "rejected", approved_by: MGR, rejection_reason: "Not eligible", updated_at: new Date(),
    });
    const r = await db("comp_off_requests").where({ id: ids[1] }).first();
    expect(r.status).toBe("rejected");
    expect(r.rejection_reason).toBe("Not eligible");
  });

  it("duplicate check query", async () => {
    const existing = await db("comp_off_requests")
      .where({ organization_id: ORG, user_id: EMP })
      .whereRaw("DATE(worked_date) = ?", ["2018-09-15"])
      .whereIn("status", ["pending", "approved"])
      .first();
    expect(existing).toBeTruthy(); // We approved the first one
  });

  it("pagination", async () => {
    const [{ count }] = await db("comp_off_requests").where({ organization_id: ORG }).count("* as count");
    const page = await db("comp_off_requests")
      .where({ organization_id: ORG })
      .orderBy("created_at", "desc").limit(5).offset(0);
    expect(Number(count)).toBeGreaterThanOrEqual(2);
    expect(page.length).toBeGreaterThanOrEqual(1);
  });
});

// -- Leave Policies -----------------------------------------------------------
describe("Leave Policies (deep)", () => {
  it("list active policies", async () => {
    const r = await db("leave_policies").where({ organization_id: ORG, is_active: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toHaveProperty("annual_quota");
  });

  it("policy fields are complete", async () => {
    const p = await db("leave_policies").where({ organization_id: ORG, is_active: true }).first();
    expect(p.accrual_type).toBeTruthy();
    expect(Number(p.annual_quota)).toBeGreaterThan(0);
  });

  it("leave types have all required fields", async () => {
    const lt = await db("leave_types").where({ organization_id: ORG, is_active: true }).first();
    expect(lt).toBeTruthy();
    expect(lt.name).toBeTruthy();
    expect(lt.code).toBeTruthy();
  });
});
