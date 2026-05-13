// =============================================================================
// EMP CLOUD — Permission catalogue
// Single source of truth for every permission in the system.
// Consumed by:
//   - server: requirePermission() middleware
//   - server: roles CRUD (validates that posted permissions are real)
//   - server: system role seed (sets defaults per role)
//   - client: role-builder UI (renders the checkbox tree)
//   - external modules (payroll, exit, performance, …) via @empcloud/shared
// =============================================================================

export interface PermissionDef {
  /** stable string key — `<resource>:<action>` */
  key: string;
  /** UI label for the role-builder */
  label: string;
  /** UI group — usually the resource name */
  group: string;
  /** scope hint — used by view_team / view_all helpers, optional */
  scope?: "own" | "team" | "all";
  /** short description for the role-builder tooltip */
  description: string;
}

/**
 * Helper to declare a permission. Keeps the literal list below readable.
 */
const p = (
  key: string,
  label: string,
  group: string,
  description: string,
  scope?: PermissionDef["scope"],
): PermissionDef => ({ key, label, group, description, scope });

// ---------------------------------------------------------------------------
// The catalogue. Add / remove / rename here.
// IMPORTANT: never reuse a key after deleting it (breaks existing role rows).
// ---------------------------------------------------------------------------

export const PERMISSIONS: PermissionDef[] = [
  // ── Attendance ──
  p("attendance:view", "View own attendance", "Attendance", "See your own attendance log", "own"),
  p("attendance:view_team", "View team attendance", "Attendance", "See your direct reports' attendance", "team"),
  p("attendance:view_all", "View all attendance", "Attendance", "See every employee's attendance", "all"),
  p("attendance:regularize", "Request regularization", "Attendance", "Submit attendance regularization requests"),
  p("attendance:approve_regularization_team", "Approve regularization (team)", "Attendance", "Approve / reject regularization requests from your direct reports", "team"),
  p("attendance:approve_regularization_all", "Approve regularization (all)", "Attendance", "Approve / reject regularization requests from anyone in the org", "all"),
  p("attendance:manage", "Manage attendance", "Attendance", "Edit any user's attendance, manage shifts and policies"),

  // ── Leave ──
  p("leave:view", "View own leaves", "Leave", "See your own leave history and balance", "own"),
  p("leave:view_team", "View team leaves", "Leave", "See your direct reports' leave history", "team"),
  p("leave:view_all", "View all leaves", "Leave", "See every employee's leave history", "all"),
  p("leave:apply", "Apply for leave", "Leave", "Submit leave applications"),
  p("leave:approve", "Approve leave", "Leave", "Approve / reject leave for your team"),
  p("leave:manage_policies", "Manage leave policies", "Leave", "Create / edit org leave policies"),
  p("leave:override_balance", "Override leave balance", "Leave", "Adjust any user's leave balance directly"),

  // ── Documents ──
  p("documents:view", "View documents", "Documents", "View documents shared with you", "own"),
  p("documents:upload", "Upload documents", "Documents", "Upload documents to your profile"),
  p("documents:share", "Share documents", "Documents", "Share documents with other employees"),
  p("documents:manage", "Manage documents", "Documents", "View / edit / delete any document"),

  // ── Announcements ──
  p("announcements:view", "View announcements", "Announcements", "Read org-wide announcements"),
  p("announcements:create", "Create announcements", "Announcements", "Post new announcements"),
  p("announcements:manage", "Manage announcements", "Announcements", "Edit / delete any announcement and pin them"),

  // ── Policies ──
  p("policies:view", "View policies", "Policies", "Read org policies"),
  p("policies:acknowledge", "Acknowledge policies", "Policies", "Mark policies as acknowledged"),
  p("policies:create", "Create policies", "Policies", "Publish new policies"),
  p("policies:manage", "Manage policies", "Policies", "Edit / delete / track acknowledgments on any policy"),

  // ── Assets ──
  p("assets:view", "View own assets", "Assets", "See assets assigned to you", "own"),
  p("assets:request", "Request assets", "Assets", "Raise asset requests"),
  p("assets:assign", "Assign assets", "Assets", "Allocate assets to employees"),
  p("assets:manage", "Manage assets", "Assets", "Full asset CRUD, including procurement and disposal"),

  // ── Employees ──
  p("employees:view", "View own profile", "Employees", "View your own employee profile", "own"),
  p("employees:view_team", "View team profiles", "Employees", "View your direct reports' profiles", "team"),
  p("employees:view_all", "View all profiles", "Employees", "View any employee's profile in the org", "all"),
  p("employees:edit_own", "Edit own profile", "Employees", "Update fields on your own profile (limited set)", "own"),
  p("employees:edit_all", "Edit any profile", "Employees", "Update any employee's profile fields", "all"),
  p("employees:invite", "Invite employees", "Employees", "Send onboarding invitations to new hires"),
  p("employees:deactivate", "Deactivate employees", "Employees", "Disable employee accounts"),
  p("employees:change_role", "Change employee role", "Employees", "Modify the system role assigned to a user"),

  // ── Probation ──
  p("probation:view", "View probation tracking", "Probation", "See who is on probation, due dates, dashboard stats"),
  p("probation:manage", "Manage probation", "Probation", "Confirm probation, extend probation, mark fail"),

  // ── Positions ──
  p("positions:view", "View positions", "Positions", "Browse the position catalogue"),
  p("positions:manage", "Manage positions", "Positions", "Create / edit / archive positions"),

  // ── Org chart ──
  p("org_chart:view", "View org chart", "Org Chart", "Browse the organization tree"),
  p("org_chart:edit", "Edit org chart", "Org Chart", "Reassign reporting relationships"),

  // ── Custom fields ──
  p("custom_fields:view", "View custom fields", "Custom Fields", "Read custom field definitions"),
  p("custom_fields:manage", "Manage custom fields", "Custom Fields", "Create / edit / delete custom fields"),

  // ── Org settings ──
  p("org_settings:view", "View org settings", "Settings", "View organization configuration"),
  p("org_settings:manage", "Manage org settings", "Settings", "Update org branding, locale, password policy, etc."),

  // ── Roles & permissions (this feature) ──
  p("roles:view", "View roles", "Roles & Permissions", "List the org's custom roles"),
  p("roles:manage", "Manage roles", "Roles & Permissions", "Create / edit / delete custom roles and assign them to users"),

  // ── Audit ──
  p("audit:view", "View audit log", "Audit", "See the org's audit trail"),
  p("audit:export", "Export audit log", "Audit", "Download audit log as CSV"),

  // ── Billing ──
  p("billing:view", "View billing", "Billing", "View invoices, payment history, plan details"),
  p("billing:manage", "Manage billing", "Billing", "Update payment methods, download invoices, manage tax info"),

  // ── Subscriptions ──
  p("subscriptions:view", "View subscriptions", "Subscriptions", "See which modules are subscribed"),
  p("subscriptions:manage_seats", "Manage seats", "Subscriptions", "Add / remove module seats for users"),
  p("subscriptions:cancel", "Cancel subscriptions", "Subscriptions", "Cancel module subscriptions"),
  p("subscriptions:add_module", "Add modules", "Subscriptions", "Subscribe to new modules"),

  // ── Notifications ──
  p("notifications:view", "View notifications", "Notifications", "Read your notifications"),
  p("notifications:send_org_wide", "Send org-wide notifications", "Notifications", "Push notifications to the whole org"),

  // ── Helpdesk ──
  p("helpdesk:view_own", "View own tickets", "Helpdesk", "See tickets you raised", "own"),
  p("helpdesk:view_all", "View all tickets", "Helpdesk", "See all tickets in the org", "all"),
  p("helpdesk:create_ticket", "Create ticket", "Helpdesk", "Open a new helpdesk ticket"),
  p("helpdesk:assign", "Assign tickets", "Helpdesk", "Assign tickets to agents"),
  p("helpdesk:close", "Close tickets", "Helpdesk", "Resolve / close tickets"),
  p("helpdesk:manage_settings", "Manage helpdesk", "Helpdesk", "Configure categories, SLA, escalation rules"),

  // ── Chatbot ──
  p("chatbot:use", "Use chatbot", "Chatbot", "Chat with the AI assistant"),
  p("chatbot:manage_kb", "Manage knowledge base", "Chatbot", "Add / edit / remove knowledge-base articles"),

  // ── Whistleblowing ──
  p("whistleblowing:submit", "Submit report", "Whistleblowing", "File a confidential whistleblower report"),
  p("whistleblowing:view", "View reports", "Whistleblowing", "See submitted reports (anonymized as configured)"),
  p("whistleblowing:assign", "Assign reports", "Whistleblowing", "Route reports to investigators"),
  p("whistleblowing:manage", "Manage reports", "Whistleblowing", "Resolve, escalate, configure the program"),

  // ── Surveys ──
  p("surveys:submit", "Take surveys", "Surveys", "Respond to surveys"),
  p("surveys:view", "View results", "Surveys", "View survey results"),
  p("surveys:create", "Create surveys", "Surveys", "Create new surveys"),
  p("surveys:manage", "Manage surveys", "Surveys", "Edit / delete / configure surveys"),

  // ── Forum ──
  p("forum:read", "Read forum", "Forum", "Read posts and replies"),
  p("forum:post", "Post on forum", "Forum", "Create new posts and replies"),
  p("forum:moderate", "Moderate forum", "Forum", "Pin, lock, and remove posts"),

  // ── Anonymous feedback ──
  p("feedback:submit", "Submit feedback", "Feedback", "Submit anonymous feedback"),
  p("feedback:view", "View feedback", "Feedback", "View submitted feedback"),
  p("feedback:respond", "Respond to feedback", "Feedback", "Reply to feedback threads"),

  // ── Events ──
  p("events:view", "View events", "Events", "Browse upcoming events"),
  p("events:create", "Create events", "Events", "Create new events"),
  p("events:manage", "Manage events", "Events", "Edit / delete / publish events"),

  // ── Wellness ──
  p("wellness:submit", "Submit check-in", "Wellness", "Log your wellness check-in", "own"),
  p("wellness:view_team", "View team wellness", "Wellness", "View team wellness summary", "team"),
  p("wellness:view_all", "View all wellness", "Wellness", "View org-wide wellness analytics", "all"),
  p("wellness:manage", "Manage wellness", "Wellness", "Configure wellness program"),

  // ── Biometrics ──
  p("biometrics:view_own", "View own biometric data", "Biometrics", "See your own biometric records", "own"),
  p("biometrics:view_all", "View all biometric data", "Biometrics", "See any user's biometric records", "all"),
  p("biometrics:enroll_self", "Enroll own biometric", "Biometrics", "Enroll your face / fingerprint"),
  p("biometrics:manage_devices", "Manage biometric devices", "Biometrics", "Configure devices, kiosks, sync settings"),

  // ── Modules access ──
  p("modules_access:view", "View module access", "Modules Access", "See which users have access to which modules"),
  p("modules_access:manage", "Manage module access", "Modules Access", "Toggle module access for users"),

  // ── Payroll (consumed by emp-payroll) ──
  p("payroll:view_own", "View own payslip", "Payroll", "See your own payslips", "own"),
  p("payroll:view_all", "View all payslips", "Payroll", "See every employee's payslips", "all"),
  p("payroll:run", "Run payroll", "Payroll", "Trigger a payroll run"),
  p("payroll:approve_run", "Approve payroll run", "Payroll", "Sign off on a payroll run"),
  p("payroll:view_reports", "View payroll reports", "Payroll", "View payroll analytics and tax reports"),
  p("payroll:export", "Export payroll", "Payroll", "Download payroll data and bank-transfer files"),

  // ── Salary ──
  p("salary:view", "View own salary", "Salary", "See your own salary structure", "own"),
  p("salary:view_all", "View any salary", "Salary", "See any employee's salary structure", "all"),
  p("salary:edit", "Edit salary", "Salary", "Modify salary components and CTC"),
  p("salary:view_history", "View salary history", "Salary", "See past salary revisions"),
  p("salary:approve_changes", "Approve salary changes", "Salary", "Sign off on salary revisions"),

  // ── Exit (consumed by emp-exit) ──
  p("exit:view_own", "View own exit case", "Exit", "See your own exit / FNF status", "own"),
  p("exit:view_all", "View all exit cases", "Exit", "See every employee's exit case", "all"),
  p("exit:initiate", "Initiate exit", "Exit", "Start an exit / resignation case"),
  p("exit:approve", "Approve exit", "Exit", "Approve resignations and FNF settlements"),
  p("exit:manage_settings", "Manage exit settings", "Exit", "Configure exit checklist and templates"),

  // ── Performance (consumed by emp-performance) ──
  p("performance:view_own", "View own reviews", "Performance", "See your own performance reviews", "own"),
  p("performance:view_team", "View team reviews", "Performance", "See your direct reports' reviews", "team"),
  p("performance:view_all", "View all reviews", "Performance", "See every employee's performance review", "all"),
  p("performance:conduct_review", "Conduct review", "Performance", "Conduct a performance review"),
  p("performance:manage_cycles", "Manage cycles", "Performance", "Create / edit performance cycles"),
  p("performance:manage_settings", "Manage performance settings", "Performance", "Configure templates, competencies, calibration"),

  // ── Recruit (consumed by emp-recruit) ──
  p("recruit:view", "View jobs", "Recruit", "View open positions and candidates"),
  p("recruit:create_job", "Create job", "Recruit", "Post new job openings"),
  p("recruit:manage_pipeline", "Manage pipeline", "Recruit", "Move candidates through the hiring pipeline"),
  p("recruit:hire", "Hire candidate", "Recruit", "Mark a candidate as hired and trigger onboarding"),
  p("recruit:manage_settings", "Manage recruit settings", "Recruit", "Configure pipeline stages, scorecards"),

  // ── LMS (consumed by emp-lms) ──
  p("lms:view", "View courses", "LMS", "Browse the course catalogue"),
  p("lms:enroll_self", "Enroll in courses", "LMS", "Enroll yourself in a course"),
  p("lms:assign_courses", "Assign courses", "LMS", "Assign courses to other employees"),
  p("lms:create_course", "Create course", "LMS", "Author new courses"),
  p("lms:manage_settings", "Manage LMS settings", "LMS", "Configure certifications, learning paths, compliance training"),

  // ── Rewards (consumed by emp-rewards) ──
  p("rewards:view", "View rewards", "Rewards", "See rewards and recognition feed"),
  p("rewards:nominate", "Nominate", "Rewards", "Nominate employees for rewards"),
  p("rewards:approve", "Approve rewards", "Rewards", "Approve nominations and award points"),
  p("rewards:manage_settings", "Manage rewards settings", "Rewards", "Configure reward types, budgets, redemption"),

  // ── Monitor (consumed by emp-monitor) ──
  p("monitor:view_own", "View own monitor data", "Monitor", "See your own activity tracking", "own"),
  p("monitor:view_team", "View team monitor data", "Monitor", "See team activity tracking", "team"),
  p("monitor:view_all", "View all monitor data", "Monitor", "See org-wide activity tracking", "all"),
  p("monitor:manage_settings", "Manage monitor settings", "Monitor", "Configure tracking policies, idle thresholds, screenshots"),

  // ── Field (consumed by emp-field) ──
  p("field:view_own", "View own field check-ins", "Field", "See your own GPS check-ins", "own"),
  p("field:view_team", "View team field check-ins", "Field", "See team GPS check-ins", "team"),
  p("field:view_all", "View all field check-ins", "Field", "See org-wide field check-ins", "all"),
  p("field:check_in", "GPS check-in", "Field", "Check in from a field location"),
  p("field:manage_settings", "Manage field settings", "Field", "Configure routes, geofences, attendance rules"),

  // ── Projects (consumed by emp-projects) ──
  p("projects:view", "View projects", "Projects", "View projects you're a member of"),
  p("projects:create", "Create projects", "Projects", "Create new projects"),
  p("projects:manage_tasks", "Manage tasks", "Projects", "Create / edit / assign tasks"),
  p("projects:view_reports", "View project reports", "Projects", "View project analytics and time-tracking reports"),
  p("projects:manage_settings", "Manage projects settings", "Projects", "Configure workflows, time-tracking rules"),
];

