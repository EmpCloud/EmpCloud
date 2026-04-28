// =============================================================================
// EMP CLOUD — Employee Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSelfOrHR, requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { AuditAction } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
import { ValidationError } from "../../utils/errors.js";
import { getDB } from "../../db/connection.js";
import {
  upsertEmployeeProfileSchema,
  createAddressSchema,
  createEducationSchema,
  updateEducationSchema,
  createExperienceSchema,
  createExperienceBaseSchema,
  createDependentSchema,
  employeeDirectoryQuerySchema,
} from "@empcloud/shared";
import * as profileService from "../../services/employee/employee-profile.service.js";
import * as detailService from "../../services/employee/employee-detail.service.js";
import * as probationService from "../../services/employee/probation.service.js";
import * as salaryService from "../../services/employee/salary.service.js";
import * as userService from "../../services/user/user.service.js";

// Photo upload multer config
const photoStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.user?.org_id ?? "unknown";
    const uploadDir = path.join(process.cwd(), "uploads", "photos", String(orgId));
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only JPEG, PNG, and WebP images are allowed."));
    }
  },
});

const router = Router();

// =========================================================================
// Directory & Insights (HR or any authenticated user for directory)
// =========================================================================

// GET /api/v1/employees/export — Export all employee data for bulk update
router.get("/export", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const employees = await db("users")
      .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
      .leftJoin("organization_locations", "users.location_id", "organization_locations.id")
      .leftJoin("users as mgr", "users.reporting_manager_id", "mgr.id")
      .where({ "users.organization_id": req.user!.org_id, "users.status": 1 })
      .whereNot("users.role", "super_admin")
      .select(
        "users.id",
        "users.emp_code",
        "users.first_name",
        "users.last_name",
        "users.email",
        "users.contact_number",
        "users.designation",
        "organization_departments.name as department_name",
        "organization_locations.name as location_name",
        "users.employment_type",
        "users.gender",
        "users.date_of_birth",
        "users.date_of_joining",
        "users.role",
        "users.address",
        db.raw("CONCAT(mgr.first_name, ' ', mgr.last_name) as reporting_manager"),
      )
      .orderBy("users.first_name", "asc");
    sendSuccess(res, employees);
  } catch (err) { next(err); }
});

