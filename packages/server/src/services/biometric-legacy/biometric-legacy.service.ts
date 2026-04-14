// =============================================================================
// EMP CLOUD — Biometric Legacy Service
//
// Business logic for the emp-monitor-compatible /api/v3/biometric surface.
// Every function here is a 1:1 port of an emp-monitor controller action,
// preserving the exact data shape the existing kiosk firmware expects.
//
// Data sources (EmpCloud only — no emp-monitor DB access):
//   - users, organizations, organization_locations, organization_departments
//   - attendance_records (via attendanceService.checkIn / checkOut)
//   - biometric_legacy_credentials (new, migration 042) — stores the
//     finger1/finger2/bio_code/secret_key/is_bio_enabled fields that have
//     no home in the modern biometrics schema
//
// Intentional simplifications vs. emp-monitor:
//   - Access counters + biometric_department access logs are dropped
//     (they were emp-monitor's per-org device metering; EmpCloud doesn't
//     meter this way and this was flagged as out-of-scope in the plan).
//   - camera_overlay_status, department_status, attendance_hours settings,
//     and the holidays table have no EmpCloud equivalent — we return
//     safe defaults so response shapes stay intact.
//   - secret_key is stored bcrypt-hashed instead of symmetrically
//     encrypted; the forgot-password OTP flow still works identically
//     from the client's perspective.
// =============================================================================

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import Redis from "ioredis";
import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import * as attendanceService from "../attendance/attendance.service.js";
import { signKioskToken, KioskUserData } from "./kiosk-auth.middleware.js";

// ---------------------------------------------------------------------------
// Redis singleton for the forgot-password OTP cache. Follows the same
// lazy-connect / soft-fail pattern as widget.service.ts so local dev
// without redis doesn't break the rest of the kiosk API — the forgot
// flow just won't work, which is acceptable.
// ---------------------------------------------------------------------------
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.connect().catch((err) => {
      logger.warn("Redis connection failed — biometric OTP cache disabled", { error: err.message });
      redis = null;
    });
  } catch {
    redis = null;
  }
  return redis;
}

const OTP_TTL_SECONDS = 1800; // 30 minutes — matches emp-monitor

export async function storeOtp(email: string, otp: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`forgot_password_otp_biometric_${email}`, String(otp), "EX", OTP_TTL_SECONDS);
  } catch (err) {
    logger.warn("OTP store failed", { err: (err as Error).message });
  }
}

export async function readOtp(email: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(`forgot_password_otp_biometric_${email}`);
  } catch {
    return null;
  }
}

export async function clearOtp(email: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`forgot_password_otp_biometric_${email}`);
  } catch {
    /* ignore */
  }
}

const DEFAULT_ATTENDANCE_SECONDS = 28800; // 8 hours — emp-monitor's fallback

// ---------------------------------------------------------------------------
// Date / timezone helpers
//
// emp-monitor used moment-timezone; EmpCloud doesn't depend on moment, and
// we don't want to pull it in for one compat shim. These two helpers cover
// every format we actually need: "YYYY-MM-DD" for dates and
// "YYYY-MM-DD HH:mm:ss" in a given IANA tz for punch timestamps.
// ---------------------------------------------------------------------------

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYMD(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatInTimezone(date: Date, timezone: string | null): string {
  const tz = timezone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hh = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")} ${hh}:${get("minute")}:${get("second")}`;
  } catch {
    return new Date(date).toISOString().replace("T", " ").slice(0, 19);
  }
}

