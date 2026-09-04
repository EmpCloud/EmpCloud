// =============================================================================
// EMP CLOUD — Organization Access Policy
// One policy seam for direct login and every authenticated API request.
// =============================================================================

import { getOrganizationOverdueStatus } from "../billing/billing-integration.service.js";
import { getDB } from "../../db/connection.js";

export interface OrganizationAccessRecord {
  id: number;
  login_blocked?: boolean | number | null;
  payment_block_enabled?: boolean | number | null;
}

export type OrganizationAccessDecision =
  | { allowed: true; paymentRestricted: boolean }
  | {
      allowed: false;
      code: "LOGIN_BLOCKED" | "PAYMENT_REQUIRED";
      statusCode: 403 | 402;
      message: string;
      paymentRestricted: boolean;
    };

export function isPaymentResolutionRequest(path: string, method: string): boolean {
  const normalizedPath = path.split("?")[0].replace(/\/$/, "");
  const normalizedMethod = method.toUpperCase();

  if (
    normalizedPath === "/api/v1/billing"
    || normalizedPath.startsWith("/api/v1/billing/")
  ) return true;

  if (normalizedMethod !== "GET") return false;
  return new Set([
    "/api/v1/onboarding/status",
    "/api/v1/auth/access-status",
    "/api/v1/subscriptions",
    "/api/v1/subscriptions/billing-summary",
    "/api/v1/subscriptions/billing-status",
    "/api/v1/modules",
  ]).has(normalizedPath);
}

export function decideOrganizationAccess(params: {
  loginBlocked: boolean;
  paymentBlockEnabled: boolean;
  hasOverduePayment: boolean;
  paymentResolutionRequest: boolean;
}): OrganizationAccessDecision {
  if (params.loginBlocked) {
    return {
      allowed: false,
      code: "LOGIN_BLOCKED",
      statusCode: 403,
      message: "Login has been disabled for this organization. Contact support.",
      paymentRestricted: false,
    };
  }

  const paymentRestricted = params.paymentBlockEnabled && params.hasOverduePayment;
  if (paymentRestricted && !params.paymentResolutionRequest) {
    return {
      allowed: false,
      code: "PAYMENT_REQUIRED",
      statusCode: 402,
      message: "Access is restricted until the organization's overdue payment is completed.",
      paymentRestricted: true,
    };
  }

  return { allowed: true, paymentRestricted };
}

const PAYMENT_STATUS_CACHE_TTL_MS = 15_000;
const paymentStatusCache = new Map<number, { overdue: boolean; expiresAt: number }>();

export function clearOrganizationPaymentAccessCache(organizationId: number): void {
  paymentStatusCache.delete(organizationId);
}

export async function hasOverduePayment(
  organizationId: number,
  options: { forceRefresh?: boolean } = {},
): Promise<boolean> {
  const cached = paymentStatusCache.get(organizationId);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.overdue;
  }

  // EMP Billing owns invoices and outstanding balances. Prefer its current
  // result so a restored database or missed webhook cannot leave an overdue
  // organization incorrectly marked active in EmpCloud.
  const billingStatus = await getOrganizationOverdueStatus(organizationId);
  // If a mapped Billing client cannot be checked, keep the explicitly enabled
  // overdue gate closed. Billing is the financial source of truth and the
  // payment-only routes remain reachable while it recovers.
  const overdue = billingStatus !== "clear";

  paymentStatusCache.set(organizationId, {
    overdue,
    expiresAt: Date.now() + PAYMENT_STATUS_CACHE_TTL_MS,
  });
  return overdue;
}

export async function evaluateOrganizationAccess(params: {
  organizationId: number;
  organization?: OrganizationAccessRecord | null;
  path?: string;
  method?: string;
  paymentResolutionRequest?: boolean;
  refreshPaymentStatus?: boolean;
}): Promise<OrganizationAccessDecision> {
  // organization_id=0 is reserved for platform super-admin accounts.
  if (params.organizationId === 0) {
    return { allowed: true, paymentRestricted: false };
  }

  const db = getDB();
  const organization = params.organization === undefined
    ? await db("organizations")
        .where({ id: params.organizationId })
        .select("id", "login_blocked", "payment_block_enabled")
        .first()
    : params.organization;

  // A token whose tenant no longer exists must fail closed.
  if (!organization) {
    return decideOrganizationAccess({
      loginBlocked: true,
      paymentBlockEnabled: false,
      hasOverduePayment: false,
      paymentResolutionRequest: false,
    });
  }

  const loginBlocked = Boolean(organization.login_blocked);
  const paymentBlockEnabled = Boolean(organization.payment_block_enabled);
  const overdue = !loginBlocked && paymentBlockEnabled
    ? await hasOverduePayment(params.organizationId, {
        forceRefresh: params.refreshPaymentStatus,
      })
    : false;

  return decideOrganizationAccess({
    loginBlocked,
    paymentBlockEnabled,
    hasOverduePayment: overdue,
    paymentResolutionRequest: params.paymentResolutionRequest
      ?? isPaymentResolutionRequest(params.path ?? "", params.method ?? "GET"),
  });
}
