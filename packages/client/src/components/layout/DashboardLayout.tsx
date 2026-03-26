import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  LayoutDashboard,
  Users,
  Package,
  Settings,
  Shield,
  LogOut,
  Building2,
  Contact,
  Clock,
  CalendarDays,
  FileText,
  Receipt,
  Megaphone,
  BookOpen,
  Bell,
  Network,
  Menu,
  X,
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
  Sparkles,
} from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const assetNavItems = [
  { path: "/assets/my", label: "My Assets", i18nKey: "nav.assets", icon: Laptop },
];

const assetHRNavItems = [
  { path: "/assets/dashboard", label: "Asset Dashboard", i18nKey: "nav.assets", icon: BarChart3 },
  { path: "/assets", label: "All Assets", i18nKey: "nav.assets", icon: Laptop },
  { path: "/assets/categories", label: "Categories", i18nKey: "", icon: FolderOpen },
];

const positionNavItems = [
  { path: "/positions", label: "Dashboard", i18nKey: "nav.dashboard", icon: BarChart3 },
  { path: "/positions/list", label: "All Positions", i18nKey: "nav.positions", icon: Briefcase },
  { path: "/positions/vacancies", label: "Vacancies", i18nKey: "", icon: Target },
  { path: "/positions/headcount-plans", label: "Headcount Plans", i18nKey: "", icon: ClipboardList },
];

