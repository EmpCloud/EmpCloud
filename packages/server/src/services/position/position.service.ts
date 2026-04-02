// =============================================================================
// EMP CLOUD — Position Management Service
// Budgeted positions, headcount planning, position assignments.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type {
  CreatePositionInput,
  UpdatePositionInput,
  AssignPositionInput,
  CreateHeadcountPlanInput,
  UpdateHeadcountPlanInput,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generatePositionCode(orgId: number, departmentId?: number | null): Promise<string> {
  const db = getDB();
  let prefix = "POS";

  if (departmentId) {
    const dept = await db("organization_departments")
      .where({ id: departmentId, organization_id: orgId })
      .first();
    if (dept) {
      // Take first 3 letters of department name, uppercase
      prefix = "POS-" + dept.name.replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase();
    }
  }

  // Find the max existing code with this prefix
  const existing = await db("positions")
    .where({ organization_id: orgId })
    .where("code", "like", `${prefix}-%`)
    .orderBy("id", "desc")
    .first();

  let nextNum = 1;
  if (existing && existing.code) {
    const parts = existing.code.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }

  return `${prefix}-${String(nextNum).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Create Position
// ---------------------------------------------------------------------------

export async function createPosition(
  orgId: number,
  userId: number,
  data: CreatePositionInput
) {
  const db = getDB();

  const code = data.code || await generatePositionCode(orgId, data.department_id);

  // Check code uniqueness
  const existing = await db("positions")
    .where({ organization_id: orgId, code })
    .first();
  if (existing) {
    throw new ValidationError(`Position code "${code}" already exists`);
  }

  const [id] = await db("positions").insert({
    organization_id: orgId,
    title: data.title,
    code,
    department_id: data.department_id || null,
    location_id: data.location_id || null,
    reports_to_position_id: data.reports_to_position_id || null,
    job_description: data.job_description || null,
    requirements: data.requirements || null,
    min_salary: data.min_salary ?? null,
    max_salary: data.max_salary ?? null,
    currency: data.currency || "INR",
    employment_type: data.employment_type || "full_time",
    headcount_budget: data.headcount_budget ?? 1,
    headcount_filled: 0,
    status: "active",
    is_critical: data.is_critical ?? false,
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("positions").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Positions (paginated, filtered)
// ---------------------------------------------------------------------------

export async function listPositions(
  orgId: number,
  params?: {
    page?: number;
    perPage?: number;
    department_id?: number;
    status?: string;
    employment_type?: string;
    search?: string;
    is_critical?: boolean;
  }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("positions")
    .where({ "positions.organization_id": orgId });

  if (params?.status) {
    query = query.where({ "positions.status": params.status });
  }
  if (params?.department_id) {
    query = query.where({ "positions.department_id": params.department_id });
  }
  if (params?.employment_type) {
    query = query.where({ "positions.employment_type": params.employment_type });
  }
  if (params?.is_critical !== undefined) {
    query = query.where({ "positions.is_critical": params.is_critical });
  }
  if (params?.search) {
    const s = `%${params.search}%`;
    query = query.where(function () {
      this.where("positions.title", "like", s)
        .orWhere("positions.code", "like", s);
    });
  }

  const [{ count }] = await query.clone().count("* as count");

  const positions = await query
    .clone()
    .select(
      "positions.*",
      "organization_departments.name as department_name",
      "organization_locations.name as location_name"
    )
    .leftJoin("organization_departments", "positions.department_id", "organization_departments.id")
    .leftJoin("organization_locations", "positions.location_id", "organization_locations.id")
    .orderBy("positions.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { positions, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Get Position Detail with Current Assignments
// ---------------------------------------------------------------------------

export async function getPosition(orgId: number, positionId: number) {
  const db = getDB();

  const position = await db("positions")
    .where({ "positions.id": positionId, "positions.organization_id": orgId })
    .select(
      "positions.*",
      "organization_departments.name as department_name",
      "organization_locations.name as location_name"
    )
    .leftJoin("organization_departments", "positions.department_id", "organization_departments.id")
    .leftJoin("organization_locations", "positions.location_id", "organization_locations.id")
    .first();

  if (!position) throw new NotFoundError("Position");

  // Current assignments
  const assignments = await db("position_assignments")
    .where({ position_id: positionId, "position_assignments.organization_id": orgId })
    .join("users", "position_assignments.user_id", "users.id")
    .select(
      "position_assignments.*",
      "users.first_name",
      "users.last_name",
      "users.email",
      "users.emp_code",
      "users.designation",
      "users.photo_path"
    )
    .orderBy("position_assignments.start_date", "desc");

  // Reports-to position
  let reportsTo = null;
  if (position.reports_to_position_id) {
    reportsTo = await db("positions")
      .where({ id: position.reports_to_position_id, organization_id: orgId })
      .select("id", "title", "code")
      .first();
  }

  return { ...position, assignments, reports_to: reportsTo };
}

// ---------------------------------------------------------------------------
// Update Position
// ---------------------------------------------------------------------------

export async function updatePosition(
  orgId: number,
  positionId: number,
  data: UpdatePositionInput
) {
  const db = getDB();

  const existing = await db("positions")
    .where({ id: positionId, organization_id: orgId })
    .first();

  if (!existing) throw new NotFoundError("Position");

  // If code changed, check uniqueness
  if (data.code && data.code !== existing.code) {
    const dup = await db("positions")
      .where({ organization_id: orgId, code: data.code })
      .whereNot({ id: positionId })
      .first();
    if (dup) {
      throw new ValidationError(`Position code "${data.code}" already exists`);
    }
  }

  await db("positions")
    .where({ id: positionId })
    .update({
      ...data,
      updated_at: new Date(),
    });

  return db("positions").where({ id: positionId }).first();
}

// ---------------------------------------------------------------------------
// Delete Position (soft — set status to closed)
// ---------------------------------------------------------------------------

export async function deletePosition(orgId: number, positionId: number) {
  const db = getDB();

  const existing = await db("positions")
    .where({ id: positionId, organization_id: orgId })
    .whereNot({ status: "closed" })
    .first();

  if (!existing) throw new NotFoundError("Position");

  // End all active assignments
  await db("position_assignments")
    .where({ position_id: positionId, status: "active" })
    .update({ status: "ended", end_date: new Date(), updated_at: new Date() });

  await db("positions")
    .where({ id: positionId })
    .update({ status: "closed", headcount_filled: 0, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Assign User to Position
// ---------------------------------------------------------------------------

export async function assignUserToPosition(
  orgId: number,
  positionId: number,
  userId: number,
  data: AssignPositionInput
) {
  const db = getDB();

  const position = await db("positions")
    .where({ id: positionId, organization_id: orgId, status: "active" })
    .first();

  if (!position) throw new NotFoundError("Position");

  // Verify user belongs to org
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("User");

  // Check if user already has an active assignment for this position
  const existingAssignment = await db("position_assignments")
    .where({ position_id: positionId, user_id: userId, status: "active" })
    .first();
  if (existingAssignment) {
    throw new ValidationError("User is already assigned to this position");
  }

  // Check headcount budget
  if (position.headcount_filled >= position.headcount_budget) {
    throw new ValidationError(
      `Position headcount budget is full (${position.headcount_filled}/${position.headcount_budget})`
    );
  }

  const [id] = await db("position_assignments").insert({
    position_id: positionId,
    organization_id: orgId,
    user_id: userId,
    start_date: data.start_date,
    end_date: data.end_date || null,
    is_primary: data.is_primary ?? true,
    status: "active",
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Increment headcount_filled and update timestamp
  await db("positions")
    .where({ id: positionId })
    .update({
      headcount_filled: db.raw("headcount_filled + 1"),
      updated_at: new Date(),
    });

  // Auto-update status to "filled" when headcount_filled reaches headcount_budget
  const updated = await db("positions").where({ id: positionId }).first();
  if (updated && updated.headcount_filled >= updated.headcount_budget) {
    await db("positions")
      .where({ id: positionId })
      .update({ status: "filled", updated_at: new Date() });
  }

  const assignment = await db("position_assignments").where({ id }).first();
  return assignment;
}

// ---------------------------------------------------------------------------
// Remove User from Position (end assignment)
// ---------------------------------------------------------------------------

export async function removeUserFromPosition(orgId: number, assignmentId: number) {
  const db = getDB();

  const assignment = await db("position_assignments")
    .where({ id: assignmentId, organization_id: orgId, status: "active" })
    .first();

  if (!assignment) throw new NotFoundError("Position Assignment");

  await db("position_assignments")
    .where({ id: assignmentId })
    .update({ status: "ended", end_date: new Date(), updated_at: new Date() });

  // Decrement headcount_filled (min 0)
  await db("positions")
    .where({ id: assignment.position_id })
    .where("headcount_filled", ">", 0)
    .update({
      headcount_filled: db.raw("headcount_filled - 1"),
      updated_at: new Date(),
    });

  // If position was "filled" (fully staffed), revert to "active" since there's now a vacancy
  const pos = await db("positions").where({ id: assignment.position_id }).first();
  if (pos && (pos.status === "filled" || pos.status === "frozen") && pos.headcount_filled < pos.headcount_budget) {
    await db("positions")
      .where({ id: assignment.position_id })
      .update({ status: "active", updated_at: new Date() });
  }
}

// ---------------------------------------------------------------------------
// Get Position Hierarchy (tree structure)
// ---------------------------------------------------------------------------

export async function getPositionHierarchy(orgId: number) {
  const db = getDB();

  const positions = await db("positions")
    .where({ "positions.organization_id": orgId })
    .whereNot({ "positions.status": "closed" })
    .select(
      "positions.id",
      "positions.title",
      "positions.code",
      "positions.department_id",
      "positions.reports_to_position_id",
      "positions.headcount_budget",
      "positions.headcount_filled",
      "positions.status",
      "positions.is_critical",
      "organization_departments.name as department_name"
    )
    .leftJoin("organization_departments", "positions.department_id", "organization_departments.id")
    .orderBy("positions.title", "asc");

  // Build tree — cast is_critical from MySQL TINYINT(1) 0/1 to boolean
  const positionMap = new Map<number, any>();
  const roots: any[] = [];

  for (const p of positions) {
    positionMap.set(Number(p.id), { ...p, id: Number(p.id), reports_to_position_id: p.reports_to_position_id ? Number(p.reports_to_position_id) : null, is_critical: Boolean(p.is_critical), children: [] });
  }

  for (const p of positions) {
    const node = positionMap.get(Number(p.id))!;
    const parentId = p.reports_to_position_id ? Number(p.reports_to_position_id) : null;
    if (parentId && positionMap.has(parentId)) {
      positionMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Get Vacancies (positions where filled < budget)
// ---------------------------------------------------------------------------

export async function getVacancies(orgId: number) {
  const db = getDB();

  const vacancies = await db("positions")
    .where({ "positions.organization_id": orgId, "positions.status": "active" })
    .whereRaw("positions.headcount_filled < positions.headcount_budget")
    .select(
      "positions.*",
      "organization_departments.name as department_name",
      "organization_locations.name as location_name",
      db.raw("(positions.headcount_budget - positions.headcount_filled) as open_count")
    )
    .leftJoin("organization_departments", "positions.department_id", "organization_departments.id")
    .leftJoin("organization_locations", "positions.location_id", "organization_locations.id")
    .orderBy("positions.is_critical", "desc")
    .orderBy("positions.created_at", "desc");

  return vacancies;
}

// ---------------------------------------------------------------------------
// Create Headcount Plan
// ---------------------------------------------------------------------------

export async function createHeadcountPlan(
  orgId: number,
  userId: number,
  data: CreateHeadcountPlanInput
) {
  const db = getDB();

  const [id] = await db("headcount_plans").insert({
    organization_id: orgId,
    title: data.title,
    fiscal_year: data.fiscal_year,
    quarter: data.quarter || null,
    department_id: data.department_id || null,
    planned_headcount: data.planned_headcount ?? 0,
    approved_headcount: 0,
    current_headcount: data.current_headcount ?? 0,
    budget_amount: data.budget_amount ?? null,
    currency: data.currency || "INR",
    status: "draft",
    notes: data.notes || null,
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("headcount_plans").where({ id }).first();
}

// ---------------------------------------------------------------------------
// List Headcount Plans
// ---------------------------------------------------------------------------

export async function listHeadcountPlans(
  orgId: number,
  params?: {
    page?: number;
    perPage?: number;
    fiscal_year?: string;
    status?: string;
    department_id?: number;
  }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("headcount_plans")
    .where({ "headcount_plans.organization_id": orgId });

  if (params?.fiscal_year) {
    query = query.where({ "headcount_plans.fiscal_year": params.fiscal_year });
  }
  if (params?.status) {
    query = query.where({ "headcount_plans.status": params.status });
  }
  if (params?.department_id) {
    query = query.where({ "headcount_plans.department_id": params.department_id });
  }

  const [{ count }] = await query.clone().count("* as count");

  const plans = await query
    .clone()
    .select(
      "headcount_plans.*",
      "organization_departments.name as department_name"
    )
    .leftJoin("organization_departments", "headcount_plans.department_id", "organization_departments.id")
    .orderBy("headcount_plans.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { plans, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Update Headcount Plan
// ---------------------------------------------------------------------------

export async function updateHeadcountPlan(
  orgId: number,
  planId: number,
  data: UpdateHeadcountPlanInput
) {
  const db = getDB();

  const existing = await db("headcount_plans")
    .where({ id: planId, organization_id: orgId })
    .first();

  if (!existing) throw new NotFoundError("Headcount Plan");

  // Only allow updates if not yet approved
  if (existing.status === "approved") {
    throw new ValidationError("Cannot update an approved headcount plan");
  }

  await db("headcount_plans")
    .where({ id: planId })
    .update({
      ...data,
      updated_at: new Date(),
    });

  return db("headcount_plans").where({ id: planId }).first();
}

// ---------------------------------------------------------------------------
// Approve Headcount Plan
// ---------------------------------------------------------------------------

export async function approveHeadcountPlan(
  orgId: number,
  planId: number,
  userId: number
) {
  const db = getDB();

  const plan = await db("headcount_plans")
    .where({ id: planId, organization_id: orgId })
    .first();

  if (!plan) throw new NotFoundError("Headcount Plan");

  if (plan.status === "approved") {
    throw new ValidationError("Plan is already approved");
  }
  if (plan.status !== "submitted" && plan.status !== "draft") {
    throw new ValidationError("Only draft or submitted plans can be approved");
  }

  await db("headcount_plans")
    .where({ id: planId })
    .update({
      status: "approved",
      approved_headcount: plan.planned_headcount,
      approved_by: userId,
      updated_at: new Date(),
    });

  return db("headcount_plans").where({ id: planId }).first();
}

// ---------------------------------------------------------------------------
// Reject Headcount Plan
// ---------------------------------------------------------------------------

export async function rejectHeadcountPlan(
  orgId: number,
  planId: number,
  userId: number,
  reason?: string
) {
  const db = getDB();

  const plan = await db("headcount_plans")
    .where({ id: planId, organization_id: orgId })
    .first();

  if (!plan) throw new NotFoundError("Headcount Plan");

  if (plan.status === "rejected") {
    throw new ValidationError("Plan is already rejected");
  }
  if (plan.status !== "submitted" && plan.status !== "draft") {
    throw new ValidationError("Only draft or submitted plans can be rejected");
  }

  await db("headcount_plans")
    .where({ id: planId })
    .update({
      status: "rejected",
      approved_by: userId,
      notes: reason ? `Rejected: ${reason}` : plan.notes,
      updated_at: new Date(),
    });

  return db("headcount_plans").where({ id: planId }).first();
}

// ---------------------------------------------------------------------------
// Position Dashboard Stats
// ---------------------------------------------------------------------------

export async function getPositionDashboard(orgId: number) {
  const db = getDB();

  // Total positions
  const [{ total_positions }] = await db("positions")
    .where({ organization_id: orgId })
    .whereNot({ status: "closed" })
    .count("* as total_positions");

  // Filled / vacant
  const [stats] = await db("positions")
    .where({ organization_id: orgId })
    .whereNot({ status: "closed" })
    .select(
      db.raw("COALESCE(SUM(headcount_budget), 0) as total_budget"),
      db.raw("COALESCE(SUM(headcount_filled), 0) as total_filled")
    );

  const totalBudget = Number(stats.total_budget);
  const totalFilled = Number(stats.total_filled);
  const totalVacant = totalBudget - totalFilled;

  // Critical vacancies
  const [{ critical_vacancies }] = await db("positions")
    .where({ organization_id: orgId, status: "active", is_critical: true })
    .whereRaw("headcount_filled < headcount_budget")
    .count("* as critical_vacancies");

  // Department breakdown
  const deptBreakdown = await db("positions")
    .where({ "positions.organization_id": orgId })
    .whereNot({ "positions.status": "closed" })
    .select(
      "organization_departments.name as department",
      db.raw("COUNT(*) as position_count"),
      db.raw("COALESCE(SUM(positions.headcount_budget), 0) as budget"),
      db.raw("COALESCE(SUM(positions.headcount_filled), 0) as filled")
    )
    .leftJoin("organization_departments", "positions.department_id", "organization_departments.id")
    .groupBy("positions.department_id", "organization_departments.name")
    .orderBy("position_count", "desc");

  // Headcount plan summary (current fiscal year approved plans)
  const currentYear = new Date().getFullYear();
  const planSummary = await db("headcount_plans")
    .where({ organization_id: orgId })
    .where("fiscal_year", "like", `${currentYear}%`)
    .select(
      db.raw("COALESCE(SUM(planned_headcount), 0) as total_planned"),
      db.raw("COALESCE(SUM(approved_headcount), 0) as total_approved"),
      db.raw("COALESCE(SUM(current_headcount), 0) as total_current"),
      db.raw("COUNT(*) as plan_count")
    )
    .first();

  // Status breakdown
  const statusBreakdown = await db("positions")
    .where({ organization_id: orgId })
    .select("status", db.raw("COUNT(*) as count"))
    .groupBy("status");

  return {
    total_positions: Number(total_positions),
    total_budget: totalBudget,
    total_filled: totalFilled,
    total_vacant: totalVacant,
    critical_vacancies: Number(critical_vacancies),
    department_breakdown: deptBreakdown.map((d: any) => ({
      department: d.department || "Unassigned",
      position_count: Number(d.position_count),
      budget: Number(d.budget),
      filled: Number(d.filled),
      vacant: Number(d.budget) - Number(d.filled),
    })),
    status_breakdown: statusBreakdown.map((s: any) => ({
      status: s.status,
      count: Number(s.count),
    })),
    headcount_plan_summary: {
      total_planned: Number(planSummary?.total_planned || 0),
      total_approved: Number(planSummary?.total_approved || 0),
      total_current: Number(planSummary?.total_current || 0),
      plan_count: Number(planSummary?.plan_count || 0),
    },
  };
}
