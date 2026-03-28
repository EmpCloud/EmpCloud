// =============================================================================
// EMP CLOUD — Shared Zod Validators
// Request validation schemas used by both server and client.
// =============================================================================

import { z } from "zod";
import {
  UserRole,
  PlanTier,
  BillingCycle,
  SubscriptionStatus,
  EmploymentType,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string to prevent stored XSS */
const stripHtml = (val: string) => val.replace(/<[^>]*>/g, "").trim();

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).default("asc"),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  // Organization
  org_name: z.string().min(2).max(100).transform(stripHtml),
  org_legal_name: z.string().max(255).optional().transform(val => val ? stripHtml(val) : val),
  org_country: z.string().min(2).max(55).default("IN"),
  org_state: z.string().max(55).optional().transform(val => val ? stripHtml(val) : val),
  org_timezone: z.string().max(50).optional(),
  org_email: z.string().email().optional(),
  // Admin user
  first_name: z.string().min(1).max(64).transform(stripHtml),
  last_name: z.string().min(1).max(64).transform(stripHtml),
  email: z.string().email().max(128),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

export const oauthAuthorizeSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().min(1),
  state: z.string().min(1),
  code_challenge: z.string().min(43).max(128).optional(),
  code_challenge_method: z.enum(["S256", "plain"]).optional(),
  nonce: z.string().optional(),
});

export const oauthTokenSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().url(),
    client_id: z.string().min(1),
    client_secret: z.string().optional(),
    code_verifier: z.string().min(43).max(128).optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    client_secret: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal("client_credentials"),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    scope: z.string().optional(),
  }),
]);

export const oauthRevokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
});

export const oauthIntrospectSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export const updateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  legal_name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  contact_number: z.string().max(20).optional(),
  website: z.string().url().max(255).optional(),
  timezone: z.string().max(50).optional(),
  country: z.string().max(55).optional(),
  state: z.string().max(55).optional(),
  city: z.string().max(55).optional(),
  zipcode: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
  language: z.string().max(10).optional(),
  weekday_start: z.string().max(10).optional(),
});

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  first_name: z.string().min(1).max(64),
  last_name: z.string().min(1).max(64),
  email: z.string().email().max(128),
  password: z.string().min(8).max(128).optional(),
  role: z.nativeEnum(UserRole).default(UserRole.EMPLOYEE),
  emp_code: z.string().max(50).optional(),
  contact_number: z.string().max(20).optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().max(10).optional(),
  date_of_joining: z.string().optional(),
  designation: z.string().max(100).optional(),
  department_id: z.number().int().positive().optional(),
  location_id: z.number().int().positive().optional(),
  reporting_manager_id: z.number().int().positive().optional(),
  employment_type: z.nativeEnum(EmploymentType).default(EmploymentType.FULL_TIME),
  date_of_exit: z.string().optional(),
  phone: z.string().max(20).optional(),
  employee_code: z.string().max(50).optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).strict();

export const inviteUserSchema = z.object({
  email: z.string().email().max(128),
  role: z.nativeEnum(UserRole).default(UserRole.EMPLOYEE),
  first_name: z.string().min(1).max(64).optional(),
  last_name: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// Departments & Locations
// ---------------------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createLocationSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(1000).optional(),
  timezone: z.string().max(50).optional(),
});

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export const createModuleSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  base_url: z.string().url(),
  icon: z.string().max(255).optional(),
  has_free_tier: z.boolean().default(false),
});

export const updateModuleSchema = createModuleSchema.partial();

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export const createSubscriptionSchema = z.object({
  module_id: z.number().int().positive(),
  plan_tier: z.nativeEnum(PlanTier),
  total_seats: z.number().int().min(1),
  billing_cycle: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
  trial_days: z.number().int().min(0).max(90).default(0),
});

export const updateSubscriptionSchema = z.object({
  plan_tier: z.nativeEnum(PlanTier).optional(),
  total_seats: z.number().int().min(1).optional(),
  billing_cycle: z.nativeEnum(BillingCycle).optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
});

export const assignSeatSchema = z.object({
  user_id: z.number().int().positive(),
  module_id: z.number().int().positive(),
});

export const checkAccessSchema = z.object({
  user_id: z.number().int().positive(),
  module_slug: z.string().min(1),
});

// ---------------------------------------------------------------------------
// OAuth Client Registration (admin)
// ---------------------------------------------------------------------------

