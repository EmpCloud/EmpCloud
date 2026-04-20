// =============================================================================
// EMP CLOUD — Module User Sync Service
// Handles enabling/disabling users across sub-modules (Monitor, Payroll, etc.)
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

interface SyncUserPayload {
  empcloud_user_id: number;
  organization_id: number;
  email: string;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  designation: string | null;
  department_name: string | null;
  role: string;
  contact_number: string | null;
  password: string | null;
}

// ---------------------------------------------------------------------------
// Get module API URL from modules table
// ---------------------------------------------------------------------------

async function getModuleApiUrl(moduleId: number): Promise<string | null> {
  const db = getDB();
  const mod = await db("modules").where({ id: moduleId }).first();
  return mod?.api_url || null;
}

// ---------------------------------------------------------------------------
// Build user payload for sync
// ---------------------------------------------------------------------------

async function buildSyncPayload(orgId: number, userId: number): Promise<SyncUserPayload> {
  const db = getDB();
  const user = await db("users")
    .leftJoin("organization_departments as dept", "users.department_id", "dept.id")
    .where({ "users.id": userId, "users.organization_id": orgId })
    .select(
      "users.id",
      "users.organization_id",
      "users.email",
      "users.first_name",
      "users.last_name",
      "users.emp_code",
      "users.designation",
      "users.contact_number",
      "users.role",
      "users.password",
      "dept.name as department_name",
    )
    .first();

  if (!user) throw new NotFoundError("User");

  return {
    empcloud_user_id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    emp_code: user.emp_code,
    designation: user.designation,
    department_name: user.department_name,
    role: user.role,
    contact_number: user.contact_number,
    password: user.password,
  };
}

// ---------------------------------------------------------------------------
// Enable user for a module
// ---------------------------------------------------------------------------

export async function enableUserForModule(
  orgId: number,
  moduleId: number,
  userId: number,
  assignedBy: number,
): Promise<{ seat: any; sync_status: string }> {
  const db = getDB();

  // Verify subscription exists
  const sub = await db("org_subscriptions")
    .where({ organization_id: orgId, module_id: moduleId })
    .whereIn("status", ["active", "trial"])
    .first();
  if (!sub) throw new NotFoundError("Active subscription for this module");

  // #1461 — Enforce seat limit by COUNTing actual seat rows rather than
  // relying on the cached `used_seats` column, which can drift under
  // concurrent assignment. This is the authoritative check that prevents
  // over-assignment even when two admin requests race.
  const [{ seatCount }] = await db("org_module_seats")
    .where({ subscription_id: sub.id })
    .count("* as seatCount");
  const currentSeats = Number(seatCount);
  if (currentSeats >= sub.total_seats) {
    throw new ConflictError(
      `Seat limit exceeded. Current subscription allows ${sub.total_seats} seats; ${currentSeats} are already assigned. Upgrade your subscription to add more.`
    );
  }

  // Check if already assigned
  const existing = await db("org_module_seats")
    .where({ organization_id: orgId, module_id: moduleId, user_id: userId })
    .first();
  if (existing) throw new ConflictError("User already enabled for this module");

  // Create seat
  const [seatId] = await db("org_module_seats").insert({
    subscription_id: sub.id,
    organization_id: orgId,
    module_id: moduleId,
    user_id: userId,
    assigned_by: assignedBy,
    assigned_at: new Date(),
  });

  await db("org_subscriptions").where({ id: sub.id }).increment("used_seats", 1);

  // Call module sync API (non-blocking)
  let syncStatus = "skipped";
  const apiUrl = await getModuleApiUrl(moduleId);
  if (apiUrl) {
    try {
      const payload = await buildSyncPayload(orgId, userId);
      const apiKey = process.env.MODULE_SYNC_API_KEY || process.env.BILLING_API_KEY || "";
      const keySource = process.env.MODULE_SYNC_API_KEY
        ? "MODULE_SYNC_API_KEY"
        : (process.env.BILLING_API_KEY ? "BILLING_API_KEY" : "NONE");
      const mask = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})` : "<empty>");
      logger.info(
        `Module sync → module=${moduleId} url=${apiUrl}/users/sync keySource=${keySource} key=${mask(apiKey)}`,
      );
      const resp = await fetch(`${apiUrl}/users/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      syncStatus = resp.ok ? "synced" : `failed:${resp.status}`;
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.warn(`Module sync failed for module ${moduleId} user ${userId}: ${resp.status} ${body}`);
      }
    } catch (err: any) {
      syncStatus = `error:${err.message}`;
      logger.warn(`Module sync error for module ${moduleId} user ${userId}: ${err.message}`);
    }
  } else {
    logger.warn(`Module sync skipped — no api_url configured for module ${moduleId}`);
  }

  const seat = await db("org_module_seats").where({ id: seatId }).first();
  return { seat, sync_status: syncStatus };
}

// ---------------------------------------------------------------------------
// Disable user for a module
// ---------------------------------------------------------------------------

