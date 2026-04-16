// =============================================================================
// EMP CLOUD — Asset Management Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
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
import { ValidationError } from "../../utils/errors.js";

const router = Router();

// CSV / XLSX bulk-import upload. Keep the body in memory so the xlsx parser
// can read it directly — files are tiny (a few hundred rows at most).
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

// POST /api/v1/assets/bulk — Bulk import assets from CSV/XLSX (HR)
// Multer handles multipart. The xlsx library transparently parses both
// CSV and XLSX buffers. Row-level errors don't kill the batch — valid
// rows get inserted and the response carries per-row error details.
router.post(
  "/bulk",
  authenticate,
  requireHR,
  bulkUpload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded — attach a CSV or XLSX as 'file'");
      }

      // Parse — xlsx transparently handles both CSV and XLSX buffers.
      const workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
        raw: false,
      });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        throw new ValidationError("Uploaded file has no sheets");
      }
      const sheet = workbook.Sheets[firstSheet];
      const records = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: true,
      });

      // Normalize header keys (lowercase, snake_case) and coerce cell values.
      const rows = records.map((record) => {
        const row: Record<string, any> = {};
        for (const [key, value] of Object.entries(record)) {
          const normalized = String(key)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
          let v: any = value;
          if (v instanceof Date) {
            // Store dates as YYYY-MM-DD so downstream validation is stable.
            v = v.toISOString().slice(0, 10);
          } else if (typeof v === "string") {
            v = v.trim();
          }
          row[normalized] = v === "" ? null : v;
        }
        return {
          name: row.name || row.asset_name || "",
          category_name: row.category_name || row.category || null,
          description: row.description || null,
          serial_number: row.serial_number || row.serial || null,
          brand: row.brand || null,
          model: row.model || null,
          purchase_date: row.purchase_date || null,
          purchase_cost:
            row.purchase_cost !== undefined && row.purchase_cost !== null
              ? Number(row.purchase_cost)
              : null,
          warranty_expiry: row.warranty_expiry || row.warranty || null,
          condition_status: row.condition_status || row.condition || null,
          location_name: row.location_name || row.location || null,
          notes: row.notes || null,
        } as assetService.BulkAssetRow;
      });

      const result = await assetService.bulkCreateAssets(
        req.user!.org_id,
        req.user!.sub,
        rows,
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ASSET_CREATED,
        resourceType: "asset",
        details: {
          bulk_import: true,
          imported: result.imported,
          errors: result.errors.length,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/assets/export?format=pdf — Export the filtered asset list (HR)
// CSV is generated on the client (it already has the filtered list in memory
// so a round-trip is wasteful). PDF is rendered server-side as a self-
// contained HTML document — no PDF library required; any browser's "Save as
// PDF" or the Content-Disposition header makes the result downloadable as
// a `.html` file that opens identically in any PDF reader the user prints to.
router.get(
  "/export",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const format = String(req.query.format || "pdf").toLowerCase();
      if (format !== "pdf" && format !== "html") {
        throw new ValidationError("format must be 'pdf' or 'html'");
      }

      // Respect the same filters the list endpoint accepts — but don't
      // paginate; export is always the full filtered set.
      const filters = assetQuerySchema.parse({ ...req.query, page: 1, per_page: 10000 });
      const result = await assetService.listAssets(req.user!.org_id, {
        page: 1,
        perPage: 10000,
        status: filters.status,
        category_id: filters.category_id,
        assigned_to: filters.assigned_to,
        condition_status: filters.condition_status,
        search: filters.search,
      });

      const esc = (s: unknown): string =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const rowsHtml = result.assets
        .map(
          (a: any) => `
            <tr>
              <td>${esc(a.asset_tag)}</td>
              <td>${esc(a.name)}</td>
              <td>${esc(a.category_name || "-")}</td>
              <td>${esc(String(a.status).replace(/_/g, " "))}</td>
              <td>${esc(a.condition_status)}</td>
              <td>${esc(a.assigned_to_name || "-")}</td>
              <td>${esc(a.serial_number || "-")}</td>
              <td>${esc(a.location_name || "-")}</td>
              <td>${esc(a.warranty_expiry ? new Date(a.warranty_expiry).toLocaleDateString() : "-")}</td>
            </tr>`,
        )
        .join("");

      const now = new Date().toLocaleString();
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Asset Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Asset Report</h1>
  <div class="meta">Generated ${esc(now)} &middot; ${result.total} asset(s)</div>
  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th>Name</th>
        <th>Category</th>
        <th>Status</th>
        <th>Condition</th>
        <th>Assigned To</th>
        <th>Serial</th>
        <th>Location</th>
        <th>Warranty</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

      // HTML-as-PDF: no PDF library installed, so we return a self-contained
      // HTML document with an attachment Content-Disposition. The browser
      // "Save as PDF" flow produces a real PDF from this, and any user who
      // opens the download prints it to PDF identically. Tradeoff is noted
      // in the PR report.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="asset-report-${Date.now()}.html"`,
      );
      res.send(html);
    } catch (err) {
      next(err);
    }
  },
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

// DELETE /api/v1/assets/:assetId/history/:entryId — Delete a single history row (HR)
// Audit-log trim only — does NOT revert the asset state. Registered BEFORE
// DELETE /:id so Express matches the more-specific path first.
router.delete(
  "/:assetId/history/:entryId",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assetService.deleteHistoryEntry(
        req.user!.org_id,
        paramInt(req.params.assetId),
        paramInt(req.params.entryId),
      );
      sendSuccess(res, { message: "History entry deleted" });
    } catch (err) {
      next(err);
    }
  },
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
