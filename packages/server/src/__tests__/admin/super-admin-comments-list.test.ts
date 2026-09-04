import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDB, getDB, initDB } from "../../db/connection.js";
import {
  getLatestOrganizationComments,
  getOrgList,
} from "../../services/admin/super-admin.service.js";

describe("getOrgList organization comments", () => {
  beforeAll(async () => {
    await initDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  it("includes a latest_comment field for every listed organization", async () => {
    const result = await getOrgList({ page: 1, per_page: 100 });

    expect(result.data.length).toBeGreaterThan(0);
    for (const organization of result.data) {
      expect(organization).toHaveProperty("latest_comment");
    }
  });

  it("selects the newest created comment and breaks timestamp ties by id", async () => {
    const trx = await getDB().transaction();

    try {
      const organization = await trx("organizations")
        .where("id", ">", 0)
        .select("id")
        .first();
      expect(organization).toBeTruthy();
      if (!organization) throw new Error("Test database has no tenant organization");

      const organizationId = Number(organization.id);
      const timestamp = "2037-01-02 10:00:00";
      await trx("organization_comments").insert({
        organization_id: organizationId,
        author_user_id: null,
        author_name: "Comment list test",
        comment: "same-time lower id",
        created_at: timestamp,
        updated_at: timestamp,
      });
      const [expectedId] = await trx("organization_comments").insert({
        organization_id: organizationId,
        author_user_id: null,
        author_name: "Comment list test",
        comment: "same-time higher id",
        created_at: timestamp,
        updated_at: timestamp,
      });
      await trx("organization_comments").insert({
        organization_id: organizationId,
        author_user_id: null,
        author_name: "Comment list test",
        comment: "higher id but older timestamp",
        created_at: "2037-01-01 10:00:00",
        updated_at: "2037-01-01 10:00:00",
      });

      const latestComments = await getLatestOrganizationComments(trx, [organizationId]);

      expect(latestComments.get(organizationId)).toMatchObject({
        id: Number(expectedId),
        comment: "same-time higher id",
      });
    } finally {
      await trx.rollback();
    }
  });
});