export const createOAuthClientSchema = z.object({
  name: z.string().min(2).max(100),
  module_id: z.number().int().positive().optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  allowed_scopes: z.array(z.string()).min(1),
  grant_types: z.array(z.string()).min(1),
  is_confidential: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Type exports for inferred types
// ---------------------------------------------------------------------------

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthAuthorizeInput = z.infer<typeof oauthAuthorizeSchema>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreateOAuthClientInput = z.infer<typeof createOAuthClientSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// HRMS — Employee Profile Validators
// ---------------------------------------------------------------------------

export const upsertEmployeeProfileSchema = z.object({
  personal_email: z.string().email().optional().nullable(),
  emergency_contact_name: z.string().max(128).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  emergency_contact_relation: z.string().max(50).optional().nullable(),
  blood_group: z.string().max(5).optional().nullable(),
  marital_status: z.enum(["single", "married", "divorced", "widowed"]).optional().nullable(),
  nationality: z.string().max(55).optional().nullable(),
  aadhar_number: z.string().length(12).optional().nullable(),
  pan_number: z.string().length(10).optional().nullable(),
  passport_number: z.string().max(20).optional().nullable(),
  passport_expiry: z.string().optional().nullable(),
  visa_status: z.string().max(50).optional().nullable(),
  visa_expiry: z.string().optional().nullable(),
  probation_start_date: z.string().optional().nullable(),
  probation_end_date: z.string().optional().nullable(),
  confirmation_date: z.string().optional().nullable(),
  notice_period_days: z.number().int().min(0).optional().nullable(),
});

export const createAddressSchema = z.object({
  type: z.enum(["current", "permanent"]),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional().nullable(),
  city: z.string().min(1).max(55),
  state: z.string().min(1).max(55),
  country: z.string().max(55).default("IN"),
  zipcode: z.string().min(1).max(20),
});

export const createEducationSchema = z.object({
  degree: z.string().min(1).max(100),
  institution: z.string().min(1).max(255),
  field_of_study: z.string().max(100).optional().nullable(),
  start_year: z.number().int().min(1950).max(2100).optional().nullable(),
  end_year: z.number().int().min(1950).max(2100).optional().nullable(),
  grade: z.string().max(20).optional().nullable(),
});

export const createExperienceSchema = z.object({
  company_name: z.string().min(1).max(255),
  designation: z.string().min(1).max(100),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
  is_current: z.boolean().default(false),
  description: z.string().optional().nullable(),
});

export const createDependentSchema = z.object({
  name: z.string().min(1).max(128),
  relationship: z.string().min(1).max(50),
  date_of_birth: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  is_nominee: z.boolean().default(false),
  nominee_percentage: z.number().min(0).max(100).optional().nullable(),
});

export const employeeDirectoryQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  status: z.coerce.number().int().optional(),
});

// ---------------------------------------------------------------------------
// HRMS — Attendance Validators
// ---------------------------------------------------------------------------

export const createShiftSchema = z.object({
  name: z.string().min(1).max(100),
  start_time: z.string(),
  end_time: z.string(),
  break_minutes: z.number().int().min(0).default(0),
  grace_minutes_late: z.number().int().min(0).default(0),
  grace_minutes_early: z.number().int().min(0).default(0),
  is_night_shift: z.boolean().default(false),
  is_default: z.boolean().default(false),
});

export const updateShiftSchema = createShiftSchema.partial();

export const assignShiftSchema = z.object({
  user_id: z.number().int().positive(),
  shift_id: z.number().int().positive(),
  effective_from: z.string(),
  effective_to: z.string().optional().nullable(),
});

export const bulkAssignShiftSchema = z.object({
  user_ids: z.array(z.number().int().positive()).min(1),
  shift_id: z.number().int().positive(),
  effective_from: z.string(),
  effective_to: z.string().optional().nullable(),
});

export const shiftSwapRequestSchema = z.object({
  target_employee_id: z.number().int().positive(),
  shift_assignment_id: z.number().int().positive(),
  target_shift_assignment_id: z.number().int().positive(),
  date: z.string(),
  reason: z.string().min(1),
});

export const shiftScheduleQuerySchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  department_id: z.coerce.number().int().positive().optional(),
});

export const createGeoFenceSchema = z.object({
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_meters: z.number().int().min(10).max(50000),
});

export const checkInSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  source: z.enum(["manual", "biometric", "geo"]).default("manual"),
  remarks: z.string().optional(),
});