const eventNavItems = [
  { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
  { path: "/events/my", label: "My Events", i18nKey: "", icon: CalendarCheck },
];

const eventHRNavItems = [
  { path: "/events", label: "Events", i18nKey: "nav.events", icon: PartyPopper },
  { path: "/events/my", label: "My Events", i18nKey: "", icon: CalendarCheck },
  { path: "/events/dashboard", label: "Event Dashboard", i18nKey: "", icon: BarChart3 },
];

const wellnessNavItems = [
  { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
  { path: "/wellness/my", label: "My Wellness", i18nKey: "", icon: Dumbbell },
  { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "", icon: Smile },
];

const wellnessHRNavItems = [
  { path: "/wellness", label: "Wellness", i18nKey: "nav.wellness", icon: Heart },
  { path: "/wellness/my", label: "My Wellness", i18nKey: "", icon: Dumbbell },
  { path: "/wellness/check-in", label: "Daily Check-in", i18nKey: "", icon: Smile },
  { path: "/wellness/dashboard", label: "Wellness Dashboard", i18nKey: "", icon: BarChart3 },
];

const forumNavItems = [
  { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
  { path: "/forum/new", label: "Create Post", i18nKey: "", icon: PenSquare },
];

const forumHRNavItems = [
  { path: "/forum", label: "Forum", i18nKey: "nav.forum", icon: MessagesSquare },
  { path: "/forum/new", label: "Create Post", i18nKey: "", icon: PenSquare },
  { path: "/forum/dashboard", label: "Forum Dashboard", i18nKey: "", icon: BarChart3 },
];

const whistleblowingNavItems = [
  { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "", icon: ShieldAlert },
  { path: "/whistleblowing/track", label: "Track Report", i18nKey: "", icon: Search },
];

const whistleblowingHRNavItems = [
  { path: "/whistleblowing/submit", label: "Submit Report", i18nKey: "", icon: ShieldAlert },
  { path: "/whistleblowing/track", label: "Track Report", i18nKey: "", icon: Search },
  { path: "/whistleblowing/dashboard", label: "Dashboard", i18nKey: "nav.dashboard", icon: BarChart3 },
  { path: "/whistleblowing/reports", label: "All Reports", i18nKey: "", icon: ClipboardList },
];

// Items visible to ALL users (including employees)
// For employees, Dashboard IS the self-service page (RootRedirect renders SelfServiceDashboardPage)
// so we only show one "Dashboard" entry pointing to "/"
const employeeNavItems = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare },
  { path: "/manager", label: "My Team", i18nKey: "nav.myTeam", icon: UsersRound },
  { path: "/attendance", label: "Attendance", i18nKey: "nav.attendance", icon: Clock },
  { path: "/leave", label: "Leave", i18nKey: "nav.leave", icon: CalendarDays },
  { path: "/leave/comp-off", label: "Comp-Off", i18nKey: "nav.compOff", icon: Gift },
  { path: "/documents", label: "Documents", i18nKey: "nav.documents", icon: FileText },
  { path: "/announcements", label: "Announcements", i18nKey: "nav.announcements", icon: Megaphone },
  { path: "/policies", label: "Policies", i18nKey: "nav.policies", icon: BookOpen },
  { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network },
];

// Items visible only to HR Admin, Org Admin, Super Admin
const adminNavItems = [
  { path: "/", label: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/modules", label: "Modules", i18nKey: "nav.modules", icon: Package },
  { path: "/billing", label: "Billing", i18nKey: "nav.billing", icon: Receipt },
  { path: "/users", label: "Users", i18nKey: "nav.users", icon: Users },
  { path: "/employees", label: "Employees", i18nKey: "nav.employees", icon: Contact },
  { path: "/org-chart", label: "Org Chart", i18nKey: "nav.orgChart", icon: Network },
  { path: "/chatbot", label: "AI Assistant", i18nKey: "nav.chatbot", icon: BotMessageSquare },
  { path: "/manager", label: "My Team", i18nKey: "nav.myTeam", icon: UsersRound },
  { path: "/attendance", label: "Attendance", i18nKey: "nav.attendance", icon: Clock },
  { path: "/leave", label: "Leave", i18nKey: "nav.leave", icon: CalendarDays },
  { path: "/leave/comp-off", label: "Comp-Off", i18nKey: "nav.compOff", icon: Gift },
  { path: "/documents", label: "Documents", i18nKey: "nav.documents", icon: FileText },
  { path: "/announcements", label: "Announcements", i18nKey: "nav.announcements", icon: Megaphone },
  { path: "/policies", label: "Policies", i18nKey: "nav.policies", icon: BookOpen },
  { path: "/settings", label: "Settings", i18nKey: "nav.settings", icon: Settings },
  { path: "/custom-fields", label: "Custom Fields", i18nKey: "nav.customFields", icon: SlidersHorizontal },
  { path: "/audit", label: "Audit Log", i18nKey: "nav.audit", icon: Shield },
];

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin"];

const helpdeskNavItems = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
  { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
];

const helpdeskHRNavItems = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", i18nKey: "helpdesk.myTickets", icon: TicketCheck },
  { path: "/helpdesk/tickets", label: "All Tickets", i18nKey: "helpdesk.allTickets", icon: TicketCheck },
  { path: "/helpdesk/dashboard", label: "Helpdesk Dashboard", i18nKey: "nav.helpdesk", icon: Headphones },
  { path: "/helpdesk/kb", label: "Knowledge Base", i18nKey: "helpdesk.knowledgeBase", icon: BookMarked },
];

const surveyNavItems = [
  { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.surveys", icon: ClipboardList },
];

const surveyHRNavItems = [
  { path: "/surveys/dashboard", label: "Survey Dashboard", i18nKey: "nav.surveys", icon: BarChart3 },
  { path: "/surveys/list", label: "All Surveys", i18nKey: "nav.surveys", icon: ClipboardList },
  { path: "/surveys/respond", label: "Active Surveys", i18nKey: "nav.surveys", icon: ClipboardList },
];

const feedbackNavItems = [
  { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.feedback", icon: MessageSquarePlus },
  { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.feedback", icon: MessageSquare },
];

const feedbackHRNavItems = [
  { path: "/feedback/submit", label: "Submit Feedback", i18nKey: "nav.feedback", icon: MessageSquarePlus },
  { path: "/feedback/my", label: "My Feedback", i18nKey: "nav.feedback", icon: MessageSquare },
  { path: "/feedback", label: "All Feedback", i18nKey: "nav.feedback", icon: MessageSquare },
  { path: "/feedback/dashboard", label: "Feedback Dashboard", i18nKey: "nav.feedback", icon: BarChart3 },
];

const biometricsNavItems = [
  { path: "/biometrics", label: "Biometric Dashboard", i18nKey: "nav.biometrics", icon: ScanFace },
  { path: "/biometrics/enrollment", label: "Face Enrollment", i18nKey: "", icon: Fingerprint },
  { path: "/biometrics/qr", label: "QR Attendance", i18nKey: "", icon: QrCode },
  { path: "/biometrics/devices", label: "Devices", i18nKey: "", icon: Smartphone },
  { path: "/biometrics/logs", label: "Biometric Logs", i18nKey: "", icon: ScrollText },
  { path: "/biometrics/settings", label: "Biometric Settings", i18nKey: "", icon: Settings },
];

function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api.get("/notifications/unread-count").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications-recent"],
    queryFn: () =>
      api.get("/notifications", { params: { page: 1, per_page: 10 } }).then((r) => r.data),
    enabled: open,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = notificationsData?.data || [];

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand-600 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${
                    !n.is_read ? "bg-brand-50/50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <div className="h-2 w-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    )}
                    <div className={!n.is_read ? "" : "ml-4"}>
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarNavRef = useRef<HTMLElement>(null);

  // Fetch org subscriptions to conditionally show module nav items
  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get("/subscriptions").then((r) => r.data.data),
    staleTime: 60000,
  });

  const hasBiometrics = (subscriptions || []).some(
    (s: any) => s.module_slug === "emp-biometrics" && (s.status === "active" || s.status === "trial")
  );

  // Auto-close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Scroll active sidebar item into view without resetting sidebar scroll position
  useEffect(() => {
    const navEl = sidebarNavRef.current;
    if (!navEl) return;
    const activeLink = navEl.querySelector('[data-active="true"]');
    if (activeLink) {
      activeLink.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  function SidebarContent() {
    return (
      <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
        <Link to="/" className="block p-6 border-b border-gray-200 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-brand-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">EMP Cloud</h1>
              <p className="text-xs text-gray-500 truncate">{user?.org_name}</p>
            </div>
          </div>
        </Link>

        {/* Close button on mobile */}
        <button
          className="lg:hidden absolute top-4 right-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>

        <nav ref={sidebarNavRef} className="flex-1 p-4 space-y-1 overflow-y-auto">
          {user?.role !== "super_admin" && <>
          {(user && HR_ROLES.includes(user.role) ? adminNavItems : employeeNavItems).map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/"
              ? location.pathname === "/"
              : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.i18nKey ? t(item.i18nKey) : item.label}
              </Link>
            );
          })}
          {/* Positions section — HR only */}
          {user && HR_ROLES.includes(user.role) && (
            <>
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.positions')}</div>
              {positionNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.i18nKey ? t(item.i18nKey) : item.label}
                  </Link>
                );
              })}
            </>
          )}
          {/* Community section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.forum')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? forumHRNavItems
            : forumNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Events section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.events')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? eventHRNavItems
            : eventNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Whistleblowing section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.whistleblowing')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? whistleblowingHRNavItems
            : whistleblowingNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Helpdesk section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.helpdesk')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? helpdeskHRNavItems
            : helpdeskNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Surveys section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.surveys')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? surveyHRNavItems
            : surveyNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Wellness section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.wellness')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? wellnessHRNavItems
            : wellnessNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Assets section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.assets')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? assetHRNavItems
            : assetNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {/* Feedback section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.feedback')}</div>
          {(user && HR_ROLES.includes(user.role)
            ? feedbackHRNavItems
            : feedbackNavItems
          ).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-active={isActive}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {hasBiometrics && (
            <>
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.biometrics')}</div>
              {biometricsNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-active={isActive}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.i18nKey ? t(item.i18nKey) : item.label}
                  </Link>
                );
              })}
            </>
          )}
          </>}
          {/* ---- Platform Admin Section (super_admin only) ---- */}
          {user?.role === "super_admin" && (
            <>
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{t('nav.platformAdmin')}</div>
              {[
                { path: "/admin", label: "Overview Dashboard", icon: Crown },
                { path: "/admin/organizations", label: "Organizations", icon: Building2 },
                { path: "/admin/modules", label: "Module Analytics", icon: Package },
                { path: "/admin/revenue", label: "Revenue", icon: TrendingUp },
                { path: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
                { path: "/admin/ai-config", label: "AI Configuration", icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-active={isActive}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-amber-50 text-amber-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-brand-700">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Top header bar */}
        <div className="flex items-center justify-between px-4 lg:px-8 py-3 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <LanguageSwitcher />
          <NotificationDropdown />
        </div>
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </div>

      {/* Floating AI Chat Widget */}
      <ChatWidget />
    </div>
  );
}
