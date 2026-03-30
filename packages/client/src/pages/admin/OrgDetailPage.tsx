import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  X,
  UserX,
  UserCheck,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

const VALID_ROLES = ["employee", "manager", "hr_admin", "org_admin"];

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [resetPasswordModal, setResetPasswordModal] = useState<any>(null);
  const [changeRoleModal, setChangeRoleModal] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-org-detail", id],
    queryFn: () => api.get(`/admin/organizations/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const deactivateUserMut = useMutation({
    mutationFn: (userId: number) => api.put(`/admin/organizations/${id}/users/${userId}/deactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-org-detail", id] }),
  });

  const activateUserMut = useMutation({
    mutationFn: (userId: number) => api.put(`/admin/organizations/${id}/users/${userId}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-org-detail", id] }),
  });

  const resetPasswordMut = useMutation({
    mutationFn: ({ userId, new_password }: { userId: number; new_password: string }) =>
      api.put(`/admin/organizations/${id}/users/${userId}/reset-password`, { new_password }),
    onSuccess: () => {
      setResetPasswordModal(null);
      setNewPassword("");
    },
  });

  const changeRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.put(`/admin/organizations/${id}/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-org-detail", id] });
      setChangeRoleModal(null);
      setNewRole("");
    },
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
                <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => {
                const isActive = user.is_active || user.status === 1;
                return (
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
                            : user.role === "hr_admin"
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
                          isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {isActive ? (
                          <button
                            onClick={() => deactivateUserMut.mutate(user.id)}
                            disabled={deactivateUserMut.isPending}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Deactivate user"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => activateUserMut.mutate(user.id)}
                            disabled={activateUserMut.isPending}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Activate user"
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setResetPasswordModal(user);
                            setNewPassword("");
                          }}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setChangeRoleModal(user);
                            setNewRole(user.role);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Change role"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
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

      {/* Reset Password Modal */}
      {resetPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
              <button onClick={() => setResetPasswordModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Reset password for <strong>{resetPasswordModal.first_name} {resetPasswordModal.last_name}</strong> ({resetPasswordModal.email}).
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setResetPasswordModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => resetPasswordMut.mutate({ userId: resetPasswordModal.id, new_password: newPassword })}
                disabled={newPassword.length < 8 || resetPasswordMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {resetPasswordMut.isPending ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {changeRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Change Role</h3>
              <button onClick={() => setChangeRoleModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Change role for <strong>{changeRoleModal.first_name} {changeRoleModal.last_name}</strong>.
              Current role: <span className="font-medium">{changeRoleModal.role}</span>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              >
                {VALID_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setChangeRoleModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => changeRoleMut.mutate({ userId: changeRoleModal.id, role: newRole })}
                disabled={!newRole || newRole === changeRoleModal.role || changeRoleMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {changeRoleMut.isPending ? "Updating..." : "Update Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
