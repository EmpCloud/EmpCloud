// =============================================================================
// EMP CLOUD — Document Service
// =============================================================================

import fs from "node:fs";
import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(
  orgId: number,
  data: { name: string; description?: string | null; is_mandatory?: boolean },
) {
  const db = getDB();
  const [id] = await db("document_categories").insert({
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    is_mandatory: data.is_mandatory ?? false,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("document_categories").where({ id }).first();
}

export async function listCategories(orgId: number) {
  const db = getDB();
  return db("document_categories")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("name", "asc");
}

export async function updateCategory(
  orgId: number,
  categoryId: number,
  data: { name?: string; description?: string | null; is_mandatory?: boolean },
) {
  const db = getDB();
  const category = await db("document_categories")
    .where({ id: categoryId, organization_id: orgId })
    .first();
  if (!category) throw new NotFoundError("Document category");

  await db("document_categories")
    .where({ id: categoryId })
    .update({ ...data, updated_at: new Date() });

  return db("document_categories").where({ id: categoryId }).first();
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(
  orgId: number,
  userId: number,
  uploadedBy: number,
  data: {
    category_id: number;
    name: string;
    file_path: string;
    file_size: number | null;
    mime_type: string | null;
    expires_at?: string | null;
  },
) {
  const db = getDB();

  // Verify category belongs to org
  const category = await db("document_categories")
    .where({ id: data.category_id, organization_id: orgId })
    .first();
  if (!category) throw new NotFoundError("Document category");

  const [id] = await db("employee_documents").insert({
    organization_id: orgId,
    user_id: userId,
    category_id: data.category_id,
    name: data.name,
    file_path: data.file_path,
    file_size: data.file_size,
    mime_type: data.mime_type,
    expires_at: data.expires_at || null,
    is_verified: false,
    uploaded_by: uploadedBy,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("employee_documents").where({ id }).first();
}

export async function listDocuments(
  orgId: number,
  params?: {
    user_id?: number;
    category_id?: number;
    page?: number;
    perPage?: number;
  },
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("employee_documents")
    .where({ "employee_documents.organization_id": orgId })
    .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
    .leftJoin("users", "employee_documents.user_id", "users.id")
    .select(
      "employee_documents.*",
      "document_categories.name as category_name",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.emp_code as user_emp_code",
    );

  if (params?.user_id) {
    query = query.where("employee_documents.user_id", params.user_id);
  }
  if (params?.category_id) {
    query = query.where("employee_documents.category_id", params.category_id);
  }

  const [{ count }] = await query.clone().clearSelect().count("employee_documents.id as count");
  const documents = await query
    .orderBy("employee_documents.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { documents, total: Number(count) };
}

export async function getDocument(orgId: number, docId: number) {
  const db = getDB();
  const doc = await db("employee_documents")
    .where({ id: docId, organization_id: orgId })
    .first();
  if (!doc) throw new NotFoundError("Document");
  return doc;
}

export async function deleteDocument(orgId: number, docId: number) {
  const db = getDB();
  const doc = await db("employee_documents")
    .where({ id: docId, organization_id: orgId })
    .first();
  if (!doc) throw new NotFoundError("Document");

  // Remove physical file
  try {
    fs.unlinkSync(doc.file_path);
  } catch {
    // File may already be deleted — continue
  }

  await db("employee_documents").where({ id: docId }).delete();
}

export async function verifyDocument(
  orgId: number,
  docId: number,
  verifiedBy: number,
  data: { is_verified: boolean; verification_remarks?: string | null },
) {
  const db = getDB();
  const doc = await db("employee_documents")
    .where({ id: docId, organization_id: orgId })
    .first();
  if (!doc) throw new NotFoundError("Document");

  await db("employee_documents")
    .where({ id: docId })
    .update({
      is_verified: data.is_verified,
      verified_by: data.is_verified ? verifiedBy : null,
      verified_at: data.is_verified ? new Date() : null,
      verification_remarks: data.verification_remarks || null,
      updated_at: new Date(),
    });

  return db("employee_documents").where({ id: docId }).first();
}

// ---------------------------------------------------------------------------
// Mandatory Document Tracking
// ---------------------------------------------------------------------------

export async function getMandatoryTracking(orgId: number) {
  const db = getDB();

  const mandatoryCategories = await db("document_categories")
    .where({ organization_id: orgId, is_mandatory: true, is_active: true });

  const activeUsers = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id", "first_name", "last_name", "emp_code");

  const existingDocs = await db("employee_documents")
    .where({ organization_id: orgId })
    .whereIn(
      "category_id",
      mandatoryCategories.map((c: any) => c.id),
    )
    .select("user_id", "category_id");

  const docSet = new Set(
    existingDocs.map((d: any) => `${d.user_id}-${d.category_id}`),
  );

  const missing: Array<{
    user_id: number;
    user_name: string;
    emp_code: string | null;
    category_id: number;
    category_name: string;
  }> = [];

  for (const user of activeUsers) {
    for (const cat of mandatoryCategories) {
      if (!docSet.has(`${user.id}-${cat.id}`)) {
        missing.push({
          user_id: user.id,
          user_name: `${user.first_name} ${user.last_name}`,
          emp_code: user.emp_code,
          category_id: cat.id,
          category_name: cat.name,
        });
      }
    }
  }

  return { mandatory_categories: mandatoryCategories, missing };
}

// ---------------------------------------------------------------------------
// Expiry Alerts
// ---------------------------------------------------------------------------

export async function getExpiryAlerts(orgId: number, daysAhead = 30) {
  const db = getDB();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const documents = await db("employee_documents")
    .where({ "employee_documents.organization_id": orgId })
    .whereNotNull("employee_documents.expires_at")
    .where("employee_documents.expires_at", "<=", futureDate)
    .leftJoin("document_categories", "employee_documents.category_id", "document_categories.id")
    .leftJoin("users", "employee_documents.user_id", "users.id")
    .select(
      "employee_documents.*",
      "document_categories.name as category_name",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.emp_code as user_emp_code",
    )
    .orderBy("employee_documents.expires_at", "asc");

  return documents;
}
