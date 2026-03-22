import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import {
  LayoutDashboard,
  Users,
  Package,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  Building2,
  Contact,
  Clock,
  CalendarDays,
  FileText,
  Megaphone,
  BookOpen,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/modules", label: "Modules", icon: Package },
  { path: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { path: "/users", label: "Users", icon: Users },
  { path: "/employees", label: "Employees", icon: Contact },
  { path: "/attendance", label: "Attendance", icon: Clock },
  { path: "/leave", label: "Leave", icon: CalendarDays },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/announcements", label: "Announcements", icon: Megaphone },
  { path: "/policies", label: "Policies", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/audit", label: "Audit Log", icon: Shield },
];

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-brand-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">EMP Cloud</h1>
              <p className="text-xs text-gray-500 truncate">{user?.org_name}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
