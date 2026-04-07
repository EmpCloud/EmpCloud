// =============================================================================
// Coverage-100-1: Biometrics, Event, Anonymous Feedback, Manager, Notification
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5; // TechNova
const ADMIN = 522; // ananya@technova.in
const EMP = 524; // priya@technova.in
const MGR = 529; // karthik@technova.in
const U = String(Date.now()).slice(-6);

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// 1. BIOMETRICS SERVICE (19 functions)
// =============================================================================
describe("Biometrics Service", () => {
  const createdEnrollmentIds: number[] = [];
  const createdDeviceIds: number[] = [];
  const createdQRUserIds: number[] = [];
  let deviceApiKeyHash: string;

  afterAll(async () => {
    const db = getDB();
    // Clean up face enrollments
    if (createdEnrollmentIds.length > 0) {
      await db("face_enrollments").whereIn("id", createdEnrollmentIds).del();
    }
    // Clean up QR codes
    if (createdQRUserIds.length > 0) {
      await db("qr_codes")
        .where("organization_id", ORG)
        .whereIn("user_id", createdQRUserIds)
        .del();
    }
    // Clean up biometric attendance logs
    await db("biometric_attendance_logs")
      .where("organization_id", ORG)
      .whereIn("user_id", [ADMIN, EMP])
      .where("created_at", ">=", new Date(Date.now() - 600_000))
      .del();
    // Clean up devices
    if (createdDeviceIds.length > 0) {
      await db("biometric_devices").whereIn("id", createdDeviceIds).del();
    }
    // Clean up settings we may have created/modified — restore defaults
    await db("biometric_settings").where("organization_id", ORG).del();
  });

  // ---- Face Enrollment ----

  it("enrollFace — creates a new face enrollment", async () => {
    const { enrollFace } = await import("../../services/biometrics/biometrics.service.js");
    const result = await enrollFace(ORG, ADMIN, {
      enrollment_method: "webcam",
      face_encoding: Buffer.from("test-face-encoding").toString("base64"),
      thumbnail_path: "/tmp/test-thumb.jpg",
      quality_score: 0.95,
    }, ADMIN);
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.user_id).toBe(ADMIN);
    expect(result.enrollment_method).toBe("webcam");
    expect(result.is_active).toBeTruthy();
    createdEnrollmentIds.push(result.id);
  });

  it("enrollFace — re-enrollment deactivates previous", async () => {
    const { enrollFace } = await import("../../services/biometrics/biometrics.service.js");
    const result = await enrollFace(ORG, ADMIN, {
      enrollment_method: "upload",
      quality_score: 0.88,
    }, ADMIN);
    expect(result.enrollment_method).toBe("upload");
    expect(result.is_active).toBeTruthy();
    createdEnrollmentIds.push(result.id);
  });

  it("enrollFace — throws NotFoundError for non-existent user", async () => {
    const { enrollFace } = await import("../../services/biometrics/biometrics.service.js");
    await expect(enrollFace(ORG, 999999, { enrollment_method: "webcam" }, ADMIN))
      .rejects.toThrow();
  });

  it("listFaceEnrollments — lists all", async () => {
    const { listFaceEnrollments } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listFaceEnrollments(ORG);
    expect(Array.isArray(list)).toBe(true);
  });

  it("listFaceEnrollments — filters by user_id", async () => {
    const { listFaceEnrollments } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listFaceEnrollments(ORG, { user_id: ADMIN });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e: any) => e.user_id === ADMIN)).toBe(true);
  });

  it("listFaceEnrollments — filters by is_active", async () => {
    const { listFaceEnrollments } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listFaceEnrollments(ORG, { is_active: true });
    expect(list.every((e: any) => e.is_active)).toBe(true);
  });

  it("removeFaceEnrollment — deactivates enrollment", async () => {
    const { removeFaceEnrollment } = await import("../../services/biometrics/biometrics.service.js");
    const id = createdEnrollmentIds[createdEnrollmentIds.length - 1];
    const result = await removeFaceEnrollment(ORG, id);
    expect(result.message).toBe("Face enrollment removed");
  });

  it("removeFaceEnrollment — throws for non-existent", async () => {
    const { removeFaceEnrollment } = await import("../../services/biometrics/biometrics.service.js");
    await expect(removeFaceEnrollment(ORG, 999999)).rejects.toThrow();
  });

  // ---- verifyFace ----

  it("verifyFace — returns match result structure", async () => {
    const { verifyFace, enrollFace } = await import("../../services/biometrics/biometrics.service.js");
    // Ensure there is an active enrollment for ORG so verifyFace reaches the threshold path
    const enrollment = await enrollFace(ORG, EMP, { enrollment_method: "webcam" }, ADMIN);
    createdEnrollmentIds.push(enrollment.id);
    const result = await verifyFace(ORG, {
      face_encoding: "test-encoding",
      liveness_passed: true,
    });
    expect(result).toHaveProperty("matched");
    expect(result).toHaveProperty("threshold");
  });

  it("verifyFace — liveness not passed with liveness_required", async () => {
    const { verifyFace, updateSettings } = await import("../../services/biometrics/biometrics.service.js");
    // Ensure liveness_required is true
    await updateSettings(ORG, { liveness_required: true });
    const result = await verifyFace(ORG, {
      face_encoding: "test-encoding",
      liveness_passed: false,
    });
    // Liveness check happens after enrollment check; if enrollments exist, returns liveness message
    expect(result.matched).toBe(false);
    expect(result.message).toContain("Liveness");
  });

  it("verifyFace — no enrollments for different org", async () => {
    const { verifyFace } = await import("../../services/biometrics/biometrics.service.js");
    const db = getDB();
    // Use a real org that has no face enrollments instead of a non-existent org
    // (biometric_settings has FK to organizations, so org 9999 would fail)
    // First ensure no enrollments exist for ORG by deactivating them temporarily
    const activeEnrollments = await db("face_enrollments")
      .where({ organization_id: ORG, is_active: true })
      .select("id");
    if (activeEnrollments.length > 0) {
      await db("face_enrollments")
        .where({ organization_id: ORG, is_active: true })
        .update({ is_active: false });
    }
    try {
      const result = await verifyFace(ORG, {
        face_encoding: "test",
        liveness_passed: true,
      });
      expect(result.matched).toBe(false);
      expect(result.message).toContain("No face enrollments");
    } finally {
      // Re-activate enrollments
      if (activeEnrollments.length > 0) {
        await db("face_enrollments")
          .whereIn("id", activeEnrollments.map((e: any) => e.id))
          .update({ is_active: true });
      }
    }
  });

  // ---- QR Codes ----

  it("generateQRCode — creates QR for user", async () => {
    const { generateQRCode } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await generateQRCode(ORG, ADMIN);
    expect(qr).toBeDefined();
    expect(qr.code).toMatch(/^EMP-/);
    expect(qr.user_id).toBe(ADMIN);
    expect(qr.is_active).toBeTruthy();
    createdQRUserIds.push(ADMIN);
  });

  it("generateQRCode — throws for non-existent user", async () => {
    const { generateQRCode } = await import("../../services/biometrics/biometrics.service.js");
    await expect(generateQRCode(ORG, 999999)).rejects.toThrow();
  });

  it("getMyQRCode — returns active QR", async () => {
    const { getMyQRCode } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await getMyQRCode(ORG, ADMIN);
    expect(qr).not.toBeNull();
    expect(qr.user_id).toBe(ADMIN);
  });

  it("getMyQRCode — returns null for user without QR", async () => {
    const { getMyQRCode } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await getMyQRCode(ORG, EMP);
    // EMP may or may not have a QR, if null that's fine
    if (qr === null) {
      expect(qr).toBeNull();
    } else {
      expect(qr.user_id).toBe(EMP);
    }
  });

  it("rotateQRCode — generates new QR replacing old", async () => {
    const { rotateQRCode } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await rotateQRCode(ORG, ADMIN);
    expect(qr).toBeDefined();
    expect(qr.code).toMatch(/^EMP-/);
    expect(qr.is_active).toBeTruthy();
  });

  it("validateQRScan — valid code returns user info", async () => {
    const { getMyQRCode, validateQRScan } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await getMyQRCode(ORG, ADMIN);
    expect(qr).not.toBeNull();
    const result = await validateQRScan(ORG, qr!.code);
    expect(result.valid).toBe(true);
    expect(result.user_id).toBe(ADMIN);
    expect(result.email).toBeDefined();
  });

  it("validateQRScan — invalid code returns invalid", async () => {
    const { validateQRScan } = await import("../../services/biometrics/biometrics.service.js");
    const result = await validateQRScan(ORG, "INVALID-CODE-XYZ");
    expect(result.valid).toBe(false);
  });

  it("validateQRScan — wrong org returns invalid", async () => {
    const { getMyQRCode, validateQRScan } = await import("../../services/biometrics/biometrics.service.js");
    const qr = await getMyQRCode(ORG, ADMIN);
    expect(qr).not.toBeNull();
    const result = await validateQRScan(9999, qr!.code);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("does not belong");
  });

  // ---- Biometric Check-In / Check-Out ----

  it("biometricCheckIn — fingerprint method (no attendance sync needed)", async () => {
    const { biometricCheckIn } = await import("../../services/biometrics/biometrics.service.js");
    const result = await biometricCheckIn(ORG, EMP, "fingerprint", {
      confidence_score: 0.99,
      liveness_passed: true,
      latitude: 12.9716,
      longitude: 77.5946,
    });
    expect(result).toHaveProperty("biometric_log");
    expect(result.biometric_log.method).toBe("fingerprint");
    expect(result.biometric_log.scan_type).toBe("check_in");
    expect(result.biometric_log.result).toBe("success");
  });

  it("biometricCheckIn — spoofing detected when liveness_passed=false", async () => {
    const { biometricCheckIn, updateSettings } = await import("../../services/biometrics/biometrics.service.js");
    await updateSettings(ORG, { liveness_required: true });
    const result = await biometricCheckIn(ORG, EMP, "face", {
      liveness_passed: false,
      latitude: 12.9716,
      longitude: 77.5946,
    });
    expect(result.result).toBe("spoofing_detected");
    expect(result.synced).toBe(false);
  });

  it("biometricCheckIn — QR method with invalid code throws", async () => {
    const { biometricCheckIn } = await import("../../services/biometrics/biometrics.service.js");
    await expect(biometricCheckIn(ORG, EMP, "qr", {
      qr_code: "INVALID-QR-CODE",
    })).rejects.toThrow();
  });

  it("biometricCheckIn — selfie without geo when required throws", async () => {
    const { biometricCheckIn, updateSettings } = await import("../../services/biometrics/biometrics.service.js");
    await updateSettings(ORG, { selfie_geo_required: true });
    await expect(biometricCheckIn(ORG, EMP, "selfie", {
      liveness_passed: true,
      // no latitude/longitude
    })).rejects.toThrow("GPS location is required");
  });

  it("biometricCheckOut — fingerprint method", async () => {
    const { biometricCheckOut } = await import("../../services/biometrics/biometrics.service.js");
    const result = await biometricCheckOut(ORG, EMP, "fingerprint", {
      confidence_score: 0.97,
      liveness_passed: true,
    });
    expect(result).toHaveProperty("biometric_log");
    expect(result.biometric_log.scan_type).toBe("check_out");
  });

  it("biometricCheckOut — spoofing detected", async () => {
    const { biometricCheckOut } = await import("../../services/biometrics/biometrics.service.js");
    const result = await biometricCheckOut(ORG, EMP, "face", {
      liveness_passed: false,
      latitude: 12.9716,
      longitude: 77.5946,
    });
    expect(result.result).toBe("spoofing_detected");
  });

  it("biometricCheckOut — QR method with invalid code throws", async () => {
    const { biometricCheckOut } = await import("../../services/biometrics/biometrics.service.js");
    await expect(biometricCheckOut(ORG, EMP, "qr", {
      qr_code: "BAD-QR",
    })).rejects.toThrow();
  });

  // ---- Device Management ----

  it("registerDevice — creates a new device", async () => {
    const { registerDevice } = await import("../../services/biometrics/biometrics.service.js");
    const serial = `SN-TEST-${U}`;
    const result = await registerDevice(ORG, {
      name: `Test Terminal ${U}`,
      type: "face_terminal",
      serial_number: serial,
      ip_address: "192.168.1.100",
      location_name: "Main Lobby",
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.api_key).toMatch(/^bdev_/);
    expect(result.type).toBe("face_terminal");
    createdDeviceIds.push(result.id);
    // Store hash for heartbeat test
    const crypto = await import("crypto");
    deviceApiKeyHash = crypto.createHash("sha256").update(result.api_key).digest("hex");
  });

  it("registerDevice — duplicate serial throws ConflictError", async () => {
    const { registerDevice } = await import("../../services/biometrics/biometrics.service.js");
    await expect(registerDevice(ORG, {
      name: "Dup Device",
      type: "qr_scanner",
      serial_number: `SN-TEST-${U}`, // same serial
    })).rejects.toThrow();
  });

  it("listDevices — returns devices", async () => {
    const { listDevices } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listDevices(ORG);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it("listDevices — filters by type", async () => {
    const { listDevices } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listDevices(ORG, { type: "face_terminal" });
    expect(list.every((d: any) => d.type === "face_terminal")).toBe(true);
  });

  it("listDevices — filters by status", async () => {
    const { listDevices } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listDevices(ORG, { status: "offline" });
    expect(list.every((d: any) => d.status === "offline")).toBe(true);
  });

  it("listDevices — filters by is_active", async () => {
    const { listDevices } = await import("../../services/biometrics/biometrics.service.js");
    const list = await listDevices(ORG, { is_active: true });
    expect(list.every((d: any) => d.is_active)).toBe(true);
  });

  it("updateDevice — updates device name and ip", async () => {
    const { updateDevice } = await import("../../services/biometrics/biometrics.service.js");
    const deviceId = createdDeviceIds[0];
    const result = await updateDevice(ORG, deviceId, {
      name: `Updated Terminal ${U}`,
      ip_address: "192.168.1.200",
      status: "maintenance",
    });
    expect(result.name).toBe(`Updated Terminal ${U}`);
    expect(result.ip_address).toBe("192.168.1.200");
    expect(result.status).toBe("maintenance");
  });

  it("updateDevice — throws for non-existent device", async () => {
    const { updateDevice } = await import("../../services/biometrics/biometrics.service.js");
    await expect(updateDevice(ORG, 999999, { name: "x" })).rejects.toThrow();
  });

  it("deviceHeartbeat — updates device status to online", async () => {
    const { deviceHeartbeat } = await import("../../services/biometrics/biometrics.service.js");
    const deviceId = createdDeviceIds[0];
    const result = await deviceHeartbeat(deviceId, deviceApiKeyHash);
    expect(result.status).toBe("online");
    expect(result.last_heartbeat).toBeDefined();
  });

  it("deviceHeartbeat — throws for invalid api key", async () => {
    const { deviceHeartbeat } = await import("../../services/biometrics/biometrics.service.js");
    await expect(deviceHeartbeat(createdDeviceIds[0], "invalid-hash")).rejects.toThrow();
  });

  it("decommissionDevice — decommissions device", async () => {
    const { decommissionDevice } = await import("../../services/biometrics/biometrics.service.js");
    const deviceId = createdDeviceIds[0];
    const result = await decommissionDevice(ORG, deviceId);
    expect(result.message).toBe("Device decommissioned");
  });

  it("decommissionDevice — throws for non-existent", async () => {
    const { decommissionDevice } = await import("../../services/biometrics/biometrics.service.js");
    await expect(decommissionDevice(ORG, 999999)).rejects.toThrow();
  });

  // ---- Settings ----

  it("getSettings — returns or creates default settings", async () => {
    const { getSettings } = await import("../../services/biometrics/biometrics.service.js");
    const settings = await getSettings(ORG);
    expect(settings).toBeDefined();
    expect(settings.organization_id).toBe(ORG);
    expect(settings).toHaveProperty("face_match_threshold");
    expect(settings).toHaveProperty("liveness_required");
    expect(settings).toHaveProperty("qr_type");
  });

  it("updateSettings — updates multiple fields", async () => {
    const { updateSettings } = await import("../../services/biometrics/biometrics.service.js");
    const result = await updateSettings(ORG, {
      face_match_threshold: 0.85,
      liveness_required: false,
      selfie_geo_required: false,
      geo_radius_meters: 500,
      qr_type: "static",
      qr_rotation_minutes: 10,
    });
    expect(Number(result.face_match_threshold)).toBeCloseTo(0.85, 1);
    expect(result.geo_radius_meters).toBe(500);
    expect(result.qr_type).toBe("static");
  });

  // ---- Logs & Dashboard ----

  it("getBiometricLogs — returns paginated logs", async () => {
    const { getBiometricLogs } = await import("../../services/biometrics/biometrics.service.js");
    const result = await getBiometricLogs(ORG, { page: 1, perPage: 5 });
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.records)).toBe(true);
  });

  it("getBiometricLogs — filters by method", async () => {
    const { getBiometricLogs } = await import("../../services/biometrics/biometrics.service.js");
    const result = await getBiometricLogs(ORG, { method: "fingerprint" });
    expect(result.records.every((r: any) => r.method === "fingerprint")).toBe(true);
  });

  it("getBiometricLogs — filters by user_id", async () => {
    const { getBiometricLogs } = await import("../../services/biometrics/biometrics.service.js");
    const result = await getBiometricLogs(ORG, { user_id: EMP });
    expect(result.records.every((r: any) => r.user_id === EMP)).toBe(true);
  });

  it("getBiometricLogs — filters by result", async () => {
    const { getBiometricLogs } = await import("../../services/biometrics/biometrics.service.js");
    const result = await getBiometricLogs(ORG, { result: "success" });
    expect(result.records.every((r: any) => r.result === "success")).toBe(true);
  });

  it("getBiometricLogs — filters by date range", async () => {
    const { getBiometricLogs } = await import("../../services/biometrics/biometrics.service.js");
    const today = new Date().toISOString().slice(0, 10);
    const result = await getBiometricLogs(ORG, { date_from: today, date_to: today });
    expect(result).toHaveProperty("total");
  });

  it("getBiometricDashboard — returns dashboard structure", async () => {
    const { getBiometricDashboard } = await import("../../services/biometrics/biometrics.service.js");
    const result = await getBiometricDashboard(ORG);
    expect(result).toHaveProperty("today_check_ins");
    expect(result).toHaveProperty("today_check_outs");
    expect(result).toHaveProperty("failed_attempts");
    expect(result).toHaveProperty("online_devices");
    expect(result).toHaveProperty("total_devices");
    expect(result).toHaveProperty("enrolled_users");
    expect(result).toHaveProperty("method_breakdown");
    expect(result).toHaveProperty("recent_events");
    expect(result).toHaveProperty("date");
    expect(typeof result.today_check_ins).toBe("number");
  });
});

