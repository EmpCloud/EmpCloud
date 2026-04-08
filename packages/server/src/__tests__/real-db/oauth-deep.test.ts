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

describe("OAuth (deep)", () => {
  it("oauth clients", async () => { const c = await db("oauth_clients").limit(5); expect(c).toBeDefined(); });
  it("signing keys table exists", async () => {
    expect(await db.schema.hasTable("signing_keys")).toBe(true);
    const k = await db("signing_keys").limit(5);
    expect(Array.isArray(k)).toBe(true);
  });
  it("access tokens", async () => { expect(await db("oauth_access_tokens").limit(5)).toBeDefined(); });
  it("refresh tokens", async () => { expect(await db("oauth_refresh_tokens").limit(5)).toBeDefined(); });
  it("auth codes table exists", async () => { expect(await db.schema.hasTable("oauth_authorization_codes")).toBe(true); });
  it("modules list", async () => { expect((await db("modules")).length).toBeGreaterThanOrEqual(10); });
  it("org subscriptions", async () => { expect(await db("org_subscriptions").where({ organization_id: ORG_ID })).toBeDefined(); });
  it("org module seats", async () => { expect(await db("org_module_seats").where({ organization_id: ORG_ID })).toBeDefined(); });
});
