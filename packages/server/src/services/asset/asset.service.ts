// =============================================================================
// EMP CLOUD — Asset Management Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Asset Tag Generation — AST-YYYY-NNNN
// ---------------------------------------------------------------------------

async function generateAssetTag(orgId: number): Promise<string> {
  const db = getDB();
  const year = new Date().getFullYear();
  const prefix = `AST-${year}-`;

  const [result] = await db("assets")
    .where({ organization_id: orgId })
    .where("asset_tag", "like", `${prefix}%`)
    .count("id as count");

  const nextNum = Number(result.count) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Log History
// ---------------------------------------------------------------------------

async function logHistory(
  assetId: number,
  orgId: number,
  action: string,
  performedBy: number,
  opts?: {
    fromUserId?: number | null;
    toUserId?: number | null;
    notes?: string | null;
  }
) {
  const db = getDB();
  await db("asset_history").insert({
    asset_id: assetId,
    organization_id: orgId,
    action,
    from_user_id: opts?.fromUserId || null,
    to_user_id: opts?.toUserId || null,
    performed_by: performedBy,
    notes: opts?.notes || null,
    created_at: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(
  orgId: number,
  data: { name: string; description?: string | null }
) {
  const db = getDB();
  const now = new Date();

  const [id] = await db("asset_categories").insert({
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  logger.info(`Asset category #${id} created in org ${orgId}`);
  return db("asset_categories").where({ id }).first();
}

export async function listCategories(orgId: number) {
  const db = getDB();
  return db("asset_categories")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("name", "asc");
}

export async function updateCategory(
  orgId: number,
  categoryId: number,
  data: { name?: string; description?: string | null; is_active?: boolean }
) {
  const db = getDB();

  const existing = await db("asset_categories")
    .where({ id: categoryId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Asset category");

  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  await db("asset_categories").where({ id: categoryId }).update(updateData);
  return db("asset_categories").where({ id: categoryId }).first();
}

export async function deleteCategory(orgId: number, categoryId: number) {
  const db = getDB();

  const existing = await db("asset_categories")
    .where({ id: categoryId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Asset category");

  // Soft delete — mark inactive
  await db("asset_categories")
    .where({ id: categoryId })
    .update({ is_active: false, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Create Asset
// ---------------------------------------------------------------------------

export async function createAsset(
  orgId: number,
  userId: number,
  data: {
    name: string;
    category_id?: number | null;
    description?: string | null;
    serial_number?: string | null;
    brand?: string | null;
    model?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    warranty_expiry?: string | null;
    status?: string;
    condition_status?: string;
    location_name?: string | null;
    notes?: string | null;
  }
) {
  const db = getDB();

  // Validate warranty_expiry is not before purchase_date
  if (data.purchase_date && data.warranty_expiry) {
    if (new Date(data.warranty_expiry) < new Date(data.purchase_date)) {
      throw new ValidationError("warranty_expiry cannot be before purchase_date");
    }
  }

  const now = new Date();
  const assetTag = await generateAssetTag(orgId);

  const [id] = await db("assets").insert({
    organization_id: orgId,
    asset_tag: assetTag,
    name: data.name,
    category_id: data.category_id || null,
    description: data.description || null,
    serial_number: data.serial_number || null,
    brand: data.brand || null,
    model: data.model || null,
    purchase_date: data.purchase_date || null,
    purchase_cost: data.purchase_cost || null,
    warranty_expiry: data.warranty_expiry || null,
    status: data.status || "available",
    condition_status: data.condition_status || "new",
    location_name: data.location_name || null,
    assigned_to: null,
    assigned_at: null,
    assigned_by: null,
    notes: data.notes || null,
    created_at: now,
    updated_at: now,
  });

  await logHistory(id, orgId, "created", userId, { notes: `Asset ${assetTag} created` });

  logger.info(`Asset #${id} (${assetTag}) created by user ${userId} in org ${orgId}`);
  return db("assets").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Assets (paginated, filterable)
// ---------------------------------------------------------------------------

export async function listAssets(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
    category_id?: number;
    assigned_to?: number;
    condition_status?: string;
    search?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("assets").where({ "assets.organization_id": orgId });

  if (filters?.status) query = query.where("assets.status", filters.status);
  if (filters?.category_id) query = query.where("assets.category_id", filters.category_id);
  if (filters?.assigned_to) query = query.where("assets.assigned_to", filters.assigned_to);
  if (filters?.condition_status) query = query.where("assets.condition_status", filters.condition_status);
  if (filters?.search) {
    query = query.where(function () {
      this.where("assets.name", "like", `%${filters.search}%`)
        .orWhere("assets.asset_tag", "like", `%${filters.search}%`)
        .orWhere("assets.serial_number", "like", `%${filters.search}%`);
    });
  }

  const [{ count }] = await query.clone().count("assets.id as count");

  const assets = await query
    .clone()
    .select(
      "assets.*",
      db.raw(
        `(SELECT name FROM asset_categories WHERE asset_categories.id = assets.category_id) as category_name`
      ),
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = assets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("assets.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { assets, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Get Asset Detail (with history)
// ---------------------------------------------------------------------------

export async function getAsset(orgId: number, assetId: number) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .select(
      "assets.*",
      db.raw(
        `(SELECT name FROM asset_categories WHERE asset_categories.id = assets.category_id) as category_name`
      ),
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = assets.assigned_to) as assigned_to_name`
      ),
      db.raw(
        `(SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM users u2 WHERE u2.id = assets.assigned_by) as assigned_by_name`
      )
    )
    .first();

  if (!asset) throw new NotFoundError("Asset");

  const history = await db("asset_history")
    .where({ asset_id: assetId, "asset_history.organization_id": orgId })
    .select(
      "asset_history.*",
      db.raw(
        `(SELECT CONCAT(u1.first_name, ' ', u1.last_name) FROM users u1 WHERE u1.id = asset_history.performed_by) as performed_by_name`
      ),
      db.raw(
        `(SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM users u2 WHERE u2.id = asset_history.from_user_id) as from_user_name`
      ),
      db.raw(
        `(SELECT CONCAT(u3.first_name, ' ', u3.last_name) FROM users u3 WHERE u3.id = asset_history.to_user_id) as to_user_name`
      )
    )
    .orderBy("asset_history.created_at", "desc");

  return { ...asset, history };
}

// ---------------------------------------------------------------------------
// Update Asset
// ---------------------------------------------------------------------------

export async function updateAsset(
  orgId: number,
  assetId: number,
  userId: number,
  data: {
    name?: string;
    category_id?: number | null;
    description?: string | null;
    serial_number?: string | null;
    brand?: string | null;
    model?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    warranty_expiry?: string | null;
    condition_status?: string;
    location_name?: string | null;
    notes?: string | null;
  }
) {
  const db = getDB();

  const existing = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Asset");

  // Validate warranty_expiry is not before purchase_date (considering existing values)
  const effectivePurchaseDate = data.purchase_date !== undefined ? data.purchase_date : existing.purchase_date;
  const effectiveWarrantyExpiry = data.warranty_expiry !== undefined ? data.warranty_expiry : existing.warranty_expiry;
  if (effectivePurchaseDate && effectiveWarrantyExpiry) {
    if (new Date(effectiveWarrantyExpiry) < new Date(effectivePurchaseDate)) {
      throw new ValidationError("warranty_expiry cannot be before purchase_date");
    }
  }

  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.category_id !== undefined) updateData.category_id = data.category_id;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.serial_number !== undefined) updateData.serial_number = data.serial_number;
  if (data.brand !== undefined) updateData.brand = data.brand;
  if (data.model !== undefined) updateData.model = data.model;
  if (data.purchase_date !== undefined) updateData.purchase_date = data.purchase_date;
  if (data.purchase_cost !== undefined) updateData.purchase_cost = data.purchase_cost;
  if (data.warranty_expiry !== undefined) updateData.warranty_expiry = data.warranty_expiry;
  if (data.condition_status !== undefined) updateData.condition_status = data.condition_status;
  if (data.location_name !== undefined) updateData.location_name = data.location_name;
  if (data.notes !== undefined) updateData.notes = data.notes;

  await db("assets").where({ id: assetId }).update(updateData);

  await logHistory(assetId, orgId, "updated", userId, { notes: "Asset details updated" });

  return db("assets").where({ id: assetId }).first();
}

// ---------------------------------------------------------------------------
// Assign Asset
// ---------------------------------------------------------------------------

export async function assignAsset(
  orgId: number,
  assetId: number,
  targetUserId: number,
  assignedBy: number,
  notes?: string | null
) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!asset) throw new NotFoundError("Asset");

  if (asset.status === "assigned") {
    throw new ForbiddenError("Asset is already assigned. Return it first.");
  }
  if (asset.status === "retired" || asset.status === "lost") {
    throw new ForbiddenError(`Cannot assign an asset with status: ${asset.status}`);
  }

  const now = new Date();
  await db("assets").where({ id: assetId }).update({
    status: "assigned",
    assigned_to: targetUserId,
    assigned_at: now,
    assigned_by: assignedBy,
    updated_at: now,
  });

  await logHistory(assetId, orgId, "assigned", assignedBy, {
    toUserId: targetUserId,
    notes: notes || "Asset assigned",
  });

  logger.info(`Asset #${assetId} assigned to user ${targetUserId} by user ${assignedBy} in org ${orgId}`);
  return db("assets").where({ id: assetId }).first();
}

// ---------------------------------------------------------------------------
// Return Asset
// ---------------------------------------------------------------------------

export async function returnAsset(
  orgId: number,
  assetId: number,
  userId: number,
  condition?: string,
  notes?: string | null
) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!asset) throw new NotFoundError("Asset");

  if (asset.status !== "assigned") {
    throw new ForbiddenError("Asset is not currently assigned");
  }

  const now = new Date();
  const updateData: Record<string, any> = {
    status: "available",
    assigned_to: null,
    assigned_at: null,
    assigned_by: null,
    returned_at: now,
    updated_at: now,
  };
  if (condition) updateData.condition_status = condition;

  await db("assets").where({ id: assetId }).update(updateData);

  await logHistory(assetId, orgId, "returned", userId, {
    fromUserId: asset.assigned_to,
    notes: notes || "Asset returned",
  });

  logger.info(`Asset #${assetId} returned by user ${userId} in org ${orgId}`);
  return db("assets").where({ id: assetId }).first();
}

// ---------------------------------------------------------------------------
// Retire Asset
// ---------------------------------------------------------------------------

export async function retireAsset(
  orgId: number,
  assetId: number,
  userId: number,
  notes?: string | null
) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!asset) throw new NotFoundError("Asset");

  if (asset.status === "retired") {
    throw new ForbiddenError("Asset is already retired");
  }

  const now = new Date();
  await db("assets").where({ id: assetId }).update({
    status: "retired",
    assigned_to: null,
    assigned_at: null,
    assigned_by: null,
    updated_at: now,
  });

  await logHistory(assetId, orgId, "retired", userId, {
    fromUserId: asset.assigned_to,
    notes: notes || "Asset retired",
  });

  logger.info(`Asset #${assetId} retired by user ${userId} in org ${orgId}`);
  return db("assets").where({ id: assetId }).first();
}

// ---------------------------------------------------------------------------
// Report Lost
// ---------------------------------------------------------------------------

export async function reportLost(
  orgId: number,
  assetId: number,
  userId: number,
  notes?: string | null
) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!asset) throw new NotFoundError("Asset");

  if (asset.status === "lost") {
    throw new ForbiddenError("Asset is already reported as lost");
  }

  const now = new Date();
  await db("assets").where({ id: assetId }).update({
    status: "lost",
    updated_at: now,
  });

  await logHistory(assetId, orgId, "lost", userId, {
    notes: notes || "Asset reported as lost",
  });

  logger.info(`Asset #${assetId} reported lost by user ${userId} in org ${orgId}`);
  return db("assets").where({ id: assetId }).first();
}

// ---------------------------------------------------------------------------
// Delete Asset (soft — retire; blocks if currently assigned)
// ---------------------------------------------------------------------------

export async function deleteAsset(
  orgId: number,
  assetId: number,
  userId: number,
) {
  const db = getDB();

  const asset = await db("assets")
    .where({ id: assetId, organization_id: orgId })
    .first();
  if (!asset) throw new NotFoundError("Asset");

  // Rule: Cannot delete an asset that is currently assigned
  if (asset.status === "assigned") {
    throw new ValidationError(
      "Cannot delete an asset that is currently assigned. Return or unassign the asset first.",
    );
  }

  // Soft delete — mark as retired
  const now = new Date();
  await db("assets").where({ id: assetId }).update({
    status: "retired",
    updated_at: now,
  });

  await logHistory(assetId, orgId, "retired", userId, {
    notes: "Asset deleted (soft-retired)",
  });

  logger.info(`Asset #${assetId} soft-deleted by user ${userId} in org ${orgId}`);
}

// ---------------------------------------------------------------------------
// My Assets
// ---------------------------------------------------------------------------

export async function getMyAssets(orgId: number, userId: number) {
  const db = getDB();

  return db("assets")
    .where({ organization_id: orgId, assigned_to: userId, status: "assigned" })
    .select(
      "assets.*",
      db.raw(
        `(SELECT name FROM asset_categories WHERE asset_categories.id = assets.category_id) as category_name`
      )
    )
    .orderBy("assigned_at", "desc");
}

// ---------------------------------------------------------------------------
// Asset Dashboard
// ---------------------------------------------------------------------------

export async function getAssetDashboard(orgId: number) {
  const db = getDB();

  // Status counts
  const statusCounts = await db("assets")
    .where({ organization_id: orgId })
    .select("status")
    .count("id as count")
    .groupBy("status");

  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    statusMap[row.status] = Number(row.count);
    total += Number(row.count);
  }

  // Expiring warranties (next 30 days)
  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const expiringWarranties = await db("assets")
    .where({ organization_id: orgId })
    .whereNotNull("warranty_expiry")
    .where("warranty_expiry", ">=", now)
    .where("warranty_expiry", "<=", thirtyDays)
    .whereNot("status", "retired")
    .select(
      "assets.*",
      db.raw(
        `(SELECT name FROM asset_categories WHERE asset_categories.id = assets.category_id) as category_name`
      ),
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = assets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("warranty_expiry", "asc");

  // Category breakdown
  const categoryBreakdown = await db("assets")
    .where({ "assets.organization_id": orgId })
    .leftJoin("asset_categories", "assets.category_id", "asset_categories.id")
    .select(db.raw("COALESCE(asset_categories.name, 'Uncategorized') as category"))
    .count("assets.id as count")
    .groupBy("asset_categories.name")
    .orderBy("count", "desc");

  // Top assignees
  const topAssignees = await db("assets")
    .where({ "assets.organization_id": orgId, "assets.status": "assigned" })
    .select(
      "assets.assigned_to",
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = assets.assigned_to) as name`
      )
    )
    .count("assets.id as count")
    .groupBy("assets.assigned_to")
    .orderBy("count", "desc")
    .limit(10);

  // Recent activity
  const recentActivity = await db("asset_history")
    .where({ "asset_history.organization_id": orgId })
    .select(
      "asset_history.*",
      db.raw(
        `(SELECT asset_tag FROM assets WHERE assets.id = asset_history.asset_id) as asset_tag`
      ),
      db.raw(
        `(SELECT name FROM assets WHERE assets.id = asset_history.asset_id) as asset_name`
      ),
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = asset_history.performed_by) as performed_by_name`
      )
    )
    .orderBy("asset_history.created_at", "desc")
    .limit(10);

  return {
    total,
    available: statusMap.available || 0,
    assigned: statusMap.assigned || 0,
    in_repair: statusMap.in_repair || 0,
    retired: statusMap.retired || 0,
    lost: statusMap.lost || 0,
    damaged: statusMap.damaged || 0,
    expiring_warranties: expiringWarranties,
    category_breakdown: categoryBreakdown.map((r: any) => ({
      category: r.category,
      count: Number(r.count),
    })),
    top_assignees: topAssignees.map((r: any) => ({
      user_id: r.assigned_to,
      name: r.name,
      count: Number(r.count),
    })),
    recent_activity: recentActivity,
  };
}

// ---------------------------------------------------------------------------
// Expiring Warranties
// ---------------------------------------------------------------------------

export async function getExpiringWarranties(orgId: number, days: number = 30) {
  const db = getDB();
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db("assets")
    .where({ organization_id: orgId })
    .whereNotNull("warranty_expiry")
    .where("warranty_expiry", ">=", now)
    .where("warranty_expiry", "<=", future)
    .whereNot("status", "retired")
    .select(
      "assets.*",
      db.raw(
        `(SELECT name FROM asset_categories WHERE asset_categories.id = assets.category_id) as category_name`
      ),
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = assets.assigned_to) as assigned_to_name`
      )
    )
    .orderBy("warranty_expiry", "asc");
}
