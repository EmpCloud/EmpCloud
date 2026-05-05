// =============================================================================
// EMP CLOUD — Leave Configuration Service
//
// Org-level settings that govern how the leave module behaves. Currently
// just `fiscal_year_start_month`; future flags (e.g. encashment policy,
// holiday-aware day counting) will land here too so the Leave Configuration
// page has a single backend service to talk to.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { ValidationError } from "../../utils/errors.js";

export interface LeaveOrgConfig {
  fiscal_year_start_month: number;
  fiscal_year_label_current: string; // e.g. "2025-26"
}

const DEFAULT_FY_START = 4; // April

export async function getLeaveOrgConfig(orgId: number): Promise<LeaveOrgConfig> {
  const db = getDB();
  const org = await db("organizations")
    .where({ id: orgId })
    .select("fiscal_year_start_month")
    .first();
  const startMonth = Number(org?.fiscal_year_start_month) || DEFAULT_FY_START;

  const now = new Date();
  const currentFy =
    now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
  const label =
    startMonth === 1
      ? String(currentFy)
      : `${currentFy}-${String((currentFy + 1) % 100).padStart(2, "0")}`;

  return {
    fiscal_year_start_month: startMonth,
    fiscal_year_label_current: label,
  };
}

export async function updateLeaveOrgConfig(
  orgId: number,
  data: { fiscal_year_start_month: number },
): Promise<LeaveOrgConfig> {
  if (data.fiscal_year_start_month < 1 || data.fiscal_year_start_month > 12) {
    throw new ValidationError("fiscal_year_start_month must be 1-12");
  }
  const db = getDB();
  await db("organizations")
    .where({ id: orgId })
    .update({
      fiscal_year_start_month: data.fiscal_year_start_month,
      updated_at: new Date(),
    });
  return getLeaveOrgConfig(orgId);
}