/** Set form for O(1) validation. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.map((d) => d.key));

/** Group permissions by their UI group, preserving declaration order within each group. */
export function groupPermissions(): Record<string, PermissionDef[]> {
  const groups: Record<string, PermissionDef[]> = {};
  for (const def of PERMISSIONS) {
    (groups[def.group] ||= []).push(def);
  }
  return groups;
}

/** Validate that every key in the given list is real. Returns the list of unknown keys (empty = ok). */
export function findUnknownPermissions(keys: string[]): string[] {
  return keys.filter((k) => !PERMISSION_KEYS.has(k));
}

// ---------------------------------------------------------------------------
// System role defaults
// Keep the keys in lockstep with UserRole; these are seeded into the `roles`
// table during migration 062 with organization_id = NULL and type = 0.
// ---------------------------------------------------------------------------

const ALL = PERMISSIONS.map((p) => p.key);

const HR_EXCLUDED = new Set<string>([
  // Org-admin-only permissions HR shouldn't get
  "billing:view",
  "billing:manage",
  "subscriptions:cancel",
  "subscriptions:add_module",
  "subscriptions:manage_seats",
  "subscriptions:view",
  "modules_access:manage",
  "roles:manage",
  "org_settings:manage",
  "audit:export",
]);

const MANAGER_KEYS: string[] = [
  "attendance:view", "attendance:view_team", "attendance:regularize", "attendance:approve_regularization_team",
  "leave:view", "leave:view_team", "leave:apply", "leave:approve",
  "documents:view", "documents:upload",
  "announcements:view", "policies:view", "policies:acknowledge",
  "assets:view", "assets:request",
  "employees:view", "employees:view_team", "employees:edit_own",
  "positions:view", "org_chart:view",
  "notifications:view", "helpdesk:view_own", "helpdesk:create_ticket",
  "chatbot:use", "surveys:submit", "forum:read", "forum:post",
  "feedback:submit", "events:view",
  "wellness:submit", "wellness:view_team",
  "biometrics:view_own", "biometrics:enroll_self",
  "payroll:view_own", "salary:view",
  "exit:view_own",
  "performance:view_own", "performance:view_team", "performance:conduct_review",
  "lms:view", "lms:enroll_self",
  "rewards:view", "rewards:nominate",
  "monitor:view_own", "monitor:view_team",
  "field:view_own", "field:view_team", "field:check_in",
  "projects:view", "projects:create", "projects:manage_tasks",
];

