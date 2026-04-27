// =============================================================================
// EMP CLOUD — Attendance Settings & Policy Service
//
// Centralises:
//   • org-level attendance_settings (which channels are allowed)
//   • per-user user_attendance_overrides (date-bounded, NULL fields inherit)
//   • the resolveAttendancePolicy() helper used by both the check-in guard
//     and the GET /me/policy endpoint that the EmpCloud mobile app calls
//
// Geofence storage is the existing geo_fence_locations table (migration 006).
// We don't enforce distance server-side; we just hand the list to the app.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import type {
  AttendanceChannel,
  CreateUserAttendanceOverrideInput,
  UpdateAttendanceSettingsInput,
  UpdateUserAttendanceOverrideInput,
} from "@empcloud/shared";

// Legacy `source` values that web/biometric clients have always sent. We treat
// them as the appropriate channel for guard purposes so existing clients
// keep working when the org disables/enables a channel.
const SOURCE_TO_CHANNEL: Record<string, AttendanceChannel> = {
  manual: "dashboard",
  geo: "dashboard",
  dashboard: "dashboard",
  biometric: "biometric",
  app: "app",
};

export function sourceToChannel(source: string | null | undefined): AttendanceChannel {
  if (!source) return "dashboard";
  return SOURCE_TO_CHANNEL[source] ?? "dashboard";
}

function parseChannels(csv: string | null | undefined): AttendanceChannel[] {
  if (!csv) return ["dashboard", "biometric", "app"];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AttendanceChannel => s === "dashboard" || s === "biometric" || s === "app");
}