export const checkOutSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  source: z.enum(["manual", "biometric", "geo"]).default("manual"),
  remarks: z.string().optional(),
});

export const createRegularizationSchema = z.object({
  date: z.string(),
  requested_check_in: z.string().optional().nullable(),
  requested_check_out: z.string().optional().nullable(),
  reason: z.string().min(1),
});

export const approveRegularizationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().optional(),
});

export const attendanceQuerySchema = paginationSchema.extend({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  user_id: z.coerce.number().int().positive().optional(),
  department_id: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// HRMS — Leave Validators
// ---------------------------------------------------------------------------

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  description: z.string().optional().nullable(),
  is_paid: z.boolean().default(true),
  is_carry_forward: z.boolean().default(false),
  max_carry_forward_days: z.number().int().min(0).default(0),
  is_encashable: z.boolean().default(false),
  requires_approval: z.boolean().default(true),
  color: z.string().max(7).optional().nullable(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const createLeavePolicySchema = z.object({
  leave_type_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  annual_quota: z.number().min(0).max(365),
  accrual_type: z.enum(["annual", "monthly", "quarterly"]).default("annual"),
  accrual_rate: z.number().min(0).optional().nullable(),
  applicable_from_months: z.number().int().min(0).default(0),
  applicable_gender: z.string().optional().nullable(),
  applicable_employment_types: z.string().optional().nullable(),
  max_consecutive_days: z.number().int().positive().optional().nullable(),
  min_days_before_application: z.number().int().min(0).default(0),
});

export const applyLeaveSchema = z.object({
  leave_type_id: z.coerce.number().int().positive(),
  start_date: z.string(),
  end_date: z.string(),
  days_count: z.coerce.number().min(0.5),
  is_half_day: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  half_day_type: z.enum(["first_half", "second_half"]).optional().nullable(),
  reason: z.string().min(1),
});

export const approveLeaveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  remarks: z.string().optional(),
});

export const createCompOffSchema = z.object({
  worked_date: z.string(),
  expires_on: z.string(),
  reason: z.string().min(1),
  days: z.number().min(0.5).max(2).default(1),
});

export const leaveQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  leave_type_id: z.coerce.number().int().positive().optional(),
  user_id: z.coerce.number().int().positive().optional(),
});

export const initializeBalancesSchema = z.object({
  year: z.number().int().min(2020).max(2100),
});

// ---------------------------------------------------------------------------
// HRMS — Document Validators
// ---------------------------------------------------------------------------

export const createDocCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  is_mandatory: z.boolean().default(false),
});

export const updateDocCategorySchema = createDocCategorySchema.partial();

export const verifyDocumentSchema = z.object({
  is_verified: z.boolean(),
  verification_remarks: z.string().optional().nullable(),
});

export const rejectDocumentSchema = z.object({
  rejection_reason: z.string().min(1, "Rejection reason is required"),
});

// ---------------------------------------------------------------------------
// HRMS — Announcement Validators
// ---------------------------------------------------------------------------

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  target_type: z.enum(["all", "department", "role"]).default("all"),
  target_ids: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

// ---------------------------------------------------------------------------
// HRMS — Policy Validators
// ---------------------------------------------------------------------------

export const createPolicySchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(50).optional().nullable(),
  effective_date: z.string().optional().nullable(),
});

export const updatePolicySchema = createPolicySchema.partial();

// ---------------------------------------------------------------------------
// HRMS Type Exports
// ---------------------------------------------------------------------------

export type UpsertEmployeeProfileInput = z.infer<typeof upsertEmployeeProfileSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type CreateDependentInput = z.infer<typeof createDependentSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type BulkAssignShiftInput = z.infer<typeof bulkAssignShiftSchema>;
export type ShiftSwapRequestInput = z.infer<typeof shiftSwapRequestSchema>;
export type RejectDocumentInput = z.infer<typeof rejectDocumentSchema>;

// ---------------------------------------------------------------------------
// HRMS — Biometrics Validators
// ---------------------------------------------------------------------------

export const faceEnrollSchema = z.object({
  user_id: z.number().int().positive(),
  face_encoding: z.string().optional(),
  thumbnail_path: z.string().max(512).optional(),
  enrollment_method: z.enum(["webcam", "upload", "device"]).default("upload"),
  quality_score: z.number().min(0).max(100).optional(),
});

export const faceVerifySchema = z.object({
  face_encoding: z.string().min(1),
  liveness_passed: z.boolean().optional(),
});

