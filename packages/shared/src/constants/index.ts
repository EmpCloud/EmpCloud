// =============================================================================
// EMP CLOUD — Shared Constants
// =============================================================================

import { PlanTier } from "../types/index.js";

// ---------------------------------------------------------------------------
// Default module definitions (seed data reference)
// ---------------------------------------------------------------------------

// Sellable modules (available in the marketplace)
// NOTE: EMP HRMS is NOT a module — it's the core platform (EMP Cloud = HRMS)
// NOTE: EMP Billing is NOT a module — it's the internal billing engine for EMP Cloud
export const DEFAULT_MODULES = [
  { slug: "emp-payroll", name: "EMP Payroll", description: "Payroll processing, tax computation & compliance" },
  { slug: "emp-monitor", name: "EMP Monitor", description: "Employee activity & productivity monitoring" },
  { slug: "emp-recruit", name: "EMP Recruit", description: "Applicant tracking & hiring pipeline" },
  { slug: "emp-field", name: "EMP Field", description: "Field force GPS check-in & route optimization" },
  { slug: "emp-biometrics", name: "EMP Biometrics", description: "Biometric authentication & facial recognition" },
  { slug: "emp-projects", name: "EMP Projects", description: "Project management & time tracking" },
  { slug: "emp-rewards", name: "EMP Rewards", description: "Employee recognition, badges & kudos" },
  { slug: "emp-performance", name: "EMP Performance", description: "Performance reviews, OKRs & succession planning" },
  { slug: "emp-exit", name: "EMP Exit", description: "Exit management & full-final settlement" },
  { slug: "emp-lms", name: "EMP LMS", description: "Learning management, courses, certifications & compliance training" },
] as const;

// ---------------------------------------------------------------------------
// OAuth2 Scopes
// ---------------------------------------------------------------------------

export const OAUTH_SCOPES = {
  OPENID: "openid",
  PROFILE: "profile",
  EMAIL: "email",
  // Module-level scopes (generated per module)
  moduleAccess: (slug: string) => `${slug}:access`,
  moduleAdmin: (slug: string) => `${slug}:admin`,
  moduleRead: (slug: string) => `${slug}:read`,
  moduleWrite: (slug: string) => `${slug}:write`,
} as const;

export const STANDARD_SCOPES = ["openid", "profile", "email"] as const;

// ---------------------------------------------------------------------------
// Plan Tier Hierarchy (higher number = more features)
// ---------------------------------------------------------------------------

export const PLAN_TIER_LEVEL: Record<PlanTier, number> = {
  [PlanTier.FREE]: 0,
  [PlanTier.BASIC]: 1,
  [PlanTier.PROFESSIONAL]: 2,
  [PlanTier.ENTERPRISE]: 3,
};

// ---------------------------------------------------------------------------
// Token Expiry Defaults (seconds)
// ---------------------------------------------------------------------------

export const TOKEN_DEFAULTS = {
  ACCESS_TOKEN_EXPIRY: 15 * 60, // 15 minutes
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days
  AUTH_CODE_EXPIRY: 10 * 60, // 10 minutes
  ID_TOKEN_EXPIRY: 60 * 60, // 1 hour
  INVITATION_EXPIRY: 7 * 24 * 60 * 60, // 7 days
  PASSWORD_RESET_EXPIRY: 60 * 60, // 1 hour
} as const;

// ---------------------------------------------------------------------------
// Role Hierarchy (higher level = more access)
// ---------------------------------------------------------------------------

import { UserRole } from "../types/index.js";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ORG_ADMIN]: 80,
  [UserRole.HR_ADMIN]: 60,
  [UserRole.HR_MANAGER]: 40,
  [UserRole.MANAGER]: 20,
  [UserRole.EMPLOYEE]: 0,
};

// ---------------------------------------------------------------------------
// Rate Limiting Defaults
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  AUTH: { max: 20, windowMs: 15 * 60 * 1000 },
  API: { max: 100, windowMs: 60 * 1000 },
  OAUTH: { max: 50, windowMs: 15 * 60 * 1000 },
} as const;

// ---------------------------------------------------------------------------
// Password Policy
// ---------------------------------------------------------------------------

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  BCRYPT_ROUNDS: 12,
} as const;

// ---------------------------------------------------------------------------
// Pagination Defaults
// ---------------------------------------------------------------------------

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PER_PAGE: 20,
  MAX_PER_PAGE: 100,
} as const;