function minutesSince(from: Date | string): number {
  const ms = Date.now() - new Date(from).getTime();
  return Math.floor(ms / 60000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateCredentials(userId: number, organizationId: number) {
  const db = getDB();
  let row = await db("biometric_legacy_credentials").where({ user_id: userId }).first();
  if (!row) {
    const now = new Date();
    await db("biometric_legacy_credentials").insert({
      user_id: userId,
      organization_id: organizationId,
      is_bio_enabled: false,
      created_at: now,
      updated_at: now,
    });
    row = await db("biometric_legacy_credentials").where({ user_id: userId }).first();
  }
  return row;
}

function boolStr(v: boolean | number | null | undefined): "true" | "false" {
  return v ? "true" : "false";
}

function faceUrlFor(baseUrl: string, userId: number, face: string | null): string | null {
  if (!face) return null;
  // Existing files on disk are served through the legacy face route; the
  // timestamp query string matches emp-monitor's cache-buster format.
  const ts = Date.now();
  return `${baseUrl.replace(/\/+$/, "")}/api/v3/biometric/face/${userId}.jpg?timestamp=${ts}`;
}

function legacyFacePath(organizationId: number, userId: number): string {
  const dir = path.join(process.cwd(), "uploads", "biometric-legacy", String(organizationId));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${userId}.jpg`);
}

// ---------------------------------------------------------------------------
// User admin endpoints (admin JWT)
// ---------------------------------------------------------------------------

export async function enableBiometricForUser(
  userId: number,
  email: string,
  body: { secretKey: string; userName?: string | null; status?: number | string },
) {
  const db = getDB();

  const user = await db("users").where({ id: userId }).first();
  if (!user) return { error: { code: 400, message: "Invalid email", data: null } };
  if (user.email !== email) return { error: { code: 400, message: "Invalid email", data: null } };

  const creds = await getOrCreateCredentials(userId, user.organization_id);

  const enable = Number(body.status) === 1;

  if (enable) {
    if (creds.is_bio_enabled) {
      return { error: { code: 400, message: "Biometric already enabled", data: null } };
    }
    const hash = await bcrypt.hash(String(body.secretKey), 12);
    const update: Record<string, unknown> = {
      is_bio_enabled: true,
      secret_key_hash: hash,
      updated_at: new Date(),
    };
    if (body.userName) update.username = body.userName;
    await db("biometric_legacy_credentials").where({ user_id: userId }).update(update);
  } else {
    if (!creds.is_bio_enabled) {
      return { error: { code: 400, message: "Biometric already disabled", data: null } };
    }
    const update: Record<string, unknown> = { is_bio_enabled: false, updated_at: new Date() };
    if (body.userName) update.username = body.userName;
    await db("biometric_legacy_credentials").where({ user_id: userId }).update(update);
  }

  const refreshed = await db("biometric_legacy_credentials").where({ user_id: userId }).first();
  const userResp = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    username: refreshed?.username ?? null,
    is_bio_enabled: boolStr(refreshed?.is_bio_enabled),
    status: user.status,
  };
  return {
    data: userResp,
    message: enable ? "Biometric enabled succesfully" : "Biometric disabled succesfully",
  };
}

export async function checkStatusForUser(userId: number) {
  const db = getDB();
  const user = await db("users").where({ id: userId }).first();
  if (!user) return { status: "false" as const };
  const creds = await db("biometric_legacy_credentials").where({ user_id: userId }).first();
  return { status: boolStr(creds?.is_bio_enabled) };
}

export async function setPassword(userId: number, email: string, secretKey: string) {
  const db = getDB();
  const user = await db("users").where({ id: userId }).first();
  if (!user) throw new Error("User not found");
  await getOrCreateCredentials(userId, user.organization_id);
  const hash = await bcrypt.hash(String(secretKey), 12);
  await db("biometric_legacy_credentials")
    .where({ user_id: userId })
    .update({ secret_key_hash: hash, updated_at: new Date() });
  // Also accept email form for parity with emp-monitor updateSecretKey(email, ...)
  if (email && email !== user.email) {
    const byEmail = await db("users").where({ email }).first();
    if (byEmail) {
      await getOrCreateCredentials(byEmail.id, byEmail.organization_id);
      await db("biometric_legacy_credentials")
        .where({ user_id: byEmail.id })
        .update({ secret_key_hash: hash, updated_at: new Date() });
    }
  }
}

// ---------------------------------------------------------------------------
// Kiosk /auth — issues the kiosk JWT
// ---------------------------------------------------------------------------

export async function kioskAuth(body: { userName?: string; email?: string; secretKey: string }) {
  const db = getDB();
  const { userName, email, secretKey } = body;

  if (!secretKey) return { error: { code: 400, message: "secretKey is required" } };

  let user: any = null;
  if (email) {
    user = await db("users").where({ email }).first();
  }
  if (!user && userName) {
    const creds = await db("biometric_legacy_credentials").where({ username: userName }).first();
    if (creds) user = await db("users").where({ id: creds.user_id }).first();
  }
  if (!user) return { error: { code: 400, message: "Invalid email or username" } };

  const creds = await db("biometric_legacy_credentials").where({ user_id: user.id }).first();
  if (!creds || !creds.is_bio_enabled) {
    return { error: { code: 400, message: "Biometric authentication disabled. Enable from dashboard." } };
  }
  if (!creds.secret_key_hash) {
    return { error: { code: 400, message: "SecretKey has not been set." } };
  }
  const ok = await bcrypt.compare(String(secretKey), creds.secret_key_hash);
  if (!ok) return { error: { code: 400, message: "Invalid SecretKey" } };

  const org = await db("organizations").where({ id: user.organization_id }).first();

  const userData: KioskUserData = {
    id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    username: creds.username ?? null,
    first_name: user.first_name,
    last_name: user.last_name,
    timezone: org?.timezone ?? null,
    is_bio_enabled: true,
  };
  const accessToken = signKioskToken(userData);

  // Mirror emp-monitor's /auth response payload shape. camera_overlay_status
  // and department_status have no EmpCloud equivalent — return safe defaults
  // so the kiosk UI keeps rendering. See plan notes in the service header.
  return {
    data: {
      userData: [
        {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          is_bio_enabled: boolStr(true),
          username: creds.username ?? null,
          secret_key: null,
          timezone: org?.timezone ?? null,
          organization_id: user.organization_id,
        },
      ],
      accessToken,
      camera_overlay_status: 0,
      department_status: 0,
    },
    message: "log in success",
  };
}

// ---------------------------------------------------------------------------
// /get-users
// ---------------------------------------------------------------------------

export async function fetchUsersForKiosk(
  orgId: number,
  baseUrl: string,
  params: {
    skip?: string;
    limit?: string;
    search?: string;
    sortOrder?: string;
    sortColumn?: string;
    location_id?: string;
    user_id?: string;
    department_id?: string;
  },
) {
  const db = getDB();
  const skip = Number(params.skip || 0);
  const limit = Number(params.limit || 10);

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return { error: { code: 400, message: "Organization not found" } };

  const confirmationStatus = 0; // no emp-monitor `biometrics_confirmation_status` in EmpCloud

  const column = params.sortColumn === "email" ? "u.email" : "u.first_name";
  const order = params.sortOrder === "ASC" ? "ASC" : "ASC"; // emp-monitor quirk: always ASC by default

  if (params.user_id) {
    const row = await db("users as u")
      .leftJoin("organization_locations as ol", "ol.id", "u.location_id")
      .leftJoin("organization_departments as od", "od.id", "u.department_id")
      .leftJoin("biometric_legacy_credentials as bd", "bd.user_id", "u.id")
      .where("u.organization_id", orgId)
      .where("u.id", params.user_id)
      .modify((q) => {
        if (params.location_id) q.where("u.location_id", params.location_id);
      })
      .select(
        "u.id",
        "u.email",
        "u.first_name",
        "u.last_name",
        "u.photo_path",
        "u.status",
        "bd.face_url as face",
        "bd.finger1",
        "bd.finger2",
        "bd.bio_code",
        "ol.name as location",
        "ol.id as location_id",
        "od.name as department",
        "od.id as department_id",
      );
    if (!row.length) return { error: { code: 400, message: "No users found with provided user_id" } };
    // Rewrite face to a served URL
    for (const r of row) r.face = faceUrlFor(baseUrl, r.id, r.face ?? null);
    return {
      data: { userData: row, confirmationStatus },
      message: "Biometric details fetched successfully",
    };
  }

  let listQuery = db("users as u")
    .leftJoin("organization_locations as ol", "ol.id", "u.location_id")
    .leftJoin("organization_departments as od", "od.id", "u.department_id")
    .leftJoin("biometric_legacy_credentials as bd", "bd.user_id", "u.id")
    .where("u.organization_id", orgId);

  if (params.location_id) listQuery = listQuery.where("u.location_id", params.location_id);
  if (params.search) {
    const s = `%${params.search}%`;
    listQuery = listQuery.where((qb) => {
      qb.where("u.first_name", "like", s)
        .orWhere("u.last_name", "like", s)
        .orWhereRaw("CONCAT(u.first_name, ' ', u.last_name) LIKE ?", [s])
        .orWhere("u.email", "like", s)
        .orWhere("od.name", "like", s);
    });
  }

  const countQuery = db("users as u").where("u.organization_id", orgId);
  if (params.location_id) countQuery.where("u.location_id", params.location_id);
  const [countRow] = await countQuery.count<{ total: number | string }[]>({ total: "*" });
  const total = Number(countRow?.total ?? 0);

  const rows = await listQuery
    .select(
      "u.id",
      "u.email",
      "u.first_name",
      "u.last_name",
      "u.photo_path",
      "u.status",
      "bd.face_url as face",
      "ol.name as location",
      "ol.id as location_id",
      "od.name as department",
      "od.id as department_id",
    )
    .orderByRaw(`${column} ${order}`)
    .limit(limit)
    .offset(skip);

  if (!rows.length) return { error: { code: 400, message: "No users found" } };

  for (const r of rows) r.face = faceUrlFor(baseUrl, r.id, r.face ?? null);

  return {
    data: { count: total, usersData: rows, confirmationStatus },
    message: "Biometric details fetched successfully",
  };
}

// ---------------------------------------------------------------------------
// /update-user (enrollment)
// ---------------------------------------------------------------------------

export async function updateBiometricUser(
  orgId: number,
  body: { user_id: string | number; finger1?: string; finger2?: string; bio_code?: string },
  file?: { buffer: Buffer; originalname: string } | null,
) {
  const db = getDB();
  const userId = Number(body.user_id);

  const user = await db("users").where({ id: userId }).first();
  if (!user) return { error: { code: 400, message: "User not found" } };
  if (user.status === 2) {
    return { data: null, message: "Can not register face for suspended user", code: 200 };
  }

  const creds = await getOrCreateCredentials(userId, orgId);

  if (body.bio_code) {
    const clash = await db("biometric_legacy_credentials")
      .where({ bio_code: body.bio_code })
      .whereNot("user_id", userId)
      .first();
    if (clash) {
      return { error: { code: 400, message: "This Bio Code already exists,Please enter a new bio code." } };
    }
  }

  let face_url: string | null = creds.face_url ?? null;
  if (file) {
    const dest = legacyFacePath(orgId, userId);
    fs.writeFileSync(dest, file.buffer);
    face_url = `local:${dest}`; // sentinel — list endpoints rewrite to HTTP URL
  }

  await db("biometric_legacy_credentials")
    .where({ user_id: userId })
    .update({
      finger1: body.finger1 ?? creds.finger1 ?? null,
      finger2: body.finger2 ?? creds.finger2 ?? null,
      bio_code: body.bio_code ?? creds.bio_code ?? null,
      face_url,
      updated_at: new Date(),
    });

  return { data: null, message: "Biometric data updated successfully" };
}

// ---------------------------------------------------------------------------
// /get-user-info  (the actual kiosk punch-in/out)
// ---------------------------------------------------------------------------

export async function matchAndPunch(
  orgId: number,
  loggedInUserId: number,
  timezone: string | null,
  body: { finger?: string; face?: string; bio_code?: string },
) {
  const db = getDB();

  let creds: any = null;
  let auth: "finger1" | "finger2" | "face" | "bio_code" | null = null;

  if (body.finger != null && body.finger !== undefined) {
    creds = await db("biometric_legacy_credentials")
      .where({ organization_id: orgId })
      .andWhere(function () {
        this.where("finger1", body.finger).orWhere("finger2", body.finger);
      })
      .first();
    if (creds) auth = creds.finger1 === body.finger ? "finger1" : "finger2";
  } else if (body.face != null && body.face !== undefined) {
    // emp-monitor's /get-user-info "face" branch matched by user_id because the
    // actual face recognition happens client-side on the kiosk. We preserve
    // that contract: the kiosk sends the matched user id as `face`.
    const userIdFromFace = Number(body.face);
    creds = await db("biometric_legacy_credentials")
      .where({ organization_id: orgId, user_id: userIdFromFace })
      .first();
    if (creds) auth = "face";
  } else if (body.bio_code != null && body.bio_code !== undefined) {
    creds = await db("biometric_legacy_credentials")
      .where({ organization_id: orgId, bio_code: body.bio_code })
      .first();
    if (creds) auth = "bio_code";
  }

  if (!creds || !auth) return { error: { code: 400, message: "No data matched" } };

  const user = await db("users").where({ id: creds.user_id }).first();
  if (!user) return { error: { code: 400, message: "No data matched" } };

  const loggedIn = await db("users").where({ id: loggedInUserId }).first();
  const loggedInCreds = await db("biometric_legacy_credentials").where({ user_id: loggedInUserId }).first();
  if (!loggedInCreds?.is_bio_enabled) {
    return { error: { code: 400, message: "BioMetric not enabled" } };
  }

  const todayStr = todayYMD();
  const existing = await db("attendance_records")
    .where({ organization_id: orgId, user_id: user.id, date: todayStr })
    .first();

  const department = await db("organization_departments").where({ id: user.department_id }).first();
  const location = await db("organization_locations").where({ id: user.location_id }).first();
  const employeeDetails = [
    {
      employee_id: user.id,
      user_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      photo_path: user.photo_path,
      face: null,
      department: department?.name ?? null,
      location: location?.name ?? null,
    },
  ];

  const timeStr = formatInTimezone(new Date(), timezone);

  if (existing && existing.check_in) {
    // checkout path — emp-monitor enforces 1h minimum between check-in and check-out
    const mins = minutesSince(existing.check_in);
    if (mins < 60) return { error: { code: 400, message: "Can not checkout before 1 hr" } };
    if (existing.check_out) {
      return { error: { code: 400, message: "Already checked out today" } };
    }
    await attendanceService.checkOut(orgId, user.id, { source: "biometric" } as any);
    return {
      data: { auth, status: 1, time: timeStr, userData: employeeDetails },
      message: "Successfully Checked Out",
    };
  }

  await attendanceService.checkIn(orgId, user.id, { source: "biometric" } as any);
  return {
    data: { auth, status: 0, time: timeStr, userData: employeeDetails },
    message: "Successfully Checked In",
  };
}

// ---------------------------------------------------------------------------
// /forgot-secret-key — OTP send
// ---------------------------------------------------------------------------

export function generateOtp(): number {
  return crypto.randomInt(100000, 1000000);
}

export async function resolveForgotTarget(email?: string, userName?: string) {
  const db = getDB();
  if (!email && !userName) return null;
  let user: any = null;
  if (email) user = await db("users").where({ email }).first();
  if (!user && userName) {
    const c = await db("biometric_legacy_credentials").where({ username: userName }).first();
    if (c) user = await db("users").where({ id: c.user_id }).first();
  }
  if (!user) return null;
  const creds = await db("biometric_legacy_credentials").where({ user_id: user.id }).first();
  return { user, creds };
}

// ---------------------------------------------------------------------------
// /verify-secret-key — OTP verify + set new key
// ---------------------------------------------------------------------------

export async function setSecretKeyByEmail(email: string, secretKey: string) {
  const db = getDB();
  const user = await db("users").where({ email }).first();
  if (!user) return false;
  await getOrCreateCredentials(user.id, user.organization_id);
  const hash = await bcrypt.hash(String(secretKey), 12);
  await db("biometric_legacy_credentials")
    .where({ user_id: user.id })
    .update({ secret_key_hash: hash, updated_at: new Date() });
  return true;
}

// ---------------------------------------------------------------------------
// /get-locations
// ---------------------------------------------------------------------------

export async function getLocations(orgId: number) {
  const db = getDB();
  return db("organization_locations")
    .where({ organization_id: orgId, is_active: true })
    .select("id", "name");
}

// ---------------------------------------------------------------------------
// /get-department
// ---------------------------------------------------------------------------

export async function getDepartments(orgId: number) {
  const db = getDB();
  return db("organization_departments")
    .where({ organization_id: orgId, is_deleted: false })
    .select("id", "name", "organization_id");
}

// ---------------------------------------------------------------------------
// /attendance-summary
// ---------------------------------------------------------------------------

async function countCheckedIn(orgId: number, locationId: number, date: string) {
  const db = getDB();
  const [row] = await db("attendance_records as ar")
    .join("users as u", "u.id", "ar.user_id")
    .where("ar.organization_id", orgId)
    .where("ar.date", date)
    .where("u.status", 1)
    .where("u.location_id", locationId)
    .whereNotNull("ar.check_in")
    .count<{ checkIn: number | string }[]>({ checkIn: "*" });
  return Number(row?.checkIn ?? 0);
}

async function countCheckedOut(orgId: number, locationId: number, date: string) {
  const db = getDB();
  const [row] = await db("attendance_records as ar")
    .join("users as u", "u.id", "ar.user_id")
    .where("ar.organization_id", orgId)
    .where("ar.date", date)
    .where("u.status", 1)
    .where("u.location_id", locationId)
    .whereNotNull("ar.check_in")
    .whereNotNull("ar.check_out")
    .count<{ checkOut: number | string }[]>({ checkOut: "*" });
  return Number(row?.checkOut ?? 0);
}

async function countSuspend(orgId: number, locationId: number) {
  const db = getDB();
  const [row] = await db("users")
    .where({ organization_id: orgId, location_id: locationId, status: 2 })
    .count<{ suspend: number | string }[]>({ suspend: "*" });
  return Number(row?.suspend ?? 0);
}

async function countAbsent(orgId: number, locationId: number, date: string, custom: boolean) {
  const db = getDB();
  const q = db("users as u")
    .leftJoin("attendance_records as ar", function () {
      this.on("ar.user_id", "=", "u.id").andOnVal("ar.date", "=", date);
    })
    .where("u.organization_id", orgId)
    .where("u.location_id", locationId)
    .where("u.status", 1);
  if (custom) {
    q.where(function () {
      this.whereNull("ar.id")
        .orWhereNull("ar.check_out")
        .orWhereRaw(
          "TIMESTAMPDIFF(SECOND, ar.check_in, ar.check_out) < ?",
          [DEFAULT_ATTENDANCE_SECONDS],
        );
    });
  } else {
    q.whereNull("ar.id");
  }
  const [row] = await q.count<{ absent: number | string }[]>({ absent: "*" });
  return Number(row?.absent ?? 0);
}

async function countPresent(orgId: number, locationId: number, date: string) {
  const db = getDB();
  const [row] = await db("attendance_records as ar")
    .join("users as u", "u.id", "ar.user_id")
    .where("ar.organization_id", orgId)
    .where("ar.date", date)
    .where("u.location_id", locationId)
    .whereRaw("TIMESTAMPDIFF(SECOND, ar.check_in, ar.check_out) >= ?", [DEFAULT_ATTENDANCE_SECONDS])
    .count<{ present: number | string }[]>({ present: "*" });
  return Number(row?.present ?? 0);
}

async function countTotalUsers(orgId: number, locationId: number) {
  const db = getDB();
  const [row] = await db("users")
    .where({ organization_id: orgId, location_id: locationId })
    .count<{ total: number | string }[]>({ total: "*" });
  return Number(row?.total ?? 0);
}

export async function attendanceSummary(
  orgId: number,
  body: { date: string; location_id: number },
) {
  const db = getDB();
  const loc = await db("organization_locations")
    .where({ organization_id: orgId, id: body.location_id })
    .first();
  if (!loc) return { error: { code: 400, message: "No locations found with provided id." } };

  const total = await countTotalUsers(orgId, body.location_id);
  if (!total) return { error: { code: 400, message: "No users found" } };

  const today = todayYMD();
  const customDate = body.date < today;

  const [checkedIn, checkedOut, suspend, absent] = await Promise.all([
    countCheckedIn(orgId, body.location_id, body.date),
    countCheckedOut(orgId, body.location_id, body.date),
    countSuspend(orgId, body.location_id),
    countAbsent(orgId, body.location_id, body.date, customDate),
  ]);

  const yesterday = addDaysYMD(body.date, -1);
  const [yesterDayPresent, yesterDayAbsent] = await Promise.all([
    countPresent(orgId, body.location_id, yesterday),
    countAbsent(orgId, body.location_id, yesterday, true),
  ]);

  return {
    data: {
      date: body.date,
      totalUsers: total,
      checkedIn,
      CheckedOut: checkedOut,
      absent,
      suspend,
      yesterDayPresent,
      yesterDayAbsent,
    },
    message: "Attendance summary fetched successfully",
  };
}

// ---------------------------------------------------------------------------
// /attendance-details
// ---------------------------------------------------------------------------

export async function attendanceDetails(
  orgId: number,
  timezone: string | null,
  body: { date: string; location_id: number; status?: string },
  query: { skip?: string; limit?: string; search?: string; sortColumn?: string; sortOrder?: string },
) {
  const db = getDB();
  const loc = await db("organization_locations")
    .where({ organization_id: orgId, id: body.location_id })
    .first();
  if (!loc) return { error: { code: 400, message: "No locations found with provided id." } };

  const skip = Number(query.skip || 0);
  const limit = Number(query.limit || 10);
  const column = query.sortColumn === "email" ? "u.email" : "u.first_name";

  const today = todayYMD();
  const isPast = body.date < today;

  const [total, checkedIn, checkedOut, suspend, absent] = await Promise.all([
    countTotalUsers(orgId, body.location_id),
    countCheckedIn(orgId, body.location_id, body.date),
    countCheckedOut(orgId, body.location_id, body.date),
    countSuspend(orgId, body.location_id),
    countAbsent(orgId, body.location_id, body.date, isPast),
  ]);

  let listQ = db("users as u")
    .leftJoin("organization_locations as ol", "ol.id", "u.location_id")
    .leftJoin("biometric_legacy_credentials as bd", "bd.user_id", "u.id")
    .leftJoin("attendance_records as ar", function () {
      this.on("ar.user_id", "=", "u.id").andOnVal("ar.date", "=", body.date);
    })
    .where("u.organization_id", orgId)
    .where("u.location_id", body.location_id);

  const status = body.status;
  if (status === "1") listQ = listQ.where("u.status", 1).whereNotNull("ar.check_in");
  if (status === "2") listQ = listQ.where("u.status", 1).whereNotNull("ar.check_in").whereNotNull("ar.check_out");
  if (status === "0") {
    if (isPast) {
      listQ = listQ.where("u.status", 1).where(function () {
        this.whereNull("ar.id")
          .orWhereRaw("TIMESTAMPDIFF(SECOND, ar.check_in, ar.check_out) < ?", [DEFAULT_ATTENDANCE_SECONDS]);
      });
    } else {
      listQ = listQ.where("u.status", 1).whereNull("ar.id");
    }
  }
  if (status === "3") listQ = listQ.where("u.status", 2);

  const rows = await listQ
    .select(
      "u.id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.photo_path",
      "bd.face_url as face",
      "ol.name as location",
      "ar.check_in as checkIn",
      "ar.check_out as checkOut",
    )
    .orderByRaw(`${column} ASC`)
    .limit(limit)
    .offset(skip);

  for (const r of rows) {
    r.checkIn = r.checkIn ? formatInTimezone(new Date(r.checkIn), timezone) : null;
    r.checkOut = r.checkOut ? formatInTimezone(new Date(r.checkOut), timezone) : null;
  }

  return {
    data: {
      totalUsers: total,
      checkedIn,
      CheckedOut: checkedOut,
      Absent: absent,
      suspend,
      userData: rows,
    },
    message: "Attendance data fetched successfully",
  };
}

// ---------------------------------------------------------------------------
// /holidays — EmpCloud has no holidays table; return empty for shape parity
// ---------------------------------------------------------------------------

export async function getHolidays(_orgId: number): Promise<unknown[]> {
  return [];
}

// ---------------------------------------------------------------------------
// /fetch-employee-password-enable-status + /verify-secretKey (org-level secret)
// ---------------------------------------------------------------------------

export async function employeePasswordStatus(_orgId: number) {
  // No EmpCloud equivalent — org-level biometrics password gate not modeled.
  // Return 0 so the kiosk UI treats this feature as off.
  return { status: 0 };
}

export async function verifyOrgSecret(_orgId: number, _secretKey: string) {
  return { error: { code: 400, message: "Passowrd check not enable" } };
}

// ---------------------------------------------------------------------------
// /delete-user-profile-image
// ---------------------------------------------------------------------------

export async function deleteFaceImage(userId: number) {
  const db = getDB();
  const user = await db("users").where({ id: userId }).first();
  if (!user) return { error: { code: 400, message: "User not found" } };
  const dest = legacyFacePath(user.organization_id, userId);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }
  await db("biometric_legacy_credentials")
    .where({ user_id: userId })
    .update({ face_url: null, updated_at: new Date() });
  return { data: null, message: "Profile picture delete successfully" };
}

export function legacyFaceFile(organizationId: number, userId: number): string {
  return legacyFacePath(organizationId, userId);
}
