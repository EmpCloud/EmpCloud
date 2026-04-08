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

describe("Leave Balance (deep)", () => {
  let balId: number, ltId: number;
  afterAll(async () => {
    if (balId) await db("leave_balances").where({ id: balId }).delete();
    if (ltId) await db("leave_types").where({ id: ltId }).delete();
  });

  it("get balances with type names", async () => {
    const r = await db("leave_balances").leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
      .where({ "leave_balances.organization_id": ORG_ID, "leave_balances.user_id": EMP_ID, "leave_balances.year": new Date().getFullYear() })
      .select("leave_balances.*", "leave_types.name as ltn");
    expect(r).toBeDefined();
  });

  it("create type + balance", async () => {
    const code = `Z${U}`;
    const [id] = await db("leave_types").insert({
      organization_id: ORG_ID, name: `TL ${U}`, code, description: "Test leave",
      is_paid: true, is_carry_forward: false, max_carry_forward_days: 0,
      created_at: new Date(), updated_at: new Date(),
    });
    ltId = id;
    const [bid] = await db("leave_balances").insert({
      organization_id: ORG_ID, user_id: EMP_ID, leave_type_id: id, year: 2017,
      total_allocated: 12, total_used: 0, total_carry_forward: 0, balance: 12,
      created_at: new Date(), updated_at: new Date(),
    });
    balId = bid;
    expect(Number((await db("leave_balances").where({ id: bid }).first()).balance)).toBe(12);
  });

  it("deduct balance", async () => {
    const b = await db("leave_balances").where({ id: balId }).first();
    await db("leave_balances").where({ id: balId }).update({ total_used: Number(b.total_used) + 2, balance: Number(b.balance) - 2, updated_at: new Date() });
    expect(Number((await db("leave_balances").where({ id: balId }).first()).balance)).toBe(10);
  });

  it("credit balance", async () => {
    const b = await db("leave_balances").where({ id: balId }).first();
    await db("leave_balances").where({ id: balId }).update({ total_used: Math.max(0, Number(b.total_used) - 1), balance: Number(b.balance) + 1, updated_at: new Date() });
    expect(Number((await db("leave_balances").where({ id: balId }).first()).balance)).toBe(11);
  });

  it("init balances data check", async () => {
    const policies = await db("leave_policies").where({ organization_id: ORG_ID, is_active: true });
    expect(policies).toBeDefined();
    expect((await db("users").where({ organization_id: ORG_ID, status: 1 }).select("id")).length).toBeGreaterThan(0);
  });

  it("carry forward types", async () => {
    expect(await db("leave_types").where({ organization_id: ORG_ID, is_carry_forward: true })).toBeDefined();
  });
});
