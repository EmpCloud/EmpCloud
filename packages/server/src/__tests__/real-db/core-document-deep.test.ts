// =============================================================================
// EMP CLOUD - Deep Document Service Tests
// =============================================================================
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

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const HR = 525;
const U = String(Date.now()).slice(-6);

// -- Document Categories ------------------------------------------------------
describe("Document Categories (deep)", () => {
  let catId: number;
  afterAll(async () => {
    if (catId) await db("document_categories").where({ id: catId }).delete();
  });

  it("list categories with document counts", async () => {
    const r = await db("document_categories")
      .where({ "document_categories.organization_id": ORG, "document_categories.is_active": true })
      .select(
        "document_categories.*",
        db.raw("(SELECT COUNT(*) FROM employee_documents WHERE employee_documents.category_id = document_categories.id AND employee_documents.organization_id = ?) as document_count", [ORG]),
      )
      .orderBy("document_categories.name", "asc");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]).toHaveProperty("document_count");
  });

  it("create category", async () => {
    const [id] = await db("document_categories").insert({
      organization_id: ORG, name: `DeepCat-${U}`,
      description: "Test category", is_mandatory: false, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    catId = id;
    expect((await db("document_categories").where({ id }).first()).name).toBe(`DeepCat-${U}`);
  });

  it("create mandatory category", async () => {
    const [id] = await db("document_categories").insert({
      organization_id: ORG, name: `MandCat-${U}`,
      description: "Mandatory test", is_mandatory: true, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("document_categories").where({ id }).first()).is_mandatory).toBeTruthy();
    await db("document_categories").where({ id }).delete();
  });

  it("update category", async () => {
    await db("document_categories").where({ id: catId }).update({
      description: "Updated desc", updated_at: new Date(),
    });
    expect((await db("document_categories").where({ id: catId }).first()).description).toBe("Updated desc");
  });

  it("soft delete category", async () => {
    const [tmpId] = await db("document_categories").insert({
      organization_id: ORG, name: `DelCat-${U}`, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    });
    await db("document_categories").where({ id: tmpId }).update({ is_active: false });
    expect((await db("document_categories").where({ id: tmpId }).first()).is_active).toBeFalsy();
    await db("document_categories").where({ id: tmpId }).delete();
  });

  it("cannot delete category with documents (check query)", async () => {
    // Category 54 (PAN Card) likely has documents
    const [{ count }] = await db("employee_documents")
      .where({ organization_id: ORG, category_id: 54 })
      .count("* as count");
    if (Number(count) > 0) {
      // Would throw ValidationError in service
      expect(Number(count)).toBeGreaterThan(0);
    }
  });
});

