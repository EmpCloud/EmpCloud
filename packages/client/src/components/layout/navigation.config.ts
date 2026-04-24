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
  ScanFace,
  Fingerprint,
  QrCode,
  Smartphone,
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
} from "lucide-react";

export type NavItem = {
  path: string;
  label: string;
  i18nKey?: string;
  icon: any;
  badge?: string;
  children?: NavItem[];
};

// Items visible to ALL users (including employees)
export const employeeNavItems: NavItem[] = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/my-profile", label: "My Profile", i18nKey: "nav.myProfile", icon: Contact },
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare, badge: "AI" },
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
  { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network },
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
];

// Items visible only to HR Admin, Org Admin, Super Admin
export const adminNavItems: NavItem[] = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/self-service", label: "Self Service", i18nKey: "nav.selfService", icon: UserCircle },
  { path: "/modules", label: "Modules", i18nKey: "nav.modules", icon: Package, children: [
    { path: "/modules", label: "Marketplace", i18nKey: "nav.modules", icon: Package },
    { path: "/modules/access", label: "Module Access", i18nKey: "nav.moduleAccess", icon: Shield },
  ]},
  { path: "/billing", label: "Billing", i18nKey: "nav.billing", icon: Receipt },
  { path: "/employees", label: "People", i18nKey: "nav.people", icon: Users, children: [
    { path: "/employees", label: "Employees", i18nKey: "nav.employees", icon: Contact },
    { path: "/employees/probation", label: "Probation", i18nKey: "nav.probation", icon: UserCheck },
    { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network },
  ]},
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare, badge: "AI" },
  { path: "/manager", label: "My Team", i18nKey: "nav.myTeam", icon: UsersRound },
  { path: "/attendance", label: "Attendance", i18nKey: "nav.attendance", icon: Clock, children: [
    { path: "/attendance", label: "Dashboard", i18nKey: "nav.attendanceDashboard", icon: Clock },
    { path: "/attendance/shifts", label: "Shift Settings", i18nKey: "nav.shiftSettings", icon: AlarmClock },
    { path: "/attendance/shift-schedule", label: "Shift Schedule", i18nKey: "nav.shiftSchedule", icon: CalendarRange },
    { path: "/attendance/regularizations", label: "Regularizations", i18nKey: "nav.regularizations", icon: ClipboardList },
  ]},
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
  { path: "/settings", label: "Settings", i18nKey: "nav.settings", icon: Settings },
  { path: "/custom-fields", label: "Custom Fields", i18nKey: "nav.customFields", icon: SlidersHorizontal },
  { path: "/audit", label: "Audit Log", i18nKey: "nav.audit", icon: Shield },
];

export const positionNavItems: NavItem[] = [
  { path: "/positions", label: "Dashboard", i18nKey: "nav.dashboard", icon: BarChart3 },
  { path: "/positions/list", label: "All Positions", i18nKey: "nav.positions", icon: Briefcase },
  { path: "/positions/vacancies", label: "Vacancies", i18nKey: "nav.vacancies", icon: Target },
  { path: "/positions/headcount-plans", label: "Headcount Plans", i18nKey: "nav.headcountPlans", icon: ClipboardList },
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

export const biometricsNavItems: NavItem[] = [
  { path: "/biometrics", label: "Biometric Dashboard", i18nKey: "nav.biometrics", icon: ScanFace },
  { path: "/biometrics/kiosk-pin", label: "Biometric PIN", i18nKey: "nav.biometricPin", icon: KeyRound },
  { path: "/biometrics/enrollment", label: "Face Enrollment", i18nKey: "nav.faceEnrollment", icon: Fingerprint },
  { path: "/biometrics/qr", label: "QR Attendance", i18nKey: "nav.qrAttendance", icon: QrCode },
  { path: "/biometrics/devices", label: "Devices", i18nKey: "nav.devices", icon: Smartphone },
  { path: "/biometrics/logs", label: "Biometric Logs", i18nKey: "nav.biometricLogs", icon: ScrollText },
  { path: "/biometrics/settings", label: "Biometric Settings", i18nKey: "nav.biometricSettings", icon: Settings },
];

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
