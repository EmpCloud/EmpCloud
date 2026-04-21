import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  LogOut,
  Building2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { NotificationDropdown } from "./NotificationDropdown";
import { NavSection } from "./NavSection";
import {
  employeeNavItems,
  adminNavItems,
  positionNavItems,
  biometricsNavItems,
  platformAdminNavItems,
  HR_ROLES,
} from "./navigation.config";

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // #1415 — desktop sidebar collapse state. Persisted in localStorage so the
  // user's preference survives reloads. Only affects md+ breakpoints; on
  // mobile the sidebar continues to work as a full-width drawer.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("empcloud-sidebar-collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "empcloud-sidebar-collapsed",
      sidebarCollapsed ? "1" : "0",
    );
  }, [sidebarCollapsed]);
  const sidebarNavRef = useRef<HTMLElement>(null);

  // Fetch org subscriptions to conditionally show module nav items (HR+ only)
  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get("/subscriptions").then((r) => r.data.data),
    staleTime: 60000,
    enabled: !!(user && HR_ROLES.includes(user.role)),
  });

  const hasBiometrics = (subscriptions || []).some(
    (s: any) => s.module_slug === "emp-biometrics" && (s.status === "active" || s.status === "trial")
  );

  const isHR = !!(user && HR_ROLES.includes(user.role));

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

  // #1415 — when the desktop sidebar is collapsed we hide label spans so only
  // nav icons remain. Mobile (drawer) always renders expanded. We detect the
  // collapsed state via a CSS class on the sidebar root and hide labels with
  // a sibling selector so we don't have to plumb a prop through every nav
  // component.
  const renderSidebar = (isCollapsed: boolean) => (
    <div
      className={`flex h-full flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ${
        isCollapsed ? "w-16 sidebar-collapsed" : "w-64"
      }`}
    >
      <Link
        to="/"
        title={isCollapsed ? "EMP Cloud" : undefined}
        className={`block border-b border-gray-200 hover:bg-gray-50 transition-colors ${
          isCollapsed ? "p-2" : "p-6"
        }`}
      >
        {isCollapsed ? (
          // #1529 — Compact brand mark when collapsed: icon + "EMP" wordmark
          // so the brand is identifiable at a glance. Previously only the
          // generic Building2 icon showed, which the reporter flagged as
          // "logo not visible".
          <div className="flex flex-col items-center gap-0.5">
            <Building2 className="h-6 w-6 text-brand-600 flex-shrink-0" />
            <span className="text-[10px] font-bold text-brand-600 leading-none tracking-wide">EMP</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-brand-600 flex-shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">EMP Cloud</h1>
              <p className="text-xs text-gray-500 truncate">{user?.org_name}</p>
            </div>
          </div>
        )}
      </Link>

      {/* Close button on mobile */}
      <button
        className="md:hidden absolute top-4 right-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        onClick={() => setSidebarOpen(false)}
      >
        <X className="h-5 w-5" />
      </button>

      <nav ref={sidebarNavRef} className="flex-1 p-4 space-y-1 overflow-y-auto">
        {user?.role !== "super_admin" && <>
          <NavSection label="" items={isHR ? adminNavItems : employeeNavItems} location={location} t={t} />
          {isHR && (
            <NavSection label={t('nav.positions')} items={positionNavItems} location={location} t={t} />
          )}
          {hasBiometrics && (
            <NavSection label={t('nav.biometrics')} items={biometricsNavItems} location={location} t={t} />
          )}
        </>}

        {/* Platform Admin Section (super_admin only) */}
        {user?.role === "super_admin" && (
          <NavSection
            label={t('nav.platformAdmin')}
            items={platformAdminNavItems}
            location={location}
            t={t}
            activeClass="bg-amber-50 text-amber-700"
          />
        )}
      </nav>

      <div className="p-4 border-t border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
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
        )}
        <button
          onClick={handleLogout}
          aria-label={t('nav.signOut')}
          className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2"} w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && t('nav.signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:block relative">
        {renderSidebar(sidebarCollapsed)}
        {/* #1415 — collapse/expand toggle. Sits on the right edge of the
            sidebar so it doesn't shift with the content; chevron direction
            reflects the current state. */}
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex absolute top-6 -right-3 z-10 h-6 w-6 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-brand-600 hover:border-brand-300 shadow-sm items-center justify-center transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Mobile sidebar overlay with slide-in animation */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 h-full transform transition-transform duration-300 ease-in-out translate-x-0 animate-slide-in-left">
            {/* Mobile drawer always renders expanded. */}
            {renderSidebar(false)}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Top header bar */}
        <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-gray-200 bg-white shrink-0 relative z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationDropdown />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </div>

      {/* Floating AI Chat Widget */}
      <ChatWidget />
    </div>
  );
}