export const biometricCheckInSchema = z.object({
  method: z.enum(["face", "fingerprint", "qr", "selfie"]),
  device_id: z.number().int().positive().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  liveness_passed: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  image_path: z.string().max(512).optional(),
  qr_code: z.string().max(128).optional(),
});

export const biometricCheckOutSchema = biometricCheckInSchema;

export const registerDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["face_terminal", "fingerprint_reader", "qr_scanner", "multi"]),
  serial_number: z.string().min(1).max(100),
  ip_address: z.string().max(45).optional(),
  location_id: z.number().int().positive().optional(),
  location_name: z.string().max(200).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  ip_address: z.string().max(45).optional(),
  location_id: z.number().int().positive().optional(),
  location_name: z.string().max(200).optional(),
  status: z.enum(["online", "offline", "maintenance"]).optional(),
  is_active: z.boolean().optional(),
});

export const biometricSettingsSchema = z.object({
  face_match_threshold: z.number().min(0).max(1).optional(),
  liveness_required: z.boolean().optional(),
  selfie_geo_required: z.boolean().optional(),
  geo_radius_meters: z.number().int().min(10).max(50000).optional(),
  qr_type: z.enum(["static", "rotating"]).optional(),
  qr_rotation_minutes: z.number().int().min(1).max(1440).optional(),
});

export const qrGenerateSchema = z.object({
  user_id: z.number().int().positive(),
});

export const qrScanSchema = z.object({
  code: z.string().min(1).max(128),
});

export const biometricLogsQuerySchema = paginationSchema.extend({
  method: z.enum(["face", "fingerprint", "qr", "selfie"]).optional(),
  user_id: z.coerce.number().int().positive().optional(),
  result: z.enum(["success", "failed", "spoofing_detected", "no_match"]).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export type FaceEnrollInput = z.infer<typeof faceEnrollSchema>;
export type FaceVerifyInput = z.infer<typeof faceVerifySchema>;
export type BiometricCheckInInput = z.infer<typeof biometricCheckInSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type BiometricSettingsInput = z.infer<typeof biometricSettingsSchema>;
export type BiometricLogsQueryInput = z.infer<typeof biometricLogsQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Position Management Validators
// ---------------------------------------------------------------------------

const positionEmploymentTypeEnum = z.enum(["full_time", "part_time", "contract", "intern"]);
const positionStatusEnum = z.enum(["active", "filled", "frozen", "closed"]);
const headcountPlanStatusEnum = z.enum(["draft", "submitted", "approved", "rejected"]);
const headcountQuarterEnum = z.enum(["Q1", "Q2", "Q3", "Q4", "annual"]);

export const createPositionSchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  location_id: z.number().int().positive().optional().nullable(),
  reports_to_position_id: z.number().int().positive().optional().nullable(),
  job_description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  min_salary: z.number().int().optional().nullable(),
  max_salary: z.number().int().optional().nullable(),
  currency: z.string().max(3).default("INR"),
  employment_type: positionEmploymentTypeEnum.default("full_time"),
  headcount_budget: z.number().int().min(1).default(1),
  is_critical: z.boolean().default(false),
});

export const updatePositionSchema = createPositionSchema.partial().extend({
  status: positionStatusEnum.optional(),
});

export const assignPositionSchema = z.object({
  user_id: z.number().int().positive(),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
  is_primary: z.boolean().default(true),
});

export const positionQuerySchema = paginationSchema.extend({
  department_id: z.coerce.number().int().positive().optional(),
  status: positionStatusEnum.optional(),
  employment_type: positionEmploymentTypeEnum.optional(),
  search: z.string().optional(),
  is_critical: z.coerce.boolean().optional(),
});

export const createHeadcountPlanSchema = z.object({
  title: z.string().min(1).max(200),
  fiscal_year: z.string().min(4).max(10),
  quarter: headcountQuarterEnum.optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  planned_headcount: z.number().int().min(0).default(0),
  current_headcount: z.number().int().min(0).default(0),
  budget_amount: z.number().int().optional().nullable(),
  currency: z.string().max(3).default("INR"),
  notes: z.string().optional().nullable(),
});

export const updateHeadcountPlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  fiscal_year: z.string().min(4).max(10).optional(),
  quarter: headcountQuarterEnum.optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  planned_headcount: z.number().int().min(0).optional(),
  current_headcount: z.number().int().min(0).optional(),
  budget_amount: z.number().int().optional().nullable(),
  currency: z.string().max(3).optional(),
  status: headcountPlanStatusEnum.optional(),
  notes: z.string().optional().nullable(),
});

