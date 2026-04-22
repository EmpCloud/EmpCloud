// =============================================================================
// EMP CLOUD — Biometric Legacy Routes (/api/v3/biometric)
//
// Drop-in compatibility layer for emp-monitor kiosk devices. Paths, request
// bodies, response shapes, and error messages mirror emp-monitor's
// v3/bioMetric router exactly so existing kiosk firmware keeps working
// without a client update. See biometric-legacy.service.ts for the data
// mapping to EmpCloud tables (attendance_records, users, organization_*).
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";
import { authenticate } from "../middleware/auth.middleware.js";
import { kioskAuthenticate } from "../../services/biometric-legacy/kiosk-auth.middleware.js";
import { sendLegacyResponse } from "../../utils/legacy-response.js";
import * as svc from "../../services/biometric-legacy/biometric-legacy.service.js";
import * as nasService from "../../services/nas/nas.service.js";
import { sendEmail } from "../../services/email/email.service.js";
import { forgotPasswordBiometricEmail } from "../../services/biometric-legacy/biometric-legacy.email.js";
import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() }).array("files");

// Convenience — emp-monitor always responded with HTTP 200 and carried the
// logical status inside the body `code` field. Clients inspect `code`, not
// res.status, so we keep the same behavior via sendLegacyResponse.
function resp(res: Response, code: number, data: unknown, message: string | null, error: unknown = null) {
  return sendLegacyResponse(res, code, data, message, error);
}

// ---------------------------------------------------------------------------
// Admin JWT routes — use the regular EmpCloud access token. These are the
// only three that are called from the EmpCloud dashboard (not kiosk).
// ---------------------------------------------------------------------------

