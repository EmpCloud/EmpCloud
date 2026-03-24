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
  HR_MANAGER = "hr_manager",
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
  USER_INVITED = "user_invited",
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
  LEAVE_APPLIED = "leave_applied",
  LEAVE_APPROVED = "leave_approved",
  LEAVE_REJECTED = "leave_rejected",
  LEAVE_CANCELLED = "leave_cancelled",
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
  // Events
  EVENT_CREATED = "event_created",
  EVENT_CANCELLED = "event_cancelled",
  // Whistleblowing
  WHISTLEBLOWER_REPORT_SUBMITTED = "whistleblower_report_submitted",
  WHISTLEBLOWER_INVESTIGATOR_ASSIGNED = "whistleblower_investigator_assigned",
  WHISTLEBLOWER_UPDATE_ADDED = "whistleblower_update_added",
  WHISTLEBLOWER_STATUS_CHANGED = "whistleblower_status_changed",
  WHISTLEBLOWER_ESCALATED = "whistleblower_escalated",
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: number;
  organization_id: number;
  user_id: number;
  leave_type_id: number;
  year: number;
  total_allocated: number;
  total_used: number;
  total_carry_forward: number;
  balance: number;
  created_at: string;
  updated_at: string;
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
