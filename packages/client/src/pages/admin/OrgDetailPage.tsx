import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import OrgCommentsCard from "@/components/admin/OrgCommentsCard";
import DeleteOrgCard from "@/components/admin/DeleteOrgCard";
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

function formatINR(paise: number): string {
  const value = paise / 100;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

const VALID_ROLES = ["employee", "manager", "hr_admin", "org_admin"];

export default function OrgDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [resetPasswordModal, setResetPasswordModal] = useState<any>(null);
  const [changeRoleModal, setChangeRoleModal] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "subscriptions" | "audit">("users");

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
          <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">{t("orgDetail.loading")}</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-500 text-sm">{t("orgDetail.error.loadFailed")}</div>
        <Link to="/admin/organizations" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          {t("orgDetail.error.backToOrganizations")}
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
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("orgDetail.backToAll")}
      </Link>

      {/* Org Info Card */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
            {org.legal_name && org.legal_name !== org.name && (
              <p className="text-sm text-muted-foreground mt-0.5">{org.legal_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-3">
              <span
                className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  org.status === "active"
                    ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {org.status}
              </span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {org.email}
              </div>
              {org.website && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  {org.website}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {t("orgDetail.createdOn")} {new Date(org.created_at).toLocaleDateString()}
              </div>
              {org.slug && (
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {org.slug}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("orgDetail.stats.users")}</p>
              <p className="text-lg font-semibold text-foreground">{users.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("orgDetail.stats.activeSubscriptions")}</p>
              <p className="text-lg font-semibold text-foreground">{activeSubCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("orgDetail.stats.monthlyRevenue")}</p>
              <p className="text-lg font-semibold text-foreground">{formatINR(monthly_revenue)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("orgDetail.stats.totalSpend")}</p>
              <p className="text-lg font-semibold text-foreground">{formatINR(total_spend)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — pick which big-data block to show. Stacking all three on
          one screen made the page extremely long; tabs keep the cards above
          visible while letting HR drill into the relevant detail. */}
      <div className="bg-card rounded-xl border border-border p-1.5 mb-6 inline-flex gap-1">
        {[
          { id: "users", label: t("orgDetail.tabs.users", { count: users.length }), icon: Users },
          { id: "subscriptions", label: t("orgDetail.tabs.subscriptions", { count: subscriptions.length }), icon: CreditCard },
          ...(audit_logs && audit_logs.length > 0
            ? [{ id: "audit", label: t("orgDetail.tabs.auditLog", { count: audit_logs.length }), icon: Shield }]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-brand-600 text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Table */}
      {activeTab === "users" && (
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t("orgDetail.users.heading", { count: users.length })}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.name")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.email")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.role")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.status")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.joined")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.users.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => {
                const isActive = user.is_active || user.status === 1;
                return (
                  <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">
                          {user.first_name} {user.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.role === "org_admin"
                            ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                            : user.role === "hr_admin"
                              ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          isActive
                            ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                            : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {isActive ? t("orgDetail.users.status.active") : t("orgDetail.users.status.inactive")}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {isActive ? (
                          <button
                            onClick={() => deactivateUserMut.mutate(user.id)}
                            disabled={deactivateUserMut.isPending}
                            className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            title={t("orgDetail.users.actions.deactivate")}
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => activateUserMut.mutate(user.id)}
                            disabled={activateUserMut.isPending}
                            className="p-1.5 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 rounded-lg transition-colors"
                            title={t("orgDetail.users.actions.activate")}
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setResetPasswordModal(user);
                            setNewPassword("");
                          }}
                          className="p-1.5 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
                          title={t("orgDetail.users.actions.resetPassword")}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setChangeRoleModal(user);
                            setNewRole(user.role);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                          title={t("orgDetail.users.actions.changeRole")}
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
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t("orgDetail.users.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Subscriptions Table */}
      {activeTab === "subscriptions" && (
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t("orgDetail.subscriptions.heading", { count: subscriptions.length })}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.module")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.plan")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.status")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.seats")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.pricePerSeat")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.monthly")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.billing")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.subscriptions.columns.periodEnd")}</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub: any) => {
                const monthlyTotal = sub.price_per_seat * sub.used_seats;
                return (
                  <tr key={sub.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium text-foreground">{sub.module_name}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 capitalize">
                        {sub.plan_tier}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          sub.status === "active"
                            ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                            : sub.status === "trial"
                              ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                              : sub.status === "cancelled"
                                ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      <span className="font-medium">{sub.used_seats}</span>
                      <span className="text-muted-foreground">/{sub.total_seats}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{formatINR(sub.price_per_seat)}</td>
                    <td className="py-3 px-4 font-medium text-foreground">
                      {formatINR(monthlyTotal)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground capitalize">{sub.billing_cycle}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                );
              })}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t("orgDetail.subscriptions.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Audit Log */}
      {activeTab === "audit" && audit_logs && audit_logs.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("orgDetail.audit.heading", { count: audit_logs.length })}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.audit.columns.action")}</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.audit.columns.entity")}</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.audit.columns.ip")}</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgDetail.audit.columns.time")}</th>
                </tr>
              </thead>
              <tbody>
                {audit_logs.map((log: any) => (
                  <tr key={log.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-2.5 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">
                      {log.entity_type}
                      {log.entity_id ? ` #${log.entity_id}` : ""}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs font-mono">
                      {log.ip_address || "-"}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Internal notes — always visible, not behind a tab: they're context for
          whatever the operator is about to do on this page. */}
      <OrgCommentsCard orgId={String(id)} />

      {/* Irreversible actions go last, below everything else. */}
      <DeleteOrgCard orgId={String(id)} orgName={org.name} />

      {/* Reset Password Modal */}
      {resetPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("orgDetail.resetPassword.title")}</h3>
              <button onClick={() => setResetPasswordModal(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <Trans
                i18nKey="orgDetail.resetPassword.description"
                values={{
                  name: `${resetPasswordModal.first_name} ${resetPasswordModal.last_name}`,
                  email: resetPasswordModal.email,
                }}
                components={{ strong: <strong /> }}
              />
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgDetail.resetPassword.newPasswordLabel")}</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("orgDetail.resetPassword.newPasswordPlaceholder")}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setResetPasswordModal(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                {t("orgDetail.actions.cancel")}
              </button>
              <button
                onClick={() => resetPasswordMut.mutate({ userId: resetPasswordModal.id, new_password: newPassword })}
                disabled={newPassword.length < 8 || resetPasswordMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {resetPasswordMut.isPending ? t("orgDetail.resetPassword.submitting") : t("orgDetail.resetPassword.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {changeRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("orgDetail.changeRole.title")}</h3>
              <button onClick={() => setChangeRoleModal(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <Trans
                i18nKey="orgDetail.changeRole.description"
                values={{ name: `${changeRoleModal.first_name} ${changeRoleModal.last_name}` }}
                components={{ strong: <strong /> }}
              />{" "}
              <span className="font-medium">{t("orgDetail.changeRole.currentRole", { role: changeRoleModal.role })}</span>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgDetail.changeRole.newRoleLabel")}</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              >
                {VALID_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setChangeRoleModal(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                {t("orgDetail.actions.cancel")}
              </button>
              <button
                onClick={() => changeRoleMut.mutate({ userId: changeRoleModal.id, role: newRole })}
                disabled={!newRole || newRole === changeRoleModal.role || changeRoleMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {changeRoleMut.isPending ? t("orgDetail.changeRole.submitting") : t("orgDetail.changeRole.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
