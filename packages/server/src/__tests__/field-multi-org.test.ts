import { describe, expect, it } from "vitest";
import { multiOrgFieldEmployeeListSchema } from "../services/field-legacy/field-legacy.validation.js";

const parse = (input: unknown) => multiOrgFieldEmployeeListSchema.parse(input);

describe("fieldAllEmployeeListMultiOrg request", () => {
  it("requires a non-empty organization_ids array", () => {
    expect(() => parse({})).toThrow();
    expect(() => parse({ organization_ids: [] })).toThrow(
      "organization_ids must contain at least one organization id",
    );
    expect(() => parse({ organization_ids: [1, "bad"] })).toThrow();
  });

  it("defaults pagination to skip 0 and limit 100", () => {
    const input = parse({ organization_ids: [3, 4] });
    expect(input.skip).toBe(0);
    expect(input.limit).toBe(100);
  });

  it("normalizes all supported filters without changing their public keys", () => {
    const input = parse({
      organization_ids: [3, 3, 4],
      department_id: "7,8",
      location_id: 9,
      role_id: 10,
      name: "  Ada  ",
      project_name: "  Apollo  ",
      employee_ids: [11, 12],
      status: 0,
      non_admin_id: 13,
      skip: 20,
      limit: 25,
    });
    expect(input).toEqual({
      organization_ids: [3, 4],
      department_ids: [7, 8],
      location_id: 9,
      role_id: 10,
      name: "Ada",
      project_name: "Apollo",
      employee_ids: [11, 12],
      status: 0,
      non_admin_id: 13,
      skip: 20,
      limit: 25,
    });
  });

  it("rejects invalid pagination", () => {
    expect(() => parse({ organization_ids: [1], skip: -1 })).toThrow();
    expect(() => parse({ organization_ids: [1], limit: 0 })).toThrow();
  });
});
