// =============================================================================
// EMP CLOUD — Employee Profile Service
// Profile queries, directory, birthdays, anniversaries, headcount.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import type { UpsertEmployeeProfileInput } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Get Profile (user + extended profile)
// ---------------------------------------------------------------------------

export async function getProfile(orgId: number, userId: number) {
  const db = getDB();
  const row = await db("users")
    .leftJoin("employee_profiles", function () {
      this.on("users.id", "employee_profiles.user_id").andOn(
        "employee_profiles.organization_id",
        db.raw("?", [orgId])
      );
    })
    .leftJoin("users as manager", "users.reporting_manager_id", "manager.id")
    .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
    .where({ "users.id": userId, "users.organization_id": orgId })
    .select(
      "users.id",
      "users.organization_id",
      "users.first_name",
      "users.last_name",
      "users.email",
      "users.emp_code",
      "users.contact_number",
      "users.date_of_birth",
      "users.gender",
      "users.date_of_joining",
      "users.date_of_exit",
      "users.designation",
      "users.department_id",
      "users.location_id",
      "users.reporting_manager_id",
      "users.employment_type",
      "users.photo_path",
      "users.role",
      "users.status",
      db.raw("CONCAT(manager.first_name, ' ', manager.last_name) as reporting_manager_name"),
      "organization_departments.name as department_name",
      "employee_profiles.personal_email",
      "employee_profiles.emergency_contact_name",
      "employee_profiles.emergency_contact_phone",
      "employee_profiles.emergency_contact_relation",
      "employee_profiles.blood_group",
      "employee_profiles.marital_status",
      "employee_profiles.nationality",
      "employee_profiles.aadhar_number",
      "employee_profiles.pan_number",
      "employee_profiles.uan_number",
      "employee_profiles.passport_number",
      "employee_profiles.passport_expiry",
      "employee_profiles.visa_status",
      "employee_profiles.visa_expiry",
      "employee_profiles.probation_start_date",
      "employee_profiles.probation_end_date",
      "employee_profiles.confirmation_date",
      "employee_profiles.notice_period_days"
    )
    .first();

  if (!row) throw new NotFoundError("Employee");

  // #1423 — include the current active shift assignment (if any) so the
  // client can show + edit it. Picked from the most recent assignment where
  // effective_to is null or in the future.
  const today = new Date();
  const currentShift = await db("shift_assignments")
    .leftJoin("shifts", "shift_assignments.shift_id", "shifts.id")
    .where({ "shift_assignments.organization_id": orgId, "shift_assignments.user_id": userId })
    .andWhere((qb) => {
      qb.whereNull("shift_assignments.effective_to").orWhere(
        "shift_assignments.effective_to",
        ">=",
        today,
      );
    })
    .orderBy("shift_assignments.effective_from", "desc")
    .select(
      "shift_assignments.shift_id",
      "shifts.name as shift_name",
    )
    .first();

  return {
    ...row,
    shift_id: currentShift?.shift_id ?? null,
    shift_name: currentShift?.shift_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Upsert Profile (insert or update on duplicate user_id)
// ---------------------------------------------------------------------------

export async function upsertProfile(
  orgId: number,
  userId: number,
  data: UpsertEmployeeProfileInput & { reporting_manager_id?: number | string | null },
  // #1423 — actor for audit trails on derived writes (shift assignments).
  // Optional so older callers keep working; defaults to the target user.
  actorUserId?: number,
  // #1423 / #1424 — whether the caller has HR privileges. When the caller is
  // editing their OWN profile without HR, we silently drop department/shift/
  // designation changes so employees can't reassign themselves.
  isHR: boolean = true,
) {
  const db = getDB();

  // Verify user belongs to org
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("Employee");

  // #1403 — gender, date_of_birth, contact_number, reporting_manager_id live
  // on the users table, not employee_profiles. Split them out of the profile
  // payload and apply them with a single users-table update.
  //
  // #1423 / #1424 — department_id and designation are also users-table columns
  // edited from the profile form; they follow the same split pattern. shift_id
  // does NOT live on users (it's a shift_assignments row) so it's handled
  // separately below.
  const {
    reporting_manager_id,
    gender,
    date_of_birth,
    contact_number,
    department_id,
    designation,
    shift_id,
    ...profileData
  } = data as any;

  const userUpdate: Record<string, unknown> = {};
  if (reporting_manager_id !== undefined && isHR) {
    userUpdate.reporting_manager_id = reporting_manager_id ? Number(reporting_manager_id) : null;
  }
  if (gender !== undefined) userUpdate.gender = gender || null;
  if (date_of_birth !== undefined) userUpdate.date_of_birth = date_of_birth || null;
  if (contact_number !== undefined) userUpdate.contact_number = contact_number || null;
  // #1423 — department is HR-only. Self-service employees cannot change their
  // own department.
  if (department_id !== undefined && isHR) {
    userUpdate.department_id = department_id ? Number(department_id) : null;
  }
  // #1424 — designation: HR can change freely. Employees can see it read-only
  // but cannot edit (matches the #1423/#1424 ticket's "be conservative"
  // guidance — employees shouldn't arbitrarily rename their role).
  if (designation !== undefined && isHR) userUpdate.designation = designation || null;

  if (Object.keys(userUpdate).length > 0) {
    userUpdate.updated_at = new Date();
    await db("users")
      .where({ id: userId, organization_id: orgId })
      .update(userUpdate);
  }

  // #1423 — shift assignment is HR-only. When a shift_id is supplied, end any
  // current assignment (effective_to = today) and create a new one starting
  // today. If shift_id is explicitly null, we end the current assignment but
  // don't create a new one.
  if (shift_id !== undefined && isHR) {
    const today = new Date();
    await db("shift_assignments")
      .where({ organization_id: orgId, user_id: userId })
      .whereNull("effective_to")
      .update({ effective_to: today, updated_at: today });

    if (shift_id) {
      await db("shift_assignments").insert({
        organization_id: orgId,
        user_id: userId,
        shift_id: Number(shift_id),
        effective_from: today,
        effective_to: null,
        created_by: actorUserId ?? userId,
        created_at: today,
        updated_at: today,
      });
    }
  }

  const existing = await db("employee_profiles")
    .where({ user_id: userId, organization_id: orgId })
    .first();

  if (existing) {
    await db("employee_profiles")
      .where({ id: existing.id })
      .update({ ...profileData, updated_at: new Date() });
  } else {
    await db("employee_profiles").insert({
      organization_id: orgId,
      user_id: userId,
      ...profileData,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  return getProfile(orgId, userId);
}

// ---------------------------------------------------------------------------
// Directory (paginated, searchable, filterable)
// ---------------------------------------------------------------------------

export async function getDirectory(
  orgId: number,
  params: {
    page?: number;
    per_page?: number;
    search?: string;
    department_id?: number;
    location_id?: number;
    role?: string;
    status?: number;
  }
) {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.per_page || 20;

  let query = db("users")
    .leftJoin("organization_departments", "users.department_id", "organization_departments.id")
    .where({ "users.organization_id": orgId });

  // Default to active employees only (status=1) to match dashboard count
  if (params.status !== undefined) {
    query = query.where("users.status", params.status);
  } else {
    query = query.where("users.status", 1);
  }

  if (params.search) {
    const s = `%${params.search}%`;
    query = query.where(function () {
      this.where("users.first_name", "like", s)
        .orWhere("users.last_name", "like", s)
        .orWhere("users.email", "like", s)
        .orWhere("users.designation", "like", s)
        .orWhere("organization_departments.name", "like", s)
        .orWhereRaw("CONCAT(users.first_name, ' ', users.last_name) LIKE ?", [s]);
    });
  }

  if (params.department_id) {
    query = query.where("users.department_id", params.department_id);
  }

  if (params.location_id) {
    query = query.where("users.location_id", params.location_id);
  }

  if (params.role) {
    query = query.where("users.role", params.role);
  }

  const [{ count }] = await query.clone().count("* as count");
  const users = await query
    .select(
      "users.id",
      "users.first_name",
      "users.last_name",
      "users.email",
      "users.emp_code",
      "users.designation",
      "users.department_id",
      "users.location_id",
      "users.photo_path",
      "users.status",
      "users.role",
      "users.date_of_joining",
      "organization_departments.name as department_name"
    )
    .orderBy("users.first_name", "asc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { users, total: Number(count) };
}

// ---------------------------------------------------------------------------
// Birthdays — users with date_of_birth in next 30 days
// ---------------------------------------------------------------------------

export async function getBirthdays(orgId: number) {
  const db = getDB();
  const today = new Date();
  const dayOfYear = getDayOfYear(today);
  const targetDay = dayOfYear + 30;

  // Handle year wrap-around
  if (targetDay <= 366) {
    return db("users")
      .where({ organization_id: orgId, status: 1 })
      .whereNotNull("date_of_birth")
      .whereRaw(
        "DAYOFYEAR(date_of_birth) >= ? AND DAYOFYEAR(date_of_birth) <= ?",
        [dayOfYear, targetDay]
      )
      .select(
        "id",
        "first_name",
        "last_name",
        "date_of_birth",
        "photo_path",
        "department_id"
      )
      .orderByRaw("DAYOFYEAR(date_of_birth) ASC");
  }

  return db("users")
    .where({ organization_id: orgId, status: 1 })
    .whereNotNull("date_of_birth")
    .where(function () {
      this.whereRaw("DAYOFYEAR(date_of_birth) >= ?", [dayOfYear]).orWhereRaw(
        "DAYOFYEAR(date_of_birth) <= ?",
        [targetDay - 366]
      );
    })
    .select(
      "id",
      "first_name",
      "last_name",
      "date_of_birth",
      "photo_path",
      "department_id"
    )
    .orderByRaw("DAYOFYEAR(date_of_birth) ASC");
}

// ---------------------------------------------------------------------------
// Anniversaries — users with date_of_joining anniversary in next 30 days
// ---------------------------------------------------------------------------

export async function getAnniversaries(orgId: number) {
  const db = getDB();
  const today = new Date();
  const dayOfYear = getDayOfYear(today);
  const targetDay = dayOfYear + 30;

  if (targetDay <= 366) {
    return db("users")
      .where({ organization_id: orgId, status: 1 })
      .whereNotNull("date_of_joining")
      .whereRaw(
        "DAYOFYEAR(date_of_joining) >= ? AND DAYOFYEAR(date_of_joining) <= ?",
        [dayOfYear, targetDay]
      )
      .select(
        "id",
        "first_name",
        "last_name",
        "date_of_joining",
        "photo_path",
        "department_id"
      )
      .orderByRaw("DAYOFYEAR(date_of_joining) ASC");
  }

  return db("users")
    .where({ organization_id: orgId, status: 1 })
    .whereNotNull("date_of_joining")
    .where(function () {
      this.whereRaw("DAYOFYEAR(date_of_joining) >= ?", [
        dayOfYear,
      ]).orWhereRaw("DAYOFYEAR(date_of_joining) <= ?", [targetDay - 366]);
    })
    .select(
      "id",
      "first_name",
      "last_name",
      "date_of_joining",
      "photo_path",
      "department_id"
    )
    .orderByRaw("DAYOFYEAR(date_of_joining) ASC");
}

// ---------------------------------------------------------------------------
// Headcount — GROUP BY department_id
// ---------------------------------------------------------------------------

export async function getHeadcount(orgId: number) {
  const db = getDB();
  return db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("department_id")
    .count("* as count")
    .groupBy("department_id");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
