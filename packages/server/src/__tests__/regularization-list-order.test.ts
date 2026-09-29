import knex, { type Knex } from "knex";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getDB } = vi.hoisted(() => ({ getDB: vi.fn() }));
vi.mock("../db/connection.js", () => ({ getDB }));
import { getMyRegularizations, listRegularizations } from "../services/attendance/regularization.service.js";

// Compile through the real MySQL Knex dialect; intercept execution so the
// regression tests need no database and cannot read or mutate server data.
const db = knex({ client: "mysql2" });
const statements: Knex.Sql[] = [];
vi.spyOn(db.client, "runner").mockImplementation((builder: Knex.QueryBuilder) => ({
  run: async () => {
    const statement = builder.toSQL();
    statements.push(statement);
    return statement.sql.includes("count(*)") ? [{ count: 0 }] : [];
  },
}) as any);

beforeEach(() => {
  statements.length = 0;
  getDB.mockReturnValue(db);
});
afterAll(async () => { await db.destroy(); });

describe("regularization ordering before pagination", () => {
  it.each(["asc", "desc"] as const)("orders the scoped organization list by date %s before paging", async (sortOrder) => {
    await listRegularizations(12, {
      page: 2, perPage: 10, sortOrder, userIds: [42], departmentId: 7,
      dateFrom: "2026-09-01", dateTo: "2026-09-30",
    });
    const query = statements[1];
    expect(query.sql).toContain("where `ar`.`organization_id` = ? and `ar`.`user_id` in (?) and `u`.`department_id` = ? and `ar`.`date` >= ? and `ar`.`date` <= ?");
    expect(query.sql).toContain(`order by \`ar\`.\`date\` ${sortOrder}, \`ar\`.\`id\` ${sortOrder} limit ? offset ?`);
    expect(query.bindings).toEqual([12, 42, 7, "2026-09-01", "2026-09-30", 10, 10]);
  });

  it("orders personal requests before paging and retains both tenant and owner restrictions", async () => {
    await getMyRegularizations(12, 42, { page: 3, perPage: 10, sortOrder: "asc" });
    const query = statements[1];
    expect(query.sql).toContain("where `ar`.`organization_id` = ? and `ar`.`user_id` = ?");
    expect(query.sql).toContain("order by `ar`.`date` asc, `ar`.`id` asc limit ? offset ?");
    expect(query.bindings).toEqual([12, 42, 10, 20]);
  });

  it("uses descending date order when service callers omit sorting", async () => {
    await listRegularizations(12);
    expect(statements[1].sql).toContain("order by `ar`.`date` desc, `ar`.`id` desc limit ?");
  });
});
