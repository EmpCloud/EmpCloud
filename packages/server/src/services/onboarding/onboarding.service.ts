// =============================================================================
// EMP CLOUD — Onboarding Service
// Guides new organizations through initial setup steps.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { randomHex, hashToken } from "../../utils/crypto.js";
import { TOKEN_DEFAULTS } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const ONBOARDING_STEPS = [
  { step: 1, name: "Company Info", key: "company_info" },
  { step: 2, name: "Departments", key: "departments" },
  { step: 3, name: "Invite Team", key: "invite_team" },
  { step: 4, name: "Choose Modules", key: "choose_modules" },
  { step: 5, name: "Quick Setup", key: "quick_setup" },
];

// ---------------------------------------------------------------------------
// Get onboarding status
// ---------------------------------------------------------------------------

export async function getOnboardingStatus(orgId: number) {
  const db = getDB();
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) throw new NotFoundError("Organization");

  const currentStep = org.onboarding_step || 0;

  return {
    completed: !!org.onboarding_completed,
    currentStep,
    steps: ONBOARDING_STEPS.map((s) => ({
      step: s.step,
      name: s.name,
      key: s.key,
      completed: s.step <= currentStep,
    })),
  };
}

// ---------------------------------------------------------------------------
// Complete a step
// ---------------------------------------------------------------------------

export async function completeStep(
  orgId: number,
  userId: number,
  step: number,
  data: Record<string, any>
) {
  const db = getDB();

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) throw new NotFoundError("Organization");

  if (step < 1 || step > 5) {
    throw new ValidationError("Invalid onboarding step. Must be 1-5.");
  }

  switch (step) {
    case 1:
      await handleCompanyInfo(orgId, data);
      break;
    case 2:
      await handleDepartments(orgId, data);
      break;
    case 3:
      await handleInviteTeam(orgId, userId, data);
      break;
    case 4:
      await handleChooseModules(orgId, userId, data);
      break;
    case 5:
      await handleQuickSetup(orgId, data);
      break;
  }

  // Advance the step pointer if this is beyond the current step
  const newStep = Math.max(org.onboarding_step || 0, step);
  await db("organizations").where({ id: orgId }).update({
    onboarding_step: newStep,
    updated_at: new Date(),
  });

  logger.info(`Onboarding step ${step} completed for org ${orgId}`);

  return getOnboardingStatus(orgId);
}

// ---------------------------------------------------------------------------
// Step 1: Company Info
// ---------------------------------------------------------------------------

async function handleCompanyInfo(orgId: number, data: Record<string, any>) {
  const db = getDB();

  const updatePayload: Record<string, any> = { updated_at: new Date() };

  if (data.timezone) updatePayload.timezone = data.timezone;
  if (data.country) updatePayload.country = data.country;
  if (data.state) updatePayload.state = data.state;
  if (data.city) updatePayload.city = data.city;
  if (data.logo) updatePayload.logo = data.logo;
  if (data.name) updatePayload.name = data.name;
  if (data.contact_number) updatePayload.contact_number = data.contact_number;
  if (data.website) updatePayload.website = data.website;
  if (data.address) updatePayload.address_line1 = data.address;
  if (data.address_line1) updatePayload.address_line1 = data.address_line1;

  await db("organizations").where({ id: orgId }).update(updatePayload);
}

// ---------------------------------------------------------------------------
// Step 2: Departments
// ---------------------------------------------------------------------------

async function handleDepartments(orgId: number, data: Record<string, any>) {
  const db = getDB();

  const departments: string[] = data.departments;
  if (!Array.isArray(departments) || departments.length === 0) {
    throw new ValidationError("At least one department name is required");
  }

  // Get existing departments to avoid duplicates
  const existing = await db("organization_departments")
    .where({ organization_id: orgId, is_deleted: false })
    .select("name");
  const existingNames = new Set(existing.map((d: any) => d.name.toLowerCase()));

  const toInsert = departments
    .filter((name) => name.trim() && !existingNames.has(name.trim().toLowerCase()))
    .map((name) => ({
      organization_id: orgId,
      name: name.trim(),
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    }));

  if (toInsert.length > 0) {
    await db("organization_departments").insert(toInsert);
  }
}

// ---------------------------------------------------------------------------
// Step 3: Invite Team
// ---------------------------------------------------------------------------