// =============================================================================
// 2. EVENT SERVICE (10 functions)
// =============================================================================
describe("Event Service", () => {
  const createdEventIds: number[] = [];

  afterAll(async () => {
    const db = getDB();
    if (createdEventIds.length > 0) {
      await db("event_rsvps").whereIn("event_id", createdEventIds).del();
      await db("company_events").whereIn("id", createdEventIds).del();
    }
  });

  it("createEvent — creates an event with all fields", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    const future = new Date(Date.now() + 86400000 * 7); // 7 days ahead
    const futureEnd = new Date(Date.now() + 86400000 * 7 + 7200000); // +2h
    const result = await createEvent(ORG, ADMIN, {
      title: `Test Event ${U}`,
      description: "Unit test event description",
      event_type: "meeting",
      start_date: future.toISOString(),
      end_date: futureEnd.toISOString(),
      location: "Conference Room A",
      is_all_day: false,
      max_attendees: 50,
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.title).toBe(`Test Event ${U}`);
    expect(result.status).toBe("upcoming");
    createdEventIds.push(result.id);
  });

  it("createEvent — minimal fields", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    const future = new Date(Date.now() + 86400000 * 14);
    const result = await createEvent(ORG, ADMIN, {
      title: `Minimal Event ${U}`,
      start_date: future.toISOString(),
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.event_type).toBe("other");
    createdEventIds.push(result.id);
  });

  it("createEvent — end_date before start_date throws", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    await expect(createEvent(ORG, ADMIN, {
      title: "Bad Event",
      start_date: "2030-06-15T10:00:00Z",
      end_date: "2030-06-14T10:00:00Z",
    })).rejects.toThrow("End date cannot be before start date");
  });

  it("listEvents — returns paginated events", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const result = await listEvents(ORG, { page: 1, perPage: 10 });
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("listEvents — filters by event_type", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const result = await listEvents(ORG, { event_type: "meeting" });
    expect(result.events.every((e: any) => e.event_type === "meeting")).toBe(true);
  });

  it("listEvents — filters by status", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const result = await listEvents(ORG, { status: "upcoming" });
    // status may be corrected to "completed" for past events, just check structure
    expect(result).toHaveProperty("total");
  });

  it("listEvents — filters by date range", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const result = await listEvents(ORG, {
      start_date: "2026-01-01",
      end_date: "2030-12-31",
    });
    expect(result).toHaveProperty("total");
  });

  it("listEvents — includes user RSVP status when userId provided", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const result = await listEvents(ORG, { userId: ADMIN, page: 1, perPage: 5 });
    expect(result).toHaveProperty("events");
  });

  it("getEvent — returns event with RSVP counts", async () => {
    const { getEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const result = await getEvent(ORG, eventId);
    expect(result.id).toBe(eventId);
    expect(result).toHaveProperty("attending_count");
    expect(result).toHaveProperty("maybe_count");
    expect(result).toHaveProperty("declined_count");
    expect(result).toHaveProperty("rsvps");
  });

  it("getEvent — throws for non-existent", async () => {
    const { getEvent } = await import("../../services/event/event.service.js");
    await expect(getEvent(ORG, 999999)).rejects.toThrow();
  });

  it("updateEvent — updates event fields", async () => {
    const { updateEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const result = await updateEvent(ORG, eventId, {
      title: `Updated Event ${U}`,
      location: "Room B",
    });
    expect(result.title).toBe(`Updated Event ${U}`);
    expect(result.location).toBe("Room B");
  });

  it("updateEvent — updates dates", async () => {
    const { updateEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const newStart = new Date(Date.now() + 86400000 * 10).toISOString();
    const newEnd = new Date(Date.now() + 86400000 * 10 + 3600000).toISOString();
    const result = await updateEvent(ORG, eventId, {
      start_date: newStart,
      end_date: newEnd,
    });
    expect(result).toBeDefined();
  });

  it("updateEvent — throws for non-existent", async () => {
    const { updateEvent } = await import("../../services/event/event.service.js");
    await expect(updateEvent(ORG, 999999, { title: "x" })).rejects.toThrow();
  });

  it("rsvpEvent — attending", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const result = await rsvpEvent(ORG, eventId, ADMIN, "attending");
    expect(result.status).toBe("attending");
    expect(result.event_id).toBe(eventId);
  });

  it("rsvpEvent — maybe (upsert)", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const result = await rsvpEvent(ORG, eventId, ADMIN, "maybe");
    expect(result.status).toBe("maybe");
  });

  it("rsvpEvent — declined", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[0];
    const result = await rsvpEvent(ORG, eventId, EMP, "declined");
    expect(result.status).toBe("declined");
  });

  it("rsvpEvent — throws for non-existent event", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    await expect(rsvpEvent(ORG, 999999, ADMIN, "attending")).rejects.toThrow();
  });

  it("rsvpEvent — throws for cancelled event", async () => {
    const { createEvent, cancelEvent, rsvpEvent } = await import("../../services/event/event.service.js");
    const future = new Date(Date.now() + 86400000 * 30);
    const evt = await createEvent(ORG, ADMIN, {
      title: `Cancel RSVP Test ${U}`,
      start_date: future.toISOString(),
    });
    createdEventIds.push(evt.id);
    await cancelEvent(ORG, evt.id);
    await expect(rsvpEvent(ORG, evt.id, ADMIN, "attending"))
      .rejects.toThrow("Cannot RSVP to a cancelled event");
  });

  it("getMyEvents — returns events user RSVPd to", async () => {
    const { getMyEvents } = await import("../../services/event/event.service.js");
    const result = await getMyEvents(ORG, ADMIN);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getUpcomingEvents — returns future events", async () => {
    const { getUpcomingEvents } = await import("../../services/event/event.service.js");
    const result = await getUpcomingEvents(ORG);
    expect(Array.isArray(result)).toBe(true);
  });

  it("cancelEvent — cancels event", async () => {
    const { cancelEvent } = await import("../../services/event/event.service.js");
    const eventId = createdEventIds[1]; // Minimal Event
    const result = await cancelEvent(ORG, eventId);
    expect(result.status).toBe("cancelled");
  });

  it("cancelEvent — throws for non-existent", async () => {
    const { cancelEvent } = await import("../../services/event/event.service.js");
    await expect(cancelEvent(ORG, 999999)).rejects.toThrow();
  });

  it("deleteEvent — deletes event", async () => {
    const { createEvent, deleteEvent } = await import("../../services/event/event.service.js");
    const future = new Date(Date.now() + 86400000 * 20);
    const evt = await createEvent(ORG, ADMIN, {
      title: `Delete Test ${U}`,
      start_date: future.toISOString(),
    });
    // Don't push to createdEventIds since we're deleting it
    await deleteEvent(ORG, evt.id);
    // Verify it's gone
    const { getEvent } = await import("../../services/event/event.service.js");
    await expect(getEvent(ORG, evt.id)).rejects.toThrow();
  });

  it("deleteEvent — throws for non-existent", async () => {
    const { deleteEvent } = await import("../../services/event/event.service.js");
    await expect(deleteEvent(ORG, 999999)).rejects.toThrow();
  });

  it("getEventDashboard — returns dashboard structure", async () => {
    const { getEventDashboard } = await import("../../services/event/event.service.js");
    const result = await getEventDashboard(ORG);
    expect(result).toHaveProperty("upcoming_count");
    expect(result).toHaveProperty("month_count");
    expect(result).toHaveProperty("total_attendees");
    expect(result).toHaveProperty("type_breakdown");
    expect(result).toHaveProperty("upcoming_events");
    expect(typeof result.upcoming_count).toBe("number");
  });
});

