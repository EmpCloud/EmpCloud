// =============================================================================
// Coverage Push 100-4: Document, Announcement, Policy, Asset, Helpdesk,
// Custom Field, Survey services — full lifecycle real-DB tests
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.BILLING_MODULE_URL = "http://localhost:4001";
process.env.LOG_LEVEL = "error";
process.env.ANTHROPIC_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5; // TechNova
const ADMIN = 522; // ananya@technova.in
const EMP = 524; // priya@technova.in
const MGR = 529; // karthik@technova.in
const U = String(Date.now()).slice(-6);

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// 1. DOCUMENT SERVICE
// =============================================================================

describe("Document service — full lifecycle", () => {
  let doc: any;
  let catId: number;
  let docId: number;
  let mandatoryCatId: number;

  beforeAll(async () => {
    doc = await import("../../services/document/document.service.js");
  });

  // --- Categories ---

  it("createCategory — basic", async () => {
    const cat = await doc.createCategory(ORG, { name: `TestCat-${U}`, description: "Test category" });
    expect(cat).toBeTruthy();
    expect(cat.name).toBe(`TestCat-${U}`);
    expect(cat.is_active).toBeTruthy();
    catId = cat.id;
  });

  it("createCategory — mandatory", async () => {
    const cat = await doc.createCategory(ORG, {
      name: `MandatoryCat-${U}`,
      description: "Mandatory test",
      is_mandatory: true,
    });
    expect(cat).toBeTruthy();
    expect(cat.is_mandatory).toBeTruthy();
    mandatoryCatId = cat.id;
  });

  it("listCategories — returns categories with document_count", async () => {
    const list = await doc.listCategories(ORG);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    const found = list.find((c: any) => c.id === catId);
    expect(found).toBeTruthy();
  });

  it("updateCategory — name and description", async () => {
    const updated = await doc.updateCategory(ORG, catId, {
      name: `UpdatedCat-${U}`,
      description: "Updated desc",
    });
    expect(updated.name).toBe(`UpdatedCat-${U}`);
  });

  it("updateCategory — not found throws", async () => {
    await expect(doc.updateCategory(ORG, 999999, { name: "x" })).rejects.toThrow();
  });

  // --- Documents ---

  it("uploadDocument — creates doc with sanitized path", async () => {
    const d = await doc.uploadDocument(ORG, EMP, ADMIN, {
      category_id: catId,
      name: `TestDoc-${U}`,
      file_path: `/tmp/test-doc-${U}.pdf`,
      file_size: 1024,
      mime_type: "application/pdf",
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 19).replace("T", " "),
    });
    expect(d).toBeTruthy();
    expect(d.download_url).toBeTruthy();
    expect(d.file_path).toBeUndefined();
    docId = d.id;
  });

  it("uploadDocument — invalid category throws", async () => {
    await expect(doc.uploadDocument(ORG, EMP, ADMIN, {
      category_id: 999999,
      name: "Bad",
      file_path: "/tmp/x",
      file_size: 0,
      mime_type: null,
    })).rejects.toThrow();
  });

  it("listDocuments — default pagination", async () => {
    const result = await doc.listDocuments(ORG);
    expect(result.documents).toBeTruthy();
    expect(typeof result.total).toBe("number");
  });

  it("listDocuments — with user_id filter", async () => {
    const result = await doc.listDocuments(ORG, { user_id: EMP });
    expect(result.documents).toBeTruthy();
    for (const d of result.documents) {
      expect(d.download_url).toBeTruthy();
    }
  });

  it("listDocuments — with search filter", async () => {
    const result = await doc.listDocuments(ORG, { search: `TestDoc-${U}` });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listDocuments — with category_id filter", async () => {
    const result = await doc.listDocuments(ORG, { category_id: catId });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listDocuments — with pagination", async () => {
    const result = await doc.listDocuments(ORG, { page: 1, perPage: 5 });
    expect(result.documents.length).toBeLessThanOrEqual(5);
  });

  it("getDocument — returns sanitized doc", async () => {
    const d = await doc.getDocument(ORG, docId);
    expect(d).toBeTruthy();
    expect(d.download_url).toBeTruthy();
    expect(d.file_path).toBeUndefined();
  });

  it("getDocument — HR can view any doc", async () => {
    const d = await doc.getDocument(ORG, docId, ADMIN, "hr_admin");
    expect(d).toBeTruthy();
  });

  it("getDocument — owner can view own doc", async () => {
    const d = await doc.getDocument(ORG, docId, EMP, "employee");
    expect(d).toBeTruthy();
  });

  it("getDocument — non-owner employee throws ForbiddenError", async () => {
    await expect(doc.getDocument(ORG, docId, MGR, "employee")).rejects.toThrow();
  });

  it("getDocument — not found throws", async () => {
    await expect(doc.getDocument(ORG, 999999)).rejects.toThrow();
  });

  it("getDocumentForDownload — returns raw file_path", async () => {
    const d = await doc.getDocumentForDownload(ORG, docId);
    expect(d).toBeTruthy();
    expect(d.file_path).toBeTruthy();
  });

  it("getDocumentForDownload — HR can download", async () => {
    const d = await doc.getDocumentForDownload(ORG, docId, ADMIN, "org_admin");
    expect(d.file_path).toBeTruthy();
  });

  it("getDocumentForDownload — non-owner throws", async () => {
    await expect(doc.getDocumentForDownload(ORG, docId, MGR, "employee")).rejects.toThrow();
  });

  it("getDocumentForDownload — not found throws", async () => {
    await expect(doc.getDocumentForDownload(ORG, 999999)).rejects.toThrow();
  });

  it("verifyDocument — approve", async () => {
    const d = await doc.verifyDocument(ORG, docId, ADMIN, {
      is_verified: true,
      verification_remarks: "Looks good",
    });
    expect(d.verification_status).toBe("verified");
    expect(d.download_url).toBeTruthy();
  });

  it("verifyDocument — un-verify (set false)", async () => {
    const d = await doc.verifyDocument(ORG, docId, ADMIN, {
      is_verified: false,
    });
    expect(d.verification_status).toBe("pending");
  });

  it("verifyDocument — not found throws", async () => {
    await expect(doc.verifyDocument(ORG, 999999, ADMIN, { is_verified: true })).rejects.toThrow();
  });

  // --- Reject Document ---

  it("rejectDocument — sets rejection_reason", async () => {
    const d = await doc.rejectDocument(ORG, docId, ADMIN, "Invalid document");
    expect(d.verification_status).toBe("rejected");
    expect(d.rejection_reason).toBe("Invalid document");
    expect(d.download_url).toBeTruthy();
  });

  it("rejectDocument — not found throws", async () => {
    await expect(doc.rejectDocument(ORG, 999999, ADMIN, "reason")).rejects.toThrow();
  });

  // --- My Documents ---

  it("getMyDocuments — returns user's own docs", async () => {
    const result = await doc.getMyDocuments(ORG, EMP);
    expect(result.documents).toBeTruthy();
    expect(typeof result.total).toBe("number");
    for (const d of result.documents) {
      expect(d.download_url).toBeTruthy();
    }
  });

  it("getMyDocuments — with pagination", async () => {
    const result = await doc.getMyDocuments(ORG, EMP, { page: 1, perPage: 5 });
    expect(result.documents.length).toBeLessThanOrEqual(5);
  });

  it("getMyDocuments — user with no docs returns empty", async () => {
    const result = await doc.getMyDocuments(ORG, 999999);
    expect(result.total).toBe(0);
  });

  // --- Mandatory Tracking ---

  it("getMandatoryTracking — returns mandatory categories and missing", async () => {
    const result = await doc.getMandatoryTracking(ORG);
    expect(result.mandatory_categories).toBeTruthy();
    expect(Array.isArray(result.missing)).toBe(true);
    // Our mandatory category should appear
    const found = result.mandatory_categories.find((c: any) => c.id === mandatoryCatId);
    expect(found).toBeTruthy();
    // Missing should include at least some users for the mandatory category
    expect(result.missing.length).toBeGreaterThan(0);
    // Verify structure of missing items
    if (result.missing.length > 0) {
      expect(result.missing[0]).toHaveProperty("user_id");
      expect(result.missing[0]).toHaveProperty("user_name");
      expect(result.missing[0]).toHaveProperty("category_id");
      expect(result.missing[0]).toHaveProperty("category_name");
    }
  });

  // --- Expiry Alerts ---

  it("getExpiryAlerts — default 30 days", async () => {
    const result = await doc.getExpiryAlerts(ORG);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getExpiryAlerts — custom daysAhead", async () => {
    const result = await doc.getExpiryAlerts(ORG, 7);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getExpiryAlerts — large window", async () => {
    const result = await doc.getExpiryAlerts(ORG, 365);
    expect(Array.isArray(result)).toBe(true);
    // Our test doc has expiry 5 days out, should appear in 365-day window
    const found = result.find((d: any) => d.id === docId);
    expect(found).toBeTruthy();
  });

  // --- Cleanup ---

  it("deleteDocument — removes doc", async () => {
    await doc.deleteDocument(ORG, docId);
    await expect(doc.getDocument(ORG, docId)).rejects.toThrow();
  });

  it("deleteDocument — not found throws", async () => {
    await expect(doc.deleteDocument(ORG, 999999)).rejects.toThrow();
  });

  it("deleteCategory — empty category succeeds", async () => {
    await doc.deleteCategory(ORG, catId);
    // Verify soft-deleted (inactive)
    const db = getDB();
    const cat = await db("document_categories").where({ id: catId }).first();
    expect(cat.is_active).toBeFalsy();
  });

  it("deleteCategory — with documents throws ValidationError", async () => {
    // Upload a document to the mandatory category first
    const d = await doc.uploadDocument(ORG, EMP, ADMIN, {
      category_id: mandatoryCatId,
      name: `BlockDelete-${U}`,
      file_path: `/tmp/block-${U}.pdf`,
      file_size: 512,
      mime_type: "application/pdf",
    });
    await expect(doc.deleteCategory(ORG, mandatoryCatId)).rejects.toThrow(/Cannot delete/);
    // Clean up the doc
    await doc.deleteDocument(ORG, d.id);
  });

  it("deleteCategory — not found throws", async () => {
    await expect(doc.deleteCategory(ORG, 999999)).rejects.toThrow();
  });

  afterAll(async () => {
    const db = getDB();
    // Clean up mandatory category
    await db("document_categories").where({ id: mandatoryCatId }).delete();
    await db("document_categories").where({ id: catId }).delete();
  });
});