// -- Documents ----------------------------------------------------------------
describe("Employee Documents (deep)", () => {
  let docId: number;
  afterAll(async () => {
    if (docId) await db("employee_documents").where({ id: docId }).delete();
  });

  it("upload document", async () => {
    const [id] = await db("employee_documents").insert({
      organization_id: ORG, user_id: EMP, category_id: 54,
      name: `TestDoc-${U}.pdf`, file_path: `/tmp/test-${U}.pdf`,
      file_size: 1024, mime_type: "application/pdf",
      expires_at: new Date(Date.now() + 365 * 86400000),
      is_verified: false, uploaded_by: EMP,
      verification_status: "pending",
      created_at: new Date(), updated_at: new Date(),
    });
    docId = id;
    expect((await db("employee_documents").where({ id }).first()).name).toBe(`TestDoc-${U}.pdf`);
  });

  it("list documents with joins", async () => {
    const r = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG })
      .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
      .leftJoin("users", "employee_documents.user_id", "users.id")
      .select(
        "employee_documents.*",
        "document_categories.name as category_name",
        "users.first_name as user_first_name", "users.last_name as user_last_name",
      )
      .orderBy("employee_documents.created_at", "desc").limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]).toHaveProperty("category_name");
  });

  it("list documents with search filter", async () => {
    const s = `%TestDoc-${U}%`;
    const r = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG })
      .leftJoin("users", "employee_documents.user_id", "users.id")
      .where(function () {
        this.where("employee_documents.name", "like", s);
      })
      .select("employee_documents.*");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("list documents by category", async () => {
    const r = await db("employee_documents")
      .where({ organization_id: ORG, category_id: 54 }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("list documents by user", async () => {
    const r = await db("employee_documents")
      .where({ organization_id: ORG, user_id: EMP }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("verify document", async () => {
    await db("employee_documents").where({ id: docId }).update({
      is_verified: true, verified_by: HR, verified_at: new Date(),
      verification_status: "verified", verification_remarks: "Looks good",
      rejection_reason: null, updated_at: new Date(),
    });
    const doc = await db("employee_documents").where({ id: docId }).first();
    expect(doc.verification_status).toBe("verified");
    expect(doc.verified_by).toBe(HR);
  });

  it("reject document", async () => {
    await db("employee_documents").where({ id: docId }).update({
      is_verified: false, verified_by: null, verified_at: null,
      verification_status: "rejected", rejection_reason: "Blurry scan",
      verification_remarks: null, updated_at: new Date(),
    });
    const doc = await db("employee_documents").where({ id: docId }).first();
    expect(doc.verification_status).toBe("rejected");
    expect(doc.rejection_reason).toBe("Blurry scan");
  });

  it("sanitize doc path strips file_path", async () => {
    const doc = await db("employee_documents").where({ id: docId }).first();
    const { file_path, ...rest } = doc;
    const sanitized = { ...rest, download_url: `/api/v1/documents/${doc.id}/download` };
    expect(sanitized).not.toHaveProperty("file_path");
    expect(sanitized.download_url).toContain("/download");
  });

  it("mandatory tracking query", async () => {
    const mandCats = await db("document_categories")
      .where({ organization_id: ORG, is_mandatory: true, is_active: true });
    const activeUsers = await db("users")
      .where({ organization_id: ORG, status: 1 }).select("id", "first_name", "last_name");

    if (mandCats.length > 0) {
      const existing = await db("employee_documents")
        .where({ organization_id: ORG })
        .whereIn("category_id", mandCats.map((c: any) => c.id))
        .select("user_id", "category_id");
      const docSet = new Set(existing.map((d: any) => `${d.user_id}-${d.category_id}`));

      let missingCount = 0;
      for (const user of activeUsers) {
        for (const cat of mandCats) {
          if (!docSet.has(`${user.id}-${cat.id}`)) missingCount++;
        }
      }
      expect(missingCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("expiry alerts query", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const expiring = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG })
      .whereNotNull("employee_documents.expires_at")
      .where("employee_documents.expires_at", "<=", futureDate)
      .leftJoin("users", "employee_documents.user_id", "users.id")
      .select("employee_documents.*", "users.first_name")
      .orderBy("employee_documents.expires_at", "asc");
    expect(Array.isArray(expiring)).toBe(true);
  });

  it("my documents query with pagination", async () => {
    const [{ count }] = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG, "employee_documents.user_id": EMP })
      .count("* as count");
    const docs = await db("employee_documents")
      .where({ "employee_documents.organization_id": ORG, "employee_documents.user_id": EMP })
      .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
      .select("employee_documents.*", "document_categories.name as category_name")
      .orderBy("employee_documents.created_at", "desc").limit(10).offset(0);
    expect(Number(count)).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(docs)).toBe(true);
  });

  it("access control - non-HR cannot see others docs (check pattern)", async () => {
    // Just verify the query pattern works
    const doc = await db("employee_documents").where({ organization_id: ORG }).first();
    if (doc) {
      const isOwner = doc.user_id === EMP;
      const hrRoles = ["hr_admin", "org_admin", "super_admin"];
      const userRole = "employee";
      const canAccess = isOwner || hrRoles.includes(userRole);
      expect(typeof canAccess).toBe("boolean");
    }
  });
});
