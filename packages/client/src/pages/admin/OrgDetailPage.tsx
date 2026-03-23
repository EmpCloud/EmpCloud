import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { ArrowLeft, Building2, Users, CreditCard, TrendingUp } from "lucide-react";

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
      <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Failed to load organization details.
      </div>
    );
  }

  const { organization: org, users, subscriptions, monthly_revenue } = data;

  return (
    <div>
      {/* Back link */}
      <Link
        to="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all organizations
      </Link>

      {/* Org Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-brand-100 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-brand-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <p className="text-gray-500 mt-1">{org.email}</p>
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    org.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {org.status}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                Created {new Date(org.created_at).toLocaleDateString()}
              </div>
              {org.slug && (
                <div className="text-sm text-gray-400">
                  Slug: <span className="font-mono">{org.slug}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
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
              <p className="text-lg font-semibold text-gray-900">
                {subscriptions.filter((s: any) => s.status === "active" || s.status === "trial").length}
              </p>
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
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Users ({users.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Role</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {user.first_name} {user.last_name}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Subscriptions ({subscriptions.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Module</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Plan</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Seats</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Price/Seat</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Billing</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Period End</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub: any) => (
                <tr key={sub.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{sub.module_name}</td>
                  <td className="py-3 px-4 text-gray-600 capitalize">{sub.plan_tier}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        sub.status === "active"
                          ? "bg-green-100 text-green-700"
                          : sub.status === "trial"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {sub.used_seats}/{sub.total_seats}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{formatINR(sub.price_per_seat)}</td>
                  <td className="py-3 px-4 text-gray-600 capitalize">{sub.billing_cycle}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {sub.current_period_end
                      ? new Date(sub.current_period_end).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    No subscriptions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