// POST /api/v1/employees/bulk-update — Bulk update employees from uploaded data
router.post("/bulk-update", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError("rows array is required");
    }

    const db = getDB();
    const orgId = req.user!.org_id;
    const results: { id: number; status: string; error?: string }[] = [];

    // Cache departments and locations for name→id lookup
    const departments = await db("organization_departments").where({ organization_id: orgId }).select("id", "name");
    const locations = await db("organization_locations").where({ organization_id: orgId }).select("id", "name");
    const deptMap = new Map(departments.map((d: any) => [d.name?.toLowerCase(), d.id]));
    const locMap = new Map(locations.map((l: any) => [l.name?.toLowerCase(), l.id]));

    for (const row of rows) {
      try {
        if (!row.id) { results.push({ id: 0, status: "skipped", error: "Missing ID" }); continue; }

        const user = await db("users").where({ id: row.id, organization_id: orgId }).first();
        if (!user) { results.push({ id: row.id, status: "skipped", error: "Not found" }); continue; }

        // Normalise blank text inputs to NULL. Critical for `emp_code`
        // because migration 054's UNIQUE(organization_id, emp_code) treats
        // empty strings as a value and fires "Duplicate entry '1-'" the
        // moment two users in an org both end up with `''`. Same hygiene
        // applied to the other plain-text columns so the DB doesn't end up
        // mixing NULLs and empty strings for what's logically the same
        // "user didn't enter anything" state.
        const blankToNull = (v: unknown): string | null => {
          if (typeof v !== "string") return v as string | null;
          const trimmed = v.trim();
          return trimmed === "" ? null : trimmed;
        };

        const updates: Record<string, any> = {};
        if (row.first_name !== undefined && row.first_name !== user.first_name) updates.first_name = row.first_name;
        if (row.last_name !== undefined && row.last_name !== user.last_name) updates.last_name = row.last_name;
        if (row.emp_code !== undefined) {
          const next = blankToNull(row.emp_code);
          if (next !== user.emp_code) updates.emp_code = next;
        }
        if (row.contact_number !== undefined) {
          const next = blankToNull(row.contact_number);
          if (next !== user.contact_number) updates.contact_number = next;
        }
        if (row.designation !== undefined) {
          const next = blankToNull(row.designation);
          if (next !== user.designation) updates.designation = next;
        }
        if (row.employment_type !== undefined && row.employment_type !== user.employment_type) updates.employment_type = row.employment_type;
        if (row.gender !== undefined) {
          const next = blankToNull(row.gender);
          if (next !== user.gender) updates.gender = next;
        }
        if (row.address !== undefined) {
          const next = blankToNull(row.address);
          if (next !== user.address) updates.address = next;
        }
        if (row.date_of_birth !== undefined) updates.date_of_birth = row.date_of_birth || null;
        if (row.date_of_joining !== undefined) updates.date_of_joining = row.date_of_joining || null;
        if (row.role && row.role !== user.role && ["employee", "manager", "hr_admin", "org_admin"].includes(row.role)) {
          updates.role = row.role;
        }
        // Department name → id
        if (row.department_name !== undefined) {
          const deptId = deptMap.get(row.department_name?.toLowerCase());
          if (deptId && deptId !== user.department_id) updates.department_id = deptId;
        }
        // Location name → id
        if (row.location_name !== undefined) {
          const locId = locMap.get(row.location_name?.toLowerCase());
          if (locId && locId !== user.location_id) updates.location_id = locId;
        }

        if (Object.keys(updates).length === 0) {
          results.push({ id: row.id, status: "unchanged" });
          continue;
        }

        updates.updated_at = new Date();
        await db("users").where({ id: row.id }).update(updates);
        results.push({ id: row.id, status: "updated" });
      } catch (err: any) {
        results.push({ id: row.id, status: "error", error: err.message });
      }
    }

    const updated = results.filter((r) => r.status === "updated").length;
    const errors = results.filter((r) => r.status === "error").length;

    await logAudit({
      organizationId: orgId,
      userId: req.user!.sub,
      action: AuditAction.PROFILE_UPDATED,
      resourceType: "employee_bulk_update",
      resourceId: `${updated} updated, ${errors} errors`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { total: rows.length, updated, unchanged: results.filter((r) => r.status === "unchanged").length, errors, details: results });
  } catch (err) { next(err); }
});

