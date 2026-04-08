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

const ORG_ID = 5;
const ADMIN_ID = 522;
const EMP_ID = 524;
const MGR_ID = 529;
const HR_ID = 525;
const U = String(Date.now()).slice(-6);

describe("Subscription (deep)", () => {
  // Use a test org to avoid unique constraint on org 5
  const TEST_ORG = 97;
  let subId: number;

  beforeAll(async () => {
    const org = await db("organizations").where({ id: TEST_ORG }).first();
    if (!org) {
      await db("organizations").insert({
        id: TEST_ORG, name: `SubTestOrg-${U}`, domain: `subtestorg-${U}.test`,
        current_user_count: 0, total_allowed_user_count: 50,
        created_at: new Date(), updated_at: new Date(),
      });
    }
  });

  afterAll(async () => {
    if (subId) {
      await db("org_module_seats").where({ subscription_id: subId }).delete();
      await db("billing_subscription_mappings").where({ cloud_subscription_id: subId }).delete();
      await db("org_subscriptions").where({ id: subId }).delete();
    }
    await db("organizations").where({ id: TEST_ORG }).delete();
  });

  it("list modules", async () => { expect((await db("modules")).length).toBeGreaterThanOrEqual(10); });

  it("create subscription", async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30*86400000);
    const [id] = await db("org_subscriptions").insert({
      organization_id: TEST_ORG, module_id: 1, plan_tier: "basic", status: "trial",
      total_seats: 10, used_seats: 0, billing_cycle: "monthly", price_per_seat: 10000, currency: "INR",
      trial_ends_at: new Date(now.getTime() + 14*86400000),
      current_period_start: now, current_period_end: end,
      created_at: now, updated_at: now,
    });
    subId = id;
    expect((await db("org_subscriptions").where({ id }).first()).status).toBe("trial");
  });

  it("activate", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "active", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("active");
  });

  it("assign seat", async () => {
    await db("org_module_seats").insert({
      organization_id: TEST_ORG, subscription_id: subId, module_id: 1,
      user_id: EMP_ID, assigned_by: ADMIN_ID, assigned_at: new Date(),
    });
    expect(await db("org_module_seats").where({ subscription_id: subId, user_id: EMP_ID }).first()).toBeTruthy();
  });

  it("count seats", async () => {
    const [{ c }] = await db("org_module_seats").where({ subscription_id: subId }).count("id as c");
    expect(Number(c)).toBe(1);
  });

  it("cancel", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("cancelled");
  });

  it("past_due", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "past_due", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("list with module info", async () => {
    const r = await db("org_subscriptions as os").leftJoin("modules as m", "os.module_id", "m.id")
      .where({ "os.organization_id": ORG_ID }).select("os.*", "m.name as mn");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("billing mappings", async () => {
    const [mid] = await db("billing_subscription_mappings").insert({
      organization_id: TEST_ORG, cloud_subscription_id: subId,
      billing_subscription_id: `bs-sub-${U}`, created_at: new Date(),
    });
    expect(mid).toBeGreaterThan(0);
  });

  it("billing client mappings", async () => { expect(await db("billing_client_mappings").limit(5)).toBeDefined(); });
});
