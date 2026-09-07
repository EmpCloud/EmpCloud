import { describe, expect, it, vi } from "vitest";

import { up } from "../../db/migrations/107_organization_contact_number.js";

function migrationKnex(columns: string[]) {
  const after = vi.fn();
  const nullable = vi.fn(() => ({ after }));
  const string = vi.fn(() => ({ nullable }));
  const update = vi.fn().mockResolvedValue(1);
  const whereNull = vi.fn(() => ({ update }));
  const tableQuery = { whereNull };
  const knex = vi.fn(() => tableQuery) as any;

  knex.schema = {
    hasColumn: vi.fn(async (_table: string, column: string) => columns.includes(column)),
    alterTable: vi.fn(async (_table: string, callback: (table: any) => void) => {
      callback({ string });
    }),
  };
  knex.ref = vi.fn((column: string) => ({ reference: column }));

  return { knex, after, string, update, whereNull };
}

describe("migration 107 organization contact number", () => {
  it("adds contact_number and backfills it from the legacy phone column", async () => {
    const mock = migrationKnex(["phone"]);

    await up(mock.knex);

    expect(mock.string).toHaveBeenCalledWith("contact_number", 30);
    expect(mock.after).toHaveBeenCalledWith("phone");
    expect(mock.whereNull).toHaveBeenCalledWith("contact_number");
    expect(mock.knex.ref).toHaveBeenCalledWith("phone");
    expect(mock.update).toHaveBeenCalledWith({ contact_number: { reference: "phone" } });
  });

  it("does nothing when contact_number already exists", async () => {
    const mock = migrationKnex(["contact_number", "phone"]);

    await up(mock.knex);

    expect(mock.knex.schema.alterTable).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});
