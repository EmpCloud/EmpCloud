// =============================================================================
// EMP CLOUD — Document Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import path from "node:path";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as documentService from "../../services/document/document.service.js";
import {
  createDocCategorySchema,
  updateDocCategorySchema,
  verifyDocumentSchema,
  rejectDocumentSchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// GET /api/v1/documents/categories
router.get("/categories", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await documentService.listCategories(req.user!.org_id);
    sendSuccess(res, categories);
  } catch (err) { next(err); }
});

// POST /api/v1/documents/categories
router.post("/categories", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDocCategorySchema.parse(req.body);
    const category = await documentService.createCategory(req.user!.org_id, data);
    sendSuccess(res, category, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/documents/categories/:id
router.put("/categories/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateDocCategorySchema.parse(req.body);
    const category = await documentService.updateCategory(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, category);
  } catch (err) { next(err); }
});

// DELETE /api/v1/documents/categories/:id
router.delete("/categories/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await documentService.deleteCategory(req.user!.org_id, paramInt(req.params.id));

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.DOCUMENT_CATEGORY_DELETED,
      resourceType: "document_category",
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Category deactivated" });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// GET /api/v1/documents
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const category_id = req.query.category_id ? Number(req.query.category_id) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    // Non-HR users can only see their own documents
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const user_id = isHR
      ? (req.query.user_id ? Number(req.query.user_id) : undefined)
      : req.user!.sub;

    const result = await documentService.listDocuments(req.user!.org_id, {
      user_id,
      category_id,
      search: isHR ? search : undefined,
      page,
      perPage: per_page,
    });
    sendPaginated(res, result.documents, result.total, page, per_page);
  } catch (err) { next(err); }
});

// POST /api/v1/documents/upload
router.post("/upload", authenticate, upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "File is required. Use field name 'file' for upload." } });
      return;
    }

    const categoryId = Number(req.body.category_id);
    if (!req.body.category_id || isNaN(categoryId)) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "category_id is required" } });
      return;
    }

    const userId = req.body.user_id ? Number(req.body.user_id) : req.user!.sub;
    const doc = await documentService.uploadDocument(
      req.user!.org_id,
      userId,
      req.user!.sub,
      {
        category_id: categoryId,
        name: req.body.name || file.originalname,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype,
        expires_at: req.body.expires_at || null,
      },
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.DOCUMENT_UPLOADED,
      resourceType: "document",
      resourceId: String(doc.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, doc, 201);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// My Documents (employee self-service — before /:id to avoid param collision)
// ---------------------------------------------------------------------------

// GET /api/v1/documents/my
router.get("/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const result = await documentService.getMyDocuments(req.user!.org_id, req.user!.sub, {
      page,
      perPage: per_page,
    });
    sendPaginated(res, result.documents, result.total, page, per_page);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Expiring Documents
// ---------------------------------------------------------------------------

// GET /api/v1/documents/expiring
router.get("/expiring", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const daysAhead = req.query.days ? Number(req.query.days) : 30;
    const documents = await documentService.getExpiryAlerts(req.user!.org_id, daysAhead);
    sendSuccess(res, documents);
  } catch (err) { next(err); }
});

// GET /api/v1/documents/mandatory-status
router.get("/mandatory-status", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await documentService.getMandatoryTracking(req.user!.org_id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Tracking & Alerts (before /:id to avoid param collision)
// ---------------------------------------------------------------------------

// GET /api/v1/documents/tracking/mandatory
router.get("/tracking/mandatory", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await documentService.getMandatoryTracking(req.user!.org_id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/documents/tracking/expiry
router.get("/tracking/expiry", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const daysAhead = req.query.days ? Number(req.query.days) : 30;
    const documents = await documentService.getExpiryAlerts(req.user!.org_id, daysAhead);
    sendSuccess(res, documents);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Single Document Operations (/:id routes last)
// ---------------------------------------------------------------------------

// GET /api/v1/documents/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await documentService.getDocument(req.user!.org_id, paramInt(req.params.id), req.user!.sub, req.user!.role);
    sendSuccess(res, doc);
  } catch (err) { next(err); }
});

// GET /api/v1/documents/:id/download
router.get("/:id/download", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await documentService.getDocumentForDownload(req.user!.org_id, paramInt(req.params.id), req.user!.sub, req.user!.role);
    const absolutePath = path.resolve(doc.file_path);

    // Path traversal protection: ensure resolved path is within the uploads directory
    const uploadsBase = path.resolve(process.cwd(), "uploads");
    if (!absolutePath.startsWith(uploadsBase)) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Invalid file path" } });
      return;
    }

    // Block paths containing traversal sequences
    if (doc.file_path.includes("..")) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Invalid file path" } });
      return;
    }

    // Ensure the download filename has the correct extension from the stored file
    let downloadName = doc.name || "document";
    const storedExt = path.extname(doc.file_path);
    if (storedExt && !path.extname(downloadName)) {
      downloadName += storedExt;
    }

    // Set explicit Content-Type from stored mime_type so browsers handle the file correctly
    if (doc.mime_type) {
      res.setHeader("Content-Type", doc.mime_type);
    }
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
    res.download(absolutePath, downloadName);
  } catch (err) { next(err); }
});

// DELETE /api/v1/documents/:id
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await documentService.deleteDocument(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Document deleted" });
  } catch (err) { next(err); }
});

// PUT /api/v1/documents/:id/verify
router.put("/:id/verify", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = verifyDocumentSchema.parse(req.body);
    const doc = await documentService.verifyDocument(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.DOCUMENT_VERIFIED,
      resourceType: "document",
      resourceId: String(doc.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, doc);
  } catch (err) { next(err); }
});

// POST /api/v1/documents/:id/reject
router.post("/:id/reject", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = rejectDocumentSchema.parse(req.body);
    const doc = await documentService.rejectDocument(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data.rejection_reason,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.DOCUMENT_REJECTED,
      resourceType: "document",
      resourceId: String(doc.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, doc);
  } catch (err) { next(err); }
});

export default router;
