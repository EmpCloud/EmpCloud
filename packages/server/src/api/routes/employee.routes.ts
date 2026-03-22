// =============================================================================
// EMP CLOUD — Employee Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSelfOrHR, requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { AuditAction } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
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

const router = Router();

// =========================================================================
// Directory & Insights (HR or any authenticated user for directory)
// =========================================================================

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
// Profile (self or HR)
// =========================================================================

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
