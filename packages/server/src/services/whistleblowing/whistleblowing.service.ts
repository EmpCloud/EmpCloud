// =============================================================================
// EMP CLOUD — Whistleblowing Service
// Anonymous reporting per EU Whistleblowing Directive 2019/1937
// =============================================================================

import crypto from "crypto";
import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashReporter(orgId: number, userId: number): string {
  return crypto
    .createHash("sha256")
    .update(`wb:org:${orgId}:user:${userId}:salt:empcloud-whistleblower`)
    .digest("hex")
    .substring(0, 64);
}

async function generateCaseNumber(orgId: number): Promise<string> {
  const db = getDB();
  const year = new Date().getFullYear();
  const prefix = `WB-${year}-`;

  const lastReport = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("case_number", "like", `${prefix}%`)
    .orderBy("id", "desc")
    .first();

  let nextNum = 1;
  if (lastReport) {
    const lastNum = parseInt(lastReport.case_number.split("-").pop()!, 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Submit Report
// ---------------------------------------------------------------------------

export async function submitReport(
  orgId: number,
  userId: number,
  data: {
    category: string;
    severity?: string;
    subject: string;
    description: string;
    evidence_paths?: string[] | null;
    is_anonymous?: boolean;
  }
) {
  const db = getDB();
  const isAnonymous = data.is_anonymous !== false;
  const caseNumber = await generateCaseNumber(orgId);

  const [id] = await db("whistleblower_reports").insert({
    organization_id: orgId,
    case_number: caseNumber,
    category: data.category,
    severity: data.severity || "medium",
    subject: data.subject,
    description: data.description,
    evidence_paths: data.evidence_paths ? JSON.stringify(data.evidence_paths) : null,
    status: "submitted",
    is_anonymous: isAnonymous,
    reporter_hash: isAnonymous ? hashReporter(orgId, userId) : null,
    reporter_user_id: isAnonymous ? null : userId,
    assigned_investigator_id: null,
    investigation_notes: null,
    resolution: null,
    resolved_at: null,
    escalated_to: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return { id, case_number: caseNumber };
}

// ---------------------------------------------------------------------------
// Get My Reports (for logged-in reporter, matched by hash)
// ---------------------------------------------------------------------------

export async function getMyReports(orgId: number, userId: number) {
  const db = getDB();
  const hash = hashReporter(orgId, userId);

  const reports = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where(function () {
      this.where("reporter_hash", hash).orWhere("reporter_user_id", userId);
    })
    .select(
      "id",
      "case_number",
      "category",
      "severity",
      "subject",
      "status",
      "is_anonymous",
      "created_at",
      "updated_at"
    )
    .orderBy("created_at", "desc");

  return reports;
}

// ---------------------------------------------------------------------------
// Lookup by Case Number (for anonymous tracking — no auth needed on service)
// ---------------------------------------------------------------------------

export async function getReportByCase(orgId: number, caseNumber: string) {
  const db = getDB();

  const report = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("case_number", caseNumber)
    .select(
      "id",
      "case_number",
      "category",
      "severity",
      "subject",
      "status",
      "is_anonymous",
      "created_at",
      "updated_at",
      "resolved_at"
    )
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  // Fetch updates visible to reporter
  const updates = await db("whistleblower_updates")
    .where("report_id", report.id)
    .where("organization_id", orgId)
    .where("is_visible_to_reporter", true)
    .select("id", "update_type", "content", "created_at")
    .orderBy("created_at", "asc");

  return { ...report, updates };
}

// ---------------------------------------------------------------------------
// List Reports (HR/Investigator view — NO reporter identity for anonymous)
// ---------------------------------------------------------------------------

export async function listReports(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
    category?: string;
    severity?: string;
    search?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;
  const offset = (page - 1) * perPage;

  let query = db("whistleblower_reports as wr")
    .where("wr.organization_id", orgId);

  // #1379 — Dashboard's "resolved" count aggregates 3 statuses. When the
  // client filters by status=resolved, return the same set so counts align.
  if (filters?.status === "resolved") {
    query = query.whereIn("wr.status", ["resolved", "dismissed", "closed"]);
  } else if (filters?.status === "open") {
    query = query.whereIn("wr.status", ["submitted", "under_investigation", "escalated"]);
  } else if (filters?.status) {
    query = query.where("wr.status", filters.status);
  }
  if (filters?.category) {
    query = query.where("wr.category", filters.category);
  }
  if (filters?.severity) {
    query = query.where("wr.severity", filters.severity);
  }
  if (filters?.search) {
    query = query.where(function () {
      this.where("wr.subject", "like", `%${filters.search}%`)
        .orWhere("wr.case_number", "like", `%${filters.search}%`);
    });
  }

  const countResult = await query.clone().count("wr.id as total").first();
  const total = Number(countResult?.total || 0);

  const reports = await query
    .clone()
    .leftJoin("users as inv", "wr.assigned_investigator_id", "inv.id")
    .select(
      "wr.id",
      "wr.case_number",
      "wr.category",
      "wr.severity",
      "wr.subject",
      "wr.status",
      "wr.is_anonymous",
      "wr.assigned_investigator_id",
      db.raw("CONCAT(inv.first_name, ' ', inv.last_name) as investigator_name"),
      "wr.escalated_to",
      "wr.created_at",
      "wr.updated_at",
      "wr.resolved_at"
    )
    .orderBy("wr.created_at", "desc")
    .limit(perPage)
    .offset(offset);

  // NEVER expose reporter_hash or reporter_user_id for anonymous reports
  return { reports, total };
}

// ---------------------------------------------------------------------------
// Get Report Detail (HR only)
// ---------------------------------------------------------------------------

export async function getReport(orgId: number, reportId: number) {
  const db = getDB();

  const report = await db("whistleblower_reports as wr")
    .where("wr.organization_id", orgId)
    .where("wr.id", reportId)
    .leftJoin("users as inv", "wr.assigned_investigator_id", "inv.id")
    .leftJoin("users as reporter", "wr.reporter_user_id", "reporter.id")
    .select(
      "wr.id",
      "wr.case_number",
      "wr.category",
      "wr.severity",
      "wr.subject",
      "wr.description",
      "wr.evidence_paths",
      "wr.status",
      "wr.is_anonymous",
      // Only include reporter info if NOT anonymous
      db.raw(
        "CASE WHEN wr.is_anonymous = 0 THEN wr.reporter_user_id ELSE NULL END as reporter_user_id"
      ),
      db.raw(
        "CASE WHEN wr.is_anonymous = 0 THEN CONCAT(reporter.first_name, ' ', reporter.last_name) ELSE NULL END as reporter_name"
      ),
      "wr.assigned_investigator_id",
      db.raw("CONCAT(inv.first_name, ' ', inv.last_name) as investigator_name"),
      "wr.investigation_notes",
      "wr.resolution",
      "wr.resolved_at",
      "wr.escalated_to",
      "wr.created_at",
      "wr.updated_at"
    )
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  // Parse evidence_paths JSON
  if (report.evidence_paths && typeof report.evidence_paths === "string") {
    report.evidence_paths = JSON.parse(report.evidence_paths);
  }

  // Fetch all updates (HR sees all)
  const updates = await db("whistleblower_updates as wu")
    .where("wu.report_id", reportId)
    .where("wu.organization_id", orgId)
    .leftJoin("users as u", "wu.created_by", "u.id")
    .select(
      "wu.id",
      "wu.update_type",
      "wu.content",
      "wu.is_visible_to_reporter",
      "wu.created_by",
      db.raw("CONCAT(u.first_name, ' ', u.last_name) as created_by_name"),
      "wu.created_at"
    )
    .orderBy("wu.created_at", "asc");

  return { ...report, updates };
}

// ---------------------------------------------------------------------------
// Assign Investigator
// ---------------------------------------------------------------------------

export async function assignInvestigator(
  orgId: number,
  reportId: number,
  investigatorId: number
) {
  const db = getDB();

  const report = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("id", reportId)
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  await db("whistleblower_reports")
    .where("id", reportId)
    .where("organization_id", orgId)
    .update({
      assigned_investigator_id: investigatorId,
      status: report.status === "submitted" ? "under_investigation" : report.status,
      updated_at: new Date(),
    });

  // Add update record
  await db("whistleblower_updates").insert({
    report_id: reportId,
    organization_id: orgId,
    update_type: "status_change",
    content: "An investigator has been assigned to this report.",
    is_visible_to_reporter: true,
    created_by: investigatorId,
    created_at: new Date(),
  });

  return getReport(orgId, reportId);
}

// ---------------------------------------------------------------------------
// Add Update / Note
// ---------------------------------------------------------------------------

export async function addUpdate(
  orgId: number,
  reportId: number,
  userId: number,
  content: string,
  updateType: string,
  visibleToReporter: boolean
) {
  const db = getDB();

  const report = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("id", reportId)
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  const [id] = await db("whistleblower_updates").insert({
    report_id: reportId,
    organization_id: orgId,
    update_type: updateType,
    content,
    is_visible_to_reporter: visibleToReporter,
    created_by: userId,
    created_at: new Date(),
  });

  await db("whistleblower_reports")
    .where("id", reportId)
    .where("organization_id", orgId)
    .update({ updated_at: new Date() });

  return { id };
}

// ---------------------------------------------------------------------------
// Update Status
// ---------------------------------------------------------------------------

export async function updateStatus(
  orgId: number,
  reportId: number,
  status: string,
  resolution?: string | null
) {
  const db = getDB();

  const report = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("id", reportId)
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date(),
  };

  if (resolution) {
    updateData.resolution = resolution;
  }

  if (status === "resolved" || status === "closed" || status === "dismissed") {
    updateData.resolved_at = new Date();
  }

  await db("whistleblower_reports")
    .where("id", reportId)
    .where("organization_id", orgId)
    .update(updateData);

  // Add visible update for reporter
  await db("whistleblower_updates").insert({
    report_id: reportId,
    organization_id: orgId,
    update_type: "status_change",
    content: `Report status changed to: ${status}`,
    is_visible_to_reporter: true,
    created_by: null,
    created_at: new Date(),
  });

  return getReport(orgId, reportId);
}

// ---------------------------------------------------------------------------
// Escalate Report
// ---------------------------------------------------------------------------

export async function escalateReport(
  orgId: number,
  reportId: number,
  escalatedTo: string
) {
  const db = getDB();

  const report = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .where("id", reportId)
    .first();

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  await db("whistleblower_reports")
    .where("id", reportId)
    .where("organization_id", orgId)
    .update({
      status: "escalated",
      escalated_to: escalatedTo,
      updated_at: new Date(),
    });

  // Add visible update
  await db("whistleblower_updates").insert({
    report_id: reportId,
    organization_id: orgId,
    update_type: "escalation",
    content: `Report has been escalated to: ${escalatedTo}`,
    is_visible_to_reporter: true,
    created_by: null,
    created_at: new Date(),
  });

  return getReport(orgId, reportId);
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

export async function getWhistleblowingDashboard(orgId: number) {
  const db = getDB();

  // Total reports
  const totalResult = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .count("id as total")
    .first();
  const total = Number(totalResult?.total || 0);

  // By status
  const byStatus = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .select("status")
    .count("id as count")
    .groupBy("status");

  // By category
  const byCategory = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .select("category")
    .count("id as count")
    .groupBy("category");

  // By severity
  const bySeverity = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .select("severity")
    .count("id as count")
    .groupBy("severity");

  // Open vs resolved
  const openStatuses = ["submitted", "under_investigation", "escalated"];
  const openResult = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .whereIn("status", openStatuses)
    .count("id as count")
    .first();
  const openCount = Number(openResult?.count || 0);

  const resolvedResult = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .whereIn("status", ["resolved", "dismissed", "closed"])
    .count("id as count")
    .first();
  const resolvedCount = Number(resolvedResult?.count || 0);

  // Average resolution time (in days)
  const avgResolution = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .whereNotNull("resolved_at")
    .select(
      db.raw("AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours")
    )
    .first();
  const avgResolutionDays = avgResolution?.avg_hours
    ? Math.round(Number(avgResolution.avg_hours) / 24 * 10) / 10
    : null;

  // Recent reports (last 5)
  const recent = await db("whistleblower_reports")
    .where("organization_id", orgId)
    .select("id", "case_number", "category", "severity", "subject", "status", "created_at")
    .orderBy("created_at", "desc")
    .limit(5);

  return {
    total,
    open: openCount,
    resolved: resolvedCount,
    avg_resolution_days: avgResolutionDays,
    by_status: byStatus,
    by_category: byCategory,
    by_severity: bySeverity,
    recent,
  };
}
