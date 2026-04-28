import { Link } from "react-router-dom";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NavItem } from "./navigation.config";
import { AiBadge } from "@/components/AiBadge";

interface NavSectionProps {
  label: string;
  items: NavItem[];
  location: { pathname: string };
  t: (key: string) => string;
  activeClass?: string;
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

export function NavSection({ label, items, location, t, activeClass = "bg-brand-50 text-brand-700" }: NavSectionProps) {
  return (
    <>
      {label && (
        <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{label}</div>
      )}
      {items.map((item) =>
        item.children ? (
          <NestedNavItem
            key={item.path}
            item={item}
            location={location}
            t={t}
            activeClass={activeClass}

          />
        ) : (
          <NavLink
            key={item.path}
            item={item}
            location={location}
            t={t}
            activeClass={activeClass}
            allItems={items}
          />
        )
      )}
    </>
  );
}

function NavLink({
  item,
  location,
  t,
  activeClass,
  allItems = [],
  indent = false,
}: {
  item: NavItem;
  location: { pathname: string };
  t: (key: string) => string;
  activeClass: string;
  allItems?: NavItem[];
  indent?: boolean;
}) {
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
    </Link>
  );
}

function NestedNavItem({
  item,
  location,
  t,
  activeClass,

}: {
  item: NavItem;
  location: { pathname: string };
  t: (key: string) => string;
  activeClass: string;
}) {
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
              t={t}
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
