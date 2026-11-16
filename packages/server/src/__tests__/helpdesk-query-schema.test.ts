import { describe, expect, it } from "vitest";
import {
  helpdeskMyTicketsQuerySchema,
  helpdeskQuerySchema,
} from "@empcloud/shared";

describe("helpdesk query schemas", () => {
  it("accepts real ISO calendar dates and the resolved-date today shortcut", () => {
    expect(
      helpdeskQuerySchema.parse({
        created_date: "2024-02-29",
        resolved_date: "today",
      }),
    ).toMatchObject({
      created_date: "2024-02-29",
      resolved_date: "today",
    });
  });

  it.each([
    { created_date: "2026-02-30" },
    { created_date: "16-10-2026" },
    { resolved_date: "tomorrow" },
    { resolved_date: "2026-13-01" },
  ])("rejects invalid helpdesk dates: %o", (query) => {
    expect(() => helpdeskQuerySchema.parse(query)).toThrow();
  });

  it("accepts both sort aliases without defaulting the common alias", () => {
    const empty = helpdeskQuerySchema.parse({});
    expect(empty.sort_order).toBeUndefined();
    expect(empty.sort_direction).toBeUndefined();

    expect(
      helpdeskQuerySchema.parse({
        sort_by: "subject",
        sort_order: "asc",
        sort_direction: "desc",
      }),
    ).toMatchObject({
      sort_by: "subject",
      sort_order: "asc",
      sort_direction: "desc",
    });
  });

  it("validates and normalizes my-ticket filters", () => {
    expect(
      helpdeskMyTicketsQuerySchema.parse({
        page: "2",
        per_page: "10",
        status: "reopened",
        category: "it",
        priority: "high",
        search: "  VPN  ",
        date_range: "30",
        sort: "priority",
      }),
    ).toEqual({
      page: 2,
      per_page: 10,
      status: "reopened",
      category: "it",
      priority: "high",
      search: "VPN",
      date_range: "30",
      sort: "priority",
    });

    expect(() =>
      helpdeskMyTicketsQuerySchema.parse({ status: "unknown" }),
    ).toThrow();
    expect(() =>
      helpdeskMyTicketsQuerySchema.parse({ category: ["it", "leave"] }),
    ).toThrow();
  });
});
