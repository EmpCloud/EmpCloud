// =============================================================================
// EMP CLOUD — Shared Types
// Central type definitions used across server and client packages.
// =============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ORG_ADMIN = "org_admin",
  HR_ADMIN = "hr_admin",
  MANAGER = "manager",
  EMPLOYEE = "employee",
}

export enum UserStatus {
  ACTIVE = 1,
  INACTIVE = 2,
  SUSPENDED = 3,
}

export enum EmploymentType {
  FULL_TIME = "full_time",
  PART_TIME = "part_time",
  CONTRACT = "contract",
  INTERN = "intern",
}

export enum OrgStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  CANCELLED = "cancelled",
}

export enum SubscriptionStatus {
  ACTIVE = "active",
  TRIAL = "trial",
  PAST_DUE = "past_due",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}

export enum PlanTier {
  FREE = "free",
  BASIC = "basic",
  PROFESSIONAL = "professional",
  ENTERPRISE = "enterprise",
}

export enum BillingCycle {
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  ANNUAL = "annual",
}

export enum OAuthGrantType {
  AUTHORIZATION_CODE = "authorization_code",
  REFRESH_TOKEN = "refresh_token",
  CLIENT_CREDENTIALS = "client_credentials",
}

export enum OAuthResponseType {
  CODE = "code",
}

export enum TokenType {
  ACCESS = "access",
  REFRESH = "refresh",
  ID = "id",
}