// POST /enable-biometric
router.post("/enable-biometric", authenticate, async (req, res, next) => {
  try {
    const { secretKey, userName, status } = req.body || {};
    if (!secretKey) return resp(res, 400, null, "secretKey is required", "Validation Failed");
    const result = await svc.enableBiometricForUser(req.user!.sub, req.user!.email, {
      secretKey,
      userName,
      status,
    });
    if ("error" in result) return resp(res, result.error!.code, result.error!.data ?? null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// GET /status
router.get("/status", authenticate, async (req, res, next) => {
  try {
    const result = await svc.checkStatusForUser(req.user!.sub);
    return resp(res, 200, result, "Biometric status ");
  } catch (err) { next(err); }
});

// POST /set-password
router.post("/set-password", authenticate, async (req, res, next) => {
  try {
    const { secretKey } = req.body || {};
    if (!secretKey) return resp(res, 400, null, "secretKey is required", "Validation Failed");
    await svc.setPassword(req.user!.sub, req.user!.email, secretKey);
    return resp(res, 200, null, "Biometric Password Updated.");
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Public routes (no auth)
// ---------------------------------------------------------------------------

// POST /auth — kiosk login, issues the short-lived kiosk JWT
router.post("/auth", async (req, res, next) => {
  try {
    const { userName, email, secretKey } = req.body || {};
    if (!secretKey) return resp(res, 400, null, "secretKey is required", "Validation Failed");
    const result = await svc.kioskAuth({ userName, email, secretKey });
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// POST /forgot-secret-key
router.post("/forgot-secret-key", async (req, res, next) => {
  try {
    const { email, userName } = req.body || {};
    if (!email && !userName) {
      return resp(res, 400, null, "email or userName required", "Validation Failed");
    }
    const target = await svc.resolveForgotTarget(email, userName);
    if (!target) return resp(res, 400, null, "email does not exist");
    const { user, creds } = target;
    if (!creds?.is_bio_enabled) return resp(res, 400, null, "Biometric feature is not enabled");
    if (!creds?.secret_key_hash) return resp(res, 400, null, "SecretKey has not been set.");

    const otp = svc.generateOtp();
    await svc.storeOtp(user.email, otp);

    const html = forgotPasswordBiometricEmail({ otp, brandName: config.email.fromName });
    await sendEmail({
      to: user.email,
      subject: `Biometric Password Reset For ${config.email.fromName}`,
      html,
    });

    return resp(res, 200, user.email, "Reset password otp sent to email, please check the mail");
  } catch (err) { next(err); }
});

// POST /verify-secret-key — OTP + new key
router.post("/verify-secret-key", async (req, res, next) => {
  try {
    const { email, otp, secretKey } = req.body || {};
    if (!secretKey || !otp || !email) {
      return resp(res, 400, null, "email, secretKey or OTP is required", "email, secretKey or OTP is required");
    }
    const stored = await svc.readOtp(email);
    if (!stored || Number(stored) !== Number(otp)) {
      return resp(res, 400, null, "Invalid OTP", "Invalid OTP");
    }
    const ok = await svc.setSecretKeyByEmail(email, secretKey);
    if (!ok) return resp(res, 400, null, "email does not exist");
    await svc.clearOtp(email);
    return resp(res, 200, null, "Biometric Password Updated.");
  } catch (err) { next(err); }
});

// GET /qr-code — public, returns PNG buffer or base64 JSON
router.get("/qr-code", async (req, res, next) => {
  try {
    const data = req.query.data as string | undefined;
    if (!data) return resp(res, 400, null, "No data provided");
    const type = Number(req.query.type ?? 1);
    const qrOptions = { margin: 2, width: 300 };
    if (type === 2) {
      const base64URl = await QRCode.toDataURL(data, qrOptions);
      return res.json({
        code: 200,
        message: "QR code generated successfully",
        data: base64URl,
        error: null,
      });
    }
    const buffer = await QRCode.toBuffer(data, qrOptions);
    res.setHeader("Content-Type", "image/png");
    return res.send(buffer);
  } catch (err) { next(err); }
});

// GET /face/:id.jpg — serves legacy face images. Dispatches to NAS (SFTP)
// or local disk based on the `face_url` sentinel scheme stored on the
// biometric_legacy_credentials row. emp-monitor returned GCS public URLs
// so this endpoint stays unauthenticated to preserve kiosk expectations;
// directory traversal isn't possible because the user-facing path is a
// numeric id and NAS lookup is constrained to the stored server-owned path.
router.get("/face/:id.jpg", async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(400).end();
    return;
  }
  try {
    const creds = await getDB()("biometric_legacy_credentials")
      .where({ user_id: userId })
      .first();
    if (!creds) { res.status(404).end(); return; }
    const stored: string | null = creds.face_url ?? null;
    if (stored && stored.startsWith("nas:")) {
      await nasService.streamFile(stored.slice(4), res);
      return;
    }
    // local disk fallback (legacy rows stored under `local:…` or unset)
    const file = svc.legacyFaceFile(creds.organization_id, userId);
    if (!fs.existsSync(file)) { res.status(404).end(); return; }
    res.setHeader("Content-Type", "image/jpeg");
    fs.createReadStream(file).pipe(res);
  } catch {
    if (!res.headersSent) res.status(500).end();
  }
});

// ---------------------------------------------------------------------------
// Kiosk JWT routes
// ---------------------------------------------------------------------------

function baseUrlFor(req: Request): string {
  return config.baseUrl || `${req.protocol}://${req.get("host")}`;
}

// GET /get-users
router.get("/get-users", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const result = await svc.fetchUsersForKiosk(orgId, baseUrlFor(req), {
      skip: req.query.skip as string,
      limit: req.query.limit as string,
      search: req.query.search as string,
      sortOrder: req.query.sortOrder as string,
      sortColumn: req.query.sortColumn as string,
      location_id: req.query.location_id as string,
      user_id: req.query.user_id as string,
      department_id: req.query.department_id as string,
      count: req.query.count as string,
    });
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// POST /update-user — multipart
router.post(
  "/update-user",
  (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())),
  kioskAuthenticate,
  async (req, res, next) => {
    try {
      const orgId = req.kioskUser!.userData.organization_id;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const file = files[0]
        ? { buffer: files[0].buffer, originalname: files[0].originalname }
        : null;
      const result = await svc.updateBiometricUser(orgId, req.body || {}, file);
      if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
      return resp(res, (result as any).code ?? 200, result.data ?? null, result.message);
    } catch (err) { next(err); }
  },
);

// POST /get-user-info — the actual kiosk punch-in/out
router.post("/get-user-info", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const timezone = req.kioskUser!.userData.timezone ?? null;
    const loggedInId = req.kioskUser!.userData.id;
    const { finger, face, bio_code } = req.body || {};
    if (finger == null && face == null && bio_code == null) {
      return resp(res, 400, null, "finger, face or bio_code required", "Validation Failed");
    }
    const result = await svc.matchAndPunch(orgId, loggedInId, timezone, { finger, face, bio_code });
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// GET /get-locations
router.get("/get-locations", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const locations = await svc.getLocations(orgId);
    if (!locations.length) return resp(res, 400, null, "No locations found.");
    return resp(res, 200, locations, "Locations fetched successfully");
  } catch (err) { next(err); }
});

// POST /attendance-summary
router.post("/attendance-summary", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const { date, location_id } = req.body || {};
    if (!date || !location_id) {
      return resp(res, 400, null, "date and location_id required", "Validation Failed");
    }
    const result = await svc.attendanceSummary(orgId, { date, location_id: Number(location_id) });
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// POST /attendance-details
router.post("/attendance-details", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const timezone = req.kioskUser!.userData.timezone ?? null;
    const { date, location_id, status } = req.body || {};
    if (!date || !location_id) {
      return resp(res, 400, null, "date and location_id required", "Validation Failed");
    }
    const result = await svc.attendanceDetails(
      orgId,
      timezone,
      { date, location_id: Number(location_id), status },
      {
        skip: req.query.skip as string,
        limit: req.query.limit as string,
        search: req.query.search as string,
        sortColumn: req.query.sortColumn as string,
        sortOrder: req.query.sortOrder as string,
      },
    );
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, result.data, result.message);
  } catch (err) { next(err); }
});

// GET /holidays
router.get("/holidays", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const list = await svc.getHolidays(orgId);
    if (!list.length) return resp(res, 400, null, "No holidays found");
    return resp(res, 200, list, "Holidays fetched successfully");
  } catch (err) { next(err); }
});

// GET /fetch-employee-password-enable-status
router.get("/fetch-employee-password-enable-status", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const result = await svc.employeePasswordStatus(orgId);
    return resp(res, 200, result, "Success");
  } catch (err) { next(err); }
});

// POST /verify-secretKey (org-level) — not the public OTP one
router.post("/verify-secretKey", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const { secretKey } = req.body || {};
    const result = await svc.verifyOrgSecret(orgId, secretKey);
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, null, "Success");
  } catch (err) { next(err); }
});

// GET /get-department
router.get("/get-department", kioskAuthenticate, async (req, res, next) => {
  try {
    const orgId = req.kioskUser!.userData.organization_id;
    const departments = await svc.getDepartments(orgId);
    return resp(res, 200, departments, "Success");
  } catch (err) { next(err); }
});

// DELETE /delete-user-profile-image
router.delete("/delete-user-profile-image", kioskAuthenticate, async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return resp(res, 400, null, "userId required");
    const result = await svc.deleteFaceImage(Number(userId));
    if ("error" in result) return resp(res, result.error!.code, null, result.error!.message);
    return resp(res, 200, null, result.message);
  } catch (err) { next(err); }
});

export default router;
