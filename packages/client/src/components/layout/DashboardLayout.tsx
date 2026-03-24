import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";

const assetNavItems = [
  { path: "/assets/my", label: "My Assets", icon: Laptop },
];

const assetHRNavItems = [
  { path: "/assets/dashboard", label: "Asset Dashboard", icon: BarChart3 },
  { path: "/assets", label: "All Assets", icon: Laptop },
  { path: "/assets/categories", label: "Categories", icon: FolderOpen },
];

const positionNavItems = [
  { path: "/positions", label: "Dashboard", icon: BarChart3 },
  { path: "/positions/list", label: "All Positions", icon: Briefcase },
  { path: "/positions/vacancies", label: "Vacancies", icon: Target },
  { path: "/positions/headcount-plans", label: "Headcount Plans", icon: ClipboardList },
];

// Items visible to ALL users (including employees)
const employeeNavItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/self-service", label: "Self Service", icon: Contact },
  { path: "/attendance", label: "Attendance", icon: Clock },
  { path: "/leave", label: "Leave", icon: CalendarDays },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/announcements", label: "Announcements", icon: Megaphone },
  { path: "/policies", label: "Policies", icon: BookOpen },
  { path: "/org-chart", label: "Org Chart", icon: Network },
];

// Items visible only to HR Admin, Org Admin, Super Admin
const adminNavItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/modules", label: "Modules", icon: Package },
  { path: "/billing", label: "Billing", icon: Receipt },
  { path: "/users", label: "Users", icon: Users },
  { path: "/employees", label: "Employees", icon: Contact },
  { path: "/org-chart", label: "Org Chart", icon: Network },
  { path: "/attendance", label: "Attendance", icon: Clock },
  { path: "/leave", label: "Leave", icon: CalendarDays },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/announcements", label: "Announcements", icon: Megaphone },
  { path: "/policies", label: "Policies", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/audit", label: "Audit Log", icon: Shield },
];

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

const helpdeskNavItems = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", icon: TicketCheck },
  { path: "/helpdesk/kb", label: "Knowledge Base", icon: BookMarked },
];

const helpdeskHRNavItems = [
  { path: "/helpdesk/my-tickets", label: "My Tickets", icon: TicketCheck },
  { path: "/helpdesk/tickets", label: "All Tickets", icon: TicketCheck },
  { path: "/helpdesk/dashboard", label: "Helpdesk Dashboard", icon: Headphones },
  { path: "/helpdesk/kb", label: "Knowledge Base", icon: BookMarked },
];

const surveyNavItems = [
  { path: "/surveys/respond", label: "Active Surveys", icon: ClipboardList },
];

const surveyHRNavItems = [
  { path: "/surveys/dashboard", label: "Survey Dashboard", icon: BarChart3 },
  { path: "/surveys/list", label: "All Surveys", icon: ClipboardList },
  { path: "/surveys/respond", label: "Active Surveys", icon: ClipboardList },
];

const biometricsNavItems = [
  { path: "/biometrics", label: "Biometric Dashboard", icon: ScanFace },
  { path: "/biometrics/enrollment", label: "Face Enrollment", icon: Fingerprint },
  { path: "/biometrics/qr", label: "QR Attendance", icon: QrCode },
  { path: "/biometrics/devices", label: "Devices", icon: Smartphone },
  { path: "/biometrics/logs", label: "Biometric Logs", icon: ScrollText },
  { path: "/biometrics/settings", label: "Biometric Settings", icon: Settings },
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
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  function SidebarContent() {
    return (
      <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-brand-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">EMP Cloud</h1>
              <p className="text-xs text-gray-500 truncate">{user?.org_name}</p>
            </div>
          </div>
        </div>

        {/* Close button on mobile */}
        <button
          className="lg:hidden absolute top-4 right-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {(user && HR_ROLES.includes(user.role) ? adminNavItems : employeeNavItems).map((item) => {
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
                {item.label}
              </Link>
            );
          })}
          {/* Positions section — HR only */}
          {user && HR_ROLES.includes(user.role) && (
            <>
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Positions</div>
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
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
          {/* Helpdesk section — visible to all users */}
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Helpdesk</div>
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
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Surveys</div>
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
          <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Assets</div>
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
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Biometrics</div>
              {biometricsNavItems.map((item) => {
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
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
          {user?.role === "super_admin" && (
            <>
              <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">Platform Admin</div>
              {[
                { path: "/admin", label: "Overview Dashboard", icon: Crown },
                { path: "/admin/organizations", label: "Organizations", icon: Building2 },
                { path: "/admin/modules", label: "Module Analytics", icon: Package },
                { path: "/admin/revenue", label: "Revenue", icon: TrendingUp },
                { path: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
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
            Sign out
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
          <NotificationDropdown />
        </div>
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