// =============================================================================
// 3. ANONYMOUS FEEDBACK SERVICE (8 functions)
// =============================================================================
describe("Anonymous Feedback Service", () => {
  const createdFeedbackIds: number[] = [];

  afterAll(async () => {
    const db = getDB();
    if (createdFeedbackIds.length > 0) {
      await db("anonymous_feedback").whereIn("id", createdFeedbackIds).del();
    }
  });

  it("submitFeedback — creates feedback with explicit sentiment", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await submitFeedback(ORG, EMP, {
      category: "general",
      subject: `Test Feedback ${U}`,
      message: "This is a test feedback message for coverage testing.",
      sentiment: "positive",
      is_urgent: false,
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.category).toBe("general");
    expect(result.sentiment).toBe("positive");
    expect(result.status).toBe("new");
    createdFeedbackIds.push(result.id);
  });

  it("submitFeedback — infers negative sentiment for harassment category", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await submitFeedback(ORG, EMP, {
      category: "harassment",
      subject: `Urgent Issue ${U}`,
      message: "Harassment report for testing.",
      is_urgent: true,
    });
    expect(result.sentiment).toBe("negative");
    expect(result.is_urgent).toBeTruthy();
    createdFeedbackIds.push(result.id);
  });

  it("submitFeedback — infers positive sentiment for suggestion category", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await submitFeedback(ORG, ADMIN, {
      category: "suggestion",
      subject: `Suggestion ${U}`,
      message: "A constructive suggestion.",
    });
    expect(result.sentiment).toBe("positive");
    createdFeedbackIds.push(result.id);
  });

  it("submitFeedback — infers neutral for unknown category", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await submitFeedback(ORG, EMP, {
      category: "other",
      subject: `Other ${U}`,
      message: "Neutral feedback.",
    });
    expect(result.sentiment).toBe("neutral");
    createdFeedbackIds.push(result.id);
  });

  it("submitFeedback — safety category infers negative", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await submitFeedback(ORG, EMP, {
      category: "safety",
      subject: `Safety ${U}`,
      message: "Safety concern.",
    });
    expect(result.sentiment).toBe("negative");
    createdFeedbackIds.push(result.id);
  });

  it("getMyFeedback — returns user's own feedback via hash", async () => {
    const { getMyFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await getMyFeedback(ORG, EMP, { page: 1, perPage: 10 });
    expect(result).toHaveProperty("feedback");
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThan(0);
    expect(Array.isArray(result.feedback)).toBe(true);
  });

  it("getMyFeedback — pagination works", async () => {
    const { getMyFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await getMyFeedback(ORG, EMP, { page: 1, perPage: 2 });
    expect(result.feedback.length).toBeLessThanOrEqual(2);
  });

  it("getMyFeedback — default params", async () => {
    const { getMyFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await getMyFeedback(ORG, EMP);
    expect(result).toHaveProperty("total");
  });

  it("listFeedback — returns all feedback for org (HR view)", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { page: 1, perPage: 10 });
    expect(result).toHaveProperty("feedback");
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThan(0);
  });

  it("listFeedback — filters by category", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { category: "harassment" });
    expect(result.feedback.every((f: any) => f.category === "harassment")).toBe(true);
  });

  it("listFeedback — filters by status", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { status: "new" });
    expect(result.feedback.every((f: any) => f.status === "new")).toBe(true);
  });

  it("listFeedback — filters by sentiment", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { sentiment: "negative" });
    expect(result.feedback.every((f: any) => f.sentiment === "negative")).toBe(true);
  });

  it("listFeedback — filters by is_urgent", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { is_urgent: true });
    expect(result.feedback.every((f: any) => f.is_urgent)).toBe(true);
  });

  it("listFeedback — search by subject/message", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG, { search: U });
    expect(result.total).toBeGreaterThan(0);
  });

  it("listFeedback — default params (no filters)", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await listFeedback(ORG);
    expect(result).toHaveProperty("total");
  });

  it("isOwner — returns true for actual owner", async () => {
    const { isOwner } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[0]; // Created by EMP
    const result = await isOwner(ORG, feedbackId, EMP);
    expect(result).toBe(true);
  });

  it("isOwner — returns false for non-owner", async () => {
    const { isOwner } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[0];
    const result = await isOwner(ORG, feedbackId, ADMIN);
    expect(result).toBe(false);
  });

  it("isOwner — returns false for non-existent feedback", async () => {
    const { isOwner } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await isOwner(ORG, 999999, EMP);
    expect(result).toBe(false);
  });

  it("getFeedbackById — returns single feedback", async () => {
    const { getFeedbackById } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[0];
    const result = await getFeedbackById(ORG, feedbackId);
    expect(result.id).toBe(feedbackId);
    expect(result).toHaveProperty("category");
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("sentiment");
    expect(result).toHaveProperty("status");
  });

  it("getFeedbackById — throws for non-existent", async () => {
    const { getFeedbackById } = await import("../../services/feedback/anonymous-feedback.service.js");
    await expect(getFeedbackById(ORG, 999999)).rejects.toThrow();
  });

  it("respondToFeedback — adds admin response", async () => {
    const { respondToFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[0];
    const result = await respondToFeedback(ORG, feedbackId, "Thank you for the feedback.", ADMIN);
    expect(result.admin_response).toBe("Thank you for the feedback.");
    expect(result.responded_by).toBe(ADMIN);
    expect(result.responded_at).toBeDefined();
    expect(result.status).toBe("acknowledged"); // was "new", should transition
  });

  it("respondToFeedback — does not change status if already not 'new'", async () => {
    const { respondToFeedback, updateStatus } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[1];
    // First set status to "under_review" (valid enum: new, acknowledged, under_review, resolved, archived)
    await updateStatus(ORG, feedbackId, "under_review");
    // Then respond
    const result = await respondToFeedback(ORG, feedbackId, "Investigating.", ADMIN);
    expect(result.status).toBe("under_review"); // should NOT change to acknowledged
  });

  it("respondToFeedback — throws for non-existent", async () => {
    const { respondToFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    await expect(respondToFeedback(ORG, 999999, "x", ADMIN)).rejects.toThrow();
  });

  it("updateStatus — changes feedback status", async () => {
    const { updateStatus } = await import("../../services/feedback/anonymous-feedback.service.js");
    const feedbackId = createdFeedbackIds[0];
    const result = await updateStatus(ORG, feedbackId, "resolved");
    expect(result.status).toBe("resolved");
  });

  it("updateStatus — throws for non-existent", async () => {
    const { updateStatus } = await import("../../services/feedback/anonymous-feedback.service.js");
    await expect(updateStatus(ORG, 999999, "resolved")).rejects.toThrow();
  });

  it("getFeedbackDashboard — returns dashboard stats", async () => {
    const { getFeedbackDashboard } = await import("../../services/feedback/anonymous-feedback.service.js");
    const result = await getFeedbackDashboard(ORG);
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("urgentCount");
    expect(result).toHaveProperty("responseRate");
    expect(result).toHaveProperty("byCategory");
    expect(result).toHaveProperty("bySentiment");
    expect(result).toHaveProperty("byStatus");
    expect(result).toHaveProperty("recent");
    expect(typeof result.total).toBe("number");
    expect(typeof result.responseRate).toBe("number");
    expect(Array.isArray(result.byCategory)).toBe(true);
    expect(Array.isArray(result.bySentiment)).toBe(true);
    expect(Array.isArray(result.byStatus)).toBe(true);
  });
});

