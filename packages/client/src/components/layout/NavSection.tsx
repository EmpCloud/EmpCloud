import { Link } from "react-router-dom";
import type { NavItem } from "./navigation.config";

interface NavSectionProps {
  label: string;
  items: NavItem[];
  location: { pathname: string };
  t: (key: string) => string;
  activeClass?: string;
}

export function NavSection({ label, items, location, t, activeClass = "bg-brand-50 text-brand-700" }: NavSectionProps) {
  return (
    <>
      {label && (
        <div className="text-xs uppercase text-gray-400 mt-6 mb-2 px-3">{label}</div>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        // Check for exact match or prefix match, but avoid matching parent routes
        // when a more specific sibling route matches (e.g. /employees vs /employees/probation)
        const isExact = location.pathname === item.path;
        const isPrefix = location.pathname.startsWith(item.path + "/");
        const hasMoreSpecificMatch = isPrefix && items.some(
          (other) => other.path !== item.path && other.path.startsWith(item.path + "/") && (location.pathname === other.path || location.pathname.startsWith(other.path + "/"))
        );
        const isActive = item.path === "/"
          ? location.pathname === "/"
          : isExact || (isPrefix && !hasMoreSpecificMatch);
        return (
          <Link
            key={item.path}
            to={item.path}
            data-active={isActive}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? activeClass
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.i18nKey && t(item.i18nKey) !== item.i18nKey ? t(item.i18nKey) : item.label}
          </Link>
        );
      })}
    </>
  );
}
