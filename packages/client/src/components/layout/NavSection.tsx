import { Link } from "react-router-dom";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { NavItem } from "./navigation.config";
import { AiBadge } from "@/components/AiBadge";

interface NavSectionProps {
  label: string;
  items: NavItem[];
  location: { pathname: string };
  t: (key: string) => string;
  activeClass?: string;
  /** Live unread counts keyed by nav path (e.g. { "/messages": 3 }). */
  unreadByPath?: Record<string, number>;
}

/** Small red count badge for a nav item (e.g. unread messages). */
function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
      {count > 99 ? t("navSection.countBadge.overflow") : count}
    </span>
  );
}

function isItemActive(item: NavItem, pathname: string, allItems: NavItem[]): boolean {
  const isExact = pathname === item.path;
  const isPrefix = pathname.startsWith(item.path + "/");
  const hasMoreSpecificMatch = isPrefix && allItems.some(
    (other) => other.path !== item.path && other.path.startsWith(item.path + "/") && (pathname === other.path || pathname.startsWith(other.path + "/"))
  );
  return item.path === "/"
    ? pathname === "/"
    : isExact || (isPrefix && !hasMoreSpecificMatch);
}

export function NavSection({ label, items, location, activeClass = "bg-brand-50 text-brand-700", unreadByPath }: NavSectionProps) {
  // Track the running section so a divider+label renders before the first
  // surviving item of each new group (resilient to permission-filtered items).
  let currentSection: string | undefined;
  return (
    <>
      {label && (
        <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{label}</div>
      )}
      {items.map((item) => {
        let header: string | null = null;
        if (item.section && item.section !== currentSection) {
          header = item.section;
          currentSection = item.section;
        }
        return (
          <Fragment key={item.path}>
            {header && (
              <div className="mx-3 mt-4 mb-1 border-t border-gray-100 pt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {header}
              </div>
            )}
            {item.children ? (
              <NestedNavItem item={item} location={location} activeClass={activeClass} />
            ) : (
              <NavLink item={item} location={location} activeClass={activeClass} allItems={items} unread={unreadByPath?.[item.path] ?? 0} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function NavLink({
  item,
  location,
  activeClass,
  allItems = [],
  indent = false,
  unread = 0,
}: {
  item: NavItem;
  location: { pathname: string };
  activeClass: string;
  allItems?: NavItem[];
  indent?: boolean;
  unread?: number;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const isActive = isItemActive(item, location.pathname, allItems);
  const label = item.i18nKey && t(item.i18nKey) !== item.i18nKey ? t(item.i18nKey) : item.label;
  return (
    <Link
      to={item.path}
      data-active={isActive}
      // #1816 — title attribute so the collapsed-sidebar icon-only state is
      // discoverable via hover tooltip. No-op when expanded: native browsers
      // suppress the tooltip if the link's visible text matches the title.
      title={label}
      className={`flex items-center gap-3 ${indent ? "pl-9 pr-3" : "px-3"} py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? activeClass
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <Icon className={`${indent ? "h-4 w-4" : "h-5 w-5"} flex-shrink-0`} />
      <span className="flex-1">{label}</span>
      {item.badge && <AiBadge label={item.badge} />}
      <CountBadge count={unread} />
    </Link>
  );
}

function NestedNavItem({
  item,
  location,
  activeClass,

}: {
  item: NavItem;
  location: { pathname: string };
  activeClass: string;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const childActive = item.children?.some((child) =>
    location.pathname === child.path || location.pathname.startsWith(child.path + "/")
  );
  const [open, setOpen] = useState(!!childActive);
  const label = item.i18nKey && t(item.i18nKey) !== item.i18nKey ? t(item.i18nKey) : item.label;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        title={label}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
          childActive
            ? activeClass
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && item.children && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavLink
              key={child.path}
              item={child}
              location={location}
              activeClass={activeClass}
              allItems={item.children!}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}
