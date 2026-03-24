// =============================================================================
// EMP CLOUD — Biometrics Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated, sendError } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as biometricsService from "../../services/biometrics/biometrics.service.js";
import {
  faceEnrollSchema,
  faceVerifySchema,
  biometricCheckInSchema,
  biometricCheckOutSchema,
  registerDeviceSchema,
  updateDeviceSchema,
  biometricSettingsSchema,
  qrGenerateSchema,
  qrScanSchema,
  biometricLogsQuerySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
import crypto from "crypto";

const router = Router();

// =============================================================================
// FACE ENROLLMENT
// =============================================================================

// POST /api/v1/biometrics/face/enroll
router.post("/face/enroll", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = faceEnrollSchema.parse(req.body);
    const enrollment = await biometricsService.enrollFace(
      req.user!.org_id,
      data.user_id,
      {
        face_encoding: data.face_encoding,
        thumbnail_path: data.thumbnail_path,
        enrollment_method: data.enrollment_method,
        quality_score: data.quality_score,
      },
      req.user!.sub
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_FACE_ENROLLED,
      resourceType: "face_enrollment",
      resourceId: String((enrollment as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, enrollment, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/biometrics/face/enrollments
router.get("/face/enrollments", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const enrollments = await biometricsService.listFaceEnrollments(req.user!.org_id, {
      user_id: userId,
      is_active: true,
    });
    sendSuccess(res, enrollments);
  } catch (err) { next(err); }
});

// DELETE /api/v1/biometrics/face/enrollments/:id
router.delete("/face/enrollments/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollmentId = paramInt(req.params.id);
    const result = await biometricsService.removeFaceEnrollment(req.user!.org_id, enrollmentId);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_FACE_REMOVED,
      resourceType: "face_enrollment",
      resourceId: String(enrollmentId),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// POST /api/v1/biometrics/face/verify
router.post("/face/verify", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = faceVerifySchema.parse(req.body);
    const result = await biometricsService.verifyFace(req.user!.org_id, data);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// QR CODES
// =============================================================================

// POST /api/v1/biometrics/qr/generate
router.post("/qr/generate", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = qrGenerateSchema.parse(req.body);
    const qr = await biometricsService.generateQRCode(req.user!.org_id, data.user_id);
    sendSuccess(res, qr, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/biometrics/qr/my-code
router.get("/qr/my-code", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let qr = await biometricsService.getMyQRCode(req.user!.org_id, req.user!.sub);
    if (!qr) {
      // Auto-generate if none exists
      qr = await biometricsService.generateQRCode(req.user!.org_id, req.user!.sub);
    }
    sendSuccess(res, qr);
  } catch (err) { next(err); }
});

// POST /api/v1/biometrics/qr/scan
router.post("/qr/scan", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = qrScanSchema.parse(req.body);
    const result = await biometricsService.validateQRScan(req.user!.org_id, data.code);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// BIOMETRIC CHECK-IN / CHECK-OUT
// =============================================================================

// POST /api/v1/biometrics/check-in
router.post("/check-in", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = biometricCheckInSchema.parse(req.body);
    const result = await biometricsService.biometricCheckIn(
      req.user!.org_id,
      req.user!.sub,
      data.method,
      {
        device_id: data.device_id,
        confidence_score: data.confidence_score,
        liveness_passed: data.liveness_passed,
        latitude: data.latitude,
        longitude: data.longitude,
        image_path: data.image_path,
        qr_code: data.qr_code,
      }
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_CHECKIN,
      resourceType: "biometric_attendance",
      resourceId: String((result.biometric_log as any)?.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// POST /api/v1/biometrics/check-out
router.post("/check-out", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = biometricCheckOutSchema.parse(req.body);
    const result = await biometricsService.biometricCheckOut(
      req.user!.org_id,
      req.user!.sub,
      data.method,
      {
        device_id: data.device_id,
        confidence_score: data.confidence_score,
        liveness_passed: data.liveness_passed,
        latitude: data.latitude,
        longitude: data.longitude,
        image_path: data.image_path,
        qr_code: data.qr_code,
      }
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_CHECKOUT,
      resourceType: "biometric_attendance",
      resourceId: String((result.biometric_log as any)?.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// DEVICES
// =============================================================================

// GET /api/v1/biometrics/devices
router.get("/devices", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const devices = await biometricsService.listDevices(req.user!.org_id, { status, type });
    sendSuccess(res, devices);
  } catch (err) { next(err); }
});

// POST /api/v1/biometrics/devices
router.post("/devices", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerDeviceSchema.parse(req.body);
    const device = await biometricsService.registerDevice(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_DEVICE_REGISTERED,
      resourceType: "biometric_device",
      resourceId: String((device as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, device, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/biometrics/devices/:id
router.put("/devices/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateDeviceSchema.parse(req.body);
    const device = await biometricsService.updateDevice(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, device);
  } catch (err) { next(err); }
});

// DELETE /api/v1/biometrics/devices/:id
router.delete("/devices/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceId = paramInt(req.params.id);
    const result = await biometricsService.decommissionDevice(req.user!.org_id, deviceId);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_DEVICE_DECOMMISSIONED,
      resourceType: "biometric_device",
      resourceId: String(deviceId),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// POST /api/v1/biometrics/devices/:id/heartbeat
router.post("/devices/:id/heartbeat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Device heartbeat uses API key auth instead of JWT
    const apiKey = req.headers["x-device-api-key"] as string;
    if (!apiKey) {
      sendError(res, 401, "UNAUTHORIZED", "Missing device API key");
      return;
    }

    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const deviceId = paramInt(req.params.id);
    const result = await biometricsService.deviceHeartbeat(deviceId, apiKeyHash);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// SETTINGS
// =============================================================================

// GET /api/v1/biometrics/settings
router.get("/settings", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await biometricsService.getSettings(req.user!.org_id);
    sendSuccess(res, settings);
  } catch (err) { next(err); }
});

// PUT /api/v1/biometrics/settings
router.put("/settings", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = biometricSettingsSchema.parse(req.body);
    const settings = await biometricsService.updateSettings(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.BIOMETRIC_SETTINGS_UPDATED,
      resourceType: "biometric_settings",
      resourceId: String(req.user!.org_id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, settings);
  } catch (err) { next(err); }
});

// =============================================================================
// LOGS & DASHBOARD
// =============================================================================

// GET /api/v1/biometrics/logs
router.get("/logs", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = biometricLogsQuerySchema.parse(req.query);
    const result = await biometricsService.getBiometricLogs(req.user!.org_id, {
      page: params.page,
      perPage: params.per_page,
      method: params.method,
      user_id: params.user_id,
      result: params.result,
      date_from: params.date_from,
      date_to: params.date_to,
    });
    sendPaginated(res, result.records, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/biometrics/dashboard
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await biometricsService.getBiometricDashboard(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

export default router;