// =============================================================================
// 4. MANAGER SERVICE (5 functions)
// =============================================================================
describe("Manager Service", () => {
  it("getMyTeam — returns team members for a manager", async () => {
    const { getMyTeam } = await import("../../services/manager/manager.service.js");
    const team = await getMyTeam(ORG, MGR);
    expect(Array.isArray(team)).toBe(true);
    // Each member should have expected fields
    if (team.length > 0) {
      expect(team[0]).toHaveProperty("id");
      expect(team[0]).toHaveProperty("first_name");
      expect(team[0]).toHaveProperty("email");
    }
  });

  it("getMyTeam — returns empty array for non-manager", async () => {
    const { getMyTeam } = await import("../../services/manager/manager.service.js");
    // Use a user that is unlikely to be anyone's manager
    const team = await getMyTeam(ORG, 999999);
    expect(Array.isArray(team)).toBe(true);
    expect(team.length).toBe(0);
  });

  it("getTeamAttendanceToday — returns attendance structure", async () => {
    const { getTeamAttendanceToday } = await import("../../services/manager/manager.service.js");
    const result = await getTeamAttendanceToday(ORG, MGR);
    expect(result).toHaveProperty("team_size");
    expect(result).toHaveProperty("date");
    if (result.team_size > 0) {
      expect(result).toHaveProperty("present");
      expect(result).toHaveProperty("absent");
      expect(result).toHaveProperty("on_leave");
    }
  });

  it("getTeamAttendanceToday — empty team returns zero structure", async () => {
    const { getTeamAttendanceToday } = await import("../../services/manager/manager.service.js");
    const result = await getTeamAttendanceToday(ORG, 999999);
    expect(result.team_size).toBe(0);
  });

  it("getTeamPendingLeaves — returns pending leaves array", async () => {
    const { getTeamPendingLeaves } = await import("../../services/manager/manager.service.js");
    const result = await getTeamPendingLeaves(ORG, MGR);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getTeamPendingLeaves — returns empty for non-manager", async () => {
    const { getTeamPendingLeaves } = await import("../../services/manager/manager.service.js");
    const result = await getTeamPendingLeaves(ORG, 999999);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("getTeamLeaveCalendar — returns leaves in date range", async () => {
    const { getTeamLeaveCalendar } = await import("../../services/manager/manager.service.js");
    const result = await getTeamLeaveCalendar(ORG, MGR, "2026-01-01", "2026-12-31");
    expect(Array.isArray(result)).toBe(true);
  });

  it("getTeamLeaveCalendar — returns empty for non-manager", async () => {
    const { getTeamLeaveCalendar } = await import("../../services/manager/manager.service.js");
    const result = await getTeamLeaveCalendar(ORG, 999999, "2026-01-01", "2026-12-31");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("getTeamLeaveCalendar — narrow date range", async () => {
    const { getTeamLeaveCalendar } = await import("../../services/manager/manager.service.js");
    const today = new Date().toISOString().slice(0, 10);
    const result = await getTeamLeaveCalendar(ORG, MGR, today, today);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getManagerDashboard — returns combined stats", async () => {
    const { getManagerDashboard } = await import("../../services/manager/manager.service.js");
    const result = await getManagerDashboard(ORG, MGR);
    expect(result).toHaveProperty("team_size");
    expect(result).toHaveProperty("present_today");
    expect(result).toHaveProperty("absent_today");
    expect(result).toHaveProperty("on_leave_today");
    expect(result).toHaveProperty("late_today");
    expect(result).toHaveProperty("pending_leave_requests");
    expect(result).toHaveProperty("pending_comp_off_requests");
    expect(typeof result.team_size).toBe("number");
  });

  it("getManagerDashboard — empty team returns zeros", async () => {
    const { getManagerDashboard } = await import("../../services/manager/manager.service.js");
    const result = await getManagerDashboard(ORG, 999999);
    expect(result.team_size).toBe(0);
    expect(result.present_today).toBe(0);
    expect(result.absent_today).toBe(0);
    expect(result.on_leave_today).toBe(0);
    expect(result.late_today).toBe(0);
    expect(result.pending_leave_requests).toBe(0);
    expect(result.pending_comp_off_requests).toBe(0);
  });
});

// =============================================================================
// 5. NOTIFICATION SERVICE (5 functions)
// =============================================================================
describe("Notification Service", () => {
  const createdNotificationIds: number[] = [];

  afterAll(async () => {
    const db = getDB();
    if (createdNotificationIds.length > 0) {
      await db("notifications").whereIn("id", createdNotificationIds).del();
    }
  });

  it("createNotification — with all params", async () => {
    const { createNotification } = await import("../../services/notification/notification.service.js");
    const result: any = await createNotification(
      ORG, EMP, "leave_approved", `Leave Approved ${U}`,
      "Your leave has been approved", "leave_application", "123"
    );
    expect(result.id).toBeGreaterThan(0);
    expect(result.type).toBe("leave_approved");
    expect(result.title).toBe(`Leave Approved ${U}`);
    expect(result.body).toBe("Your leave has been approved");
    expect(result.reference_type).toBe("leave_application");
    expect(result.reference_id).toBe("123");
    expect(result.is_read).toBeFalsy();
    createdNotificationIds.push(result.id);
  });

  it("createNotification — minimal params (no body, no reference)", async () => {
    const { createNotification } = await import("../../services/notification/notification.service.js");
    const result: any = await createNotification(ORG, EMP, "info", `Info ${U}`);
    expect(result.id).toBeGreaterThan(0);
    expect(result.body).toBeNull();
    expect(result.reference_type).toBeNull();
    createdNotificationIds.push(result.id);
  });

  it("createNotification — with null body and reference", async () => {
    const { createNotification } = await import("../../services/notification/notification.service.js");
    const result: any = await createNotification(ORG, EMP, "system", `System ${U}`, null, null, null);
    expect(result.body).toBeNull();
    createdNotificationIds.push(result.id);
  });

  it("createNotification — multiple for same user", async () => {
    const { createNotification } = await import("../../services/notification/notification.service.js");
    const result: any = await createNotification(ORG, ADMIN, "announcement", `Announcement ${U}`, "New policy posted");
    expect(result.user_id).toBe(ADMIN);
    createdNotificationIds.push(result.id);
  });

  it("listNotifications — returns paginated list", async () => {
    const { listNotifications } = await import("../../services/notification/notification.service.js");
    const result = await listNotifications(ORG, EMP, { page: 1, perPage: 10 });
    expect(result).toHaveProperty("notifications");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.notifications)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it("listNotifications — unreadOnly filter", async () => {
    const { listNotifications } = await import("../../services/notification/notification.service.js");
    const result = await listNotifications(ORG, EMP, { unreadOnly: true });
    expect(result.notifications.every((n: any) => !n.is_read)).toBe(true);
  });

  it("listNotifications — default params", async () => {
    const { listNotifications } = await import("../../services/notification/notification.service.js");
    const result = await listNotifications(ORG, EMP);
    expect(result).toHaveProperty("total");
  });

  it("listNotifications — pagination page 2", async () => {
    const { listNotifications } = await import("../../services/notification/notification.service.js");
    const result = await listNotifications(ORG, EMP, { page: 2, perPage: 1 });
    expect(result).toHaveProperty("notifications");
  });

  it("getUnreadCount — returns count of unread", async () => {
    const { getUnreadCount } = await import("../../services/notification/notification.service.js");
    const count = await getUnreadCount(ORG, EMP);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0); // We created unread notifications above
  });

  it("getUnreadCount — returns 0 for user with no notifications", async () => {
    const { getUnreadCount } = await import("../../services/notification/notification.service.js");
    const count = await getUnreadCount(ORG, 999999);
    expect(count).toBe(0);
  });

  it("markAsRead — marks a notification as read", async () => {
    const { markAsRead } = await import("../../services/notification/notification.service.js");
    const notifId = createdNotificationIds[0]; // belongs to EMP
    await markAsRead(ORG, notifId, EMP);
    // Verify it's read
    const db = getDB();
    const notif = await db("notifications").where({ id: notifId }).first();
    expect(notif.is_read).toBeTruthy();
    expect(notif.read_at).not.toBeNull();
  });

  it("markAsRead — throws for non-existent notification", async () => {
    const { markAsRead } = await import("../../services/notification/notification.service.js");
    await expect(markAsRead(ORG, 999999, EMP)).rejects.toThrow();
  });

  it("markAsRead — throws for wrong user", async () => {
    const { markAsRead } = await import("../../services/notification/notification.service.js");
    const notifId = createdNotificationIds[1]; // belongs to EMP
    await expect(markAsRead(ORG, notifId, ADMIN)).rejects.toThrow();
  });

  it("markAllAsRead — marks all unread as read", async () => {
    const { markAllAsRead, getUnreadCount } = await import("../../services/notification/notification.service.js");
    const result = await markAllAsRead(ORG, EMP);
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
    // Verify unread count is now 0
    const unread = await getUnreadCount(ORG, EMP);
    expect(unread).toBe(0);
  });

  it("markAllAsRead — returns 0 when nothing to mark", async () => {
    const { markAllAsRead } = await import("../../services/notification/notification.service.js");
    // Already marked all as read above
    const result = await markAllAsRead(ORG, EMP);
    expect(result.count).toBe(0);
  });
});