function serialiseChannels(channels: AttendanceChannel[]): string {
  // Dedupe + stable ordering so the row is deterministic.
  const order: AttendanceChannel[] = ["dashboard", "biometric", "app"];
  return order.filter((c) => channels.includes(c)).join(",");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Org-level settings
// ---------------------------------------------------------------------------

export async function getOrCreateSettings(orgId: number) {
  const db = getDB();
  let row = await db("attendance_settings").where({ organization_id: orgId }).first();
  if (row) return row;
  await db("attendance_settings").insert({
    organization_id: orgId,
    allowed_channels: "dashboard,biometric,app",
    geofence_advisory: false,
    created_at: new Date(),
    updated_at: new Date(),
  });
  row = await db("attendance_settings").where({ organization_id: orgId }).first();
  return row;
}

export async function getSettings(orgId: number) {
  const row = await getOrCreateSettings(orgId);
  return {
    organization_id: row.organization_id,
    allowed_channels: parseChannels(row.allowed_channels),
    geofence_advisory: !!row.geofence_advisory,
    updated_at: row.updated_at,
  };
}

export async function updateSettings(orgId: number, data: UpdateAttendanceSettingsInput) {
  const db = getDB();
  await getOrCreateSettings(orgId);
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (data.allowed_channels !== undefined) {
    patch.allowed_channels = serialiseChannels(data.allowed_channels);
  }
  if (data.geofence_advisory !== undefined) {
    patch.geofence_advisory = data.geofence_advisory;
  }
  await db("attendance_settings").where({ organization_id: orgId }).update(patch);
  return getSettings(orgId);
}

// ---------------------------------------------------------------------------
// User-level overrides
// ---------------------------------------------------------------------------

function shapeOverride(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    allowed_channels: row.allowed_channels ? parseChannels(row.allowed_channels) : null,
    geofence_mode: row.geofence_mode as "inherit" | "off" | "custom",
    custom_geofence_id: row.custom_geofence_id ?? null,
    start_date: row.start_date,
    end_date: row.end_date,
    note: row.note ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listUserOverrides(orgId: number, userId: number) {
  const db = getDB();
  const rows = await db("user_attendance_overrides")
    .where({ organization_id: orgId, user_id: userId })
    .orderBy("start_date", "desc")
    .orderBy("id", "desc");
  return rows.map(shapeOverride);
}

async function findOverlap(
  orgId: number,
  userId: number,
  startDate: string,
  endDate: string | null,
  ignoreId?: number,
) {
  const db = getDB();
  let q = db("user_attendance_overrides")
    .where({ organization_id: orgId, user_id: userId })
    .where(function () {
      this.where(function () {
        // existing rows whose range overlaps [startDate, endDate]
        // overlap = NOT (existing.end_date < startDate OR existing.start_date > endDate)
        this.whereNull("end_date").orWhere("end_date", ">=", startDate);
      });
      if (endDate) {
        this.andWhere("start_date", "<=", endDate);
      }
    });
  if (ignoreId) q = q.andWhereNot({ id: ignoreId });
  return q.first();
}

export async function createUserOverride(
  orgId: number,
  userId: number,
  actorId: number,
  data: CreateUserAttendanceOverrideInput,
) {
  const db = getDB();

  const target = await db("users").where({ id: userId, organization_id: orgId }).first();
  if (!target) throw new NotFoundError("User");

  if (data.geofence_mode === "custom" && data.custom_geofence_id) {
    const fence = await db("geo_fence_locations")
      .where({ id: data.custom_geofence_id, organization_id: orgId })
      .first();
    if (!fence) throw new ValidationError("custom_geofence_id does not belong to this organization");
  }

  const overlap = await findOverlap(orgId, userId, data.start_date, data.end_date ?? null);
  if (overlap) {
    throw new ConflictError(
      `Override #${overlap.id} (${overlap.start_date} → ${overlap.end_date ?? "open"}) overlaps the requested window`,
    );
  }

  const [id] = await db("user_attendance_overrides").insert({
    organization_id: orgId,
    user_id: userId,
    allowed_channels: data.allowed_channels?.length ? serialiseChannels(data.allowed_channels) : null,
    geofence_mode: data.geofence_mode,
    custom_geofence_id: data.geofence_mode === "custom" ? data.custom_geofence_id ?? null : null,
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    note: data.note ?? null,
    created_by: actorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const row = await db("user_attendance_overrides").where({ id }).first();
  return shapeOverride(row);
}

export async function updateUserOverride(
  orgId: number,
  overrideId: number,
  data: UpdateUserAttendanceOverrideInput,
) {
  const db = getDB();
  const row = await db("user_attendance_overrides")
    .where({ id: overrideId, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Attendance override");

  const newEnd = data.end_date === undefined ? row.end_date : data.end_date;
  if (newEnd && newEnd < row.start_date) {
    throw new ValidationError("end_date must be on or after start_date");
  }
  if (newEnd !== row.end_date) {
    const overlap = await findOverlap(orgId, row.user_id, row.start_date, newEnd ?? null, row.id);
    if (overlap) {
      throw new ConflictError(
        `Override #${overlap.id} (${overlap.start_date} → ${overlap.end_date ?? "open"}) overlaps the new window`,
      );
    }
  }

  const newMode = data.geofence_mode ?? row.geofence_mode;
  const newCustomFenceId =
    data.custom_geofence_id === undefined ? row.custom_geofence_id : data.custom_geofence_id;
  if (newMode === "custom" && !newCustomFenceId) {
    throw new ValidationError("custom_geofence_id is required when geofence_mode is 'custom'");
  }
  if (newMode === "custom" && newCustomFenceId && newCustomFenceId !== row.custom_geofence_id) {
    const fence = await db("geo_fence_locations")
      .where({ id: newCustomFenceId, organization_id: orgId })
      .first();
    if (!fence) throw new ValidationError("custom_geofence_id does not belong to this organization");
  }

  await db("user_attendance_overrides").where({ id: overrideId }).update({
    allowed_channels:
      data.allowed_channels === undefined
        ? row.allowed_channels
        : data.allowed_channels?.length
          ? serialiseChannels(data.allowed_channels)
          : null,
    geofence_mode: newMode,
    custom_geofence_id: newMode === "custom" ? newCustomFenceId : null,
    end_date: newEnd ?? null,
    note: data.note === undefined ? row.note : data.note,
    updated_at: new Date(),
  });

  const updated = await db("user_attendance_overrides").where({ id: overrideId }).first();
  return shapeOverride(updated);
}

export async function deleteUserOverride(orgId: number, overrideId: number) {
  const db = getDB();
  const row = await db("user_attendance_overrides")
    .where({ id: overrideId, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Attendance override");
  await db("user_attendance_overrides").where({ id: overrideId }).delete();
}

// ---------------------------------------------------------------------------
// Effective policy resolver
// ---------------------------------------------------------------------------

export interface AttendancePolicy {
  organization_id: number;
  user_id: number;
  effective_date: string;
  allowed_channels: AttendanceChannel[];
  geofence_advisory: boolean;
  source: "org" | "override";
  override_id: number | null;
  geofences: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
  }>;
}

export async function resolveAttendancePolicy(
  orgId: number,
  userId: number,
  date: string = todayIso(),
): Promise<AttendancePolicy> {
  const db = getDB();

  const settings = await getSettings(orgId);

  const override = await db("user_attendance_overrides")
    .where({ organization_id: orgId, user_id: userId })
    .where("start_date", "<=", date)
    .where(function () {
      this.whereNull("end_date").orWhere("end_date", ">=", date);
    })
    .orderBy("start_date", "desc")
    .orderBy("id", "desc")
    .first();

  let allowedChannels = settings.allowed_channels;
  let geofences: AttendancePolicy["geofences"] = [];
  const geofenceAdvisory = settings.geofence_advisory;

  if (override?.allowed_channels) {
    allowedChannels = parseChannels(override.allowed_channels);
  }

  const mode = (override?.geofence_mode ?? "inherit") as "inherit" | "off" | "custom";
  if (mode === "off") {
    geofences = [];
  } else if (mode === "custom" && override?.custom_geofence_id) {
    const fence = await db("geo_fence_locations")
      .where({ id: override.custom_geofence_id, organization_id: orgId, is_active: true })
      .first();
    if (fence) {
      geofences = [
        {
          id: fence.id,
          name: fence.name,
          latitude: Number(fence.latitude),
          longitude: Number(fence.longitude),
          radius_meters: Number(fence.radius_meters),
        },
      ];
    }
  } else {
    const rows = await db("geo_fence_locations")
      .where({ organization_id: orgId, is_active: true })
      .orderBy("name", "asc");
    geofences = rows.map((f) => ({
      id: f.id,
      name: f.name,
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
      radius_meters: Number(f.radius_meters),
    }));
  }

  return {
    organization_id: orgId,
    user_id: userId,
    effective_date: date,
    allowed_channels: allowedChannels,
    geofence_advisory: geofenceAdvisory,
    source: override ? "override" : "org",
    override_id: override?.id ?? null,
    geofences,
  };
}

// Thrown by the check-in guard when the resolved policy disallows the
// channel the request is using. Surfaces as HTTP 403 with a stable error
// code so the mobile app can render an actionable message.
export class ChannelNotAllowedError extends AppError {
  constructor(channel: AttendanceChannel, allowed: AttendanceChannel[]) {
    super(
      `Check-in via '${channel}' is not allowed for this user. Allowed channels: ${allowed.join(", ") || "none"}`,
      403,
      "ATTENDANCE_CHANNEL_NOT_ALLOWED",
      { channel, allowed_channels: allowed },
    );
    this.name = "ChannelNotAllowedError";
  }
}

export async function assertChannelAllowed(
  orgId: number,
  userId: number,
  source: string | undefined,
): Promise<AttendanceChannel> {
  const channel = sourceToChannel(source);
  const policy = await resolveAttendancePolicy(orgId, userId);
  if (!policy.allowed_channels.includes(channel)) {
    throw new ChannelNotAllowedError(channel, policy.allowed_channels);
  }
  return channel;
}
