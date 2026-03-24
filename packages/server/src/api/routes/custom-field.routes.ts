// =============================================================================
// EMP CLOUD — Custom Field Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as customFieldService from "../../services/custom-field/custom-field.service.js";
import {
  createCustomFieldDefinitionSchema,
  updateCustomFieldDefinitionSchema,
  setCustomFieldValuesSchema,
  customFieldSearchSchema,
  reorderCustomFieldsSchema,
  entityTypeParamSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";

const router = Router();

// ===========================================================================
// Field Definitions (HR only)
// ===========================================================================

// PUT /api/v1/custom-fields/definitions/reorder — must be before :id routes
router.put(
  "/definitions/reorder",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = reorderCustomFieldsSchema.parse(req.body);
      await customFieldService.reorderFields(
        req.user!.org_id,
        data.entity_type,
        data.field_ids
      );
      sendSuccess(res, { message: "Fields reordered successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/custom-fields/definitions — List definitions
router.get(
  "/definitions",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = req.query.entity_type
        ? String(req.query.entity_type)
        : undefined;
      const fields = await customFieldService.listFieldDefinitions(
        req.user!.org_id,
        entityType
      );
      sendSuccess(res, fields);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/custom-fields/definitions — Create definition
router.post(
  "/definitions",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createCustomFieldDefinitionSchema.parse(req.body);
      const field = await customFieldService.createFieldDefinition(
        req.user!.org_id,
        req.user!.sub,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.CUSTOM_FIELD_CREATED,
        resourceType: "custom_field_definition",
        resourceId: String(field.id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, field, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/custom-fields/definitions/:id — Get definition
router.get(
  "/definitions/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = paramInt(req.params.id);
      const field = await customFieldService.getFieldDefinition(
        req.user!.org_id,
        id
      );
      sendSuccess(res, field);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/custom-fields/definitions/:id — Update definition
router.put(
  "/definitions/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = paramInt(req.params.id);
      const data = updateCustomFieldDefinitionSchema.parse(req.body);
      const field = await customFieldService.updateFieldDefinition(
        req.user!.org_id,
        id,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.CUSTOM_FIELD_UPDATED,
        resourceType: "custom_field_definition",
        resourceId: String(id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, field);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/custom-fields/definitions/:id — Deactivate definition
router.delete(
  "/definitions/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = paramInt(req.params.id);
      await customFieldService.deleteFieldDefinition(req.user!.org_id, id);

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.CUSTOM_FIELD_DELETED,
        resourceType: "custom_field_definition",
        resourceId: String(id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, { message: "Custom field deactivated" });
    } catch (err) {
      next(err);
    }
  }
);

// ===========================================================================
// Field Values
// ===========================================================================

// GET /api/v1/custom-fields/search — Search by field value
router.get(
  "/search",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = customFieldSearchSchema.parse(req.query);
      const entityIds = await customFieldService.searchByFieldValue(
        req.user!.org_id,
        data.entity_type,
        data.field_id,
        data.search_value
      );
      sendSuccess(res, entityIds);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/custom-fields/values/:entityType — Bulk get values
router.get(
  "/values/:entityType",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = param(req.params.entityType);
      const entityIdsRaw = req.query.entityIds
        ? String(req.query.entityIds)
        : "";
      const entityIds = entityIdsRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      if (!entityIds.length) {
        sendSuccess(res, {});
        return;
      }

      const values = await customFieldService.getFieldValuesForEntities(
        req.user!.org_id,
        entityType,
        entityIds
      );
      sendSuccess(res, values);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/custom-fields/values/:entityType/:entityId — Get values for entity
router.get(
  "/values/:entityType/:entityId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = param(req.params.entityType);
      const entityId = paramInt(req.params.entityId);
      const values = await customFieldService.getFieldValues(
        req.user!.org_id,
        entityType,
        entityId
      );
      sendSuccess(res, values);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/custom-fields/values/:entityType/:entityId — Set/update values
router.post(
  "/values/:entityType/:entityId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = param(req.params.entityType);
      const entityId = paramInt(req.params.entityId);
      const data = setCustomFieldValuesSchema.parse(req.body);

      const values = await customFieldService.setFieldValues(
        req.user!.org_id,
        entityType,
        entityId,
        data.values
      );
      sendSuccess(res, values);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