export async function disableUserForModule(
  orgId: number,
  moduleId: number,
  userId: number,
): Promise<{ sync_status: string }> {
  const db = getDB();

  const seat = await db("org_module_seats")
    .where({ organization_id: orgId, module_id: moduleId, user_id: userId })
    .first();
  if (!seat) throw new NotFoundError("Seat assignment");

  // Call module delete API first (before removing seat)
  let syncStatus = "skipped";
  const apiUrl = await getModuleApiUrl(moduleId);
  if (apiUrl) {
    try {
      const apiKey = process.env.MODULE_SYNC_API_KEY || process.env.BILLING_API_KEY || "";
      const resp = await fetch(`${apiUrl}/users/sync/${userId}`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(10000),
      });
      syncStatus = resp.ok ? "synced" : `failed:${resp.status}`;
      if (!resp.ok) {
        logger.warn(`Module unsync failed for module ${moduleId} user ${userId}: ${resp.status}`);
      }
    } catch (err: any) {
      syncStatus = `error:${err.message}`;
      logger.warn(`Module unsync error for module ${moduleId} user ${userId}: ${err.message}`);
    }
  }

  // Remove seat
  await db("org_module_seats").where({ id: seat.id }).delete();
  await db("org_subscriptions").where({ id: seat.subscription_id }).decrement("used_seats", 1);

  return { sync_status: syncStatus };
}

// ---------------------------------------------------------------------------
// Bulk enable — enable multiple users for a module at once
// ---------------------------------------------------------------------------

export async function bulkEnableUsersForModule(
  orgId: number,
  moduleId: number,
  userIds: number[],
  assignedBy: number,
): Promise<{ enabled: number; skipped: number; errors: number }> {
  let enabled = 0, skipped = 0, errors = 0;

  for (const userId of userIds) {
    try {
      await enableUserForModule(orgId, moduleId, userId, assignedBy);
      enabled++;
    } catch (err: any) {
      if (err.message?.includes("already enabled") || err.message?.includes("already has a seat")) {
        skipped++;
      } else if (err.message?.includes("Seat limit exceeded")) {
        // #1461 — Stop processing once the subscription runs out of seats.
        // Surface the exact limit message so the caller can show it.
        errors++;
        logger.warn(`Bulk enable stopped at user ${userId} module ${moduleId}: ${err.message}`);
        throw err;
      } else {
        errors++;
        logger.warn(`Bulk enable failed for user ${userId} module ${moduleId}: ${err.message}`);
      }
    }
  }

  return { enabled, skipped, errors };
}

// ---------------------------------------------------------------------------
// Get user's module access map — which modules is a user enabled for
// ---------------------------------------------------------------------------

export async function getUserModuleMap(orgId: number, userId: number) {
  const db = getDB();

  const seats = await db("org_module_seats as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId, "s.user_id": userId })
    .select("m.id as module_id", "m.name", "m.slug", "s.assigned_at");

  return seats;
}

// ---------------------------------------------------------------------------
// Get all users with their module access for an org
// ---------------------------------------------------------------------------

export async function getAllUsersModuleMap(orgId: number) {
  const db = getDB();

  const users = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .whereNot("role", "super_admin")
    .select("id", "first_name", "last_name", "email", "emp_code", "designation", "role");

  const allSeats = await db("org_module_seats as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .select("s.user_id", "m.id as module_id", "m.name as module_name", "m.slug as module_slug");

  const seatMap: Record<number, Array<{ module_id: number; module_name: string; module_slug: string }>> = {};
  for (const s of allSeats) {
    if (!seatMap[s.user_id]) seatMap[s.user_id] = [];
    seatMap[s.user_id].push({ module_id: s.module_id, module_name: s.module_name, module_slug: s.module_slug });
  }

  return users.map((u: any) => ({
    ...u,
    modules: seatMap[u.id] || [],
  }));
}

// ---------------------------------------------------------------------------
// Webhook: Module reports a seat (module → EmpCloud)
// Called when a user is added directly inside a module
// ---------------------------------------------------------------------------

export async function handleModuleSeatWebhook(data: {
  module_slug: string;
  empcloud_user_id?: number;
  email?: string;
  organization_id?: number;
  action: "added" | "removed";
}): Promise<void> {
  const db = getDB();

  const mod = await db("modules").where({ slug: data.module_slug }).first();
  if (!mod) throw new NotFoundError(`Module '${data.module_slug}'`);

  // Look up user by empcloud_user_id or email
  let user;
  if (data.empcloud_user_id && data.organization_id) {
    user = await db("users").where({ id: data.empcloud_user_id, organization_id: data.organization_id }).first();
  }
  if (!user && data.email) {
    user = await db("users").where({ email: data.email }).first();
  }
  if (!user) throw new NotFoundError("User");

  const orgId = user.organization_id;

  const sub = await db("org_subscriptions")
    .where({ organization_id: orgId, module_id: mod.id })
    .whereIn("status", ["active", "trial"])
    .first();
  if (!sub) throw new NotFoundError("Active subscription");

  if (data.action === "added") {
    const existing = await db("org_module_seats")
      .where({ organization_id: orgId, module_id: mod.id, user_id: user.id })
      .first();
    if (existing) return;

    await db("org_module_seats").insert({
      subscription_id: sub.id,
      organization_id: orgId,
      module_id: mod.id,
      user_id: user.id,
      assigned_by: user.id,
      assigned_at: new Date(),
    });
    await db("org_subscriptions").where({ id: sub.id }).increment("used_seats", 1);
    logger.info(`Seat registered via webhook: module ${data.module_slug}, user ${user.id} (${user.email})`);

  } else if (data.action === "removed") {
    const seat = await db("org_module_seats")
      .where({ organization_id: orgId, module_id: mod.id, user_id: user.id })
      .first();
    if (!seat) return;

    await db("org_module_seats").where({ id: seat.id }).delete();
    await db("org_subscriptions").where({ id: seat.subscription_id }).decrement("used_seats", 1);
    logger.info(`Seat removed via webhook: module ${data.module_slug}, user ${user.id} (${user.email})`);
  }
}