export const headcountPlanQuerySchema = paginationSchema.extend({
  fiscal_year: z.string().optional(),
  status: headcountPlanStatusEnum.optional(),
  department_id: z.coerce.number().int().positive().optional(),
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
export type AssignPositionInput = z.infer<typeof assignPositionSchema>;
export type CreateHeadcountPlanInput = z.infer<typeof createHeadcountPlanSchema>;
export type UpdateHeadcountPlanInput = z.infer<typeof updateHeadcountPlanSchema>;

// ---------------------------------------------------------------------------
// HRMS — Helpdesk Validators
// ---------------------------------------------------------------------------

const helpdeskCategoryEnum = z.enum([
  "leave",
  "payroll",
  "benefits",
  "it",
  "facilities",
  "onboarding",
  "policy",
  "general",
]);

const ticketPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);

const ticketStatusEnum = z.enum([
  "open",
  "in_progress",
  "awaiting_response",
  "resolved",
  "closed",
  "reopened",
]);

export const createTicketSchema = z.object({
  category: helpdeskCategoryEnum,
  priority: ticketPriorityEnum.default("medium"),
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  department_id: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

export const updateTicketSchema = z.object({
  category: helpdeskCategoryEnum.optional(),
  priority: ticketPriorityEnum.optional(),
  status: ticketStatusEnum.optional(),
  assigned_to: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

export const addCommentSchema = z.object({
  comment: z.string().min(1),
  is_internal: z.boolean().default(false),
  attachments: z.array(z.string()).optional().nullable(),
});

export const rateTicketSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
});

export const createArticleSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: helpdeskCategoryEnum,
  slug: z.string().max(255).optional(),
  is_published: z.boolean().default(false),
  is_featured: z.boolean().default(false),
});

export const updateArticleSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  category: helpdeskCategoryEnum.optional(),
  slug: z.string().max(255).optional(),
  is_published: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

export const helpdeskQuerySchema = paginationSchema.extend({
  status: ticketStatusEnum.optional(),
  category: helpdeskCategoryEnum.optional(),
  priority: ticketPriorityEnum.optional(),
  assigned_to: z.coerce.number().int().positive().optional(),
  raised_by: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type AddCommentInput = z.infer<typeof addCommentSchema>;
export type RateTicketInput = z.infer<typeof rateTicketSchema>;
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type HelpdeskQueryInput = z.infer<typeof helpdeskQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Survey Validators
// ---------------------------------------------------------------------------

const surveyTypeEnum = z.enum([
  "pulse",
  "enps",
  "engagement",
  "custom",
  "onboarding",
  "exit_survey",
]);

const surveyStatusEnum = z.enum(["draft", "active", "closed", "archived"]);

const surveyTargetTypeEnum = z.enum(["all", "department", "role", "custom"]);

const surveyRecurrenceEnum = z.enum(["none", "weekly", "monthly", "quarterly"]);

const questionTypeEnum = z.enum([
  "rating_1_5",
  "rating_1_10",
  "enps_0_10",
  "yes_no",
  "multiple_choice",
  "text",
  "scale",
]);

const surveyQuestionSchema = z.object({
  question_text: z.string().min(1),
  question_type: questionTypeEnum.default("rating_1_5"),
  options: z.array(z.string()).optional().nullable(),
  is_required: z.boolean().default(true),
  sort_order: z.number().int().min(0).optional(),
});

export const createSurveySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  type: surveyTypeEnum.default("pulse"),
  is_anonymous: z.boolean().default(true),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  target_type: surveyTargetTypeEnum.default("all"),
  target_ids: z.array(z.number()).optional().nullable(),
  recurrence: surveyRecurrenceEnum.default("none"),
  questions: z.array(surveyQuestionSchema).optional(),
});

export const updateSurveySchema = createSurveySchema.partial();

export const submitSurveyResponseSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.number().int().positive(),
      rating_value: z.number().int().optional().nullable(),
      text_value: z.string().optional().nullable(),
    })
  ),
});

export const surveyQuerySchema = paginationSchema.extend({
  status: surveyStatusEnum.optional(),
  type: surveyTypeEnum.optional(),
});

export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;
export type SubmitSurveyResponseInput = z.infer<typeof submitSurveyResponseSchema>;
export type SurveyQueryInput = z.infer<typeof surveyQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Asset Management Validators
// ---------------------------------------------------------------------------

