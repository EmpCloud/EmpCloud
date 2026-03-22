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

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// GET /api/v1/documents
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const user_id = req.query.user_id ? Number(req.query.user_id) : undefined;
    const category_id = req.query.category_id ? Number(req.query.category_id) : undefined;
    const result = await documentService.listDocuments(req.user!.org_id, {
      user_id,
      category_id,
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
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "File is required" } });
      return;
    }

    const userId = req.body.user_id ? Number(req.body.user_id) : req.user!.sub;
    const doc = await documentService.uploadDocument(
      req.user!.org_id,
      userId,
      req.user!.sub,
      {
        category_id: Number(req.body.category_id),
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
    const doc = await documentService.getDocument(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, doc);
  } catch (err) { next(err); }
});

// GET /api/v1/documents/:id/download
router.get("/:id/download", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await documentService.getDocument(req.user!.org_id, paramInt(req.params.id));
    const absolutePath = path.resolve(doc.file_path);
    res.download(absolutePath, doc.name);
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

export default router;