export enum AuditAction {
  LOGIN = "login",
  LOGOUT = "logout",
  LOGIN_FAILED = "login_failed",
  REGISTER = "register",
  PASSWORD_CHANGE = "password_change",
  PASSWORD_RESET = "password_reset",
  USER_CREATED = "user_created",
  USER_UPDATED = "user_updated",
  USER_DEACTIVATED = "user_deactivated",
  USER_DELETED = "user_deleted",
  USER_INVITED = "user_invited",
  INVITATION_CANCELLED = "invitation_cancelled",
  ORG_UPDATED = "org_updated",
  SUBSCRIPTION_CREATED = "subscription_created",
  SUBSCRIPTION_UPDATED = "subscription_updated",
  SUBSCRIPTION_CANCELLED = "subscription_cancelled",
  SEAT_ASSIGNED = "seat_assigned",
  SEAT_REVOKED = "seat_revoked",
  TOKEN_ISSUED = "token_issued",
  TOKEN_REVOKED = "token_revoked",
  OAUTH_AUTHORIZE = "oauth_authorize",
  OAUTH_TOKEN = "oauth_token",
  // HRMS
  PROFILE_UPDATED = "profile_updated",
  ATTENDANCE_CHECKIN = "attendance_checkin",
  ATTENDANCE_CHECKOUT = "attendance_checkout",
  ATTENDANCE_SETTINGS_UPDATED = "attendance_settings_updated",
  ATTENDANCE_OVERRIDE_CREATED = "attendance_override_created",
  ATTENDANCE_OVERRIDE_UPDATED = "attendance_override_updated",
  ATTENDANCE_OVERRIDE_DELETED = "attendance_override_deleted",
  LEAVE_APPLIED = "leave_applied",
  LEAVE_APPROVED = "leave_approved",
  LEAVE_REJECTED = "leave_rejected",
  LEAVE_CANCELLED = "leave_cancelled",
  LEAVE_UPDATED = "leave_updated",
  LEAVE_BALANCE_ADJUSTED = "leave_balance_adjusted",
  LEAVE_BALANCE_OVERRIDDEN = "leave_balance_overridden",
  LEAVE_BALANCE_BULK_OVERRIDDEN = "leave_balance_bulk_overridden",
  LEAVE_PERIOD_RESET = "leave_period_reset",
  LEAVE_FISCAL_YEAR_ARCHIVED = "leave_fiscal_year_archived",
  LEAVE_CONFIG_UPDATED = "leave_config_updated",
  DOCUMENT_UPLOADED = "document_uploaded",
  DOCUMENT_VERIFIED = "document_verified",
  ANNOUNCEMENT_CREATED = "announcement_created",
  POLICY_CREATED = "policy_created",
  POLICY_ACKNOWLEDGED = "policy_acknowledged",
  // Cross-module webhooks
  MODULE_WEBHOOK_RECEIVED = "module_webhook_received",
  CANDIDATE_HIRED = "candidate_hired",
  EXIT_INITIATED = "exit_initiated",
  EXIT_COMPLETED = "exit_completed",
  PERFORMANCE_CYCLE_COMPLETED = "performance_cycle_completed",
  REWARDS_MILESTONE_ACHIEVED = "rewards_milestone_achieved",
  // Biometrics
  BIOMETRIC_FACE_ENROLLED = "biometric_face_enrolled",
  BIOMETRIC_FACE_REMOVED = "biometric_face_removed",
  BIOMETRIC_CHECKIN = "biometric_checkin",
  BIOMETRIC_CHECKOUT = "biometric_checkout",
  BIOMETRIC_DEVICE_REGISTERED = "biometric_device_registered",
  BIOMETRIC_DEVICE_DECOMMISSIONED = "biometric_device_decommissioned",
  BIOMETRIC_SETTINGS_UPDATED = "biometric_settings_updated",
  // Positions
  POSITION_CREATED = "position_created",
  POSITION_ASSIGNED = "position_assigned",
  HEADCOUNT_PLAN_CREATED = "headcount_plan_created",
  HEADCOUNT_PLAN_APPROVED = "headcount_plan_approved",
  HEADCOUNT_PLAN_REJECTED = "headcount_plan_rejected",
  // Helpdesk
  TICKET_CREATED = "ticket_created",
  TICKET_ASSIGNED = "ticket_assigned",
  TICKET_RESOLVED = "ticket_resolved",
  TICKET_CLOSED = "ticket_closed",
  KB_ARTICLE_CREATED = "kb_article_created",
  // Surveys
  SURVEY_CREATED = "survey_created",
  SURVEY_PUBLISHED = "survey_published",
  SURVEY_CLOSED = "survey_closed",
  SURVEY_RESPONDED = "survey_responded",
  // Assets
  ASSET_CREATED = "asset_created",
  ASSET_ASSIGNED = "asset_assigned",
  ASSET_RETURNED = "asset_returned",
  ASSET_RETIRED = "asset_retired",
  // Anonymous Feedback
  FEEDBACK_SUBMITTED = "feedback_submitted",
  FEEDBACK_RESPONDED = "feedback_responded",
  FEEDBACK_STATUS_UPDATED = "feedback_status_updated",
  FEEDBACK_UPDATED = "feedback_updated",
  FEEDBACK_DELETED = "feedback_deleted",
  // Events
  EVENT_CREATED = "event_created",
  EVENT_CANCELLED = "event_cancelled",
  // Whistleblowing
  WHISTLEBLOWER_REPORT_SUBMITTED = "whistleblower_report_submitted",
  WHISTLEBLOWER_INVESTIGATOR_ASSIGNED = "whistleblower_investigator_assigned",
  WHISTLEBLOWER_UPDATE_ADDED = "whistleblower_update_added",
  WHISTLEBLOWER_STATUS_CHANGED = "whistleblower_status_changed",
  WHISTLEBLOWER_ESCALATED = "whistleblower_escalated",
  // Forum / Social Intranet
  FORUM_POST_CREATED = "forum_post_created",
  FORUM_POST_DELETED = "forum_post_deleted",
  // Wellness
  WELLNESS_PROGRAM_CREATED = "wellness_program_created",
  WELLNESS_ENROLLED = "wellness_enrolled",
  WELLNESS_CHECK_IN = "wellness_check_in",
  // Shift Scheduling
  SHIFT_BULK_ASSIGNED = "shift_bulk_assigned",
  SHIFT_ASSIGNMENT_UPDATED = "shift_assignment_updated",
  SHIFT_ASSIGNMENT_DELETED = "shift_assignment_deleted",
  SHIFT_SWAP_REQUESTED = "shift_swap_requested",
  SHIFT_SWAP_APPROVED = "shift_swap_approved",
  SHIFT_SWAP_REJECTED = "shift_swap_rejected",
  // Documents
  DOCUMENT_REJECTED = "document_rejected",
  DOCUMENT_CATEGORY_DELETED = "document_category_deleted",
  // Custom Fields
  CUSTOM_FIELD_CREATED = "custom_field_created",
  CUSTOM_FIELD_UPDATED = "custom_field_updated",
  CUSTOM_FIELD_DELETED = "custom_field_deleted",
}

