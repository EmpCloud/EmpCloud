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
                ? activeClass
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.i18nKey ? t(item.i18nKey) : item.label}
          </Link>
        );
      })}
    </>
  );
}
