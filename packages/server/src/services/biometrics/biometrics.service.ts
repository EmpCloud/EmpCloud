// =============================================================================
// EMP CLOUD — Biometrics Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import * as attendanceService from "../attendance/attendance.service.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Face Enrollment
// ---------------------------------------------------------------------------

export async function enrollFace(
  orgId: number,
  userId: number,
  data: {
    face_encoding?: Buffer | string;
    thumbnail_path?: string;
    enrollment_method: "webcam" | "upload" | "device";
    quality_score?: number;
  },
  enrolledBy: number
) {
  const db = getDB();

  // Verify user belongs to org
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("User");

  // Check if already enrolled with active enrollment
  const existing = await db("face_enrollments")
    .where({ organization_id: orgId, user_id: userId, is_active: true })
    .first();

  if (existing) {
    // Deactivate old enrollment
    await db("face_enrollments")
      .where({ id: existing.id })
      .update({ is_active: false, updated_at: new Date() });
  }

  const now = new Date();
  const [id] = await db("face_enrollments").insert({
    organization_id: orgId,
    user_id: userId,
    face_encoding: data.face_encoding ? Buffer.from(data.face_encoding as string, "base64") : null,
    thumbnail_path: data.thumbnail_path || null,
    enrollment_method: data.enrollment_method,
    quality_score: data.quality_score || null,
    is_active: true,
    enrolled_by: enrolledBy,
    created_at: now,
    updated_at: now,
  });

  logger.info("Face enrollment created", { orgId, userId, enrollmentId: id });

  return db("face_enrollments")
    .where({ id })
    .select("id", "organization_id", "user_id", "thumbnail_path", "enrollment_method", "quality_score", "is_active", "enrolled_by", "created_at")
    .first();
}

export async function listFaceEnrollments(orgId: number, filters?: { user_id?: number; is_active?: boolean }) {
  const db = getDB();
  let query = db("face_enrollments as fe")
    .join("users as u", "fe.user_id", "u.id")
    .where("fe.organization_id", orgId);

  if (filters?.user_id) {
    query = query.where("fe.user_id", filters.user_id);
  }
  if (filters?.is_active !== undefined) {
    query = query.where("fe.is_active", filters.is_active);
  }

  return query.select(
    "fe.id",
    "fe.user_id",
    "fe.thumbnail_path",
    "fe.enrollment_method",
    "fe.quality_score",
    "fe.is_active",
    "fe.enrolled_by",
    "fe.created_at",
    "u.first_name",
    "u.last_name",
    "u.email",
    "u.emp_code"
  ).orderBy("fe.created_at", "desc");
}

export async function removeFaceEnrollment(orgId: number, enrollmentId: number) {
  const db = getDB();
  const enrollment = await db("face_enrollments")
    .where({ id: enrollmentId, organization_id: orgId })
    .first();

  if (!enrollment) throw new NotFoundError("Face enrollment");

  await db("face_enrollments")
    .where({ id: enrollmentId })
    .update({ is_active: false, updated_at: new Date() });

  logger.info("Face enrollment deactivated", { orgId, enrollmentId });
  return { message: "Face enrollment removed" };
}

export async function verifyFace(
  orgId: number,
  data: { face_encoding: string; liveness_passed?: boolean }
) {
  const db = getDB();

  // Get org settings
  const settings = await getOrCreateSettings(orgId);

  // Get all active enrollments for the org
  const enrollments = await db("face_enrollments")
    .join("users as u", "face_enrollments.user_id", "u.id")
    .where({ "face_enrollments.organization_id": orgId, "face_enrollments.is_active": true })
    .select(
      "face_enrollments.id",
      "face_enrollments.user_id",
      "face_enrollments.face_encoding",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code"
    );

  if (enrollments.length === 0) {
    return { matched: false, message: "No face enrollments found for this organization" };
  }

  // Check liveness if required
  if (settings.liveness_required && !data.liveness_passed) {
    return { matched: false, message: "Liveness check failed or not provided" };
  }

  // In production, face matching would be handled by a face recognition service/ML model.
  // For now, we return a placeholder indicating the API contract is ready.
  // The mobile app or a face-api.js integration will handle actual comparison.
  // A real implementation would compare face_encoding vectors and return confidence.

  return {
    matched: false,
    confidence: 0,
    threshold: Number(settings.face_match_threshold),
    message: "Face verification endpoint ready. Integrate face recognition engine for matching.",
    enrollment_count: enrollments.length,
  };
}

// ---------------------------------------------------------------------------
// QR Codes
// ---------------------------------------------------------------------------

