import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Bell,
  Send,
  X,
  Info,
  AlertTriangle,
  Wrench,
  Rocket,
  Building2,
  Globe,
  XCircle,
} from "lucide-react";

const NOTIF_TYPES = [
  { value: "info", labelKey: "systemNotifications.type.info", icon: Info, color: "bg-blue-100 text-blue-700" },
  { value: "warning", labelKey: "systemNotifications.type.warning", icon: AlertTriangle, color: "bg-amber-100 text-amber-700" },
  { value: "maintenance", labelKey: "systemNotifications.type.maintenance", icon: Wrench, color: "bg-orange-100 text-orange-700" },
  { value: "release", labelKey: "systemNotifications.type.release", icon: Rocket, color: "bg-green-100 text-green-700" },
];

function getTypeStyle(type: string) {
  return NOTIF_TYPES.find((nt) => nt.value === type) || NOTIF_TYPES[0];
}

export default function SystemNotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<"all" | "org">("all");
  const [targetOrgId, setTargetOrgId] = useState("");
  const [notifType, setNotifType] = useState("info");

  const { data: notifData, isLoading } = useQuery({
    queryKey: ["admin-system-notifications"],
    queryFn: () => api.get("/admin/notifications").then((r) => r.data),
  });

  const { data: orgs } = useQuery({
    queryKey: ["admin-org-list-short"],
    queryFn: () => api.get("/admin/organizations?per_page=100").then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: (payload: any) => api.post("/admin/notifications", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-system-notifications"] });
      setShowForm(false);
      setTitle("");
      setMessage("");
      setTargetType("all");
      setTargetOrgId("");
      setNotifType("info");
    },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => api.put(`/admin/notifications/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-system-notifications"] });
    },
  });

  const notifications = notifData?.data || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Bell className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("systemNotifications.title")}</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              {t("systemNotifications.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
        >
          <Send className="h-4 w-4" />
          {t("systemNotifications.newNotification")}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("systemNotifications.form.heading")}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("systemNotifications.form.titleLabel")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("systemNotifications.form.titlePlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("systemNotifications.form.typeLabel")}</label>
              <select
                value={notifType}
                onChange={(e) => setNotifType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              >
                {NOTIF_TYPES.map((nt) => (
                  <option key={nt.value} value={nt.value}>{t(nt.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("systemNotifications.form.messageLabel")}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("systemNotifications.form.messagePlaceholder")}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("systemNotifications.form.targetLabel")}</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setTargetType("all")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    targetType === "all"
                      ? "bg-violet-50 border-violet-300 text-violet-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  {t("systemNotifications.form.allOrgs")}
                </button>
                <button
                  onClick={() => setTargetType("org")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    targetType === "org"
                      ? "bg-violet-50 border-violet-300 text-violet-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  {t("systemNotifications.form.specificOrg")}
                </button>
              </div>
            </div>
            {targetType === "org" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("systemNotifications.form.organizationLabel")}</label>
                <select
                  value={targetOrgId}
                  onChange={(e) => setTargetOrgId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                >
                  <option value="">{t("systemNotifications.form.selectOrgPlaceholder")}</option>
                  {(orgs || []).map((org: any) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() =>
                createMut.mutate({
                  title,
                  message,
                  target_type: targetType,
                  target_org_id: targetType === "org" ? Number(targetOrgId) : null,
                  notification_type: notifType,
                })
              }
              disabled={!title || !message || (targetType === "org" && !targetOrgId) || createMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {createMut.isPending ? t("systemNotifications.form.sending") : t("systemNotifications.form.send")}
            </button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("systemNotifications.list.heading", { count: notifications.length })}
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            {t("systemNotifications.list.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif: any) => {
              const typeStyle = getTypeStyle(notif.notification_type);
              const TypeIcon = typeStyle.icon;
              return (
                <div
                  key={notif.id}
                  className={`flex items-start gap-4 p-4 rounded-lg border ${
                    notif.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${typeStyle.color}`}>
                    <TypeIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{notif.title}</h3>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeStyle.color}`}>
                        {notif.notification_type}
                      </span>
                      {!notif.is_active && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">
                          {t("systemNotifications.item.deactivated")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{notif.message}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>
                        {t("systemNotifications.item.targetPrefix")} {notif.target_type === "all" ? t("systemNotifications.item.targetAll") : notif.target_org_name || t("systemNotifications.item.orgFallback", { id: notif.target_org_id })}
                      </span>
                      <span>{t("systemNotifications.item.byPrefix")} {notif.created_by_name || t("systemNotifications.item.systemAuthor")}</span>
                      <span>{new Date(notif.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {notif.is_active && (
                    <button
                      onClick={() => deactivateMut.mutate(notif.id)}
                      className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title={t("systemNotifications.item.deactivate")}
                    >
                      <XCircle className="h-4.5 w-4.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
