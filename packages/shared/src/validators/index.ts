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
  org_name: z.string().min(2).max(100),
  org_legal_name: z.string().max(255).optional(),
  org_country: z.string().min(2).max(55).default("IN"),
  org_state: z.string().max(55).optional(),
  org_timezone: z.string().max(50).optional(),
  org_email: z.string().email().optional(),
  // Admin user
  first_name: z.string().min(1).max(64),
  last_name: z.string().min(1).max(64),
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
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

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
  leave_type_id: z.number().int().positive(),
  start_date: z.string(),
  end_date: z.string(),
  days_count: z.number().min(0.5),
  is_half_day: z.boolean().default(false),
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
