import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import { Megaphone, Plus, Check, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Roles for the targeting dropdown. Labels come from i18n
// (announcements.page.roles.*).
const AVAILABLE_ROLES = ["employee", "manager", "hr_admin", "org_admin"];

// Priority → colour + icon. Label text comes from i18n
// (announcements.page.priority.*).
const PRIORITY_CONFIG: Record<string, { color: string; icon: typeof Info }> = {
  urgent: { color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  high: { color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle },
  normal: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Info },
  low: { color: "bg-gray-100 text-gray-600 border-gray-200", icon: Info },
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

function useAnnouncements(page: number) {
  return useQuery({
    queryKey: ["announcements", page],
    queryFn: () => api.get("/announcements", { params: { page } }).then((r) => r.data),
  });
}

function useUnreadCount() {
  return useQuery({
    queryKey: ["announcements-unread"],
    queryFn: () => api.get("/announcements/unread-count").then((r) => r.data.data.count),
  });
}

function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post("/announcements", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-unread"] });
    },
  });
}

function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/announcements/${id}/read`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-unread"] });
    },
  });
}

function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/announcements/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-unread"] });
    },
  });
}

export default function AnnouncementsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Confirm-delete dialog state (replaces window.confirm). Holds the
  // announcement awaiting confirmation so the dialog can show its title.
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const { data, isLoading } = useAnnouncements(page);
  const { data: unreadCount } = useUnreadCount();
  const createAnnouncement = useCreateAnnouncement();
  const markAsRead = useMarkAsRead();
  const user = useAuthStore((s) => s.user);

  const isHR = user && HR_ROLES.includes(user.role);
  // Mirror the recent custom-role fixes: server gates POST on
  // announcements:create|manage and DELETE on announcements:manage, so the
  // UI must accept the same custom-role permission grants.
  const { has } = usePermissions();
  const canManage = isHR || has("announcements:manage");
  const deleteAnnouncement = useDeleteAnnouncement();
  const announcements = data?.data || [];
  const meta = data?.meta;

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("normal");
  const [targetType, setTargetType] = useState("all");

  // Fetch departments for target dropdown (must be after targetType state declaration)
  const { data: departments, isLoading: deptLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    enabled: !!isHR && targetType === "department",
  });
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAnnouncement.mutateAsync({
      title,
      content,
      priority,
      target_type: targetType,
      target_ids: selectedTargetIds.length > 0 ? JSON.stringify(selectedTargetIds) : null,
      expires_at: expiresAt || null,
    });
    setTitle("");
    setContent("");
    setPriority("normal");
    setTargetType("all");
    setSelectedTargetIds([]);
    setExpiresAt("");
    setShowForm(false);
  };

  const handleTargetToggle = (id: string) => {
    setSelectedTargetIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleMarkRead = async (id: number) => {
    await markAsRead.mutateAsync(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{t("announcements.page.title")}</h1>
            {typeof unreadCount === "number" && unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">{t("announcements.page.subtitle")}</p>
        </div>
        {isHR && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("announcements.page.newAnnouncement")}
          </button>
        )}
      </div>

      {/* Create Announcement Form */}
      {showForm && isHR && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("announcements.page.createTitle")}</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("announcements.page.fieldTitle")} <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={t("announcements.page.titlePlaceholder")}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("announcements.page.fieldContent")} <span className="text-red-500">*</span></label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[120px]"
              placeholder={t("announcements.page.contentPlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("announcements.page.fieldPriority")}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="low">{t("announcements.page.priority.low")}</option>
                <option value="normal">{t("announcements.page.priority.normal")}</option>
                <option value="high">{t("announcements.page.priority.high")}</option>
                <option value="urgent">{t("announcements.page.priority.urgent")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("announcements.page.fieldTarget")}</label>
              <select
                value={targetType}
                onChange={(e) => { setTargetType(e.target.value); setSelectedTargetIds([]); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">{t("announcements.page.targetAll")}</option>
                <option value="department">{t("announcements.page.targetDepartment")}</option>
                <option value="role">{t("announcements.page.targetRole")}</option>
              </select>
            </div>

            {targetType === "department" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("announcements.page.selectDepartments")}
                </label>
                <div className="w-full border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto bg-white">
                  {deptLoading ? (
                    <p className="text-xs text-gray-400 p-1">{t("announcements.page.loadingDepartments")}</p>
                  ) : (departments || []).length === 0 ? (
                    <p className="text-xs text-gray-400 p-1">{t("announcements.page.noDepartments")}</p>
                  ) : (
                    (departments || []).map((dept: any) => (
                      <label key={dept.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTargetIds.includes(String(dept.id))}
                          onChange={() => handleTargetToggle(String(dept.id))}
                          className="rounded border-gray-300 text-brand-600"
                        />
                        <span className="text-sm text-gray-700">{dept.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedTargetIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{t("announcements.page.departmentsSelected", { count: selectedTargetIds.length })}</p>
                )}
              </div>
            )}
            {targetType === "role" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("announcements.page.selectRoles")}
                </label>
                <div className="w-full border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto bg-white">
                  {AVAILABLE_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTargetIds.includes(role)}
                        onChange={() => handleTargetToggle(role)}
                        className="rounded border-gray-300 text-brand-600"
                      />
                      <span className="text-sm text-gray-700">{t(`announcements.page.roles.${role}`)}</span>
                    </label>
                  ))}
                </div>
                {selectedTargetIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{t("announcements.page.rolesSelected", { count: selectedTargetIds.length })}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("announcements.page.fieldExpires")}</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t("announcements.page.cancel")}
            </button>
            <button
              type="submit"
              disabled={createAnnouncement.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Megaphone className="h-4 w-4" /> {t("announcements.page.publish")}
            </button>
          </div>
        </form>
      )}

      {/* Announcement Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            {t("announcements.page.loading")}
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            {t("announcements.page.empty")}
          </div>
        ) : (
          announcements.map((a: any) => {
            const config = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;
            const PriorityIcon = config.icon;
            const isRead = !!a.read_at;
            const isExpanded = expandedId === a.id;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
                  isRead ? "border-gray-200" : "border-brand-300 shadow-sm"
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {/* Priority Badge */}
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${config.color}`}>
                          <PriorityIcon className="h-3 w-3" />
                          {t(`announcements.page.priority.${a.priority}`, { defaultValue: a.priority })}
                        </span>

                        {/* Unread indicator */}
                        {!isRead && (
                          <span className="inline-flex items-center text-xs font-medium text-brand-600">
                            {t("announcements.page.new")}
                          </span>
                        )}

                        {/* Target badge */}
                        {a.target_type !== "all" && (
                          <span className="text-xs text-gray-400 capitalize">
                            {a.target_type}
                          </span>
                        )}
                      </div>

                      <h3 className={`text-base font-semibold ${isRead ? "text-gray-700" : "text-gray-900"}`}>
                        {a.title}
                      </h3>

                      {/* Content is sanitized server-side via sanitizeHtml()
                          before insert/update, so it's safe to render as
                          HTML here. Was previously rendered as plain text,
                          which caused authored markup to leak as literal
                          <p>...</p> tags to readers (#1634). */}
                      <div
                        className={`mt-1 text-sm leading-relaxed prose prose-sm max-w-none ${
                          isExpanded ? "" : "line-clamp-2"
                        } ${isRead ? "text-gray-500" : "text-gray-600"}`}
                        dangerouslySetInnerHTML={{ __html: a.content || "" }}
                      />

                      {(a.content.length > 120 || (a.content.match(/\n/g) || []).length > 2) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : a.id); }}
                          className="mt-1 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>{t("announcements.page.showLess")} <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>{t("announcements.page.readMore")} <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {/* Mark as read button */}
                      {!isRead && (
                        <button
                          onClick={() => handleMarkRead(a.id)}
                          disabled={markAsRead.isPending}
                          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> {t("announcements.page.markRead")}
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => setDeleteTarget({ id: a.id, title: a.title })}
                          disabled={deleteAnnouncement.isPending}
                          title={t("announcements.page.deleteTitle")}
                          aria-label={t("announcements.page.deleteAria", { title: a.title })}
                          className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("announcements.page.delete")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      {a.published_at
                        ? new Date(a.published_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : t("announcements.page.draft")}
                    </span>
                    {a.expires_at && (
                      <span>
                        {t("announcements.page.expires", { date: new Date(a.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })}
                      </span>
                    )}
                    {isRead && a.read_at && (
                      <span className="flex items-center gap-1 text-green-500">
                        <Check className="h-3 w-3" /> {t("announcements.page.read")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            {t("announcements.page.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              {t("announcements.page.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              {t("announcements.page.next")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? t("announcements.page.deleteConfirmTitle", { title: deleteTarget.title }) : t("announcements.page.deleteConfirmTitleGeneric")}
        description={t("announcements.page.deleteConfirmDesc")}
        confirmText={t("announcements.page.delete")}
        variant="danger"
        loading={deleteAnnouncement.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAnnouncement.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
