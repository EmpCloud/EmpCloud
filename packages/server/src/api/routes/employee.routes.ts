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
  createExperienceSchema,
  createDependentSchema,
  employeeDirectoryQuerySchema,
} from "@empcloud/shared";
import * as profileService from "../../services/employee/employee-profile.service.js";
import * as detailService from "../../services/employee/employee-detail.service.js";
import * as probationService from "../../services/employee/probation.service.js";
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
    const profile = await profileService.upsertProfile(req.user!.org_id, paramInt(req.params.id), data);

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
    const body = createEducationSchema.partial().parse(req.body);
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
    const body = createExperienceSchema.partial().parse(req.body);
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
