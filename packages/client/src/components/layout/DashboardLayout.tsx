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

  const sidebarContent = (
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {sidebarContent}
      </div>

      {/* Mobile sidebar overlay with slide-in animation */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 h-full transform transition-transform duration-300 ease-in-out translate-x-0 animate-slide-in-left">
            {sidebarContent}
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