export async function generateQRCode(orgId: number, userId: number) {
  const db = getDB();

  // Verify user
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("User");

  const settings = await getOrCreateSettings(orgId);

  // Deactivate existing active QR codes for this user
  await db("qr_codes")
    .where({ organization_id: orgId, user_id: userId, is_active: true })
    .update({ is_active: false, updated_at: new Date() });

  const now = new Date();
  const code = `EMP-${orgId}-${userId}-${uuidv4().replace(/-/g, "").slice(0, 16)}`;
  const isRotating = settings.qr_type === "rotating";

  const validUntil = isRotating
    ? new Date(now.getTime() + settings.qr_rotation_minutes * 60000)
    : null;

  const [id] = await db("qr_codes").insert({
    organization_id: orgId,
    user_id: userId,
    code,
    type: settings.qr_type,
    valid_from: now,
    valid_until: validUntil,
    rotation_interval_minutes: isRotating ? settings.qr_rotation_minutes : null,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  logger.info("QR code generated", { orgId, userId, type: settings.qr_type });

  return db("qr_codes").where({ id }).first();
}

export async function getMyQRCode(orgId: number, userId: number) {
  const db = getDB();
  const now = new Date();

  const qr = await db("qr_codes")
    .where({ organization_id: orgId, user_id: userId, is_active: true })
    .orderBy("created_at", "desc")
    .first();

  if (!qr) return null;

  // Check if rotating QR has expired
  if (qr.type === "rotating" && qr.valid_until && new Date(qr.valid_until) < now) {
    // Auto-rotate: deactivate old and generate new
    return rotateQRCode(orgId, userId);
  }

  return qr;
}

export async function rotateQRCode(orgId: number, userId: number) {
  // Simply generate a new QR code (which deactivates the old one)
  return generateQRCode(orgId, userId);
}

export async function validateQRScan(orgId: number, code: string) {
  const db = getDB();
  const now = new Date();

  const qr = await db("qr_codes")
    .where({ code, is_active: true })
    .first();

  if (!qr) {
    return { valid: false, message: "Invalid or expired QR code" };
  }

  // Verify QR belongs to the org
  if (qr.organization_id !== orgId) {
    return { valid: false, message: "QR code does not belong to this organization" };
  }

  // Check expiry for rotating QR
  if (qr.type === "rotating" && qr.valid_until && new Date(qr.valid_until) < now) {
    return { valid: false, message: "QR code has expired" };
  }

  // Get user info
  const user = await db("users")
    .where({ id: qr.user_id, organization_id: orgId })
    .select("id", "first_name", "last_name", "email", "emp_code")
    .first();

  if (!user) {
    return { valid: false, message: "User not found" };
  }

  return {
    valid: true,
    user_id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    emp_code: user.emp_code,
  };
}

// ---------------------------------------------------------------------------
// Biometric Check-In / Check-Out
// ---------------------------------------------------------------------------

export async function biometricCheckIn(
  orgId: number,
  userId: number,
  method: "face" | "fingerprint" | "qr" | "selfie",
  data: {
    device_id?: number;
    confidence_score?: number;
    liveness_passed?: boolean;
    latitude?: number;
    longitude?: number;
    image_path?: string;
    qr_code?: string;
  }
) {
  const db = getDB();
  const now = new Date();

  // For QR method, validate QR code first
  if (method === "qr" && data.qr_code) {
    const qrResult = await validateQRScan(orgId, data.qr_code);
    if (!qrResult.valid) {
      // Log the failed attempt
      await logBiometricEvent(orgId, userId, {
        method,
        device_id: data.device_id,
        scan_type: "check_in",
        result: "failed",
        latitude: data.latitude,
        longitude: data.longitude,
      });
      throw new ValidationError(qrResult.message || "QR validation failed");
    }
  }

  // Check geo-fence if selfie_geo_required
  const settings = await getOrCreateSettings(orgId);
  if (settings.selfie_geo_required && (method === "selfie" || method === "face")) {
    if (!data.latitude || !data.longitude) {
      throw new ValidationError("GPS location is required for this biometric method");
    }
  }

  // Determine result
  let result: "success" | "failed" | "spoofing_detected" | "no_match" = "success";

  // Check liveness for face/selfie
  if ((method === "face" || method === "selfie") && settings.liveness_required) {
    if (data.liveness_passed === false) {
      result = "spoofing_detected";
    }
  }

  // Log biometric event
  const logEntry = await logBiometricEvent(orgId, userId, {
    method,
    device_id: data.device_id,
    confidence_score: data.confidence_score,
    liveness_passed: data.liveness_passed,
    latitude: data.latitude,
    longitude: data.longitude,
    image_path: data.image_path,
    scan_type: "check_in",
    result,
  });

  // If successful, sync to attendance
  if (result === "success") {
    try {
      const attendanceRecord = await attendanceService.checkIn(orgId, userId, {
        source: "biometric",
        latitude: data.latitude,
        longitude: data.longitude,
      });

      // Update biometric log with attendance record link
      await db("biometric_attendance_logs")
        .where({ id: logEntry.id })
        .update({
          synced_to_attendance: true,
          attendance_record_id: (attendanceRecord as any).id,
        });

      logger.info("Biometric check-in synced to attendance", { orgId, userId, method });

      return {
        biometric_log: logEntry,
        attendance_record: attendanceRecord,
        synced: true,
      };
    } catch (err: any) {
      // If attendance sync fails (e.g., already checked in), still return the biometric log
      logger.warn("Biometric check-in attendance sync failed", { orgId, userId, error: err.message });
      return {
        biometric_log: logEntry,
        attendance_record: null,
        synced: false,
        sync_error: err.message,
      };
    }
  }

  return {
    biometric_log: logEntry,
    attendance_record: null,
    synced: false,
    result,
  };
}

export async function biometricCheckOut(
  orgId: number,
  userId: number,
  method: "face" | "fingerprint" | "qr" | "selfie",
  data: {
    device_id?: number;
    confidence_score?: number;
    liveness_passed?: boolean;
    latitude?: number;
    longitude?: number;
    image_path?: string;
    qr_code?: string;
  }
) {
  const db = getDB();

  // For QR method, validate QR code first
  if (method === "qr" && data.qr_code) {
    const qrResult = await validateQRScan(orgId, data.qr_code);
    if (!qrResult.valid) {
      await logBiometricEvent(orgId, userId, {
        method,
        device_id: data.device_id,
        scan_type: "check_out",
        result: "failed",
        latitude: data.latitude,
        longitude: data.longitude,
      });
      throw new ValidationError(qrResult.message || "QR validation failed");
    }
  }

  // Check liveness
  const settings = await getOrCreateSettings(orgId);
  let result: "success" | "failed" | "spoofing_detected" | "no_match" = "success";
  if ((method === "face" || method === "selfie") && settings.liveness_required) {
    if (data.liveness_passed === false) {
      result = "spoofing_detected";
    }
  }

  // Log biometric event
  const logEntry = await logBiometricEvent(orgId, userId, {
    method,
    device_id: data.device_id,
    confidence_score: data.confidence_score,
    liveness_passed: data.liveness_passed,
    latitude: data.latitude,
    longitude: data.longitude,
    image_path: data.image_path,
    scan_type: "check_out",
    result,
  });

  // If successful, sync to attendance
  if (result === "success") {
    try {
      const attendanceRecord = await attendanceService.checkOut(orgId, userId, {
        source: "biometric",
        latitude: data.latitude,
        longitude: data.longitude,
      });

      await db("biometric_attendance_logs")
        .where({ id: logEntry.id })
        .update({
          synced_to_attendance: true,
          attendance_record_id: (attendanceRecord as any).id,
        });

      logger.info("Biometric check-out synced to attendance", { orgId, userId, method });

      return {
        biometric_log: logEntry,
        attendance_record: attendanceRecord,
        synced: true,
      };
    } catch (err: any) {
      logger.warn("Biometric check-out attendance sync failed", { orgId, userId, error: err.message });
      return {
        biometric_log: logEntry,
        attendance_record: null,
        synced: false,
        sync_error: err.message,
      };
    }
  }

  return {
    biometric_log: logEntry,
    attendance_record: null,
    synced: false,
    result,
  };
}

// ---------------------------------------------------------------------------
// Device Management
// ---------------------------------------------------------------------------

export async function registerDevice(
  orgId: number,
  data: {
    name: string;
    type: "face_terminal" | "fingerprint_reader" | "qr_scanner" | "multi";
    serial_number: string;
    ip_address?: string;
    location_id?: number;
    location_name?: string;
  }
) {
  const db = getDB();

  // Check for duplicate serial number in org
  const existing = await db("biometric_devices")
    .where({ organization_id: orgId, serial_number: data.serial_number })
    .first();
  if (existing) throw new ConflictError("Device with this serial number already exists");

  // Generate API key for device authentication
  const apiKey = `bdev_${uuidv4().replace(/-/g, "")}`;
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const now = new Date();
  const [id] = await db("biometric_devices").insert({
    organization_id: orgId,
    name: data.name,
    type: data.type,
    serial_number: data.serial_number,
    ip_address: data.ip_address || null,
    location_id: data.location_id || null,
    location_name: data.location_name || null,
    status: "offline",
    last_heartbeat: null,
    api_key_hash: apiKeyHash,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  logger.info("Biometric device registered", { orgId, deviceId: id, type: data.type });

  const device = await db("biometric_devices").where({ id }).first();
  return {
    ...device,
    api_key: apiKey, // Return API key only on creation — never stored in plaintext
  };
}

export async function listDevices(
  orgId: number,
  filters?: { status?: string; type?: string; is_active?: boolean }
) {
  const db = getDB();
  let query = db("biometric_devices").where({ organization_id: orgId });

  if (filters?.status) {
    query = query.where("status", filters.status);
  }
  if (filters?.type) {
    query = query.where("type", filters.type);
  }
  if (filters?.is_active !== undefined) {
    query = query.where("is_active", filters.is_active);
  }

  return query
    .select(
      "id", "name", "type", "serial_number", "ip_address",
      "location_id", "location_name", "status", "last_heartbeat",
      "is_active", "created_at", "updated_at"
    )
    .orderBy("created_at", "desc");
}

export async function updateDevice(
  orgId: number,
  deviceId: number,
  data: {
    name?: string;
    ip_address?: string;
    location_id?: number;
    location_name?: string;
    status?: "online" | "offline" | "maintenance";
    is_active?: boolean;
  }
) {
  const db = getDB();
  const device = await db("biometric_devices")
    .where({ id: deviceId, organization_id: orgId })
    .first();

  if (!device) throw new NotFoundError("Biometric device");

  await db("biometric_devices")
    .where({ id: deviceId })
    .update({ ...data, updated_at: new Date() });

  return db("biometric_devices")
    .where({ id: deviceId })
    .select(
      "id", "name", "type", "serial_number", "ip_address",
      "location_id", "location_name", "status", "last_heartbeat",
      "is_active", "created_at", "updated_at"
    )
    .first();
}

export async function decommissionDevice(orgId: number, deviceId: number) {
  const db = getDB();
  const device = await db("biometric_devices")
    .where({ id: deviceId, organization_id: orgId })
    .first();

  if (!device) throw new NotFoundError("Biometric device");

  await db("biometric_devices")
    .where({ id: deviceId })
    .update({ is_active: false, status: "offline", updated_at: new Date() });

  logger.info("Biometric device decommissioned", { orgId, deviceId });
  return { message: "Device decommissioned" };
}

export async function deviceHeartbeat(deviceId: number, apiKeyHash: string) {
  const db = getDB();
  const device = await db("biometric_devices")
    .where({ id: deviceId, api_key_hash: apiKeyHash, is_active: true })
    .first();

  if (!device) throw new NotFoundError("Biometric device");

  const now = new Date();
  await db("biometric_devices")
    .where({ id: deviceId })
    .update({ status: "online", last_heartbeat: now, updated_at: now });

  return { status: "online", last_heartbeat: now };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(orgId: number) {
  return getOrCreateSettings(orgId);
}

export async function updateSettings(
  orgId: number,
  data: {
    face_match_threshold?: number;
    liveness_required?: boolean;
    selfie_geo_required?: boolean;
    geo_radius_meters?: number;
    qr_type?: "static" | "rotating";
    qr_rotation_minutes?: number;
  }
) {
  const db = getDB();

  // Ensure settings exist
  await getOrCreateSettings(orgId);

  await db("biometric_settings")
    .where({ organization_id: orgId })
    .update({ ...data, updated_at: new Date() });

  logger.info("Biometric settings updated", { orgId });

  return db("biometric_settings").where({ organization_id: orgId }).first();
}

// ---------------------------------------------------------------------------
// Logs & Dashboard
// ---------------------------------------------------------------------------

export async function getBiometricLogs(
  orgId: number,
  filters?: {
    page?: number;
    perPage?: number;
    method?: string;
    user_id?: number;
    result?: string;
    date_from?: string;
    date_to?: string;
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;

  let query = db("biometric_attendance_logs as bal")
    .join("users as u", "bal.user_id", "u.id")
    .where("bal.organization_id", orgId);

  if (filters?.method) {
    query = query.where("bal.method", filters.method);
  }
  if (filters?.user_id) {
    query = query.where("bal.user_id", filters.user_id);
  }
  if (filters?.result) {
    query = query.where("bal.result", filters.result);
  }
  if (filters?.date_from) {
    query = query.where("bal.created_at", ">=", filters.date_from);
  }
  if (filters?.date_to) {
    query = query.where("bal.created_at", "<=", filters.date_to + " 23:59:59");
  }

  const [{ count }] = await query.clone().count("* as count");
  const records = await query
    .select(
      "bal.id",
      "bal.user_id",
      "bal.method",
      "bal.device_id",
      "bal.confidence_score",
      "bal.liveness_passed",
      "bal.latitude",
      "bal.longitude",
      "bal.scan_type",
      "bal.result",
      "bal.synced_to_attendance",
      "bal.attendance_record_id",
      "bal.created_at",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code"
    )
    .orderBy("bal.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

export async function getBiometricDashboard(orgId: number) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today} 00:00:00`;
  const todayEnd = `${today} 23:59:59`;

  // Today's biometric check-ins
  const [todayCheckIns] = await db("biometric_attendance_logs")
    .where({ organization_id: orgId, scan_type: "check_in", result: "success" })
    .whereBetween("created_at", [todayStart, todayEnd])
    .count("* as count");

  // Today's biometric check-outs
  const [todayCheckOuts] = await db("biometric_attendance_logs")
    .where({ organization_id: orgId, scan_type: "check_out", result: "success" })
    .whereBetween("created_at", [todayStart, todayEnd])
    .count("* as count");

  // Today's failed attempts
  const [failedAttempts] = await db("biometric_attendance_logs")
    .where({ organization_id: orgId })
    .whereIn("result", ["failed", "spoofing_detected", "no_match"])
    .whereBetween("created_at", [todayStart, todayEnd])
    .count("* as count");

  // Active devices
  const [onlineDevices] = await db("biometric_devices")
    .where({ organization_id: orgId, status: "online", is_active: true })
    .count("* as count");

  const [totalDevices] = await db("biometric_devices")
    .where({ organization_id: orgId, is_active: true })
    .count("* as count");

  // Total enrolled users
  const [enrolledUsers] = await db("face_enrollments")
    .where({ organization_id: orgId, is_active: true })
    .countDistinct("user_id as count");

  // Method breakdown for today
  const methodBreakdown = await db("biometric_attendance_logs")
    .where({ organization_id: orgId, result: "success" })
    .whereBetween("created_at", [todayStart, todayEnd])
    .select("method")
    .count("* as count")
    .groupBy("method");

  // Recent events (last 10)
  const recentEvents = await db("biometric_attendance_logs as bal")
    .join("users as u", "bal.user_id", "u.id")
    .where("bal.organization_id", orgId)
    .select(
      "bal.id",
      "bal.user_id",
      "bal.method",
      "bal.scan_type",
      "bal.result",
      "bal.created_at",
      "u.first_name",
      "u.last_name"
    )
    .orderBy("bal.created_at", "desc")
    .limit(10);

  return {
    today_check_ins: Number(todayCheckIns.count),
    today_check_outs: Number(todayCheckOuts.count),
    failed_attempts: Number(failedAttempts.count),
    online_devices: Number(onlineDevices.count),
    total_devices: Number(totalDevices.count),
    enrolled_users: Number(enrolledUsers.count),
    method_breakdown: methodBreakdown.map((m: any) => ({
      method: m.method,
      count: Number(m.count),
    })),
    recent_events: recentEvents,
    date: today,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateSettings(orgId: number) {
  const db = getDB();
  let settings = await db("biometric_settings")
    .where({ organization_id: orgId })
    .first();

  if (!settings) {
    const now = new Date();
    await db("biometric_settings").insert({
      organization_id: orgId,
      face_match_threshold: 0.75,
      liveness_required: true,
      selfie_geo_required: true,
      geo_radius_meters: 200,
      qr_type: "rotating",
      qr_rotation_minutes: 5,
      created_at: now,
      updated_at: now,
    });
    settings = await db("biometric_settings").where({ organization_id: orgId }).first();
  }

  return settings;
}

async function logBiometricEvent(
  orgId: number,
  userId: number,
  data: {
    method: "face" | "fingerprint" | "qr" | "selfie";
    device_id?: number;
    confidence_score?: number;
    liveness_passed?: boolean;
    latitude?: number;
    longitude?: number;
    image_path?: string;
    scan_type: "check_in" | "check_out";
    result: "success" | "failed" | "spoofing_detected" | "no_match";
  }
) {
  const db = getDB();
  const now = new Date();

  const [id] = await db("biometric_attendance_logs").insert({
    organization_id: orgId,
    user_id: userId,
    method: data.method,
    device_id: data.device_id || null,
    confidence_score: data.confidence_score || null,
    liveness_passed: data.liveness_passed ?? null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    image_path: data.image_path || null,
    scan_type: data.scan_type,
    result: data.result,
    synced_to_attendance: false,
    attendance_record_id: null,
    created_at: now,
  });

  return db("biometric_attendance_logs").where({ id }).first();
}