const assetStatusEnum = z.enum([
  "available",
  "assigned",
  "in_repair",
  "retired",
  "lost",
  "damaged",
]);

const assetConditionEnum = z.enum(["new", "good", "fair", "poor"]);

export const createAssetCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
});

export const updateAssetCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  category_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  serial_number: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  purchase_cost: z.number().int().optional().nullable(),
  warranty_expiry: z.string().optional().nullable(),
  status: assetStatusEnum.default("available"),
  condition_status: assetConditionEnum.default("new"),
  location_name: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  serial_number: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  purchase_cost: z.number().int().optional().nullable(),
  warranty_expiry: z.string().optional().nullable(),
  condition_status: assetConditionEnum.optional(),
  location_name: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const assignAssetSchema = z.object({
  assigned_to: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

export const returnAssetSchema = z.object({
  condition: assetConditionEnum.optional(),
  notes: z.string().optional().nullable(),
});

export const assetActionSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const assetQuerySchema = paginationSchema.extend({
  status: assetStatusEnum.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  assigned_to: z.coerce.number().int().positive().optional(),
  condition_status: assetConditionEnum.optional(),
  search: z.string().optional(),
});

export type CreateAssetCategoryInput = z.infer<typeof createAssetCategorySchema>;
export type UpdateAssetCategoryInput = z.infer<typeof updateAssetCategorySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;
export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;
export type AssetActionInput = z.infer<typeof assetActionSchema>;
export type AssetQueryInput = z.infer<typeof assetQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Anonymous Feedback Validators
// ---------------------------------------------------------------------------

const feedbackCategoryEnum = z.enum([
  "general",
  "workplace",
  "management",
  "process",
  "culture",
  "harassment",
  "safety",
  "suggestion",
  "other",
]);

const feedbackSentimentEnum = z.enum(["positive", "neutral", "negative"]);

const feedbackStatusEnum = z.enum([
  "new",
  "acknowledged",
  "under_review",
  "resolved",
  "archived",
]);

export const submitFeedbackSchema = z.object({
  category: feedbackCategoryEnum,
  subject: z.string().min(1).max(255),
  message: z.string().min(1),
  sentiment: feedbackSentimentEnum.optional().nullable(),
  is_anonymous: z.preprocess((v) => v === 1 || v === "1" || v === "true" || v === true, z.boolean()).default(false),
  is_urgent: z.preprocess((v) => v === 1 || v === "1" || v === "true" || v === true, z.boolean()).default(false),
});

export const respondFeedbackSchema = z.object({
  admin_response: z.string().min(1),
});

export const updateFeedbackStatusSchema = z.object({
  status: feedbackStatusEnum,
});

export const feedbackQuerySchema = paginationSchema.extend({
  category: feedbackCategoryEnum.optional(),
  status: feedbackStatusEnum.optional(),
  sentiment: feedbackSentimentEnum.optional(),
  is_urgent: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type RespondFeedbackInput = z.infer<typeof respondFeedbackSchema>;
export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;
export type FeedbackQueryInput = z.infer<typeof feedbackQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Event Validators
// ---------------------------------------------------------------------------

const eventTypeEnum = z.enum([
  "meeting",
  "training",
  "celebration",
  "team_building",
  "town_hall",
  "holiday",
  "workshop",
  "social",
  "other",
]);

const eventStatusEnum = z.enum(["upcoming", "ongoing", "completed", "cancelled"]);

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  event_type: eventTypeEnum.default("other"),
  start_date: z.string().min(1),
  end_date: z.string().optional().nullable(),
  is_all_day: z.boolean().default(false),
  location: z.string().max(255).optional().nullable(),
  virtual_link: z.string().max(500).optional().nullable(),
  target_type: z.enum(["all", "department", "role"]).default("all"),
  target_ids: z.string().optional().nullable(),
  max_attendees: z.number().int().positive().optional().nullable(),
  is_mandatory: z.boolean().default(false),
});

export const updateEventSchema = createEventSchema.partial();

export const rsvpEventSchema = z.object({
  status: z.enum(["attending", "maybe", "declined"]).default("attending"),
});

export const eventQuerySchema = paginationSchema.extend({
  event_type: eventTypeEnum.optional(),
  status: eventStatusEnum.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RsvpEventInput = z.infer<typeof rsvpEventSchema>;
export type EventQueryInput = z.infer<typeof eventQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Whistleblowing Validators (EU Directive 2019/1937)
// ---------------------------------------------------------------------------

const whistleblowerCategoryEnum = z.enum([
  "fraud",
  "corruption",
  "harassment",
  "discrimination",
  "safety_violation",
  "data_breach",
  "financial_misconduct",
  "environmental",
  "retaliation",
  "other",
]);

const whistleblowerSeverityEnum = z.enum(["low", "medium", "high", "critical"]);

const whistleblowerStatusEnum = z.enum([
  "submitted",
  "under_investigation",
  "escalated",
  "resolved",
  "dismissed",
  "closed",
]);

const whistleblowerUpdateTypeEnum = z.enum([
  "status_change",
  "note",
  "response_to_reporter",
  "escalation",
]);

export const submitWhistleblowerReportSchema = z.object({
  category: whistleblowerCategoryEnum,
  severity: whistleblowerSeverityEnum.default("medium"),
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  evidence_paths: z.array(z.string()).optional().nullable(),
  is_anonymous: z.boolean().default(true),
});

export const whistleblowerUpdateSchema = z.object({
  content: z.string().min(1),
  update_type: whistleblowerUpdateTypeEnum.default("note"),
  is_visible_to_reporter: z.boolean().default(false),
});

export const whistleblowerStatusSchema = z.object({
  status: whistleblowerStatusEnum,
  resolution: z.string().optional().nullable(),
});

export const whistleblowerEscalateSchema = z.object({
  escalated_to: z.string().min(1).max(255),
});

export const whistleblowerAssignSchema = z.object({
  investigator_id: z.number().int().positive(),
});

export const whistleblowerQuerySchema = paginationSchema.extend({
  status: whistleblowerStatusEnum.optional(),
  category: whistleblowerCategoryEnum.optional(),
  severity: whistleblowerSeverityEnum.optional(),
  search: z.string().optional(),
});

export type SubmitWhistleblowerReportInput = z.infer<typeof submitWhistleblowerReportSchema>;
export type WhistleblowerUpdateInput = z.infer<typeof whistleblowerUpdateSchema>;
export type WhistleblowerStatusInput = z.infer<typeof whistleblowerStatusSchema>;
export type WhistleblowerEscalateInput = z.infer<typeof whistleblowerEscalateSchema>;
export type WhistleblowerAssignInput = z.infer<typeof whistleblowerAssignSchema>;
export type WhistleblowerQueryInput = z.infer<typeof whistleblowerQuerySchema>;

// ---------------------------------------------------------------------------
// HRMS — Forum / Social Intranet Validators
// ---------------------------------------------------------------------------

const forumPostTypeEnum = z.enum(["discussion", "question", "idea", "poll"]);

export const createForumCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateForumCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const createForumPostSchema = z.object({
  category_id: z.number().int().positive(),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  post_type: forumPostTypeEnum.default("discussion"),
  tags: z.array(z.string()).optional().nullable(),
});

export const updateForumPostSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional().nullable(),
});

export const forumPostQuerySchema = paginationSchema.extend({
  category_id: z.coerce.number().int().positive().optional(),
  post_type: forumPostTypeEnum.optional(),
  author_id: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export const createForumReplySchema = z.object({
  content: z.string().min(1),
  parent_reply_id: z.number().int().positive().optional().nullable(),
});

export const forumLikeSchema = z.object({
  target_type: z.enum(["post", "reply"]),
  target_id: z.number().int().positive(),
});

export type CreateForumCategoryInput = z.infer<typeof createForumCategorySchema>;
export type UpdateForumCategoryInput = z.infer<typeof updateForumCategorySchema>;
export type CreateForumPostInput = z.infer<typeof createForumPostSchema>;
export type UpdateForumPostInput = z.infer<typeof updateForumPostSchema>;
export type ForumPostQueryInput = z.infer<typeof forumPostQuerySchema>;
export type CreateForumReplyInput = z.infer<typeof createForumReplySchema>;
export type ForumLikeInput = z.infer<typeof forumLikeSchema>;

// ---------------------------------------------------------------------------
// HRMS — Wellness Program Validators
// ---------------------------------------------------------------------------

const wellnessProgramTypeEnum = z.enum([
  "fitness",
  "mental_health",
  "nutrition",
  "meditation",
  "yoga",
  "team_activity",
  "health_checkup",
  "other",
]);

const wellnessMoodEnum = z.enum(["great", "good", "okay", "low", "stressed"]);
const wellnessGoalTypeEnum = z.enum(["steps", "exercise", "meditation", "water", "sleep", "custom"]);
const wellnessGoalFrequencyEnum = z.enum(["daily", "weekly", "monthly"]);
const wellnessGoalStatusEnum = z.enum(["active", "completed", "abandoned"]);

export const createWellnessProgramSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  program_type: wellnessProgramTypeEnum.default("other"),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  max_participants: z.number().int().positive().optional().nullable(),
  points_reward: z.number().int().min(0).optional(),
});

export const updateWellnessProgramSchema = createWellnessProgramSchema.partial();

export const wellnessCheckInSchema = z.object({
  check_in_date: z.string().optional(),
  mood: wellnessMoodEnum,
  energy_level: z.number().int().min(1).max(5),
  sleep_hours: z.number().min(0).max(24).optional().nullable(),
  exercise_minutes: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});

export const createWellnessGoalSchema = z.object({
  title: z.string().min(1).max(255),
  goal_type: wellnessGoalTypeEnum.default("custom"),
  target_value: z.number().int().positive(),
  unit: z.string().min(1).max(20),
  frequency: wellnessGoalFrequencyEnum.default("daily"),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
});

export const updateWellnessGoalSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  current_value: z.number().int().min(0).optional(),
  target_value: z.number().int().positive().optional(),
  status: wellnessGoalStatusEnum.optional(),
});

