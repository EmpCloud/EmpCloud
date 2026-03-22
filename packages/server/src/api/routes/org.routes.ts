// =============================================================================
// EMP CLOUD — Organization Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import * as orgService from "../../services/org/org.service.js";
import { updateOrgSchema, createDepartmentSchema, createLocationSchema } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/organizations/me
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getOrg(req.user!.org_id);
    sendSuccess(res, org);
  } catch (err) { next(err); }
});

// PUT /api/v1/organizations/me
router.put("/me", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateOrgSchema.parse(req.body);
    const org = await orgService.updateOrg(req.user!.org_id, data);
    sendSuccess(res, org);
  } catch (err) { next(err); }
});

// GET /api/v1/organizations/me/stats
router.get("/me/stats", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await orgService.getOrgStats(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// --- Departments ---

// GET /api/v1/organizations/me/departments
router.get("/me/departments", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await orgService.listDepartments(req.user!.org_id);
    sendSuccess(res, departments);
  } catch (err) { next(err); }
});

// POST /api/v1/organizations/me/departments
router.post("/me/departments", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDepartmentSchema.parse(req.body);
    const dept = await orgService.createDepartment(req.user!.org_id, data.name);
    sendSuccess(res, dept, 201);
  } catch (err) { next(err); }
});

// DELETE /api/v1/organizations/me/departments/:id
router.delete("/me/departments/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await orgService.deleteDepartment(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Department deleted" });
  } catch (err) { next(err); }
});

// --- Locations ---

// GET /api/v1/organizations/me/locations
router.get("/me/locations", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locations = await orgService.listLocations(req.user!.org_id);
    sendSuccess(res, locations);
  } catch (err) { next(err); }
});

// POST /api/v1/organizations/me/locations
router.post("/me/locations", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLocationSchema.parse(req.body);
    const loc = await orgService.createLocation(req.user!.org_id, data);
    sendSuccess(res, loc, 201);
  } catch (err) { next(err); }
});

export default router;
