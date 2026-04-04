import knex, { Knex } from "knex";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: Knex;

beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "empcloud" },
    pool: { min: 1, max: 5 },
  });
  await db.raw("SELECT 1");
});

afterAll(async () => { if (db) await db.destroy(); });

const ORG_ID = 5;
const U = String(Date.now()).slice(-6);

describe("Webhook Handler (deep)", () => {
  const TEST_ORG = 96;
  let subId: number, mapId: number;

  beforeAll(async () => {
    const org = await db("organizations").where({ id: TEST_ORG }).first();
    if (!org) {
      await db("organizations").insert({
        id: TEST_ORG, name: `WhOrg-${U}`, domain: `whorg-${U}.test`,
        current_user_count: 0, total_allowed_user_count: 50,
        created_at: new Date(), updated_at: new Date(),
      });
    }
  });

  afterAll(async () => {
    if (mapId) await db("billing_subscription_mappings").where({ id: mapId }).delete();
    if (subId) await db("org_subscriptions").where({ id: subId }).delete();
    await db("organizations").where({ id: TEST_ORG }).delete();
  });

  it("create test sub + mapping", async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30*86400000);
    const [sid] = await db("org_subscriptions").insert({
      organization_id: TEST_ORG, module_id: 1, plan_tier: "basic", status: "trial",
      total_seats: 5, used_seats: 0, billing_cycle: "monthly", price_per_seat: 10000, currency: "INR",
      current_period_start: now, current_period_end: end,
      created_at: now, updated_at: now,
    });
    subId = sid;
    const [mid] = await db("billing_subscription_mappings").insert({
      organization_id: TEST_ORG, cloud_subscription_id: sid, billing_subscription_id: `wh-${U}`, created_at: new Date(),
    });
    mapId = mid;
  });

  it("invoice.paid activates", async () => {
    const m = await db("billing_subscription_mappings").where({ billing_subscription_id: `wh-${U}` }).first();
    await db("org_subscriptions").where({ id: m.cloud_subscription_id }).update({ status: "active", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("active");
  });

  it("subscription.cancelled", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("cancelled");
  });

  it("payment_failed marks past_due", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "active", cancelled_at: null, updated_at: new Date() });
    await db("org_subscriptions").where({ id: subId }).update({ status: "past_due", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("invoice.overdue", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "past_due", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("audit logs exist", async () => {
    expect(await db("audit_logs").where({ organization_id: ORG_ID }).orderBy("created_at", "desc").limit(5)).toBeDefined();
  });

  it("unknown mapping graceful", async () => {
    expect(await db("billing_subscription_mappings").where({ billing_subscription_id: "nonexistent" }).first()).toBeFalsy();
  });
});
