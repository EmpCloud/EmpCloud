import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  ArrowLeft,
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  DollarSign,
  Shield,
  Calendar,
  Mail,
  Globe,
} from "lucide-react";

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-org-detail", id],
    queryFn: () => api.get(`/admin/organizations/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-500 text-sm">Failed to load organization details.</div>
        <Link to="/admin/organizations" className="text-sm text-brand-600 hover:underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  const { organization: org, users, subscriptions, monthly_revenue, total_spend, audit_logs } = data;
  const activeSubCount = subscriptions.filter(
    (s: any) => s.status === "active" || s.status === "trial"
  ).length;

  return (
    <div>
      {/* Back link */}
      <Link
        to="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all organizations
      </Link>

      {/* Org Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            {org.legal_name && org.legal_name !== org.name && (
              <p className="text-sm text-gray-400 mt-0.5">{org.legal_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-3">
              <span
                className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  org.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {org.status}
              </span>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                {org.email}
              </div>
              {org.website && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Globe className="h-3.5 w-3.5" />
                  {org.website}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                Created {new Date(org.created_at).toLocaleDateString()}
              </div>
              {org.slug && (
                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
                  {org.slug}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Users</p>
              <p className="text-lg font-semibold text-gray-900">{users.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Subscriptions</p>
              <p className="text-lg font-semibold text-gray-900">{activeSubCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Monthly Revenue</p>
              <p className="text-lg font-semibold text-gray-900">{formatINR(monthly_revenue)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spend</p>
              <p className="text-lg font-semibold text-gray-900">{formatINR(total_spend)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Users ({users.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Role</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-brand-700">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{user.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "org_admin"
                          ? "bg-purple-100 text-purple-700"
                          : user.role === "hr_admin" || user.role === "hr_manager"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active || user.status === 1
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.is_active || user.status === 1 ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No users in this organization
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Subscriptions ({subscriptions.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Module</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Plan</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Seats</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Price/Seat</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Monthly</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Billing</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Period End</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub: any) => {
                const monthlyTotal = sub.price_per_seat * sub.used_seats;
                return (
                  <tr key={sub.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-3 px-4 font-medium text-gray-900">{sub.module_name}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 capitalize">
                        {sub.plan_tier}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          sub.status === "active"
                            ? "bg-green-100 text-green-700"
                            : sub.status === "trial"
                              ? "bg-blue-100 text-blue-700"
                              : sub.status === "cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      <span className="font-medium">{sub.used_seats}</span>
                      <span className="text-gray-400">/{sub.total_seats}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatINR(sub.price_per_seat)}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {formatINR(monthlyTotal)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 capitalize">{sub.billing_cycle}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                );
              })}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    No subscriptions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      {audit_logs && audit_logs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Audit Log (Last {audit_logs.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Action</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Entity</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">IP</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {audit_logs.map((log: any) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-2.5 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-600 text-xs">
                      {log.entity_type}
                      {log.entity_id ? ` #${log.entity_id}` : ""}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs font-mono">
                      {log.ip_address || "-"}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
