// =============================================================================
// EMP CLOUD — Asset Management Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as assetService from "../../services/asset/asset.service.js";
import {
  createAssetSchema,
  updateAssetSchema,
  createAssetCategorySchema,
  updateAssetCategorySchema,
  assetQuerySchema,
  assignAssetSchema,
  returnAssetSchema,
  assetActionSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
import { ROLE_HIERARCHY } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";

const router = Router();

// Helper to check if current user has HR-level access
function isHRUser(req: Request): boolean {
  if (!req.user) return false;
  const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
  const hrLevel = ROLE_HIERARCHY["hr_admin" as UserRole] ?? 60;
  return userRoleLevel >= hrLevel;
}

// =========================================================================
// CATEGORIES
// =========================================================================

// GET /api/v1/assets/categories — List categories
router.get(
  "/categories",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await assetService.listCategories(req.user!.org_id);
      sendSuccess(res, categories);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/categories — Create category (HR)
router.post(
  "/categories",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createAssetCategorySchema.parse(req.body);
      const category = await assetService.createCategory(req.user!.org_id, data);
      sendSuccess(res, category, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/assets/categories/:id — Update category (HR)
router.put(
  "/categories/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateAssetCategorySchema.parse(req.body);
      const category = await assetService.updateCategory(
        req.user!.org_id,
        paramInt(req.params.id),
        data
      );
      sendSuccess(res, category);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/assets/categories/:id — Delete category (HR)
router.delete(
  "/categories/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assetService.deleteCategory(req.user!.org_id, paramInt(req.params.id));
      sendSuccess(res, { message: "Category deactivated" });
    } catch (err) {
      next(err);
    }
  }
);

// =========================================================================
// ASSETS
// =========================================================================

// POST /api/v1/assets — Create asset (HR)
router.post(
  "/",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createAssetSchema.parse(req.body);
      const asset = await assetService.createAsset(
        req.user!.org_id,
        req.user!.sub,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ASSET_CREATED,
        resourceType: "asset",
        resourceId: String((asset as any).id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, asset, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/assets/my — My assigned assets
router.get(
  "/my",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assets = await assetService.getMyAssets(req.user!.org_id, req.user!.sub);
      sendSuccess(res, assets);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/assets/dashboard — Asset dashboard stats (HR)
router.get(
  "/dashboard",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await assetService.getAssetDashboard(req.user!.org_id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/assets/expiring-warranties — Expiring warranties (HR)
router.get(
  "/expiring-warranties",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const assets = await assetService.getExpiringWarranties(req.user!.org_id, days);
      sendSuccess(res, assets);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/assets — List assets (HR: all, Employee: own)
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hr = isHRUser(req);

      if (!hr) {
        // Non-HR users see only their assigned assets
        const assets = await assetService.getMyAssets(req.user!.org_id, req.user!.sub);
        return sendSuccess(res, assets);
      }

      const filters = assetQuerySchema.parse(req.query);
      const result = await assetService.listAssets(req.user!.org_id, {
        page: filters.page,
        perPage: filters.per_page,
        status: filters.status,
        category_id: filters.category_id,
        assigned_to: filters.assigned_to,
        condition_status: filters.condition_status,
        search: filters.search,
      });
      sendPaginated(res, result.assets, result.total, filters.page, filters.per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/assets/:id — Asset detail with history
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const asset = await assetService.getAsset(
        req.user!.org_id,
        paramInt(req.params.id)
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/assets/:id — Update asset (HR)
router.put(
  "/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateAssetSchema.parse(req.body);
      const asset = await assetService.updateAsset(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/assign — Assign to employee (HR)
router.post(
  "/:id/assign",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assignAssetSchema.parse(req.body);
      const asset = await assetService.assignAsset(
        req.user!.org_id,
        paramInt(req.params.id),
        data.assigned_to,
        req.user!.sub,
        data.notes
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ASSET_ASSIGNED,
        resourceType: "asset",
        resourceId: String(paramInt(req.params.id)),
        details: { assigned_to: data.assigned_to },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/return — Return asset (HR or assigned user)
router.post(
  "/:id/return",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = returnAssetSchema.parse(req.body);
      const asset = await assetService.returnAsset(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.condition,
        data.notes,
        req.user!.role
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ASSET_RETURNED,
        resourceType: "asset",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/retire — Retire asset (HR)
router.post(
  "/:id/retire",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assetActionSchema.parse(req.body);
      const asset = await assetService.retireAsset(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.notes
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ASSET_RETIRED,
        resourceType: "asset",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/assets/:id — Delete asset (HR, blocks if assigned)
router.delete(
  "/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assetService.deleteAsset(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub
      );
      sendSuccess(res, { message: "Asset deleted" });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/report-lost — Report lost (HR or assigned user)
router.post(
  "/:id/report-lost",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assetActionSchema.parse(req.body);
      const asset = await assetService.reportLost(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.notes
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/mark-found — Recover a lost asset back to available (HR)
router.post(
  "/:id/mark-found",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assetActionSchema.parse(req.body);
      const asset = await assetService.markFound(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.notes
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/send-to-repair — Move asset into repair (HR)
router.post(
  "/:id/send-to-repair",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assetActionSchema.parse(req.body);
      const asset = await assetService.sendToRepair(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.notes
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/assets/:id/complete-repair — Mark repair done, back to available (HR)
router.post(
  "/:id/complete-repair",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = assetActionSchema.parse(req.body);
      const asset = await assetService.completeRepair(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.notes
      );
      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