const EMPLOYEE_KEYS: string[] = [
  "attendance:view", "attendance:regularize",
  "leave:view", "leave:apply",
  "documents:view", "documents:upload",
  "announcements:view", "policies:view", "policies:acknowledge",
  "assets:view", "assets:request",
  "employees:view", "employees:edit_own",
  "positions:view", "org_chart:view",
  "notifications:view", "helpdesk:view_own", "helpdesk:create_ticket",
  "chatbot:use", "surveys:submit", "forum:read", "forum:post",
  "feedback:submit", "events:view",
  "wellness:submit",
  "biometrics:view_own", "biometrics:enroll_self",
  "payroll:view_own", "salary:view",
  "exit:view_own",
  "performance:view_own",
  "lms:view", "lms:enroll_self",
  "rewards:view",
  "monitor:view_own",
  "field:view_own", "field:check_in",
  "projects:view",
];

export const SYSTEM_ROLE_DEFAULTS: Record<string, string[]> = {
  org_admin: ALL,
  hr_admin: ALL.filter((k) => !HR_EXCLUDED.has(k)),
  manager: MANAGER_KEYS,
  employee: EMPLOYEE_KEYS,
};

// Sanity check at module load: catch typos in MANAGER_KEYS / EMPLOYEE_KEYS.
// Surfaces as a thrown error in dev / test so a typo can't silently ship.
const _bad = [
  ...MANAGER_KEYS.filter((k) => !PERMISSION_KEYS.has(k)).map((k) => `manager:${k}`),
  ...EMPLOYEE_KEYS.filter((k) => !PERMISSION_KEYS.has(k)).map((k) => `employee:${k}`),
];
if (_bad.length > 0) {
  throw new Error(
    `[permissions catalogue] unknown keys in system role defaults: ${_bad.join(", ")}`,
  );
}
