// =============================================================================
// EMP CLOUD — Module Webhook Service
// Handles inbound lifecycle events from sub-modules (recruit, exit, performance,
// rewards, etc.) and takes appropriate action in the Cloud identity layer.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import { logAudit } from "../audit/audit.service.js";
import { AuditAction } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleModuleWebhook(
  event: string,
  data: Record<string, any>,
  source?: string,
): Promise<void> {
  logger.info(`Module webhook received: ${event} from ${source || "unknown"}`, { data });

  switch (event) {
    case "recruit.candidate_hired":
      await handleCandidateHired(data);
      break;

    case "exit.initiated":
      await handleExitInitiated(data);
      break;

    case "exit.completed":
      await handleExitCompleted(data);
      break;

    case "performance.cycle_completed":
      await handlePerformanceCycleCompleted(data);
      break;

    case "rewards.milestone_achieved":
      await handleRewardsMilestoneAchieved(data);
      break;

    default:
      logger.warn(`Unhandled module webhook event: ${event}`);
  }
}

// ---------------------------------------------------------------------------
// recruit.candidate_hired
// ---------------------------------------------------------------------------

async function handleCandidateHired(data: Record<string, any>): Promise<void> {
  const { employeeId, candidateId, jobTitle, joiningDate } = data;
  const db = getDB();

  if (employeeId) {
    // Update existing user — set active and joining date
    const user = await db("users").where({ id: employeeId }).first();
    if (user) {
      await db("users").where({ id: employeeId }).update({
        status: 1,
        designation: jobTitle || user.designation,
        date_of_joining: joiningDate || null,
        updated_at: new Date(),
      });
      logger.info(`User ${employeeId} activated via recruit.candidate_hired`);
    } else {
      logger.warn(`recruit.candidate_hired: user ${employeeId} not found — skipping`);
    }
  }

  await logAudit({
    organizationId: null,
    action: AuditAction.CANDIDATE_HIRED,
    resourceType: "user",
    resourceId: employeeId ? String(employeeId) : candidateId,
    details: { event: "recruit.candidate_hired", candidateId, jobTitle, joiningDate },
  });
}

// ---------------------------------------------------------------------------
// exit.initiated
// ---------------------------------------------------------------------------

async function handleExitInitiated(data: Record<string, any>): Promise<void> {
  const { employeeId, exitType, lastWorkingDate } = data;

  await logAudit({
    organizationId: null,
    userId: employeeId ? Number(employeeId) : null,
    action: AuditAction.EXIT_INITIATED,
    resourceType: "user",
    resourceId: employeeId ? String(employeeId) : undefined,
    details: { event: "exit.initiated", exitType, lastWorkingDate },
  });

  logger.info(`Exit initiated for employee ${employeeId}, type=${exitType}`);
}

// ---------------------------------------------------------------------------
// exit.completed
// ---------------------------------------------------------------------------

async function handleExitCompleted(data: Record<string, any>): Promise<void> {
  const { employeeId, exitType, lastWorkingDate } = data;
  const db = getDB();

  if (employeeId) {
    try {
      await db("users").where({ id: employeeId }).update({
        status: 2,
        date_of_exit: lastWorkingDate || new Date().toISOString().split("T")[0],
        updated_at: new Date(),
      });
      logger.info(`User ${employeeId} set to inactive (2) via exit.completed`);
    } catch (err) {
      logger.error(`Failed to deactivate user ${employeeId} on exit.completed:`, err);
    }
  }

  await logAudit({
    organizationId: null,
    userId: employeeId ? Number(employeeId) : null,
    action: AuditAction.EXIT_COMPLETED,
    resourceType: "user",
    resourceId: employeeId ? String(employeeId) : undefined,
    details: { event: "exit.completed", exitType, lastWorkingDate },
  });
}

// ---------------------------------------------------------------------------
// performance.cycle_completed
// ---------------------------------------------------------------------------

async function handlePerformanceCycleCompleted(data: Record<string, any>): Promise<void> {
  const { cycleId, cycleName, participantCount } = data;

  await logAudit({
    organizationId: null,
    action: AuditAction.PERFORMANCE_CYCLE_COMPLETED,
    resourceType: "review_cycle",
    resourceId: cycleId ? String(cycleId) : undefined,
    details: { event: "performance.cycle_completed", cycleName, participantCount },
  });

  logger.info(`Performance cycle completed: ${cycleName} (${participantCount} participants)`);
}

// ---------------------------------------------------------------------------
// rewards.milestone_achieved
// ---------------------------------------------------------------------------

async function handleRewardsMilestoneAchieved(data: Record<string, any>): Promise<void> {
  const { employeeId, milestoneName, pointsAwarded } = data;

  await logAudit({
    organizationId: null,
    userId: employeeId ? Number(employeeId) : null,
    action: AuditAction.REWARDS_MILESTONE_ACHIEVED,
    resourceType: "milestone",
    resourceId: employeeId ? String(employeeId) : undefined,
    details: { event: "rewards.milestone_achieved", milestoneName, pointsAwarded },
  });

  logger.info(`Milestone achieved: ${milestoneName} for employee ${employeeId} (+${pointsAwarded} pts)`);
}