async function handleInviteTeam(orgId: number, userId: number, data: Record<string, any>) {
  const db = getDB();

  const invitations: Array<{ email: string; role?: string }> = data.invitations;
  if (!Array.isArray(invitations) || invitations.length === 0) {
    return; // It's okay to skip invitations
  }

  for (const inv of invitations) {
    if (!inv.email || !inv.email.trim()) continue;

    // Skip if user already exists
    const existingUser = await db("users").where({ email: inv.email.trim() }).first();
    if (existingUser) continue;

    // Skip if invitation already pending
    const existingInv = await db("invitations")
      .where({ organization_id: orgId, email: inv.email.trim(), status: "pending" })
      .first();
    if (existingInv) continue;

    const token = randomHex(32);
    const expiresAt = new Date(Date.now() + TOKEN_DEFAULTS.INVITATION_EXPIRY * 1000);

    await db("invitations").insert({
      organization_id: orgId,
      email: inv.email.trim(),
      role: inv.role || "employee",
      invited_by: userId,
      token_hash: hashToken(token),
      status: "pending",
      expires_at: expiresAt,
      created_at: new Date(),
    });
  }
}

// ---------------------------------------------------------------------------
// Step 4: Choose Modules
// ---------------------------------------------------------------------------

async function handleChooseModules(orgId: number, userId: number, data: Record<string, any>) {
  const db = getDB();

  const moduleIds: number[] = data.module_ids;
  if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
    return; // It's okay to skip module selection
  }

  for (const moduleId of moduleIds) {
    // Check if already subscribed
    const existing = await db("org_subscriptions")
      .where({ organization_id: orgId, module_id: moduleId })
      .whereNot({ status: "cancelled" })
      .first();
    if (existing) continue;

    // Get module info
    const mod = await db("modules").where({ id: moduleId, is_active: true }).first();
    if (!mod) continue;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Create trial subscription
    const trialEndsAt = new Date(now.getTime() + 14 * 86400000); // 14-day trial

    await db("org_subscriptions").insert({
      organization_id: orgId,
      module_id: moduleId,
      plan_tier: "basic",
      status: "trial",
      total_seats: 10,
      used_seats: 0,
      billing_cycle: "monthly",
      price_per_seat: 0,
      currency: "USD",
      trial_ends_at: trialEndsAt,
      current_period_start: now,
      current_period_end: periodEnd,
      created_at: now,
      updated_at: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Step 5: Quick Setup (Leave types + Attendance shift)
// ---------------------------------------------------------------------------

async function handleQuickSetup(orgId: number, data: Record<string, any>) {
  const db = getDB();

  // Create default leave types if provided
  if (data.leave_types && Array.isArray(data.leave_types)) {
    for (const lt of data.leave_types) {
      // Check if already exists
      const existing = await db("leave_types")
        .where({ organization_id: orgId, code: lt.code })
        .first();
      if (existing) continue;

      const [leaveTypeId] = await db("leave_types").insert({
        organization_id: orgId,
        name: lt.name,
        code: lt.code,
        description: lt.description || null,
        is_paid: lt.is_paid !== false,
        is_carry_forward: lt.is_carry_forward || false,
        max_carry_forward_days: lt.max_carry_forward_days || 0,
        is_encashable: lt.is_encashable || false,
        requires_approval: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Also create a leave policy for the type
      if (lt.annual_quota) {
        await db("leave_policies").insert({
          organization_id: orgId,
          leave_type_id: leaveTypeId,
          name: `${lt.name} Policy`,
          annual_quota: lt.annual_quota,
          accrual_type: "annual",
          applicable_from_months: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  }

  // Create default shift if provided
  if (data.shift) {
    const existingShift = await db("shifts")
      .where({ organization_id: orgId, is_default: true })
      .first();

    if (!existingShift) {
      await db("shifts").insert({
        organization_id: orgId,
        name: data.shift.name || "General Shift",
        start_time: data.shift.start_time || "09:00:00",
        end_time: data.shift.end_time || "18:00:00",
        break_minutes: data.shift.break_minutes || 60,
        grace_minutes_late: data.shift.grace_minutes_late || 15,
        grace_minutes_early: data.shift.grace_minutes_early || 15,
        is_night_shift: false,
        is_default: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Complete onboarding
// ---------------------------------------------------------------------------

export async function completeOnboarding(orgId: number) {
  const db = getDB();

  await db("organizations").where({ id: orgId }).update({
    onboarding_completed: true,
    updated_at: new Date(),
  });

  logger.info(`Onboarding completed for org ${orgId}`);
  return { completed: true };
}

// ---------------------------------------------------------------------------
// Skip onboarding (mark as complete without finishing all steps)
// ---------------------------------------------------------------------------

export async function skipOnboarding(orgId: number) {
  const db = getDB();

  await db("organizations").where({ id: orgId }).update({
    onboarding_completed: true,
    updated_at: new Date(),
  });

  logger.info(`Onboarding skipped for org ${orgId}`);
  return { completed: true, skipped: true };
}