// GET /api/v1/employees — alias for /directory (#751)
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = employeeDirectoryQuerySchema.parse(req.query);
    const result = await profileService.getDirectory(req.user!.org_id, params);
    sendPaginated(res, result.users, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/directory
router.get("/directory", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = employeeDirectoryQuerySchema.parse(req.query);
    const result = await profileService.getDirectory(req.user!.org_id, params);
    sendPaginated(res, result.users, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/birthdays
router.get("/birthdays", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await profileService.getBirthdays(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/anniversaries
router.get("/anniversaries", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await profileService.getAnniversaries(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/headcount
router.get("/headcount", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await profileService.getHeadcount(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// =========================================================================
// Probation Tracking (HR only)
// =========================================================================

// GET /api/v1/employees/probation — list on probation
router.get("/probation", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await probationService.getEmployeesOnProbation(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/probation/dashboard — stats
router.get("/probation/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await probationService.getProbationDashboard(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/probation/upcoming — upcoming confirmations
router.get("/probation/upcoming", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 30;
    const data = await probationService.getUpcomingConfirmations(req.user!.org_id, days);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// #1419 — GET /api/v1/employees/probation/confirmed-this-month
router.get("/probation/confirmed-this-month", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await probationService.getConfirmedThisMonth(req.user!.org_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/probation/confirm — confirm probation
router.put("/:id/probation/confirm", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await probationService.confirmProbation(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PROFILE_UPDATED,
      resourceType: "probation",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/probation/extend — extend probation
router.put("/:id/probation/extend", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { new_end_date, reason } = req.body;
    if (!new_end_date) throw new ValidationError("new_end_date is required");
    if (!reason) throw new ValidationError("reason is required");

    const result = await probationService.extendProbation(
      req.user!.org_id,
      paramInt(req.params.id),
      new_end_date,
      reason
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PROFILE_UPDATED,
      resourceType: "probation",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =========================================================================
// Profile (self or HR)
// =========================================================================

// GET /api/v1/employees/:id — Employee detail (alias for /users/:id) (#752)
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUser(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

// POST /api/v1/employees — Create employee (alias for POST /users) (#753)
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { createUserSchema } = await import("@empcloud/shared");
    const data = createUserSchema.parse(req.body);
    const user = await userService.createUser(req.user!.org_id, data);
    sendSuccess(res, user, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/employees/:id/profile
router.get("/:id/profile", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await profileService.getProfile(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, profile);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/profile
router.put("/:id/profile", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = upsertEmployeeProfileSchema.parse(req.body);
    // Allow reporting_manager_id to pass through (handled by service, lives on users table)
    const fullData = { ...data, reporting_manager_id: req.body.reporting_manager_id };
    // #1423 — determine HR privilege so the service can gate org-mutation
    // fields (department, shift, designation, reporting_manager). Self-service
    // employees can still edit their own personal data.
    const isHR = ["hr_admin", "org_admin", "super_admin"].includes(req.user!.role as string);
    const profile = await profileService.upsertProfile(
      req.user!.org_id,
      paramInt(req.params.id),
      fullData,
      req.user!.sub,
      isHR,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PROFILE_UPDATED,
      resourceType: "employee_profile",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, profile);
  } catch (err) { next(err); }
});

// =========================================================================
// Profile Photo Upload
// =========================================================================

// POST /api/v1/employees/:id/photo
router.post("/:id/photo", authenticate, requireSelfOrHR("id"), photoUpload.single("photo"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError("No photo file provided");
    const userId = paramInt(req.params.id);
    const orgId = req.user!.org_id;
    const relativePath = `uploads/photos/${orgId}/${req.file.filename}`;
    const db = getDB();
    await db("users").where({ id: userId, organization_id: orgId }).update({ photo_path: relativePath, updated_at: new Date() });
    sendSuccess(res, { photo_url: `/api/v1/employees/${userId}/photo`, photo_path: relativePath });
  } catch (err) { next(err); }
});

// GET /api/v1/employees/:id/photo
router.get("/:id/photo", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramInt(req.params.id);
    const orgId = req.user!.org_id;
    const db = getDB();
    const user = await db("users").where({ id: userId, organization_id: orgId }).select("photo_path").first();
    if (!user || !user.photo_path) {
      return res.status(404).json({ success: false, error: { message: "No photo found" } });
    }
    const filePath = path.join(process.cwd(), user.photo_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: { message: "Photo file not found" } });
    }
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

// DELETE /api/v1/employees/:id/photo
// #1650 — "Option to revert to initials avatar" from the issue. Removes the
// stored file from disk and clears `photo_path` so display fallbacks kick in
// everywhere. Self or HR only — same auth as upload.
router.delete("/:id/photo", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramInt(req.params.id);
    const orgId = req.user!.org_id;
    const db = getDB();
    const user = await db("users").where({ id: userId, organization_id: orgId }).select("photo_path").first();
    if (!user) throw new ValidationError("User not found");
    if (user.photo_path) {
      const filePath = path.join(process.cwd(), user.photo_path);
      // Best-effort delete; missing file shouldn't block the column reset.
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    await db("users").where({ id: userId, organization_id: orgId }).update({ photo_path: null, updated_at: new Date() });
    await logAudit({
      organizationId: orgId,
      userId: req.user!.sub,
      action: AuditAction.USER_UPDATED,
      resourceType: "user",
      resourceId: String(userId),
      details: { field: "photo_path", removed: true },
    });
    sendSuccess(res, { removed: true });
  } catch (err) { next(err); }
});

// =========================================================================
// Salary Structure (self or HR)
// =========================================================================

// GET /api/v1/employees/:id/salary
router.get("/:id/salary", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await salaryService.getSalaryStructure(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/salary
router.put("/:id/salary", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ctc, basic, hra, da, special_allowance, gross, employer_pf, employer_esi, gratuity } = req.body;

    // Basic presence checks
    const requiredFields = { ctc, basic, hra, da, special_allowance, gross, employer_pf, employer_esi, gratuity };
    const missing = Object.entries(requiredFields)
      .filter(([, v]) => v === undefined || v === null)
      .map(([k]) => k);
    if (missing.length > 0) {
      throw new ValidationError(`Missing required fields: ${missing.join(", ")}`);
    }

    // Type checks — all must be non-negative numbers
    for (const [key, val] of Object.entries(requiredFields)) {
      if (typeof val !== "number" || val < 0) {
        throw new ValidationError(`${key} must be a non-negative number`);
      }
    }

    const result = await salaryService.upsertSalaryStructure(
      req.user!.org_id,
      paramInt(req.params.id),
      { ctc, basic, hra, da, special_allowance, gross, employer_pf, employer_esi, gratuity }
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PROFILE_UPDATED,
      resourceType: "salary_structure",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =========================================================================
// Addresses
// =========================================================================

// GET /api/v1/employees/:id/addresses
router.get("/:id/addresses", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await detailService.getAddresses(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// POST /api/v1/employees/:id/addresses
router.post("/:id/addresses", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createAddressSchema.parse(req.body);
    const address = await detailService.createAddress(req.user!.org_id, paramInt(req.params.id), body);
    sendSuccess(res, address, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/addresses/:addressId
router.put("/:id/addresses/:addressId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createAddressSchema.partial().parse(req.body);
    const address = await detailService.updateAddress(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.addressId), body);
    sendSuccess(res, address);
  } catch (err) { next(err); }
});

// DELETE /api/v1/employees/:id/addresses/:addressId
router.delete("/:id/addresses/:addressId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await detailService.deleteAddress(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.addressId));
    sendSuccess(res, { message: "Address deleted" });
  } catch (err) { next(err); }
});

// =========================================================================
// Education
// =========================================================================

// GET /api/v1/employees/:id/education
router.get("/:id/education", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await detailService.getEducation(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// POST /api/v1/employees/:id/education
router.post("/:id/education", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createEducationSchema.parse(req.body);
    const record = await detailService.createEducation(req.user!.org_id, paramInt(req.params.id), body);
    sendSuccess(res, record, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/education/:educationId
router.put("/:id/education/:educationId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateEducationSchema.parse(req.body);
    const record = await detailService.updateEducation(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.educationId), body);
    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// DELETE /api/v1/employees/:id/education/:educationId
router.delete("/:id/education/:educationId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await detailService.deleteEducation(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.educationId));
    sendSuccess(res, { message: "Education record deleted" });
  } catch (err) { next(err); }
});

// =========================================================================
// Work Experience
// =========================================================================

// GET /api/v1/employees/:id/experience
router.get("/:id/experience", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await detailService.getExperience(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// POST /api/v1/employees/:id/experience
router.post("/:id/experience", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createExperienceSchema.parse(req.body);
    const record = await detailService.createExperience(req.user!.org_id, paramInt(req.params.id), body);
    sendSuccess(res, record, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/experience/:experienceId
router.put("/:id/experience/:experienceId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createExperienceBaseSchema.partial().parse(req.body);
    const record = await detailService.updateExperience(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.experienceId), body);
    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// DELETE /api/v1/employees/:id/experience/:experienceId
router.delete("/:id/experience/:experienceId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await detailService.deleteExperience(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.experienceId));
    sendSuccess(res, { message: "Experience record deleted" });
  } catch (err) { next(err); }
});

// =========================================================================
// Dependents
// =========================================================================

// GET /api/v1/employees/:id/dependents
router.get("/:id/dependents", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await detailService.getDependents(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// POST /api/v1/employees/:id/dependents
router.post("/:id/dependents", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createDependentSchema.parse(req.body);
    const record = await detailService.createDependent(req.user!.org_id, paramInt(req.params.id), body);
    sendSuccess(res, record, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/employees/:id/dependents/:dependentId
router.put("/:id/dependents/:dependentId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createDependentSchema.partial().parse(req.body);
    const record = await detailService.updateDependent(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.dependentId), body);
    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// DELETE /api/v1/employees/:id/dependents/:dependentId
router.delete("/:id/dependents/:dependentId", authenticate, requireSelfOrHR("id"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await detailService.deleteDependent(req.user!.org_id, paramInt(req.params.id), paramInt(req.params.dependentId));
    sendSuccess(res, { message: "Dependent deleted" });
  } catch (err) { next(err); }
});

export default router;
