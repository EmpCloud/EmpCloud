// =============================================================================
// EMP CLOUD — Organization Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { getDB } from "../../db/connection.js";
import { ValidationError } from "../../utils/errors.js";
import * as orgService from "../../services/org/org.service.js";
import { updateOrgSchema, createDepartmentSchema, updateDepartmentSchema, createLocationSchema, updateLocationSchema } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

// ---------------------------------------------------------------------------
// Logo upload — disk-backed, per-org directory, 2MB limit, images only
// ---------------------------------------------------------------------------
const logoStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const orgId = req.user?.org_id ?? "unknown";
    const uploadDir = path.join(process.cwd(), "uploads", "logos", String(orgId));
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB — matches the UI hint
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only JPEG, PNG, WebP, and SVG images are allowed."));
    }
  },
});

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

// --- Logo ---

// POST /api/v1/organizations/me/logo — upload org logo, stores path in
// organizations.logo_url and returns both the stored path and a fetchable URL.
router.post(
  "/me/logo",
  authenticate,
  requireOrgAdmin,
  logoUpload.single("logo"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new ValidationError("No logo file provided");
      const orgId = req.user!.org_id;
      const relativePath = `uploads/logos/${orgId}/${req.file.filename}`;
      const db = getDB();
      await db("organizations")
        .where({ id: orgId })
        .update({ logo_url: relativePath, updated_at: new Date() });
      sendSuccess(res, {
        logo_url: `/api/v1/organizations/me/logo`,
        logo_path: relativePath,
      });
    } catch (err) { next(err); }
  },
);

// GET /api/v1/organizations/me/logo — stream the current org's logo file.
router.get("/me/logo", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;
    const db = getDB();
    const org = await db("organizations").where({ id: orgId }).select("logo_url").first();
    if (!org || !org.logo_url) {
      return res.status(404).json({ success: false, error: { message: "No logo found" } });
    }
    // Path-traversal guard: ensure resolved path stays inside ./uploads
    const uploadsBase = path.resolve(process.cwd(), "uploads");
    const absolutePath = path.resolve(process.cwd(), org.logo_url);
    if (!absolutePath.startsWith(uploadsBase) || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: { message: "Logo file not found" } });
    }
    res.sendFile(absolutePath);
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

// GET /api/v1/organizations/me/departments/:id
router.get("/me/departments/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dept = await orgService.getDepartment(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, dept);
  } catch (err) { next(err); }
});

// PUT /api/v1/organizations/me/departments/:id
router.put("/me/departments/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateDepartmentSchema.parse(req.body);
    const dept = await orgService.updateDepartment(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, dept);
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

// GET /api/v1/organizations/me/locations/:id
router.get("/me/locations/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loc = await orgService.getLocation(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, loc);
  } catch (err) { next(err); }
});

// PUT /api/v1/organizations/me/locations/:id
router.put("/me/locations/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateLocationSchema.parse(req.body);
    const loc = await orgService.updateLocation(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, loc);
  } catch (err) { next(err); }
});

// DELETE /api/v1/organizations/me/locations/:id
router.delete("/me/locations/:id", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await orgService.deleteLocation(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Location deleted" });
  } catch (err) { next(err); }
});

export default router;
