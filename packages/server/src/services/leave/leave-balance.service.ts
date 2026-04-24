// =============================================================================
// EMP CLOUD — Leave Balance Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type { LeaveBalance } from "@empcloud/shared";

export async function getBalances(
  orgId: number,
  userId: number,
  year?: number,
): Promise<LeaveBalance[]> {
  const db = getDB();
  const currentYear = year ?? new Date().getFullYear();

  return db("leave_balances")
    .leftJoin("leave_types", "leave_balances.leave_type_id", "leave_types.id")
    .where({
      "leave_balances.organization_id": orgId,
      "leave_balances.user_id": userId,
      "leave_balances.year": currentYear,
    })
    .select(
      "leave_balances.*",
      "leave_types.name as leave_type_name",
      "leave_types.code as leave_type_code",
      "leave_types.color as leave_type_color",
    )
    .orderBy("leave_balances.leave_type_id", "asc");
}

export async function initializeBalances(orgId: number, year: number): Promise<number> {
  const db = getDB();

  // Get all active policies for the org
  const policies = await db("leave_policies")
    .where({ organization_id: orgId, is_active: true });

  // Get all active users in the org
  const users = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id");

  let created = 0;

  for (const user of users) {
    for (const policy of policies) {
      // Check if balance already exists
      const existing = await db("leave_balances")
        .where({
          organization_id: orgId,
          user_id: user.id,
          leave_type_id: policy.leave_type_id,
          year,
        })
        .first();

      if (!existing) {
        // Check carry-forward from previous year
        let carryForward = 0;
        const leaveType = await db("leave_types")
          .where({ id: policy.leave_type_id })
          .first();

        if (leaveType?.is_carry_forward) {
          const prevBalance = await db("leave_balances")
            .where({
              organization_id: orgId,
              user_id: user.id,
              leave_type_id: policy.leave_type_id,
              year: year - 1,
            })
            .first();

          if (prevBalance) {
            carryForward = Math.min(
              Number(prevBalance.balance),
              leaveType.max_carry_forward_days,
            );
          }
        }

        const totalAllocated = Number(policy.annual_quota);
        await db("leave_balances").insert({
          organization_id: orgId,
          user_id: user.id,
          leave_type_id: policy.leave_type_id,
          year,
          total_allocated: totalAllocated,
          total_used: 0,
          total_carry_forward: carryForward,
          balance: totalAllocated + carryForward,
          created_at: new Date(),
          updated_at: new Date(),
        });
        created++;
      }
    }
  }

  return created;
}

export async function deductBalance(
  orgId: number,
  userId: number,
  leaveTypeId: number,
  days: number,
  year?: number,
): Promise<LeaveBalance> {
  const db = getDB();
  const currentYear = year ?? new Date().getFullYear();

  const balance = await db("leave_balances")
    .where({
      organization_id: orgId,
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: currentYear,
    })
    .first();

  if (!balance) throw new NotFoundError("Leave balance");
  if (Number(balance.balance) < days) {
    throw new ValidationError("Insufficient leave balance");
  }

  await db("leave_balances")
    .where({ id: balance.id })
    .update({
      total_used: Number(balance.total_used) + days,
      balance: Number(balance.balance) - days,
      updated_at: new Date(),
    });

  return db("leave_balances").where({ id: balance.id }).first();
}

export async function creditBalance(
  orgId: number,
  userId: number,
  leaveTypeId: number,
  days: number,
  year?: number,
): Promise<LeaveBalance> {
  const db = getDB();
  const currentYear = year ?? new Date().getFullYear();

  const balance = await db("leave_balances")
    .where({
      organization_id: orgId,
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: currentYear,
    })
    .first();

  if (!balance) throw new NotFoundError("Leave balance");

  await db("leave_balances")
    .where({ id: balance.id })
    .update({
      total_used: Math.max(0, Number(balance.total_used) - days),
      balance: Number(balance.balance) + days,
      updated_at: new Date(),
    });

  return db("leave_balances").where({ id: balance.id }).first();
}
