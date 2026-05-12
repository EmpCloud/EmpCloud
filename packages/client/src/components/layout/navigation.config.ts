import {
  LayoutDashboard,
  Users,
  Package,
  Settings,
  Shield,
  Building2,
  Contact,
  Clock,
  CalendarDays,
  FileText,
  Receipt,
  Megaphone,
  BookOpen,
  Network,
  Crown,
  ScrollText,
  CreditCard,
  TrendingUp,
  Headphones,
  TicketCheck,
  BookMarked,
  ClipboardList,
  BarChart3,
  Laptop,
  FolderOpen,
  Briefcase,
  Target,
  MessageSquarePlus,
  MessageSquare,
  PartyPopper,
  CalendarCheck,
  ShieldAlert,
  Search,
  BotMessageSquare,
  MessagesSquare,
  PenSquare,
  Heart,
  Dumbbell,
  Smile,
  UsersRound,
  Gift,
  SlidersHorizontal,
  AlarmClock,
  CalendarRange,
  Sparkles,
  UserCircle,
  Activity,
  DatabaseZap,
  Bell,
  UserCheck,
  KeyRound,
  History,
} from "lucide-react";

export type NavItem = {
  path: string;
  label: string;
  i18nKey?: string;
  icon: any;
  badge?: string;
  children?: NavItem[];
  /**
   * RBAC v1 — if set, the item is only visible to users whose effective
   * permissions intersect with this list (OR semantics). Items without
   * this field are visible to everyone. Used to surface admin-side nav
   * items to non-HR users with custom roles that grant the relevant
   * permissions.
   */
  requiredPermissions?: string[];
};

