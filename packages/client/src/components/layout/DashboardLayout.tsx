import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  LogOut,
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
  orgAdminOnlyNavItems,
  platformAdminNavItems,
  HR_ROLES,
  filterNavItem,
  type NavItem,
} from "./navigation.config";
import { usePermissions } from "@/lib/use-permissions";
import { useViewModeStore, hasAnyAdminPermission } from "@/lib/use-view-mode";
import { ViewModeToggle } from "./ViewModeToggle";
import { ThemeToggle } from "./ThemeToggle";

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

  // Chat is gated to an allowlist of orgs (pilot rollout). Hide the Messages
  // nav item unless the caller's org has chat enabled. Default to true so the
  // link isn't hidden while loading; the server still enforces access.
  const { data: chatStatus } = useQuery({
    queryKey: ["chat-feature-status"],
    queryFn: () => api.get("/chat/feature-status").then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });
  const chatEnabled = chatStatus?.enabled !== false;

  // Live unread-message count for the Messages nav badge. Polls on a modest
  // interval (the socket also nudges chat caches on new messages). Only runs
  // when chat is enabled for this org.
  const { data: chatUnread } = useQuery({
    queryKey: ["chat-unread-count"],
    queryFn: () => api.get("/chat/unread-count").then((r) => r.data.data?.unread_count ?? 0),
    enabled: !!user && chatEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const unreadByPath: Record<string, number> = { "/messages": chatUnread ?? 0 };

  const hasBiometrics = (subscriptions || []).some(
    (s: any) => s.module_slug === "emp-biometrics" && (s.status === "active" || s.status === "trial")
  );

  const isHR = !!(user && HR_ROLES.includes(user.role));
  const isOrgAdmin = user?.role === "org_admin";

  // RBAC v1 — view-mode toggle. HR users always see the admin sidebar.
  // Non-HR users with at least one admin-level permission (via custom roles)
  // can flip into "Admin view" — they get the admin sidebar filtered to the
  // items their permission set actually unlocks. Everyone else stays on the
  // employee sidebar.
  const { has: hasPerm, permissions } = usePermissions();
  const viewMode = useViewModeStore((s) => s.viewMode);
  const hasAdminPerms = hasAnyAdminPermission(permissions);
  const showViewToggle = !isHR && hasAdminPerms;
  // If the user lost their admin perms (custom role removed) but the toggle
  // is still set to "admin", fall back to "self" so they aren't stranded
  // on an empty sidebar.
  const effectiveViewMode = !showViewToggle && !isHR ? "self" : viewMode;
  const showAdminSidebar = isHR || (showViewToggle && effectiveViewMode === "admin");
  const sidebarItems = (showAdminSidebar ? adminNavItems : employeeNavItems)
    .map((i) => filterNavItem(i, hasPerm))
    .filter((i): i is NavItem => i !== null)
    // Hide the Messages link when chat isn't enabled for this org.
    .filter((i) => chatEnabled || i.path !== "/messages");

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
      className={`flex h-full flex-col bg-card border-r border-border transition-[width] duration-200 ${
        isCollapsed ? "w-16 sidebar-collapsed" : "w-64"
      }`}
    >
      <Link
        to="/"
        title={isCollapsed ? "EMP Cloud" : undefined}
        className={`block border-b border-border hover:bg-background transition-colors ${
          isCollapsed ? "p-2" : "px-4 py-4"
        }`}
      >
        {isCollapsed ? (
          // Compact brand mark when collapsed — square cloud icon (no
          // wordmark) since the wide horizontal logo doesn't fit a 64px
          // sidebar. Square asset is shared with the favicon.
          <div className="flex justify-center">
            <img
              src="/empcloud-icon.png"
              alt="EmpCloud"
              className="h-9 w-9 object-contain"
            />
          </div>
        ) : (
          // Centered logo block — visually balanced inside the 256px sidebar
          // and the org name reads as a caption beneath, instead of a
          // misaligned left-hugging stack.
          <div className="flex flex-col items-center gap-2">
            <img
              src="/empcloud-logo.png"
              alt="EmpCloud"
              className="h-10 w-auto max-w-full object-contain"
            />
            <p className="text-xs text-muted-foreground truncate w-full text-center">
              {user?.org_name}
            </p>
          </div>
        )}
      </Link>

      {/* Close button on mobile */}
      <button
        className="md:hidden absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        onClick={() => setSidebarOpen(false)}
      >
        <X className="h-5 w-5" />
      </button>

      <nav ref={sidebarNavRef} className="flex-1 p-4 space-y-1 overflow-y-auto">
        {user?.role !== "super_admin" && <>
          <NavSection label="" items={sidebarItems} location={location} t={t} unreadByPath={unreadByPath} />
          {isHR && (
            // Positions is now a single collapsible parent (label rendered
            // by the NavItem itself), so the section label here would be a
            // duplicate "Positions / Positions" stack. Pass empty label.
            <NavSection label="" items={positionNavItems} location={location} t={t} />
          )}
          {hasBiometrics && (
            <NavSection label={t('nav.biometrics')} items={biometricsNavItems} location={location} t={t} />
          )}
          {isOrgAdmin && (
            <NavSection label="" items={orgAdminOnlyNavItems} location={location} t={t} />
          )}
        </>}

        {/* Platform Admin Section (super_admin only) */}
        {user?.role === "super_admin" && (
          <NavSection
            label={t('nav.platformAdmin')}
            items={platformAdminNavItems}
            location={location}
            t={t}
            activeClass="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
          />
        )}
      </nav>

      <div className="p-4 border-t border-border">
        {!isCollapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-brand-700">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          aria-label={t('nav.signOut')}
          className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2"} w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && t('nav.signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      {/* #1575 — overflow-visible on the relative wrapper so the collapse
          chevron (which intentionally protrudes at -right-3) isn't clipped
          by an ancestor's flex-item overflow context. z-30 also raises it
          above the main content's any-z layers (modals stay z-50). */}
      <div className="hidden md:block relative overflow-visible">
        {renderSidebar(sidebarCollapsed)}
        {/* #1587 — collapse/expand toggle. Previously anchored at top-6 which
            overlapped the brand header (h-10 collapsed, h-20 expanded), so
            the chevron sat awkwardly on top of the EMP wordmark and was
            barely discoverable. Anchor it to the vertical middle of the
            sidebar's right edge instead — a position that's stable across
            both width states, far from any other clickable target, and
            matches the dominant convention (Slack, Linear, Notion). */}
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 z-30 h-6 w-6 rounded-full bg-card border border-border text-muted-foreground hover:text-brand-600 hover:border-brand-300 shadow-sm items-center justify-center transition-colors"
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
        <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-border bg-card shrink-0 relative z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {showViewToggle && <ViewModeToggle />}
            <ThemeToggle />
            <LanguageSwitcher />
            <NotificationDropdown />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-background">
          <Outlet />
        </div>
      </div>

      {/* Floating AI Chat Widget */}
      <ChatWidget />
    </div>
  );
}