export enum InvitationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface Organization {
  id: number;
  name: string;
  legal_name: string | null;
  email: string | null;
  contact_number: string | null;
  website: string | null;
  logo: string | null;
  timezone: string | null;
  country: string;
  state: string | null;
  city: string | null;
  zipcode: string | null;
  address: string | null;
  language: string;
  weekday_start: string;
  current_user_count: number;
  total_allowed_user_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Department {
  id: number;
  name: string;
  organization_id: number;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Location {
  id: number;
  name: string;
  organization_id: number;
  address: string | null;
  timezone: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  organization_id: number;
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  emp_code: string | null;
  contact_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  date_of_joining: string | null;
  date_of_exit: string | null;
  designation: string | null;
  department_id: number | null;
  location_id: number | null;
  reporting_manager_id: number | null;
  employment_type: EmploymentType;
  photo_path: string | null;
  address: string | null;
  role: UserRole;
  status: UserStatus;
  language: string;
  created_at: Date;
  updated_at: Date;
}

export type UserPublic = Omit<User, "password">;

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

export interface Role {
  id: number;
  name: string;
  organization_id: number | null;
  type: number; // 0 = Custom, 1 = Default
  is_active: boolean;
  permissions: string | null; // JSON array of permission keys
  created_at: Date;
  updated_at: Date;
}

export interface UserRoleAssignment {
  id: number;
  user_id: number;
  role_id: number;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Module Registry
// ---------------------------------------------------------------------------

export interface Module {
  id: number;
  name: string;
  slug: string; // e.g. "emp-payroll"
  description: string | null;
  base_url: string; // e.g. "https://payroll.empcloud.com"
  icon: string | null;
  is_active: boolean;
  has_free_tier: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ModuleFeature {
  id: number;
  module_id: number;
  feature_key: string; // e.g. "ai_screening", "advanced_tax"
  name: string;
  description: string | null;
  min_plan_tier: PlanTier; // minimum tier that unlocks this feature
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Subscriptions & Seats
// ---------------------------------------------------------------------------

export interface OrgSubscription {
  id: number;
  organization_id: number;
  module_id: number;
  plan_tier: PlanTier;
  status: SubscriptionStatus;
  total_seats: number;
  used_seats: number;
  billing_cycle: BillingCycle;
  price_per_seat: number; // stored as smallest currency unit (paise/cents)
  currency: string;
  trial_ends_at: Date | null;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrgModuleSeat {
  id: number;
  subscription_id: number;
  organization_id: number;
  module_id: number;
  user_id: number;
  assigned_at: Date;
  assigned_by: number;
}

// ---------------------------------------------------------------------------
// OAuth2 / OIDC
// ---------------------------------------------------------------------------

export interface OAuthClient {
  id: number;
  client_id: string; // public identifier
  client_secret_hash: string | null; // null for public clients (SPAs)
  name: string;
  module_id: number | null; // linked module, null for third-party clients
  redirect_uris: string; // JSON array
  allowed_scopes: string; // JSON array
  grant_types: string; // JSON array
  is_confidential: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OAuthAuthorizationCode {
  id: number;
  code_hash: string;
  client_id: string;
  user_id: number;
  organization_id: number;
  redirect_uri: string;
  scope: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface OAuthAccessToken {
  id: number;
  jti: string; // unique token ID
  client_id: string;
  user_id: number;
  organization_id: number;
  scope: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface OAuthRefreshToken {
  id: number;
  token_hash: string;
  access_token_id: number;
  client_id: string;
  user_id: number;
  organization_id: number;
  scope: string;
  family_id: string; // for rotation detection
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface SigningKey {
  id: number;
  kid: string; // key ID for JWK
  algorithm: string; // RS256
  public_key: string;
  private_key: string;
  is_current: boolean;
  expires_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: number;
  organization_id: number | null;
  user_id: number | null;
  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null; // JSON
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface Invitation {
  id: number;
  organization_id: number;
  email: string;
  role: UserRole;
  invited_by: number;
  token_hash: string;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// API Response Envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
}

// ---------------------------------------------------------------------------
// JWT / Auth Payloads
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  sub: number; // user ID
  org_id: number;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  org_name: string;
  scope: string;
  client_id: string;
  jti: string;
  /**
   * Effective permissions for this user — union of system-role defaults +
   * any custom role assignments. Embedded in the JWT so external modules
   * (payroll, exit, performance, etc.) can authorize without calling back
   * to EmpCloud. Refreshed on token issue / refresh.
   */
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
}

export interface IDTokenPayload {
  sub: number;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  org_id: number;
  org_name: string;
  role: UserRole;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  nonce?: string;
}

export interface RefreshTokenPayload {
  sub: number;
  org_id: number;
  jti: string;
  family_id: string;
  iat: number;
  exp: number;
  iss: string;
}

// ---------------------------------------------------------------------------
// Request / Query Types
// ---------------------------------------------------------------------------

export interface PaginationQuery {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface ModuleAccessCheck {
  user_id: number;
  organization_id: number;
  module_slug: string;
}

export interface ModuleAccessResult {
  has_access: boolean;
  subscription?: OrgSubscription;
  seat_assigned: boolean;
  features: string[];
}

// ---------------------------------------------------------------------------
// HRMS — Employee Extended Profiles
// ---------------------------------------------------------------------------

export interface EmployeeProfile {
  id: number;
  organization_id: number;
  user_id: number;
  personal_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  blood_group: string | null;
  marital_status: string | null;
  nationality: string | null;
  aadhar_number: string | null;
  pan_number: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  visa_status: string | null;
  visa_expiry: string | null;
  probation_start_date: string | null;
  probation_end_date: string | null;
  confirmation_date: string | null;
  notice_period_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeAddress {
  id: number;
  organization_id: number;
  user_id: number;
  type: "current" | "permanent";
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeEducation {
  id: number;
  organization_id: number;
  user_id: number;
  degree: string;
  institution: string;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  grade: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeWorkExperience {
  id: number;
  organization_id: number;
  user_id: number;
  company_name: string;
  designation: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDependent {
  id: number;
  organization_id: number;
  user_id: number;
  name: string;
  relationship: string;
  date_of_birth: string | null;
  gender: string | null;
  is_nominee: boolean;
  nominee_percentage: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// HRMS — Attendance
// ---------------------------------------------------------------------------

export enum AttendanceStatus {
  PRESENT = "present",
  ABSENT = "absent",
  HALF_DAY = "half_day",
  ON_LEAVE = "on_leave",
  HOLIDAY = "holiday",
  WEEKEND = "weekend",
}

export enum AttendanceSource {
  MANUAL = "manual",
  BIOMETRIC = "biometric",
  GEO = "geo",
}

export enum RegularizationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface Shift {
  id: number;
  organization_id: number;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes_late: number;
  grace_minutes_early: number;
  is_night_shift: boolean;
  is_default: boolean;
  is_active: boolean;
  working_days: string; // comma-separated day numbers: 0=Sun,1=Mon,...6=Sat
  half_days: string; // comma-separated day numbers for half-day work
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: number;
  organization_id: number;
  user_id: number;
  shift_id: number;
  effective_from: string;
  effective_to: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface GeoFenceLocation {
  id: number;
  organization_id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: number;
  organization_id: number;
  user_id: number;
  date: string;
  shift_id: number | null;
  check_in: string | null;
  check_out: string | null;
  check_in_source: string | null;
  check_out_source: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  status: AttendanceStatus;
  worked_minutes: number | null;
  overtime_minutes: number | null;
  late_minutes: number | null;
  early_departure_minutes: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRegularization {
  id: number;
  organization_id: number;
  user_id: number;
  attendance_id: number | null;
  date: string;
  original_check_in: string | null;
  original_check_out: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: RegularizationStatus;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// HRMS — Leave Management
// ---------------------------------------------------------------------------

export enum LeaveStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export enum LeaveAccrualType {
  ANNUAL = "annual",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
}

export interface LeaveType {
  id: number;
  organization_id: number;
  name: string;
  code: string;
  description: string | null;
  is_paid: boolean;
  is_carry_forward: boolean;
  max_carry_forward_days: number;
  is_encashable: boolean;
  requires_approval: boolean;
  is_active: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicy {
  id: number;
  organization_id: number;
  leave_type_id: number;
  name: string;
  annual_quota: number;
  accrual_type: LeaveAccrualType;
  accrual_rate: number | null;
  applicable_from_months: number;
  applicable_gender: string | null;
  applicable_employment_types: string | null;
  max_consecutive_days: number | null;
  min_days_before_application: number;
  /**
   * Within-fiscal-year roll-over toggle. When true, unused days from one
   * accrual period (e.g. Q1) carry into the next (Q2). When false, each
   * period resets and unused days are forfeited at the period boundary.
   * Independent from `LeaveType.is_carry_forward` which used to gate
   * year-end carry — this is per-period within the same fiscal year.
   */
  period_carry_forward: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: number;
  organization_id: number;
  user_id: number;
  leave_type_id: number;
  /** Fiscal-year start year. With fiscal_year_start_month=4, year=2025 means Apr 2025–Mar 2026. */
  year: number;
  total_allocated: number;
  /** HR-granted bonus days, separate from the policy's annual_quota. */
  extra_allocated: number;
  total_used: number;
  total_carry_forward: number;
  balance: number;
  /** Used in current period only (resets at period boundary for non-carry-forward policies). */
  period_used: number;
  /** Identifier of the most-recently-seen period (e.g. "2025-Q2"). Used for lazy rollover. */
  period_key: string | null;
  override_reason: string | null;
  overridden_by: number | null;
  overridden_at: string | null;
  created_at: string;
  updated_at: string;
  // Payroll-compat additive fields populated at read time (not stored):
  available_now?: number;
  period_quota?: number;
  fiscal_year_label?: string;
}

export interface LeaveApplication {
  id: number;
  organization_id: number;
  user_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  half_day_type: string | null;
  reason: string;
  status: LeaveStatus;
  current_approver_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveApproval {
  id: number;
  leave_application_id: number;
  approver_id: number;
  level: number;
  status: LeaveStatus;
  remarks: string | null;
  acted_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// HRMS — Documents
// ---------------------------------------------------------------------------

export interface DocumentCategory {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: number;
  organization_id: number;
  user_id: number;
  category_id: number;
  name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  expires_at: string | null;
  is_verified: boolean;
  verified_by: number | null;
  verified_at: string | null;
  verification_remarks: string | null;
  uploaded_by: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// HRMS — Announcements
// ---------------------------------------------------------------------------

export enum AnnouncementPriority {
  LOW = "low",
  NORMAL = "normal",
  HIGH = "high",
  URGENT = "urgent",
}

export enum AnnouncementTargetType {
  ALL = "all",
  DEPARTMENT = "department",
  ROLE = "role",
}

export interface Announcement {
  id: number;
  organization_id: number;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  target_type: AnnouncementTargetType;
  target_ids: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_by: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRead {
  id: number;
  announcement_id: number;
  user_id: number;
  read_at: string;
}

// ---------------------------------------------------------------------------
// HRMS — Company Policies
// ---------------------------------------------------------------------------

export interface CompanyPolicy {
  id: number;
  organization_id: number;
  title: string;
  content: string;
  version: number;
  category: string | null;
  effective_date: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyAcknowledgment {
  id: number;
  policy_id: number;
  user_id: number;
  acknowledged_at: string;
}

// ---------------------------------------------------------------------------
// Employee Chat / Private Messaging
// ---------------------------------------------------------------------------

export type ConversationType = "direct" | "group";

export interface ChatParticipant {
  user_id: number;
  name: string;
  email: string | null;
  designation: string | null;
  photo_path: string | null;
  /** Self-set status / "About" line, shown under the name in 1:1 chats. */
  chat_status?: string | null;
}

/** A file/photo attached to a chat message. */
export interface ChatAttachment {
  /** Original filename as uploaded. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type — clients use the `image/*` prefix to render an inline thumbnail. */
  mime: string;
  /** Authenticated URL to fetch the file (never the server filesystem path). */
  url: string;
  /** Convenience flag so the UI doesn't have to parse the mime. */
  is_image: boolean;
}

/**
 * Delivery/read state for a message, from the SENDER's perspective.
 * - sent: stored on the server (single grey ✓)
 * - delivered: reached every active recipient's device (double grey ✓✓)
 * - read: opened+viewed by every active recipient (blue ✓✓)
 * - sending / failed: client-only optimistic states (clock / red retry); never
 *   sent by the server.
 * Null/undefined for messages that aren't mine (recipients don't see ticks).
 */
export type TickStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  is_deleted: boolean;
  is_mine: boolean;
  /** Present when the message carries a file/photo (null otherwise). */
  attachment: ChatAttachment | null;
  /** Sender-only delivery/read tick. Null for messages that aren't mine. */
  tick_status: TickStatus | null;
  /**
   * User ids @-mentioned in this message (groups). A single `0` means
   * @everyone. Empty/absent when nobody was mentioned. The client uses this to
   * highlight the @tags in the bubble.
   */
  mentioned_user_ids?: number[];
  /**
   * Client-supplied nonce for optimistic-send reconciliation. Echoed back on
   * the stored message + the realtime `message:new` event so the client can
   * replace its temporary bubble instead of rendering a duplicate. Server
   * messages from other users won't carry one.
   */
  client_msg_id?: string | null;
  /** The message this one replies to / quotes, if any. */
  reply_to?: ReplyQuote | null;
  /** Aggregated emoji reactions on this message (empty when none). */
  reactions?: MessageReaction[];
  /** Original sender's name when this message was forwarded (null otherwise). */
  forwarded_from?: string | null;
  /**
   * True for system event notices ("X left the group", "Y was added"). Rendered
   * centered + author-less; not interactive (no ticks/reactions/menu).
   */
  is_system?: boolean;
  /** True when this message is pinned in the conversation. */
  is_pinned?: boolean;
  created_at: string;
  edited_at: string | null;
}

/** One emoji's reaction tally on a message. */
export interface MessageReaction {
  emoji: string;
  /** How many people reacted with this emoji. */
  count: number;
  /** Whether the current user is one of them (drives the highlighted pill). */
  reacted: boolean;
  /** Names of reactors (for the hover tooltip), capped client-side if long. */
  names: string[];
}

/** A compact snippet of the message being replied to (shown as a quote). */
export interface ReplyQuote {
  id: number;
  sender_name: string;
  /** Quoted text (truncated server-side); empty for attachment-only. */
  body: string;
  /** True when the quoted message carried a file/photo. */
  has_attachment: boolean;
  /** True when the quoted message was since deleted (render "deleted"). */
  is_deleted: boolean;
}

/** One recipient's delivery/read state for a specific message (group panel). */
export interface ChatMessageReceipt {
  recipient_id: number;
  name: string;
  photo_path: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

/** The per-name "Read by / Delivered to / Pending" breakdown for a message. */
export interface MessageReceiptBreakdown {
  message_id: number;
  read: ChatMessageReceipt[];
  delivered: ChatMessageReceipt[];
  pending: ChatMessageReceipt[];
}

/** A single message's resolved tick state, used by tick:resync / GET /ticks. */
export interface MessageTick {
  message_id: number;
  tick_status: TickStatus;
  /** Group aggregate counts (delivered/read out of total active recipients). */
  agg: { delivered_count: number; read_count: number; total_recipients: number };
}

/** A message-body search hit, used to deep-link into a conversation. */
export interface MessageSearchResult {
  message_id: number;
  conversation_id: number;
  /** Conversation display title (group name or the other person's name). */
  conversation_title: string;
  conversation_type: ConversationType;
  sender_name: string;
  /** The matching message body (full, for snippet/highlight on the client). */
  body: string;
  created_at: string;
}

/** A conversation as shown in the sidebar list (with derived display fields). */
export interface ConversationSummary {
  id: number;
  type: ConversationType;
  /** Who created the conversation (the group "owner" who can manage members). */
  created_by: number;
  /** For direct chats this is the other person's name; for groups the group name. */
  title: string;
  /** The other participant for direct chats (null for groups). */
  counterpart: ChatParticipant | null;
  participants: ChatParticipant[];
  /** Group description (groups only). */
  description?: string | null;
  /** Group avatar serving URL (groups only). */
  avatar_url?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  /** The current user's last-read message id (0 if none) — drives the unread
   *  divider and scroll-to-first-unread on open. */
  my_last_read_id: number;
  /** True when the current user has muted this conversation (no notifications). */
  is_muted: boolean;
  /** True when the current user has archived this conversation (hidden from list). */
  is_archived: boolean;
  /** True when this is the user's personal "self chat" / notes space. */
  is_self?: boolean;
}