// =============================================================================
// 2. ANNOUNCEMENT SERVICE
// =============================================================================

describe("Announcement service — full lifecycle", () => {
  let ann: any;
  let announcementId: number;

  beforeAll(async () => {
    ann = await import("../../services/announcement/announcement.service.js");
  });

  it("createAnnouncement — basic", async () => {
    const a = await ann.createAnnouncement(ORG, ADMIN, {
      title: `TestAnn-${U}`,
      content: `<p>Announcement content ${U}</p>`,
      priority: "high",
      target_type: "all",
    });
    expect(a).toBeTruthy();
    expect(a.title).toContain(`TestAnn-${U}`);
    expect(a.priority).toBe("high");
    announcementId = a.id;
  });

  it("createAnnouncement — with expires_at and published_at", async () => {
    const a = await ann.createAnnouncement(ORG, ADMIN, {
      title: `Expiring-${U}`,
      content: "<p>Expires soon</p>",
      priority: "normal",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace("T", " "),
      published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      target_type: "department",
      target_ids: JSON.stringify(["1"]),
    });
    expect(a).toBeTruthy();
    // Clean up
    await ann.deleteAnnouncement(ORG, a.id);
  });

  it("listAnnouncements — default", async () => {
    const result = await ann.listAnnouncements(ORG, ADMIN);
    expect(result.announcements).toBeTruthy();
    expect(typeof result.total).toBe("number");
  });

  it("listAnnouncements — with pagination", async () => {
    const result = await ann.listAnnouncements(ORG, ADMIN, { page: 1, perPage: 5 });
    expect(result.announcements.length).toBeLessThanOrEqual(5);
  });

  it("listAnnouncements — with role filter", async () => {
    const result = await ann.listAnnouncements(ORG, EMP, {
      userRole: "employee",
      userDepartmentId: 1,
    });
    expect(result.announcements).toBeTruthy();
  });

  it("getAnnouncement — without userId", async () => {
    const a = await ann.getAnnouncement(ORG, announcementId);
    expect(a).toBeTruthy();
    expect(a.title).toContain(`TestAnn-${U}`);
  });

  it("getAnnouncement — with userId (includes read_at)", async () => {
    const a = await ann.getAnnouncement(ORG, announcementId, EMP);
    expect(a).toBeTruthy();
    expect(a.read_at).toBeNull();
  });

  it("getAnnouncement — not found throws", async () => {
    await expect(ann.getAnnouncement(ORG, 999999)).rejects.toThrow();
  });

  it("updateAnnouncement — title and content", async () => {
    const a = await ann.updateAnnouncement(ORG, announcementId, {
      title: `Updated-${U}`,
      content: "<p>Updated content</p>",
    });
    expect(a.title).toContain(`Updated-${U}`);
  });

  it("updateAnnouncement — with expires_at and published_at", async () => {
    const a = await ann.updateAnnouncement(ORG, announcementId, {
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 19).replace("T", " "),
      published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    expect(a).toBeTruthy();
  });

  it("updateAnnouncement — not found throws", async () => {
    await expect(ann.updateAnnouncement(ORG, 999999, { title: "x" })).rejects.toThrow();
  });

  // --- Mark as Read ---

  it("markAsRead — marks announcement as read for user", async () => {
    await ann.markAsRead(announcementId, EMP, ORG);
    // Verify via getAnnouncement
    const a = await ann.getAnnouncement(ORG, announcementId, EMP);
    expect(a.read_at).toBeTruthy();
  });

  it("markAsRead — idempotent (second call does not throw)", async () => {
    await ann.markAsRead(announcementId, EMP, ORG);
    // Should not throw
  });

  it("markAsRead — not found throws", async () => {
    await expect(ann.markAsRead(999999, EMP, ORG)).rejects.toThrow();
  });

  // --- Read Status ---

  it("getReadStatus — returns read users", async () => {
    const reads = await ann.getReadStatus(announcementId, ORG);
    expect(Array.isArray(reads)).toBe(true);
    expect(reads.length).toBeGreaterThan(0);
    const found = reads.find((r: any) => r.user_id === EMP);
    expect(found).toBeTruthy();
    expect(found.first_name).toBeTruthy();
  });

  it("getReadStatus — not found throws", async () => {
    await expect(ann.getReadStatus(999999, ORG)).rejects.toThrow();
  });

  // --- Unread Count ---

  it("getUnreadCount — returns count for user", async () => {
    const count = await ann.getUnreadCount(ORG, MGR);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("getUnreadCount — user who read should have lower count", async () => {
    const countMgr = await ann.getUnreadCount(ORG, MGR);
    const countEmp = await ann.getUnreadCount(ORG, EMP);
    // EMP read the announcement, so EMP's count should be <= MGR's count
    expect(countEmp).toBeLessThanOrEqual(countMgr);
  });

  it("getUnreadCount — with role and department filter", async () => {
    const count = await ann.getUnreadCount(ORG, EMP, "employee", 1);
    expect(typeof count).toBe("number");
  });

  it("getUnreadCount — with role only", async () => {
    const count = await ann.getUnreadCount(ORG, EMP, "hr_admin");
    expect(typeof count).toBe("number");
  });

  it("getUnreadCount — with department only", async () => {
    const count = await ann.getUnreadCount(ORG, EMP, undefined, 1);
    expect(typeof count).toBe("number");
  });

  // --- Delete ---

  it("deleteAnnouncement — soft deletes", async () => {
    await ann.deleteAnnouncement(ORG, announcementId);
    await expect(ann.getAnnouncement(ORG, announcementId)).rejects.toThrow();
  });

  it("deleteAnnouncement — not found throws", async () => {
    await expect(ann.deleteAnnouncement(ORG, 999999)).rejects.toThrow();
  });

  afterAll(async () => {
    const db = getDB();
    await db("announcement_reads").where({ announcement_id: announcementId }).delete();
    await db("announcements").where({ id: announcementId }).delete();
  });
});

// =============================================================================
// 3. POLICY SERVICE
// =============================================================================

describe("Policy service — full lifecycle", () => {
  let pol: any;
  let policyId: number;

  beforeAll(async () => {
    pol = await import("../../services/policy/policy.service.js");
  });

  it("createPolicy — basic", async () => {
    const p = await pol.createPolicy(ORG, ADMIN, {
      title: `TestPolicy-${U}`,
      content: `<p>Policy content ${U}</p>`,
      category: "hr",
      effective_date: new Date().toISOString().split("T")[0],
    });
    expect(p).toBeTruthy();
    expect(p.title).toContain(`TestPolicy-${U}`);
    expect(p.version).toBe(1);
    policyId = p.id;
  });

  it("createPolicy — minimal (no category/date)", async () => {
    const p = await pol.createPolicy(ORG, ADMIN, {
      title: `MinPolicy-${U}`,
      content: "<p>Minimal</p>",
    });
    expect(p).toBeTruthy();
    // Clean up
    await pol.deletePolicy(ORG, p.id);
  });

  it("listPolicies — default", async () => {
    const result = await pol.listPolicies(ORG);
    expect(result.policies).toBeTruthy();
    expect(typeof result.total).toBe("number");
    // Should include acknowledgment_count
    if (result.policies.length > 0) {
      expect(result.policies[0]).toHaveProperty("acknowledgment_count");
    }
  });

  it("listPolicies — with pagination", async () => {
    const result = await pol.listPolicies(ORG, { page: 1, perPage: 3 });
    expect(result.policies.length).toBeLessThanOrEqual(3);
  });

  it("listPolicies — with category filter", async () => {
    const result = await pol.listPolicies(ORG, { category: "hr" });
    for (const p of result.policies) {
      expect(p.category.toLowerCase()).toBe("hr");
    }
  });

  it("getPolicy — returns policy", async () => {
    const p = await pol.getPolicy(ORG, policyId);
    expect(p).toBeTruthy();
    expect(p.title).toContain(`TestPolicy-${U}`);
  });

  it("getPolicy — not found throws", async () => {
    await expect(pol.getPolicy(ORG, 999999)).rejects.toThrow();
  });

  it("updatePolicy — bumps version", async () => {
    const p = await pol.updatePolicy(ORG, policyId, {
      title: `UpdatedPolicy-${U}`,
      content: "<p>Updated content</p>",
    });
    expect(p.version).toBe(2);
    expect(p.title).toContain(`UpdatedPolicy-${U}`);
  });

  it("updatePolicy — not found throws", async () => {
    await expect(pol.updatePolicy(ORG, 999999, { title: "x" })).rejects.toThrow();
  });

  // --- Acknowledge Policy ---

  it("acknowledgePolicy — creates acknowledgment", async () => {
    const result = await pol.acknowledgePolicy(policyId, EMP, ORG);
    expect(result.policy_id).toBe(policyId);
    expect(result.user_id).toBe(EMP);
    expect(result.acknowledged).toBe(true);
  });

  it("acknowledgePolicy — idempotent (second call)", async () => {
    const result = await pol.acknowledgePolicy(policyId, EMP, ORG);
    expect(result.acknowledged).toBe(true);
  });

  it("acknowledgePolicy — second user", async () => {
    const result = await pol.acknowledgePolicy(policyId, MGR, ORG);
    expect(result.acknowledged).toBe(true);
  });

  it("acknowledgePolicy — not found throws", async () => {
    await expect(pol.acknowledgePolicy(999999, EMP, ORG)).rejects.toThrow();
  });

  // --- Get Acknowledgments ---

  it("getAcknowledgments — returns list of users who acknowledged", async () => {
    const acks = await pol.getAcknowledgments(ORG, policyId);
    expect(Array.isArray(acks)).toBe(true);
    expect(acks.length).toBeGreaterThanOrEqual(2);
    const empAck = acks.find((a: any) => a.user_id === EMP);
    expect(empAck).toBeTruthy();
    expect(empAck.first_name).toBeTruthy();
    expect(empAck.acknowledged_at).toBeTruthy();
  });

  it("getAcknowledgments — not found throws", async () => {
    await expect(pol.getAcknowledgments(ORG, 999999)).rejects.toThrow();
  });

  // --- Pending Acknowledgments ---

  it("getPendingAcknowledgments — returns policies not yet acknowledged", async () => {
    const pending = await pol.getPendingAcknowledgments(ORG, ADMIN);
    expect(Array.isArray(pending)).toBe(true);
    // ADMIN hasn't acknowledged our test policy, so it should be in the list
    const found = pending.find((p: any) => p.id === policyId);
    expect(found).toBeTruthy();
  });

  it("getPendingAcknowledgments — user who acknowledged should not see it", async () => {
    const pending = await pol.getPendingAcknowledgments(ORG, EMP);
    const found = pending.find((p: any) => p.id === policyId);
    expect(found).toBeUndefined();
  });

  // --- Delete ---

  it("deletePolicy — soft deletes", async () => {
    await pol.deletePolicy(ORG, policyId);
    // getPolicy still returns it (queries without is_active filter)
    const p = await pol.getPolicy(ORG, policyId);
    expect(p.is_active).toBeFalsy();
  });

  it("deletePolicy — already deleted throws", async () => {
    await expect(pol.deletePolicy(ORG, policyId)).rejects.toThrow();
  });

  it("deletePolicy — not found throws", async () => {
    await expect(pol.deletePolicy(ORG, 999999)).rejects.toThrow();
  });

  afterAll(async () => {
    const db = getDB();
    await db("policy_acknowledgments").where({ policy_id: policyId }).delete();
    await db("company_policies").where({ id: policyId }).delete();
  });
});

// =============================================================================
// 4. ASSET SERVICE — FULL LIFECYCLE
// =============================================================================

describe("Asset service — full lifecycle", () => {
  let asset: any;
  let assetCatId: number;
  let assetId: number;
  let asset2Id: number;

  beforeAll(async () => {
    asset = await import("../../services/asset/asset.service.js");
  });

  // --- Categories ---

  it("createCategory — basic", async () => {
    const cat = await asset.createCategory(ORG, { name: `AstCat-${U}`, description: "Laptops" });
    expect(cat).toBeTruthy();
    expect(cat.name).toBe(`AstCat-${U}`);
    assetCatId = cat.id;
  });

  it("listCategories — returns active categories", async () => {
    const list = await asset.listCategories(ORG);
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((c: any) => c.id === assetCatId);
    expect(found).toBeTruthy();
  });

  it("updateCategory — name", async () => {
    const cat = await asset.updateCategory(ORG, assetCatId, { name: `AstCatUpd-${U}` });
    expect(cat.name).toBe(`AstCatUpd-${U}`);
  });

  it("updateCategory — description and is_active", async () => {
    const cat = await asset.updateCategory(ORG, assetCatId, {
      description: "Updated desc",
      is_active: true,
    });
    expect(cat.description).toBe("Updated desc");
  });

  it("updateCategory — not found throws", async () => {
    await expect(asset.updateCategory(ORG, 999999, { name: "x" })).rejects.toThrow();
  });

  // --- Create Asset ---

  it("createAsset — full data", async () => {
    const a = await asset.createAsset(ORG, ADMIN, {
      name: `Laptop-${U}`,
      category_id: assetCatId,
      description: "Test laptop",
      serial_number: `SN-${U}`,
      brand: "Dell",
      model: "XPS 15",
      purchase_date: "2025-01-01",
      purchase_cost: 150000,
      warranty_expiry: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      status: "available",
      condition_status: "new",
      location_name: "Office A",
      notes: "Test notes",
    });
    expect(a).toBeTruthy();
    expect(a.asset_tag).toMatch(/^AST-\d{4}-\d{4}$/);
    expect(a.name).toBe(`Laptop-${U}`);
    assetId = a.id;
  });

  it("createAsset — minimal data", async () => {
    const a = await asset.createAsset(ORG, ADMIN, { name: `MinAsset-${U}` });
    expect(a).toBeTruthy();
    expect(a.status).toBe("available");
    expect(a.condition_status).toBe("new");
    asset2Id = a.id;
  });

  it("createAsset — warranty before purchase throws", async () => {
    await expect(asset.createAsset(ORG, ADMIN, {
      name: "BadDates",
      purchase_date: "2025-06-01",
      warranty_expiry: "2024-01-01",
    })).rejects.toThrow(/warranty_expiry/);
  });

  // --- List Assets ---

  it("listAssets — default", async () => {
    const result = await asset.listAssets(ORG);
    expect(result.assets).toBeTruthy();
    expect(typeof result.total).toBe("number");
  });

  it("listAssets — with status filter", async () => {
    const result = await asset.listAssets(ORG, { status: "available" });
    for (const a of result.assets) {
      expect(a.status).toBe("available");
    }
  });

  it("listAssets — with category_id filter", async () => {
    const result = await asset.listAssets(ORG, { category_id: assetCatId });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listAssets — with search filter", async () => {
    const result = await asset.listAssets(ORG, { search: `Laptop-${U}` });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listAssets — with condition_status filter", async () => {
    const result = await asset.listAssets(ORG, { condition_status: "new" });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listAssets — with pagination", async () => {
    const result = await asset.listAssets(ORG, { page: 1, perPage: 2 });
    expect(result.assets.length).toBeLessThanOrEqual(2);
  });

  // --- Get Asset ---

  it("getAsset — returns asset with history", async () => {
    const a = await asset.getAsset(ORG, assetId);
    expect(a).toBeTruthy();
    expect(a.name).toBe(`Laptop-${U}`);
    expect(a.history).toBeTruthy();
    expect(a.history.length).toBeGreaterThanOrEqual(1);
  });

  it("getAsset — not found throws", async () => {
    await expect(asset.getAsset(ORG, 999999)).rejects.toThrow();
  });

  // --- Update Asset ---

  it("updateAsset — update multiple fields", async () => {
    const a = await asset.updateAsset(ORG, assetId, ADMIN, {
      name: `UpdatedLaptop-${U}`,
      brand: "Lenovo",
      condition_status: "good",
      location_name: "Office B",
      notes: "Updated notes",
    });
    expect(a.name).toBe(`UpdatedLaptop-${U}`);
    expect(a.brand).toBe("Lenovo");
  });

  it("updateAsset — warranty before purchase throws", async () => {
    await expect(asset.updateAsset(ORG, assetId, ADMIN, {
      warranty_expiry: "2020-01-01",
    })).rejects.toThrow(/warranty_expiry/);
  });

  it("updateAsset — not found throws", async () => {
    await expect(asset.updateAsset(ORG, 999999, ADMIN, { name: "x" })).rejects.toThrow();
  });

  // --- Assign Asset ---

  it("assignAsset — assigns to user", async () => {
    const a = await asset.assignAsset(ORG, assetId, EMP, ADMIN, "For project work");
    expect(a.status).toBe("assigned");
    expect(a.assigned_to).toBe(EMP);
  });

  it("assignAsset — already assigned throws", async () => {
    await expect(asset.assignAsset(ORG, assetId, MGR, ADMIN)).rejects.toThrow(/already assigned/);
  });

  it("assignAsset — not found throws", async () => {
    await expect(asset.assignAsset(ORG, 999999, EMP, ADMIN)).rejects.toThrow();
  });

  // --- My Assets ---

  it("getMyAssets — returns assets assigned to user", async () => {
    const myAssets = await asset.getMyAssets(ORG, EMP);
    expect(Array.isArray(myAssets)).toBe(true);
    expect(myAssets.length).toBeGreaterThanOrEqual(1);
    const found = myAssets.find((a: any) => a.id === assetId);
    expect(found).toBeTruthy();
  });

  it("getMyAssets — user with no assets", async () => {
    const myAssets = await asset.getMyAssets(ORG, 999999);
    expect(myAssets.length).toBe(0);
  });

  // --- Delete Asset (should fail when assigned) ---

  it("deleteAsset — assigned asset throws ValidationError", async () => {
    await expect(asset.deleteAsset(ORG, assetId, ADMIN)).rejects.toThrow(/assigned/);
  });

  // --- Return Asset ---

  it("returnAsset — HR returns asset", async () => {
    const a = await asset.returnAsset(ORG, assetId, ADMIN, "good", "Returned after project", "hr_admin");
    expect(a.status).toBe("available");
    expect(a.assigned_to).toBeNull();
  });

  it("returnAsset — not assigned throws", async () => {
    await expect(asset.returnAsset(ORG, assetId, EMP, "good")).rejects.toThrow(/not currently assigned/);
  });

  it("returnAsset — self-return by assigned user", async () => {
    // First assign
    await asset.assignAsset(ORG, assetId, EMP, ADMIN);
    // EMP returns their own asset
    const a = await asset.returnAsset(ORG, assetId, EMP, "fair", "Done with it");
    expect(a.status).toBe("available");
  });

  it("returnAsset — non-owner non-HR throws Forbidden", async () => {
    await asset.assignAsset(ORG, assetId, EMP, ADMIN);
    await expect(asset.returnAsset(ORG, assetId, MGR, "good", null, "employee")).rejects.toThrow();
    // Clean up — HR returns it
    await asset.returnAsset(ORG, assetId, ADMIN, "good", null, "hr_admin");
  });

  it("returnAsset — not found throws", async () => {
    await expect(asset.returnAsset(ORG, 999999, EMP)).rejects.toThrow();
  });

  // --- Report Lost ---

  it("reportLost — marks as lost", async () => {
    const a = await asset.reportLost(ORG, asset2Id, ADMIN, "Lost in transit");
    expect(a.status).toBe("lost");
  });

  it("reportLost — already lost throws", async () => {
    await expect(asset.reportLost(ORG, asset2Id, ADMIN)).rejects.toThrow(/already reported/);
  });

  it("reportLost — not found throws", async () => {
    await expect(asset.reportLost(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  // --- Assign retired/lost asset throws ---

  it("assignAsset — lost asset throws", async () => {
    await expect(asset.assignAsset(ORG, asset2Id, EMP, ADMIN)).rejects.toThrow(/status: lost/);
  });

  // --- Retire Asset ---

  it("retireAsset — marks as retired", async () => {
    const a = await asset.retireAsset(ORG, assetId, ADMIN, "End of life");
    expect(a.status).toBe("retired");
  });

  it("retireAsset — already retired throws", async () => {
    await expect(asset.retireAsset(ORG, assetId, ADMIN)).rejects.toThrow(/already retired/);
  });

  it("retireAsset — not found throws", async () => {
    await expect(asset.retireAsset(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  it("assignAsset — retired asset throws", async () => {
    await expect(asset.assignAsset(ORG, assetId, EMP, ADMIN)).rejects.toThrow(/status: retired/);
  });

  // --- Delete Asset ---

  it("deleteAsset — available asset succeeds (soft retire)", async () => {
    // Create a fresh available asset
    const a = await asset.createAsset(ORG, ADMIN, { name: `Deletable-${U}` });
    await asset.deleteAsset(ORG, a.id, ADMIN);
    const detail = await asset.getAsset(ORG, a.id);
    expect(detail.status).toBe("retired");
  });

  it("deleteAsset — not found throws", async () => {
    await expect(asset.deleteAsset(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  // --- Dashboard ---

  it("getAssetDashboard — returns full stats", async () => {
    const dash = await asset.getAssetDashboard(ORG);
    expect(typeof dash.total).toBe("number");
    expect(typeof dash.available).toBe("number");
    expect(typeof dash.assigned).toBe("number");
    expect(typeof dash.retired).toBe("number");
    expect(typeof dash.lost).toBe("number");
    expect(Array.isArray(dash.expiring_warranties)).toBe(true);
    expect(Array.isArray(dash.category_breakdown)).toBe(true);
    expect(Array.isArray(dash.top_assignees)).toBe(true);
    expect(Array.isArray(dash.recent_activity)).toBe(true);
  });

  // --- Expiring Warranties ---

  it("getExpiringWarranties — default 30 days", async () => {
    const list = await asset.getExpiringWarranties(ORG);
    expect(Array.isArray(list)).toBe(true);
  });

  it("getExpiringWarranties — custom days", async () => {
    const list = await asset.getExpiringWarranties(ORG, 90);
    expect(Array.isArray(list)).toBe(true);
  });

  afterAll(async () => {
    const db = getDB();
    await db("asset_history").where({ organization_id: ORG }).whereIn("asset_id", [assetId, asset2Id]).delete();
    await db("assets").where({ organization_id: ORG }).whereIn("id", [assetId, asset2Id]).delete();
    // Also clean up the deletable asset
    await db("asset_history").where({ organization_id: ORG }).where("notes", "like", `%Deletable-${U}%`).delete();
    await db("assets").where({ organization_id: ORG }).where("name", "like", `%Deletable-${U}%`).delete();
    await db("asset_categories").where({ id: assetCatId }).delete();
  });
});

// =============================================================================
// 5. HELPDESK SERVICE — FULL LIFECYCLE
// =============================================================================

describe("Helpdesk service — full lifecycle", () => {
  let hd: any;
  let ticketId: number;
  let ticket2Id: number;

  beforeAll(async () => {
    hd = await import("../../services/helpdesk/helpdesk.service.js");
  });

  // --- Create Ticket ---

  it("createTicket — full data", async () => {
    const t = await hd.createTicket(ORG, EMP, {
      category: "it",
      priority: "high",
      subject: `Ticket-${U}`,
      description: "My laptop is broken",
      department_id: 1,
      tags: ["hardware", "urgent"],
    });
    expect(t).toBeTruthy();
    expect(t.status).toBe("open");
    expect(t.priority).toBe("high");
    expect(t.sla_response_hours).toBe(8);
    ticketId = t.id;
  });

  it("createTicket — default priority (medium)", async () => {
    const t = await hd.createTicket(ORG, EMP, {
      category: "general",
      subject: `Ticket2-${U}`,
      description: "Need help with leave",
    });
    expect(t.priority).toBe("medium");
    ticket2Id = t.id;
  });

  it("createTicket — urgent priority SLA", async () => {
    const t = await hd.createTicket(ORG, EMP, {
      category: "it",
      priority: "urgent",
      subject: `UrgentTicket-${U}`,
      description: "Server is down",
    });
    expect(t.sla_response_hours).toBe(2);
    expect(t.sla_resolution_hours).toBe(8);
    // Clean up
    await hd.addComment(ORG, t.id, ADMIN, "Resolved");
    await hd.resolveTicket(ORG, t.id, ADMIN);
    await hd.closeTicket(ORG, t.id);
  });

  // --- List Tickets ---

  it("listTickets — default", async () => {
    const result = await hd.listTickets(ORG);
    expect(result.tickets).toBeTruthy();
    expect(typeof result.total).toBe("number");
  });

  it("listTickets — with status filter", async () => {
    const result = await hd.listTickets(ORG, { status: "open" });
    for (const t of result.tickets) {
      expect(t.status).toBe("open");
    }
  });

  it("listTickets — with category filter", async () => {
    const result = await hd.listTickets(ORG, { category: "it" });
    for (const t of result.tickets) {
      expect(t.category).toBe("it");
    }
  });

  it("listTickets — with priority filter", async () => {
    const result = await hd.listTickets(ORG, { priority: "high" });
    for (const t of result.tickets) {
      expect(t.priority).toBe("high");
    }
  });

  it("listTickets — with raised_by filter", async () => {
    const result = await hd.listTickets(ORG, { raised_by: EMP });
    for (const t of result.tickets) {
      expect(t.raised_by).toBe(EMP);
    }
  });

  it("listTickets — with search filter", async () => {
    const result = await hd.listTickets(ORG, { search: `Ticket-${U}` });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listTickets — with pagination", async () => {
    const result = await hd.listTickets(ORG, { page: 1, perPage: 2 });
    expect(result.tickets.length).toBeLessThanOrEqual(2);
  });

  // --- Get Ticket ---

  it("getTicket — as HR (with internal comments)", async () => {
    const t = await hd.getTicket(ORG, ticketId, ADMIN, true);
    expect(t).toBeTruthy();
    expect(t.subject).toContain(`Ticket-${U}`);
    expect(t.comments).toBeTruthy();
  });

  it("getTicket — as ticket raiser", async () => {
    const t = await hd.getTicket(ORG, ticketId, EMP, false);
    expect(t).toBeTruthy();
  });

  it("getTicket — non-raiser non-HR throws Forbidden", async () => {
    await expect(hd.getTicket(ORG, ticketId, MGR, false)).rejects.toThrow();
  });

  it("getTicket — not found throws", async () => {
    await expect(hd.getTicket(ORG, 999999)).rejects.toThrow();
  });

  // --- Assign Ticket ---

  it("assignTicket — assigns and moves to in_progress", async () => {
    const t = await hd.assignTicket(ORG, ticketId, ADMIN);
    expect(t.assigned_to).toBe(ADMIN);
    expect(t.status).toBe("in_progress");
  });

  it("assignTicket — not found throws", async () => {
    await expect(hd.assignTicket(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  it("assignTicket — invalid assignee throws", async () => {
    await expect(hd.assignTicket(ORG, ticketId, 999999)).rejects.toThrow();
  });

  // --- Update Ticket ---

  it("updateTicket — change priority (recalculates SLA)", async () => {
    const t = await hd.updateTicket(ORG, ticketId, { priority: "low" });
    expect(t.priority).toBe("low");
    expect(t.sla_response_hours).toBe(48);
  });

  it("updateTicket — change status triggers notification", async () => {
    const t = await hd.updateTicket(ORG, ticketId, { status: "awaiting_response" });
    expect(t.status).toBe("awaiting_response");
  });

  it("updateTicket — change tags and department", async () => {
    const t = await hd.updateTicket(ORG, ticketId, {
      tags: ["updated", "test"],
      department_id: 2,
    });
    expect(t).toBeTruthy();
  });

  it("updateTicket — clear tags", async () => {
    const t = await hd.updateTicket(ORG, ticketId, { tags: null });
    expect(t.tags).toBeNull();
  });

  it("updateTicket — not found throws", async () => {
    await expect(hd.updateTicket(ORG, 999999, { priority: "low" })).rejects.toThrow();
  });

  // --- Add Comment ---

  it("addComment — HR response tracks first_response_at", async () => {
    const c = await hd.addComment(ORG, ticketId, ADMIN, "Looking into this", false);
    expect(c).toBeTruthy();
    expect(c.comment).toBe("Looking into this");
    // Verify first_response_at was set
    const t = await hd.getTicket(ORG, ticketId, ADMIN, true);
    expect(t.first_response_at).toBeTruthy();
  });

  it("addComment — internal comment", async () => {
    const c = await hd.addComment(ORG, ticketId, ADMIN, "Internal note", true);
    expect(c.is_internal).toBeTruthy();
  });

  it("addComment — with attachments", async () => {
    const c = await hd.addComment(ORG, ticketId, ADMIN, "See attached", false, ["/uploads/file.pdf"]);
    expect(c).toBeTruthy();
  });

  it("addComment — raiser response moves awaiting_response to in_progress", async () => {
    // Ticket is in awaiting_response status, raiser responds
    const c = await hd.addComment(ORG, ticketId, EMP, "Here is more info");
    expect(c).toBeTruthy();
    const t = await hd.getTicket(ORG, ticketId, ADMIN, true);
    expect(t.status).toBe("in_progress");
  });

  it("addComment — not found throws", async () => {
    await expect(hd.addComment(ORG, 999999, EMP, "test")).rejects.toThrow();
  });

  // --- Internal comments hidden from non-HR ---

  it("getTicket — non-HR does not see internal comments", async () => {
    const t = await hd.getTicket(ORG, ticketId, EMP, false);
    const internalComments = t.comments.filter((c: any) => c.is_internal);
    expect(internalComments.length).toBe(0);
  });

  // --- Resolve Ticket ---

  it("resolveTicket — resolves open ticket", async () => {
    const t = await hd.resolveTicket(ORG, ticketId, ADMIN);
    expect(t.status).toBe("resolved");
    expect(t.resolved_at).toBeTruthy();
  });

  it("resolveTicket — already resolved throws", async () => {
    await expect(hd.resolveTicket(ORG, ticketId, ADMIN)).rejects.toThrow(/already resolved/);
  });

  it("resolveTicket — not found throws", async () => {
    await expect(hd.resolveTicket(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  // --- Rate Ticket ---

  it("rateTicket — rates resolved ticket", async () => {
    const t = await hd.rateTicket(ORG, ticketId, 4, "Good support");
    expect(t.satisfaction_rating).toBe(4);
    expect(t.satisfaction_comment).toBe("Good support");
  });

  it("rateTicket — update rating", async () => {
    const t = await hd.rateTicket(ORG, ticketId, 5);
    expect(t.satisfaction_rating).toBe(5);
  });

  it("rateTicket — not found throws", async () => {
    await expect(hd.rateTicket(ORG, 999999, 5)).rejects.toThrow();
  });

  // --- Close Ticket ---

  it("closeTicket — closes resolved ticket", async () => {
    const t = await hd.closeTicket(ORG, ticketId);
    expect(t.status).toBe("closed");
    expect(t.closed_at).toBeTruthy();
  });

  it("closeTicket — no comments throws", async () => {
    // ticket2 has no comments yet
    await expect(hd.closeTicket(ORG, ticket2Id)).rejects.toThrow(/resolution comment/);
  });

  it("closeTicket — with comment succeeds and sets resolved_at", async () => {
    await hd.addComment(ORG, ticket2Id, ADMIN, "Resolved the issue");
    const t = await hd.closeTicket(ORG, ticket2Id);
    expect(t.status).toBe("closed");
    expect(t.resolved_at).toBeTruthy();
  });

  it("closeTicket — not found throws", async () => {
    await expect(hd.closeTicket(ORG, 999999)).rejects.toThrow();
  });

  // --- Reopen Ticket ---

  it("reopenTicket — reopens closed ticket", async () => {
    const t = await hd.reopenTicket(ORG, ticketId);
    expect(t.status).toBe("reopened");
    expect(t.resolved_at).toBeNull();
    expect(t.closed_at).toBeNull();
    expect(t.satisfaction_rating).toBeNull();
  });

  it("reopenTicket — reopening an open ticket throws", async () => {
    await expect(hd.reopenTicket(ORG, ticketId)).rejects.toThrow(/resolved or closed/);
  });

  it("reopenTicket — not found throws", async () => {
    await expect(hd.reopenTicket(ORG, 999999)).rejects.toThrow();
  });

  // --- Rate ticket must be resolved/closed ---

  it("rateTicket — open ticket throws", async () => {
    await expect(hd.rateTicket(ORG, ticketId, 3)).rejects.toThrow(/resolved or closed/);
  });

  // --- Assign reopened ticket moves to in_progress ---

  it("assignTicket — reopened ticket moves to in_progress", async () => {
    const t = await hd.assignTicket(ORG, ticketId, ADMIN);
    expect(t.status).toBe("in_progress");
  });

  // --- Get My Tickets ---

  it("getMyTickets — returns user's tickets", async () => {
    const result = await hd.getMyTickets(ORG, EMP);
    expect(result.tickets).toBeTruthy();
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("getMyTickets — with status filter", async () => {
    const result = await hd.getMyTickets(ORG, EMP, { status: "in_progress" });
    for (const t of result.tickets) {
      expect(t.status).toBe("in_progress");
    }
  });

  it("getMyTickets — with category filter", async () => {
    const result = await hd.getMyTickets(ORG, EMP, { category: "it" });
    for (const t of result.tickets) {
      expect(t.category).toBe("it");
    }
  });

  it("getMyTickets — with pagination", async () => {
    const result = await hd.getMyTickets(ORG, EMP, { page: 1, perPage: 1 });
    expect(result.tickets.length).toBeLessThanOrEqual(1);
  });

  it("getMyTickets — user with no tickets", async () => {
    const result = await hd.getMyTickets(ORG, 999999);
    expect(result.total).toBe(0);
  });

  // --- Dashboard ---

  it("getHelpdeskDashboard — returns full stats", async () => {
    const dash = await hd.getHelpdeskDashboard(ORG);
    expect(typeof dash.total_open).toBe("number");
    expect(typeof dash.open).toBe("number");
    expect(typeof dash.in_progress).toBe("number");
    expect(typeof dash.resolved).toBe("number");
    expect(typeof dash.closed).toBe("number");
    expect(typeof dash.overdue).toBe("number");
    expect(typeof dash.resolved_today).toBe("number");
    expect(typeof dash.sla_compliance).toBe("number");
    expect(typeof dash.avg_resolution_hours).toBe("number");
    expect(Array.isArray(dash.category_breakdown)).toBe(true);
    expect(Array.isArray(dash.recent_tickets)).toBe(true);
    expect(typeof dash.rated_count).toBe("number");
  });

  afterAll(async () => {
    const db = getDB();
    await db("ticket_comments").where({ organization_id: ORG }).whereIn("ticket_id", [ticketId, ticket2Id]).delete();
    await db("helpdesk_tickets").where({ organization_id: ORG }).whereIn("id", [ticketId, ticket2Id]).delete();
    // Clean up urgent ticket
    await db("ticket_comments").where({ organization_id: ORG })
      .whereIn("ticket_id", function() {
        this.select("id").from("helpdesk_tickets").where("subject", "like", `%UrgentTicket-${U}%`);
      }).delete();
    await db("helpdesk_tickets").where({ organization_id: ORG }).where("subject", "like", `%UrgentTicket-${U}%`).delete();
  });
});

// =============================================================================
// 6. CUSTOM FIELD SERVICE — ALL 10 FUNCTIONS WITH EDGE CASES
// =============================================================================

describe("Custom field service — deep coverage", () => {
  let cf: any;
  let textFieldId: number;
  let numFieldId: number;
  let dropdownFieldId: number;
  let boolFieldId: number;
  let dateFieldId: number;
  let multiSelectFieldId: number;
  let searchableFieldId: number;

  beforeAll(async () => {
    cf = await import("../../services/custom-field/custom-field.service.js");
  });

  // --- Create Field Definitions ---

  it("createFieldDefinition — text field", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `TextField ${U}`,
      field_type: "text",
      is_required: false,
      placeholder: "Enter value",
      description: "Test text field",
    });
    expect(f).toBeTruthy();
    expect(f.field_key).toBe(`textfield_${U.toLowerCase()}`);
    textFieldId = f.id;
  });

  it("createFieldDefinition — number field with min/max", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `NumField ${U}`,
      field_type: "number",
      is_required: true,
      min_value: 0,
      max_value: 100,
    });
    expect(f).toBeTruthy();
    numFieldId = f.id;
  });

  it("createFieldDefinition — dropdown field with options", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Dropdown ${U}`,
      field_type: "dropdown",
      options: ["Small", "Medium", "Large"],
    });
    expect(f).toBeTruthy();
    dropdownFieldId = f.id;
  });

  it("createFieldDefinition — checkbox (boolean) field", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `BoolField ${U}`,
      field_type: "checkbox",
    });
    expect(f).toBeTruthy();
    boolFieldId = f.id;
  });

  it("createFieldDefinition — date field", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `DateField ${U}`,
      field_type: "date",
    });
    expect(f).toBeTruthy();
    dateFieldId = f.id;
  });

  it("createFieldDefinition — multi_select field", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `MultiSelect ${U}`,
      field_type: "multi_select",
      options: ["A", "B", "C", "D"],
    });
    expect(f).toBeTruthy();
    multiSelectFieldId = f.id;
  });

  it("createFieldDefinition — searchable text field", async () => {
    const f = await cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Searchable ${U}`,
      field_type: "text",
      is_searchable: true,
      validation_regex: "^[A-Za-z]+$",
      section: "Personal",
      help_text: "Enter only letters",
    });
    expect(f).toBeTruthy();
    searchableFieldId = f.id;
  });

  it("createFieldDefinition — duplicate key throws", async () => {
    await expect(cf.createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `TextField ${U}`,
      field_type: "text",
    })).rejects.toThrow(/already exists/);
  });

  // --- List Field Definitions ---

  it("listFieldDefinitions — all for org", async () => {
    const list = await cf.listFieldDefinitions(ORG);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(7);
  });

  it("listFieldDefinitions — filtered by entity type", async () => {
    const list = await cf.listFieldDefinitions(ORG, "employee");
    expect(list.length).toBeGreaterThanOrEqual(7);
  });

  // --- Get Field Definition ---

  it("getFieldDefinition — returns with parsed options", async () => {
    const f = await cf.getFieldDefinition(ORG, dropdownFieldId);
    expect(f).toBeTruthy();
    expect(Array.isArray(f.options)).toBe(true);
    expect(f.options).toContain("Small");
  });

  it("getFieldDefinition — not found throws", async () => {
    await expect(cf.getFieldDefinition(ORG, 999999)).rejects.toThrow();
  });

  // --- Update Field Definition ---

  it("updateFieldDefinition — rename", async () => {
    const f = await cf.updateFieldDefinition(ORG, textFieldId, {
      field_name: `RenamedText ${U}`,
    });
    expect(f.field_name).toBe(`RenamedText ${U}`);
    expect(f.field_key).toBe(`renamedtext_${U.toLowerCase()}`);
  });

  it("updateFieldDefinition — update type, options, required, searchable", async () => {
    const f = await cf.updateFieldDefinition(ORG, dropdownFieldId, {
      options: ["XS", "S", "M", "L", "XL"],
      is_required: true,
      is_searchable: true,
      placeholder: "Choose size",
      default_value: "M",
      validation_regex: null,
      min_value: null,
      max_value: null,
      section: "Details",
      help_text: "Select your size",
    });
    expect(f).toBeTruthy();
  });

  it("updateFieldDefinition — duplicate key throws", async () => {
    await expect(cf.updateFieldDefinition(ORG, numFieldId, {
      field_name: `RenamedText ${U}`,
    })).rejects.toThrow(/already exists/);
  });

  it("updateFieldDefinition — not found throws", async () => {
    await expect(cf.updateFieldDefinition(ORG, 999999, { field_name: "x" })).rejects.toThrow();
  });

  // --- Reorder Fields ---

  it("reorderFields — reorders correctly", async () => {
    await cf.reorderFields(ORG, "employee", [
      multiSelectFieldId,
      dateFieldId,
      boolFieldId,
      dropdownFieldId,
      numFieldId,
      textFieldId,
      searchableFieldId,
    ]);
    // Verify order
    const list = await cf.listFieldDefinitions(ORG, "employee");
    const ids = list.map((f: any) => f.id);
    const multiIdx = ids.indexOf(multiSelectFieldId);
    const dateIdx = ids.indexOf(dateFieldId);
    expect(multiIdx).toBeLessThan(dateIdx);
  });

  it("reorderFields — invalid ID throws", async () => {
    await expect(cf.reorderFields(ORG, "employee", [999999])).rejects.toThrow();
  });

  // --- Set Field Values ---

  it("setFieldValues — text value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: textFieldId, value: "Hello World" },
    ]);
    expect(Array.isArray(values)).toBe(true);
    const tv = values.find((v: any) => v.field_id === textFieldId);
    expect(tv?.value).toBe("Hello World");
  });

  it("setFieldValues — number value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: 42 },
    ]);
    const nv = values.find((v: any) => v.field_id === numFieldId);
    expect(nv?.value).toBe(42);
  });

  it("setFieldValues — number out of range (too low) throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: -5 },
    ])).rejects.toThrow(/must be >=/);
  });

  it("setFieldValues — number out of range (too high) throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: 200 },
    ])).rejects.toThrow(/must be <=/);
  });

  it("setFieldValues — invalid number throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: "notanumber" },
    ])).rejects.toThrow(/Invalid number/);
  });

  it("setFieldValues — dropdown valid option", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: dropdownFieldId, value: "M" },
    ]);
    const dv = values.find((v: any) => v.field_id === dropdownFieldId);
    expect(dv?.value).toBe("M");
  });

  it("setFieldValues — dropdown invalid option throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: dropdownFieldId, value: "XXL" },
    ])).rejects.toThrow(/Invalid option/);
  });

  it("setFieldValues — boolean value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: boolFieldId, value: true },
    ]);
    const bv = values.find((v: any) => v.field_id === boolFieldId);
    expect(bv?.value).toBe(true);
  });

  it("setFieldValues — date value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: dateFieldId, value: "2025-06-15" },
    ]);
    const dv = values.find((v: any) => v.field_id === dateFieldId);
    expect(dv?.value).toBeTruthy();
  });

  it("setFieldValues — invalid date throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: dateFieldId, value: "not-a-date" },
    ])).rejects.toThrow(/Invalid date/);
  });

  it("setFieldValues — multi_select value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: multiSelectFieldId, value: ["A", "C"] },
    ]);
    const mv = values.find((v: any) => v.field_id === multiSelectFieldId);
    expect(Array.isArray(mv?.value)).toBe(true);
    expect(mv?.value).toContain("A");
    expect(mv?.value).toContain("C");
  });

  it("setFieldValues — multi_select invalid option throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: multiSelectFieldId, value: ["A", "Z"] },
    ])).rejects.toThrow(/Invalid option/);
  });

  it("setFieldValues — validation_regex failure throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: searchableFieldId, value: "123" },
    ])).rejects.toThrow(/does not match/);
  });

  it("setFieldValues — searchable text with valid value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: searchableFieldId, value: "Hello" },
    ]);
    expect(values).toBeTruthy();
  });

  it("setFieldValues — required field with empty value throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: "" },
    ])).rejects.toThrow(/required/);
  });

  it("setFieldValues — required field with null throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: numFieldId, value: null },
    ])).rejects.toThrow(/required/);
  });

  it("setFieldValues — wrong entity type throws", async () => {
    await expect(cf.setFieldValues(ORG, "project", EMP, [
      { fieldId: textFieldId, value: "Test" },
    ])).rejects.toThrow(/not/);
  });

  it("setFieldValues — inactive field throws", async () => {
    await expect(cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: 999999, value: "Test" },
    ])).rejects.toThrow(/not found/);
  });

  it("setFieldValues — null value clears value", async () => {
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: textFieldId, value: null },
    ]);
    const tv = values.find((v: any) => v.field_id === textFieldId);
    expect(tv?.value).toBeNull();
  });

  it("setFieldValues — upsert existing value", async () => {
    await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: textFieldId, value: "First" },
    ]);
    const values = await cf.setFieldValues(ORG, "employee", EMP, [
      { fieldId: textFieldId, value: "Updated" },
    ]);
    const tv = values.find((v: any) => v.field_id === textFieldId);
    expect(tv?.value).toBe("Updated");
  });

  // --- Get Field Values ---

  it("getFieldValues — returns all values for entity", async () => {
    const values = await cf.getFieldValues(ORG, "employee", EMP);
    expect(Array.isArray(values)).toBe(true);
    expect(values.length).toBeGreaterThanOrEqual(1);
    // Check structure
    for (const v of values) {
      expect(v).toHaveProperty("field_id");
      expect(v).toHaveProperty("field_name");
      expect(v).toHaveProperty("field_key");
      expect(v).toHaveProperty("field_type");
      expect(v).toHaveProperty("section");
    }
  });

  it("getFieldValues — entity with no values returns empty", async () => {
    const values = await cf.getFieldValues(ORG, "employee", 999999);
    expect(values.length).toBe(0);
  });

  // --- Get Field Values For Entities ---

  it("getFieldValuesForEntities — multiple entity IDs", async () => {
    // Set a value for MGR too
    await cf.setFieldValues(ORG, "employee", MGR, [
      { fieldId: textFieldId, value: "MGR Value" },
    ]);
    const result = await cf.getFieldValuesForEntities(ORG, "employee", [EMP, MGR]);
    expect(result[EMP]).toBeTruthy();
    expect(result[MGR]).toBeTruthy();
  });

  it("getFieldValuesForEntities — empty IDs returns empty object", async () => {
    const result = await cf.getFieldValuesForEntities(ORG, "employee", []);
    expect(result).toEqual({});
  });

  it("getFieldValuesForEntities — non-existent IDs returns empty arrays", async () => {
    const result = await cf.getFieldValuesForEntities(ORG, "employee", [999998, 999999]);
    expect(result[999998]).toEqual([]);
    expect(result[999999]).toEqual([]);
  });

  // --- Search By Field Value ---

  it("searchByFieldValue — text search", async () => {
    const ids = await cf.searchByFieldValue(ORG, "employee", searchableFieldId, "Hello");
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toContain(EMP);
  });

  it("searchByFieldValue — non-searchable field throws", async () => {
    await expect(cf.searchByFieldValue(ORG, "employee", textFieldId, "x")).rejects.toThrow(/not searchable/);
  });

  it("searchByFieldValue — not found field throws", async () => {
    await expect(cf.searchByFieldValue(ORG, "employee", 999999, "x")).rejects.toThrow();
  });

  // --- Delete Field Definition ---

  it("deleteFieldDefinition — soft deletes", async () => {
    await cf.deleteFieldDefinition(ORG, boolFieldId);
    // Should not appear in list
    const list = await cf.listFieldDefinitions(ORG, "employee");
    const found = list.find((f: any) => f.id === boolFieldId);
    expect(found).toBeUndefined();
  });

  it("deleteFieldDefinition — not found throws", async () => {
    await expect(cf.deleteFieldDefinition(ORG, 999999)).rejects.toThrow();
  });

  afterAll(async () => {
    const db = getDB();
    const fieldIds = [textFieldId, numFieldId, dropdownFieldId, boolFieldId, dateFieldId, multiSelectFieldId, searchableFieldId];
    await db("custom_field_values").whereIn("field_id", fieldIds).delete();
    await db("custom_field_definitions").whereIn("id", fieldIds).delete();
  });
});

