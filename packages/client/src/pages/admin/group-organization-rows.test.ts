import { describe, expect, it } from "vitest";
import { groupOrganizationRows } from "./group-organization-rows";

type Row = {
  id: string;
  organizationId: number | null;
  clientId?: string;
  organizationName: string | null;
  organizationEmail: string | null;
};

describe("groupOrganizationRows", () => {
  it("groups repeated organizations while keeping unrelated billing clients separate", () => {
    const rows: Row[] = [
      {
        id: "invoice-1",
        organizationId: 12,
        organizationName: "Acme",
        organizationEmail: "billing@acme.test",
      },
      {
        id: "invoice-2",
        organizationId: 44,
        organizationName: "Beta",
        organizationEmail: "billing@beta.test",
      },
      {
        id: "invoice-3",
        organizationId: 12,
        organizationName: "Acme",
        organizationEmail: "billing@acme.test",
      },
      {
        id: "invoice-4",
        organizationId: null,
        clientId: "billing-client-a",
        organizationName: null,
        organizationEmail: null,
      },
      {
        id: "invoice-5",
        organizationId: null,
        clientId: "billing-client-b",
        organizationName: null,
        organizationEmail: null,
      },
    ];

    const groups = groupOrganizationRows(rows, (row) => ({
      key: row.organizationId != null
        ? `organization:${row.organizationId}`
        : `client:${row.clientId ?? row.id}`,
      id: row.organizationId,
      name: row.organizationName,
      email: row.organizationEmail,
    }));

    expect(
      groups.map((group) => ({
        key: group.key,
        rowIds: group.rows.map((row) => row.id),
      })),
    ).toEqual([
      { key: "organization:12", rowIds: ["invoice-1", "invoice-3"] },
      { key: "organization:44", rowIds: ["invoice-2"] },
      { key: "client:billing-client-a", rowIds: ["invoice-4"] },
      { key: "client:billing-client-b", rowIds: ["invoice-5"] },
    ]);
    expect(groups[0]).toMatchObject({
      name: "Acme",
      email: "billing@acme.test",
    });
  });
});