export const wellnessQuerySchema = paginationSchema.extend({
  program_type: wellnessProgramTypeEnum.optional(),
  is_active: z.coerce.boolean().optional(),
});

export type CreateWellnessProgramInput = z.infer<typeof createWellnessProgramSchema>;
export type UpdateWellnessProgramInput = z.infer<typeof updateWellnessProgramSchema>;
export type WellnessCheckInInput = z.infer<typeof wellnessCheckInSchema>;
export type CreateWellnessGoalInput = z.infer<typeof createWellnessGoalSchema>;
export type UpdateWellnessGoalInput = z.infer<typeof updateWellnessGoalSchema>;
export type WellnessQueryInput = z.infer<typeof wellnessQuerySchema>;

// ---------------------------------------------------------------------------
// Custom Fields
// ---------------------------------------------------------------------------

export const customFieldEntityTypeEnum = z.enum([
  "employee",
  "department",
  "location",
  "project",
  "document",
]);

export const customFieldTypeEnum = z.enum([
  "text",
  "textarea",
  "number",
  "decimal",
  "date",
  "datetime",
  "dropdown",
  "multi_select",
  "checkbox",
  "email",
  "phone",
  "url",
  "file",
]);

export const createCustomFieldDefinitionSchema = z.object({
  entity_type: customFieldEntityTypeEnum,
  field_name: z.string().min(1).max(100),
  field_type: customFieldTypeEnum,
  options: z.array(z.string()).optional().nullable(),
  default_value: z.string().max(5000).optional().nullable(),
  placeholder: z.string().max(200).optional().nullable(),
  is_required: z.boolean().optional(),
  is_searchable: z.boolean().optional(),
  validation_regex: z.string().max(255).optional().nullable(),
  min_value: z.number().optional().nullable(),
  max_value: z.number().optional().nullable(),
  section: z.string().max(100).optional(),
  help_text: z.string().max(5000).optional().nullable(),
});

export const updateCustomFieldDefinitionSchema = createCustomFieldDefinitionSchema
  .omit({ entity_type: true })
  .partial();

export const setCustomFieldValuesSchema = z.object({
  values: z.array(
    z.object({
      fieldId: z.number().int().positive(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
    })
  ),
});

export const reorderCustomFieldsSchema = z.object({
  entity_type: customFieldEntityTypeEnum,
  field_ids: z.array(z.number().int().positive()),
});

export const customFieldSearchSchema = z.object({
  entity_type: customFieldEntityTypeEnum,
  field_id: z.coerce.number().int().positive(),
  search_value: z.string().min(1),
});

export const entityTypeParamSchema = z.object({
  entityType: customFieldEntityTypeEnum,
});

export type CreateCustomFieldDefinitionInput = z.infer<typeof createCustomFieldDefinitionSchema>;
export type UpdateCustomFieldDefinitionInput = z.infer<typeof updateCustomFieldDefinitionSchema>;
export type SetCustomFieldValueInput = z.infer<typeof setCustomFieldValuesSchema>["values"][number];
export type CustomFieldEntityType = z.infer<typeof customFieldEntityTypeEnum>;