// =============================================================================
// 7. SURVEY SERVICE — DEEP COVERAGE INCLUDING eNPS
// =============================================================================

describe("Survey service — deep coverage", () => {
  let srv: any;
  let draftSurveyId: number;
  let activeSurveyId: number;
  let enpsSurveyId: number;
  let nonAnonSurveyId: number;
  let questionIds: number[] = [];

  beforeAll(async () => {
    srv = await import("../../services/survey/survey.service.js");
  });

  // --- Create Survey ---

  it("createSurvey — pulse with questions", async () => {
    const s = await srv.createSurvey(ORG, ADMIN, {
      title: `PulseSurvey-${U}`,
      description: "Test pulse survey",
      type: "pulse",
      is_anonymous: true,
      questions: [
        { question_text: "How do you feel?", question_type: "rating_1_5", is_required: true },
        { question_text: "Suggestions?", question_type: "text", is_required: false },
        { question_text: "Happy?", question_type: "yes_no", is_required: true },
        {
          question_text: "Fav color?",
          question_type: "multiple_choice",
          options: ["Red", "Blue", "Green"],
          is_required: false,
        },
      ],
    });
    expect(s).toBeTruthy();
    expect(s.status).toBe("draft");
    expect(s.questions.length).toBe(4);
    draftSurveyId = s.id;
    questionIds = s.questions.map((q: any) => q.id);
  });

  it("createSurvey — with date validation", async () => {
    await expect(srv.createSurvey(ORG, ADMIN, {
      title: "Bad Dates",
      start_date: "2026-06-01",
      end_date: "2025-01-01",
      questions: [],
    })).rejects.toThrow(/end_date/);
  });

  it("createSurvey — minimal (no questions)", async () => {
    const s = await srv.createSurvey(ORG, ADMIN, {
      title: `MinSurvey-${U}`,
      type: "general",
    });
    expect(s).toBeTruthy();
    expect(s.questions.length).toBe(0);
    // Clean up
    await srv.deleteSurvey(ORG, s.id);
  });

  it("createSurvey — eNPS survey", async () => {
    const s = await srv.createSurvey(ORG, ADMIN, {
      title: `ENPS-${U}`,
      type: "enps",
      is_anonymous: true,
      questions: [
        {
          question_text: "How likely are you to recommend this company?",
          question_type: "enps_0_10",
          is_required: true,
        },
      ],
    });
    expect(s).toBeTruthy();
    enpsSurveyId = s.id;
  });

  it("createSurvey — non-anonymous survey", async () => {
    const s = await srv.createSurvey(ORG, ADMIN, {
      title: `NonAnon-${U}`,
      type: "general",
      is_anonymous: false,
      questions: [
        { question_text: "Rate your manager", question_type: "rating_1_5", is_required: true },
      ],
    });
    expect(s).toBeTruthy();
    nonAnonSurveyId = s.id;
  });

  // --- List Surveys ---

  it("listSurveys — default", async () => {
    const result = await srv.listSurveys(ORG);
    expect(result.surveys).toBeTruthy();
    expect(typeof result.total).toBe("number");
  });

  it("listSurveys — with status filter", async () => {
    const result = await srv.listSurveys(ORG, { status: "draft" });
    for (const s of result.surveys) {
      expect(s.status).toBe("draft");
    }
  });

  it("listSurveys — with type filter", async () => {
    const result = await srv.listSurveys(ORG, { type: "enps" });
    for (const s of result.surveys) {
      expect(s.type).toBe("enps");
    }
  });

  it("listSurveys — with pagination", async () => {
    const result = await srv.listSurveys(ORG, { page: 1, perPage: 2 });
    expect(result.surveys.length).toBeLessThanOrEqual(2);
  });

  // --- Get Survey ---

  it("getSurvey — returns with questions and parsed options", async () => {
    const s = await srv.getSurvey(ORG, draftSurveyId);
    expect(s).toBeTruthy();
    expect(s.questions.length).toBe(4);
    const mcQ = s.questions.find((q: any) => q.question_type === "multiple_choice");
    expect(Array.isArray(mcQ.options)).toBe(true);
  });

  it("getSurvey — not found throws", async () => {
    await expect(srv.getSurvey(ORG, 999999)).rejects.toThrow();
  });

  // --- Update Survey ---

  it("updateSurvey — update title and description", async () => {
    const s = await srv.updateSurvey(ORG, draftSurveyId, {
      title: `UpdatedPulse-${U}`,
      description: "Updated desc",
    });
    expect(s.title).toBe(`UpdatedPulse-${U}`);
  });

  it("updateSurvey — replace questions", async () => {
    const s = await srv.updateSurvey(ORG, draftSurveyId, {
      questions: [
        { question_text: "New Q1", question_type: "rating_1_5", is_required: true },
        { question_text: "New Q2", question_type: "text", is_required: false },
      ],
    });
    expect(s.questions.length).toBe(2);
    questionIds = s.questions.map((q: any) => q.id);
  });

  it("updateSurvey — update dates and targeting", async () => {
    const s = await srv.updateSurvey(ORG, draftSurveyId, {
      start_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace("T", " "),
      target_type: "department",
      target_ids: [1, 2],
      recurrence: "weekly",
      is_anonymous: false,
    });
    expect(s).toBeTruthy();
  });

  it("updateSurvey — invalid date range throws", async () => {
    await expect(srv.updateSurvey(ORG, draftSurveyId, {
      end_date: "2020-01-01",
    })).rejects.toThrow(/end_date/);
  });

  it("updateSurvey — not found throws", async () => {
    await expect(srv.updateSurvey(ORG, 999999, { title: "x" })).rejects.toThrow();
  });

  // --- Publish Survey ---

  it("publishSurvey — publishes draft", async () => {
    const s = await srv.publishSurvey(ORG, draftSurveyId);
    expect(s.status).toBe("active");
    activeSurveyId = draftSurveyId;
  });

  it("publishSurvey — no questions throws", async () => {
    const s = await srv.createSurvey(ORG, ADMIN, { title: `NoQSurvey-${U}` });
    await expect(srv.publishSurvey(ORG, s.id)).rejects.toThrow(/at least one question/);
    await srv.deleteSurvey(ORG, s.id);
  });

  it("publishSurvey — already active throws", async () => {
    await expect(srv.publishSurvey(ORG, activeSurveyId)).rejects.toThrow(/draft or closed/);
  });

  it("publishSurvey — not found throws", async () => {
    await expect(srv.publishSurvey(ORG, 999999)).rejects.toThrow();
  });

  it("publishSurvey — eNPS survey", async () => {
    const s = await srv.publishSurvey(ORG, enpsSurveyId);
    expect(s.status).toBe("active");
  });

  it("publishSurvey — non-anonymous survey", async () => {
    const s = await srv.publishSurvey(ORG, nonAnonSurveyId);
    expect(s.status).toBe("active");
  });

  // --- Update non-draft survey throws ---

  it("updateSurvey — active survey throws", async () => {
    await expect(srv.updateSurvey(ORG, activeSurveyId, { title: "x" })).rejects.toThrow(/draft/);
  });

  // --- Submit Response ---

  it("submitResponse — anonymous pulse survey", async () => {
    const s = await srv.getSurvey(ORG, activeSurveyId);
    const result = await srv.submitResponse(ORG, activeSurveyId, EMP, [
      { question_id: s.questions[0].id, rating_value: 4 },
      { question_id: s.questions[1].id, text_value: "Great workplace" },
    ]);
    expect(result.response_id).toBeTruthy();
  });

  it("submitResponse — duplicate response throws", async () => {
    const s = await srv.getSurvey(ORG, activeSurveyId);
    await expect(srv.submitResponse(ORG, activeSurveyId, EMP, [
      { question_id: s.questions[0].id, rating_value: 3 },
    ])).rejects.toThrow(/already responded/);
  });

  it("submitResponse — missing required question throws", async () => {
    const s = await srv.getSurvey(ORG, activeSurveyId);
    await expect(srv.submitResponse(ORG, activeSurveyId, MGR, [
      { question_id: s.questions[1].id, text_value: "Only optional" },
    ])).rejects.toThrow(/Missing answers/);
  });

  it("submitResponse — eNPS survey", async () => {
    const s = await srv.getSurvey(ORG, enpsSurveyId);
    // Promoter (score 9)
    await srv.submitResponse(ORG, enpsSurveyId, EMP, [
      { question_id: s.questions[0].id, rating_value: 9 },
    ]);
    // Passive (score 7)
    await srv.submitResponse(ORG, enpsSurveyId, MGR, [
      { question_id: s.questions[0].id, rating_value: 7 },
    ]);
    // Detractor (score 4) - use ADMIN
    await srv.submitResponse(ORG, enpsSurveyId, ADMIN, [
      { question_id: s.questions[0].id, rating_value: 4 },
    ]);
  });

  it("submitResponse — non-anonymous survey", async () => {
    const s = await srv.getSurvey(ORG, nonAnonSurveyId);
    await srv.submitResponse(ORG, nonAnonSurveyId, EMP, [
      { question_id: s.questions[0].id, rating_value: 5 },
    ]);
  });

  it("submitResponse — non-anonymous duplicate throws", async () => {
    const s = await srv.getSurvey(ORG, nonAnonSurveyId);
    await expect(srv.submitResponse(ORG, nonAnonSurveyId, EMP, [
      { question_id: s.questions[0].id, rating_value: 3 },
    ])).rejects.toThrow(/already responded/);
  });

  it("submitResponse — not found survey throws", async () => {
    await expect(srv.submitResponse(ORG, 999999, EMP, [])).rejects.toThrow();
  });

  // --- Get Survey Results ---

  it("getSurveyResults — admin can view active survey results", async () => {
    const result = await srv.getSurveyResults(ORG, activeSurveyId, "org_admin");
    expect(result).toBeTruthy();
    expect(result.questions.length).toBe(2);
    expect(result.response_count).toBeGreaterThanOrEqual(1);
    // Rating question should have avg_rating
    const ratingQ = result.questions.find((q: any) => q.question_type === "rating_1_5");
    expect(ratingQ.avg_rating).toBeTruthy();
    expect(ratingQ.distribution).toBeTruthy();
    // Text question
    const textQ = result.questions.find((q: any) => q.question_type === "text");
    expect(textQ.text_responses).toBeTruthy();
  });

  it("getSurveyResults — non-admin on active survey throws", async () => {
    await expect(srv.getSurveyResults(ORG, activeSurveyId, "employee")).rejects.toThrow(/not available/);
  });

  it("getSurveyResults — eNPS survey has enps scores", async () => {
    const result = await srv.getSurveyResults(ORG, enpsSurveyId, "org_admin");
    expect(result.overall_enps).toBeTruthy();
    expect(typeof result.overall_enps.score).toBe("number");
    expect(typeof result.overall_enps.promoters).toBe("number");
    expect(typeof result.overall_enps.detractors).toBe("number");
    // Check per-question eNPS
    const enpsQ = result.questions.find((q: any) => q.question_type === "enps_0_10");
    expect(enpsQ.enps).toBeTruthy();
    expect(typeof enpsQ.enps.score).toBe("number");
  });

  it("getSurveyResults — not found throws", async () => {
    await expect(srv.getSurveyResults(ORG, 999999)).rejects.toThrow();
  });

  // --- Calculate eNPS ---

  it("calculateENPS — with responses", async () => {
    const result = await srv.calculateENPS(enpsSurveyId);
    expect(result).toBeTruthy();
    expect(typeof result.score).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.promoters).toBeGreaterThanOrEqual(1);
    expect(result.detractors).toBeGreaterThanOrEqual(1);
    expect(result.passives).toBeGreaterThanOrEqual(1);
  });

  it("calculateENPS — non-existent survey returns null", async () => {
    const result = await srv.calculateENPS(999999);
    expect(result).toBeNull();
  });

  it("calculateENPS — survey without enps_0_10 falls back to rating_1_10", async () => {
    // Our pulse survey doesn't have enps_0_10 question, tests fallback
    const result = await srv.calculateENPS(activeSurveyId);
    // Should return null because no enps_0_10 or rating_1_10 question
    expect(result).toBeNull();
  });

  // --- Get Active Surveys ---

  it("getActiveSurveys — returns active surveys with has_responded flag", async () => {
    const surveys = await srv.getActiveSurveys(ORG, EMP);
    expect(Array.isArray(surveys)).toBe(true);
    expect(surveys.length).toBeGreaterThanOrEqual(1);
    // EMP responded, so has_responded should be true for at least one
    const responded = surveys.find((s: any) => s.has_responded === true);
    expect(responded).toBeTruthy();
  });

  it("getActiveSurveys — new user has not responded", async () => {
    const surveys = await srv.getActiveSurveys(ORG, 999999);
    for (const s of surveys) {
      expect(s.has_responded).toBe(false);
    }
  });

  // --- Get My Responses ---

  it("getMyResponses — returns both anonymous and non-anonymous responses", async () => {
    const responses = await srv.getMyResponses(ORG, EMP);
    expect(Array.isArray(responses)).toBe(true);
    expect(responses.length).toBeGreaterThanOrEqual(1);
    // Should be sorted by submitted_at desc
    for (let i = 1; i < responses.length; i++) {
      expect(new Date(responses[i - 1].submitted_at).getTime())
        .toBeGreaterThanOrEqual(new Date(responses[i].submitted_at).getTime());
    }
  });

  it("getMyResponses — user with no responses", async () => {
    const responses = await srv.getMyResponses(ORG, 999999);
    expect(responses.length).toBe(0);
  });

  // --- Close Survey ---

  it("closeSurvey — closes active survey", async () => {
    const s = await srv.closeSurvey(ORG, activeSurveyId);
    expect(s.status).toBe("closed");
    expect(s.end_date).toBeTruthy();
  });

  it("closeSurvey — already closed throws", async () => {
    await expect(srv.closeSurvey(ORG, activeSurveyId)).rejects.toThrow(/active/);
  });

  it("closeSurvey — not found throws", async () => {
    await expect(srv.closeSurvey(ORG, 999999)).rejects.toThrow();
  });

  // --- Results available after close ---

  it("getSurveyResults — closed survey results available to all", async () => {
    const result = await srv.getSurveyResults(ORG, activeSurveyId, "employee");
    expect(result).toBeTruthy();
    expect(result.status).toBe("closed");
  });

  // --- Republish closed survey ---

  it("publishSurvey — can republish closed survey", async () => {
    const s = await srv.publishSurvey(ORG, activeSurveyId);
    expect(s.status).toBe("active");
    // Close again for cleanup
    await srv.closeSurvey(ORG, activeSurveyId);
  });

  // --- Delete Survey ---

  it("deleteSurvey — non-draft throws", async () => {
    await expect(srv.deleteSurvey(ORG, enpsSurveyId)).rejects.toThrow(/draft/);
  });

  it("deleteSurvey — not found throws", async () => {
    await expect(srv.deleteSurvey(ORG, 999999)).rejects.toThrow();
  });

  // --- Survey Dashboard ---

  it("getSurveyDashboard — returns full stats", async () => {
    const dash = await srv.getSurveyDashboard(ORG);
    expect(typeof dash.active_count).toBe("number");
    expect(typeof dash.total_count).toBe("number");
    expect(typeof dash.draft_count).toBe("number");
    expect(typeof dash.closed_count).toBe("number");
    expect(typeof dash.total_responses).toBe("number");
    expect(typeof dash.avg_response_rate).toBe("number");
    expect(typeof dash.user_count).toBe("number");
    expect(Array.isArray(dash.recent_surveys)).toBe(true);
    // enps_score might be a number or null
    if (dash.enps_score !== null) {
      expect(typeof dash.enps_score).toBe("number");
    }
  });

  afterAll(async () => {
    const db = getDB();
    const surveyIds = [activeSurveyId, enpsSurveyId, nonAnonSurveyId].filter(Boolean);
    // Clean up answers -> responses -> questions -> surveys
    for (const sid of surveyIds) {
      const responseIds = await db("survey_responses").where({ survey_id: sid }).select("id");
      if (responseIds.length > 0) {
        await db("survey_answers").whereIn("response_id", responseIds.map((r: any) => r.id)).delete();
      }
      await db("survey_responses").where({ survey_id: sid }).delete();
      await db("survey_questions").where({ survey_id: sid }).delete();
    }
    await db("surveys").whereIn("id", surveyIds).delete();
  });
});