// Items visible to ALL users (including employees)
export const employeeNavItems: NavItem[] = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/my-profile", label: "My Profile", i18nKey: "nav.myProfile", icon: Contact },
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare, badge: "AI", requiredPermissions: ["chatbot:use"] },
  { path: "/manager", label: "My Team", i18nKey: "nav.myTeam", icon: UsersRound },
  { path: "/attendance/my", label: "Attendance", i18nKey: "nav.attendance", icon: Clock },
  { path: "/leave", label: "Leave & Time Off", i18nKey: "nav.leave", icon: CalendarDays, children: [
    { path: "/leave", label: "Leave", i18nKey: "nav.leaveManagement", icon: CalendarDays },
    { path: "/leave/comp-off", label: "Comp-Off", i18nKey: "nav.compOff", icon: Gift },
    { path: "/holidays", label: "Holidays", i18nKey: "nav.holidays", icon: PartyPopper },
  ]},
  { path: "/documents", label: "Company", i18nKey: "nav.company", icon: Building2, children: [
    { path: "/documents", label: "Documents", i18nKey: "nav.documents", icon: FileText },
    { path: "/announcements", label: "Announcements", i18nKey: "nav.announcements", icon: Megaphone },
    { path: "/policies", label: "Policies", i18nKey: "nav.policies", icon: BookOpen },
  ]},
  { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network, requiredPermissions: ["org_chart:view", "org_chart:edit"] },
  { path: "/helpdesk/my-tickets", label: "Workplace", i18nKey: "nav.workplace", icon: Headphones, children: [
    { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
    { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
    { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.activeSurveys", icon: ClipboardList },
    { path: "/assets/my", label: "My Assets", i18nKey: "nav.myAssets", icon: Laptop },
    { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.submitFeedback", icon: MessageSquarePlus },
    { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.myFeedback", icon: MessageSquare },
    { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
    { path: "/wellness/my", label: "My Wellness", i18nKey: "nav.myWellness", icon: Dumbbell },
    { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "nav.wellnessCheckIn", icon: Smile },
  ]},
  { path: "/forum", label: "Community", i18nKey: "nav.community", icon: MessagesSquare, children: [
    { path: "/feed", label: "Feed", i18nKey: "nav.feed", icon: MessagesSquare },
    { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
    { path: "/forum/new", label: "Create Post", i18nKey: "nav.createPost", icon: PenSquare },
    { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
    { path: "/events/my", label: "My Events", i18nKey: "nav.myEvents", icon: CalendarCheck },
    { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "nav.submitReport", icon: ShieldAlert },
    { path: "/whistleblowing/track", label: "Track Report", i18nKey: "nav.trackReport", icon: Search },
  ]},
  // Self-service password change — visible to every signed-in user.
  { path: "/change-password", label: "Change Password", i18nKey: "nav.changePassword", icon: KeyRound },
];

// Items visible only to HR Admin, Org Admin, Super Admin — by default. With
// RBAC v1 these items also surface for non-HR users who have the required
// permissions (via custom roles). Items without `requiredPermissions` stay
// HR-only when injected into the employee sidebar.
export const adminNavItems: NavItem[] = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/self-service", label: "Self Service", i18nKey: "nav.selfService", icon: UserCircle },
  { path: "/modules", label: "Modules", i18nKey: "nav.modules", icon: Package, requiredPermissions: ["modules_access:view", "modules_access:manage", "subscriptions:view"], children: [
    { path: "/modules", label: "Marketplace", i18nKey: "nav.modules", icon: Package, requiredPermissions: ["subscriptions:view", "subscriptions:add_module"] },
    { path: "/modules/access", label: "Module Access", i18nKey: "nav.moduleAccess", icon: Shield, requiredPermissions: ["modules_access:view", "modules_access:manage"] },
  ]},
  { path: "/billing", label: "Billing", i18nKey: "nav.billing", icon: Receipt, requiredPermissions: ["billing:view", "billing:manage"] },
  { path: "/employees", label: "People", i18nKey: "nav.people", icon: Users, requiredPermissions: ["employees:view_all", "employees:edit_all", "employees:invite"], children: [
    { path: "/employees", label: "Employees", i18nKey: "nav.employees", icon: Contact, requiredPermissions: ["employees:view_all"] },
    { path: "/employees/probation", label: "Probation", i18nKey: "nav.probation", icon: UserCheck, requiredPermissions: ["employees:view_all", "employees:edit_all"] },
    { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network, requiredPermissions: ["org_chart:view", "org_chart:edit"] },
  ]},
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare, badge: "AI", requiredPermissions: ["chatbot:use"] },
  { path: "/manager", label: "My Team", i18nKey: "nav.myTeam", icon: UsersRound },
  { path: "/attendance", label: "Attendance", i18nKey: "nav.attendance", icon: Clock, requiredPermissions: ["attendance:view_team", "attendance:view_all", "attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"], children: [
    // The "View Attendance" page (AttendanceDashboardPage) renders the
    // employee records grid. Visible to anyone with team-or-broader
    // attendance read access — the page itself scopes the data to the
    // user's permission level (team vs all-org).
    { path: "/attendance", label: "View Attendance", i18nKey: "nav.viewAttendance", icon: Clock, requiredPermissions: ["attendance:view_team", "attendance:view_all", "attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"] },
    // Detailed grid -- date columns 1..31 with single-letter codes
    // (P / A / H / L / WO / HO). Double-click any cell to update.
    { path: "/attendance/grid", label: "Attendance Grid", i18nKey: "nav.attendanceGrid", icon: CalendarRange, requiredPermissions: ["attendance:view_all", "attendance:manage"] },
    { path: "/attendance/shifts", label: "Shift Settings", i18nKey: "nav.shiftSettings", icon: AlarmClock, requiredPermissions: ["attendance:manage"] },
    { path: "/attendance/shift-schedule", label: "Shift Schedule", i18nKey: "nav.shiftSchedule", icon: CalendarRange, requiredPermissions: ["attendance:manage"] },
    { path: "/attendance/regularizations", label: "Regularizations", i18nKey: "nav.regularizations", icon: ClipboardList, requiredPermissions: ["attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"] },
    { path: "/attendance/settings", label: "Attendance Settings", i18nKey: "nav.attendanceSettings", icon: SlidersHorizontal, requiredPermissions: ["attendance:manage"] },
    // Biometric PIN moved here from the org-admin-only top-level group --
    // it's an attendance setup task (kiosk authentication) and HR
    // expected to find it under Attendance.
    { path: "/biometrics/kiosk-pin", label: "Biometric PIN", i18nKey: "nav.biometricPin", icon: KeyRound },
  ]},
  { path: "/leave", label: "Leave & Time Off", i18nKey: "nav.leave", icon: CalendarDays, requiredPermissions: ["leave:view_all", "leave:approve", "leave:manage_policies", "leave:override_balance"], children: [
    { path: "/leave", label: "Leave", i18nKey: "nav.leaveManagement", icon: CalendarDays, requiredPermissions: ["leave:view_all", "leave:approve"] },
    { path: "/leave/comp-off", label: "Comp-Off", i18nKey: "nav.compOff", icon: Gift, requiredPermissions: ["leave:view_all", "leave:approve"] },
    { path: "/holidays", label: "Holidays", i18nKey: "nav.holidays", icon: PartyPopper },
  ]},
  { path: "/documents", label: "Company", i18nKey: "nav.company", icon: Building2, children: [
    { path: "/documents", label: "Documents", i18nKey: "nav.documents", icon: FileText },
    { path: "/announcements", label: "Announcements", i18nKey: "nav.announcements", icon: Megaphone },
    { path: "/policies", label: "Policies", i18nKey: "nav.policies", icon: BookOpen },
  ]},
  { path: "/helpdesk/my-tickets", label: "Workplace", i18nKey: "nav.workplace", icon: Headphones, children: [
    { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
    { path: "/helpdesk/tickets", label: "All Tickets", i18nKey: "helpdesk.allTickets", icon: TicketCheck },
    { path: "/helpdesk/dashboard", label: "Helpdesk Dashboard", i18nKey: "nav.helpdesk", icon: Headphones },
    { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
    { path: "/surveys/dashboard", label: "Survey Dashboard", i18nKey: "nav.surveyDashboard", icon: BarChart3 },
    { path: "/surveys/list", label: "All Surveys", i18nKey: "nav.surveys", icon: ClipboardList },
    { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.activeSurveys", icon: ClipboardList },
    { path: "/assets/dashboard", label: "Asset Dashboard", i18nKey: "nav.assetDashboard", icon: BarChart3 },
    { path: "/assets", label: "All Assets", i18nKey: "nav.assets", icon: Laptop },
    { path: "/assets/categories", label: "Asset Categories", i18nKey: "nav.assetCategories", icon: FolderOpen },
    { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.submitFeedback", icon: MessageSquarePlus },
    { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.myFeedback", icon: MessageSquare },
    { path: "/feedback", label: "All Feedback", i18nKey: "nav.allFeedback", icon: MessageSquare },
    { path: "/feedback/dashboard", label: "Feedback Dashboard", i18nKey: "nav.feedbackDashboard", icon: BarChart3 },
    { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
    { path: "/wellness/my", label: "My Wellness", i18nKey: "nav.myWellness", icon: Dumbbell },
    { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "nav.wellnessCheckIn", icon: Smile },
    { path: "/wellness/dashboard", label: "Wellness Dashboard", i18nKey: "nav.wellnessDashboard", icon: BarChart3 },
  ]},
  { path: "/forum", label: "Community", i18nKey: "nav.community", icon: MessagesSquare, children: [
    { path: "/feed", label: "Feed", i18nKey: "nav.feed", icon: MessagesSquare },
    { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
    { path: "/forum/new", label: "Create Post", i18nKey: "nav.createPost", icon: PenSquare },
    { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
    { path: "/events/my", label: "My Events", i18nKey: "nav.myEvents", icon: CalendarCheck },
    { path: "/events/dashboard", label: "Event Dashboard", i18nKey: "nav.eventDashboard", icon: BarChart3 },
    { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "nav.submitReport", icon: ShieldAlert },
    { path: "/whistleblowing/track", label: "Track Report", i18nKey: "nav.trackReport", icon: Search },
    { path: "/whistleblowing/dashboard", label: "Whistleblowing Dashboard", i18nKey: "nav.whistleblowingDashboard", icon: BarChart3 },
    { path: "/whistleblowing/reports", label: "All Reports", i18nKey: "nav.allReports", icon: ClipboardList },
  ]},
  { path: "/settings", label: "Settings", i18nKey: "nav.settings", icon: Settings, requiredPermissions: ["org_settings:view", "org_settings:manage"] },
  { path: "/custom-fields", label: "Custom Fields", i18nKey: "nav.customFields", icon: SlidersHorizontal, requiredPermissions: ["custom_fields:view", "custom_fields:manage"] },
  { path: "/roles", label: "Roles & Permissions", i18nKey: "nav.rolesPermissions", icon: Shield, requiredPermissions: ["roles:view", "roles:manage"] },
  { path: "/audit", label: "Audit Log", i18nKey: "nav.audit", icon: History, requiredPermissions: ["audit:view", "audit:export"] },
];

// Positions is now rendered as a single collapsible parent (mirroring
// Attendance / Leave / Company), with its previous flat list moved
// under `children`. The DashboardLayout still mounts this array via
// NavSection, but NavSection treats a parent item with `children` as
// an expandable submenu.
export const positionNavItems: NavItem[] = [
  {
    path: "/positions",
    label: "Positions",
    i18nKey: "nav.positions",
    icon: Briefcase,
    children: [
      { path: "/positions", label: "Dashboard", i18nKey: "nav.dashboard", icon: BarChart3 },
      { path: "/positions/list", label: "All Positions", i18nKey: "nav.positions", icon: Briefcase },
      { path: "/positions/vacancies", label: "Vacancies", i18nKey: "nav.vacancies", icon: Target },
      { path: "/positions/headcount-plans", label: "Headcount Plans", i18nKey: "nav.headcountPlans", icon: ClipboardList },
    ],
  },
];

export const forumNavItems: NavItem[] = [
  { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
  { path: "/forum/new", label: "Create Post", i18nKey: "nav.createPost", icon: PenSquare },
];

export const forumHRNavItems: NavItem[] = [
  { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
  { path: "/forum/new", label: "Create Post", i18nKey: "nav.createPost", icon: PenSquare },
  { path: "/forum/dashboard", label: "Forum Dashboard", i18nKey: "nav.forumDashboard", icon: BarChart3 },
];

export const eventNavItems: NavItem[] = [
  { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
  { path: "/events/my", label: "My Events", i18nKey: "nav.myEvents", icon: CalendarCheck },
];

export const eventHRNavItems: NavItem[] = [
  { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
  { path: "/events/my", label: "My Events", i18nKey: "nav.myEvents", icon: CalendarCheck },
  { path: "/events/dashboard", label: "Event Dashboard", i18nKey: "nav.eventDashboard", icon: BarChart3 },
];

export const whistleblowingNavItems: NavItem[] = [
  { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "nav.submitReport", icon: ShieldAlert },
  { path: "/whistleblowing/track", label: "Track Report", i18nKey: "nav.trackReport", icon: Search },
];

export const whistleblowingHRNavItems: NavItem[] = [
  { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "nav.submitReport", icon: ShieldAlert },
  { path: "/whistleblowing/track", label: "Track Report", i18nKey: "nav.trackReport", icon: Search },
  { path: "/whistleblowing/dashboard", label: "Dashboard", i18nKey: "nav.dashboard", icon: BarChart3 },
  { path: "/whistleblowing/reports", label: "All Reports", i18nKey: "nav.allReports", icon: ClipboardList },
];

export const helpdeskNavItems: NavItem[] = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
  { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
];

export const helpdeskHRNavItems: NavItem[] = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
  { path: "/helpdesk/tickets", label: "All Tickets", i18nKey: "helpdesk.allTickets", icon: TicketCheck },
  { path: "/helpdesk/dashboard", label: "Helpdesk Dashboard", i18nKey: "nav.helpdesk", icon: Headphones },
  { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
];

export const surveyNavItems: NavItem[] = [
  { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.activeSurveys", icon: ClipboardList },
];

export const surveyHRNavItems: NavItem[] = [
  { path: "/surveys/dashboard", label: "Survey Dashboard", i18nKey: "nav.surveyDashboard", icon: BarChart3 },
  { path: "/surveys/list", label: "All Surveys", i18nKey: "nav.allSurveys", icon: ClipboardList },
  { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.activeSurveys", icon: ClipboardList },
];

export const wellnessNavItems: NavItem[] = [
  { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
  { path: "/wellness/my", label: "My Wellness", i18nKey: "nav.myWellness", icon: Dumbbell },
  { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "nav.dailyCheckIn", icon: Smile },
];

export const wellnessHRNavItems: NavItem[] = [
  { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
  { path: "/wellness/my", label: "My Wellness", i18nKey: "nav.myWellness", icon: Dumbbell },
  { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "nav.dailyCheckIn", icon: Smile },
  { path: "/wellness/dashboard", label: "Wellness Dashboard", i18nKey: "nav.wellnessDashboard", icon: BarChart3 },
];

export const assetNavItems: NavItem[] = [
  { path: "/assets/my", label: "My Assets", i18nKey: "nav.myAssets", icon: Laptop },
];

export const assetHRNavItems: NavItem[] = [
  { path: "/assets/dashboard", label: "Asset Dashboard", i18nKey: "nav.assetDashboard", icon: BarChart3 },
  { path: "/assets", label: "All Assets", i18nKey: "nav.allAssets", icon: Laptop },
  { path: "/assets/categories", label: "Categories", i18nKey: "nav.categories", icon: FolderOpen },
];

export const feedbackNavItems: NavItem[] = [
  { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.submitFeedback", icon: MessageSquarePlus },
  { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.myFeedback", icon: MessageSquare },
];

export const feedbackHRNavItems: NavItem[] = [
  { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.submitFeedback", icon: MessageSquarePlus },
  { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.myFeedback", icon: MessageSquare },
  { path: "/feedback", label: "All Feedback", i18nKey: "nav.allFeedback", icon: MessageSquare },
  { path: "/feedback/dashboard", label: "Feedback Dashboard", i18nKey: "nav.feedbackDashboard", icon: BarChart3 },
];

// Biometrics section deprecated — only the self-service Kiosk PIN page
// (under orgAdminOnlyNavItems) remains. Dashboard / Face Enrollment / QR /
// Devices / Logs / Settings pages are no longer surfaced; the v3 kiosk
// stack drives biometric attendance directly via /api/v3/biometric/*.
export const biometricsNavItems: NavItem[] = [];

// Items visible ONLY to org_admin (not hr_admin, not employees).
// Previously held "Biometric PIN" -- moved to the Attendance submenu
// (above) since HR setup expects to find kiosk auth alongside the
// other attendance configuration. This array is empty now but kept so
// DashboardLayout's mount point doesn't have to be removed; future
// org-admin-only nav entries can be appended here.
export const orgAdminOnlyNavItems: NavItem[] = [];

export const platformAdminNavItems: NavItem[] = [
  { path: "/admin", label: "Overview Dashboard", i18nKey: "nav.overviewDashboard", icon: Crown },
  { path: "/admin/organizations", label: "Organizations", i18nKey: "nav.organizations", icon: Building2 },
  { path: "/admin/modules", label: "Module Analytics", i18nKey: "nav.moduleAnalytics", icon: Package },
  { path: "/admin/revenue", label: "Revenue", i18nKey: "nav.revenue", icon: TrendingUp },
  { path: "/admin/subscriptions", label: "Subscriptions", i18nKey: "nav.subscriptions", icon: CreditCard },
  { path: "/admin/notifications", label: "System Notifications", i18nKey: "nav.systemNotifications", icon: Bell },
  { path: "/admin/health", label: "Service Health", i18nKey: "nav.serviceHealth", icon: Activity },
  { path: "/admin/data-sanity", label: "Data Sanity", i18nKey: "nav.dataSanity", icon: DatabaseZap },
  { path: "/admin/ai-config", label: "AI Configuration", i18nKey: "nav.aiConfiguration", icon: Sparkles },
  { path: "/admin/logs", label: "Log Dashboard", i18nKey: "nav.logDashboard", icon: ScrollText },
  { path: "/admin/audit", label: "Audit Log", i18nKey: "nav.audit", icon: Shield },
  { path: "/admin/settings", label: "Platform Settings", i18nKey: "nav.platformSettings", icon: Settings },
];

export const HR_ROLES = ["hr_admin", "org_admin"];

// ---------------------------------------------------------------------------
// Permission-driven filtering helpers (RBAC v1)
// ---------------------------------------------------------------------------

/**
 * Recursively filter a nav item against the user's effective permissions.
 * Returns null when the item itself is gated by perms the user doesn't have
 * AND none of its children pass either. Items without `requiredPermissions`
 * always pass (visible to everyone).
 *
 * Used to render an admin nav item to a non-HR user with a custom role that
 * grants the relevant permission(s).
 */
export function filterNavItem(item: NavItem, has: (...keys: string[]) => boolean): NavItem | null {
  const ownPasses = !item.requiredPermissions || has(...item.requiredPermissions);
  const filteredChildren = item.children
    ?.map((c) => filterNavItem(c, has))
    .filter((c): c is NavItem => c !== null);
  // Item passes if it self-passes OR any child passes (a parent with a
  // permission gate that the user fails should still render if a child does
  // — e.g. an unrestricted child link inside a restricted group).
  if (!ownPasses && (!filteredChildren || filteredChildren.length === 0)) return null;
  // If self-passes but children all got filtered, drop the children but keep
  // the parent.
  if (ownPasses && filteredChildren && filteredChildren.length === 0 && item.children?.length) {
    return { ...item, children: undefined };
  }
  return filteredChildren ? { ...item, children: filteredChildren } : item;
}

/**
 * For non-HR users: return the union of employeeNavItems + adminNavItems
 * filtered by the user's permissions. Admin items the user doesn't have
 * permission for are dropped. Items already present in the employee nav
 * (deduped by path) aren't re-added.
 */
export function buildEffectiveNav(
  base: NavItem[],
  extras: NavItem[],
  has: (...keys: string[]) => boolean,
): NavItem[] {
  const baselinePaths = new Set<string>();
  const collect = (items: NavItem[]) => {
    for (const i of items) {
      baselinePaths.add(i.path);
      if (i.children) collect(i.children);
    }
  };
  collect(base);

  const filtered = extras
    .map((i) => filterNavItem(i, has))
    .filter((i): i is NavItem => i !== null && !baselinePaths.has(i.path));

  return [...base, ...filtered];
}
