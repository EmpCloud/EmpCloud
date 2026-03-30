import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { Megaphone, Plus, Check, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";

const AVAILABLE_ROLES = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "org_admin", label: "Org Admin" },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: typeof Info }> = {
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  high: { label: "High", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Info },
  low: { label: "Low", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Info },
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

export default function AnnouncementsPage() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data, isLoading } = useAnnouncements(page);
  const { data: unreadCount } = useUnreadCount();
  const createAnnouncement = useCreateAnnouncement();
  const markAsRead = useMarkAsRead();
  const user = useAuthStore((s) => s.user);

  const isHR = user && HR_ROLES.includes(user.role);
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
            <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
            {typeof unreadCount === "number" && unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Stay updated with company announcements.</p>
        </div>
        {isHR && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New Announcement
          </button>
        )}
      </div>

      {/* Create Announcement Form */}
      {showForm && isHR && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Announcement</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Announcement title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[120px]"
              placeholder="Write your announcement here..."
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
              <select
                value={targetType}
                onChange={(e) => { setTargetType(e.target.value); setSelectedTargetIds([]); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Employees</option>
                <option value="department">Department</option>
                <option value="role">Role</option>
              </select>
            </div>

            {targetType === "department" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Departments
                </label>
                <div className="w-full border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto bg-white">
                  {deptLoading ? (
                    <p className="text-xs text-gray-400 p-1">Loading departments...</p>
                  ) : (departments || []).length === 0 ? (
                    <p className="text-xs text-gray-400 p-1">No departments found. Create departments in Settings first.</p>
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
                  <p className="text-xs text-gray-500 mt-1">{selectedTargetIds.length} department(s) selected</p>
                )}
              </div>
            )}
            {targetType === "role" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Roles
                </label>
                <div className="w-full border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto bg-white">
                  {AVAILABLE_ROLES.map((role) => (
                    <label key={role.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTargetIds.includes(role.value)}
                        onChange={() => handleTargetToggle(role.value)}
                        className="rounded border-gray-300 text-brand-600"
                      />
                      <span className="text-sm text-gray-700">{role.label}</span>
                    </label>
                  ))}
                </div>
                {selectedTargetIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{selectedTargetIds.length} role(s) selected</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAnnouncement.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Megaphone className="h-4 w-4" /> Publish
            </button>
          </div>
        </form>
      )}

      {/* Announcement Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No announcements to display.
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
                          {config.label}
                        </span>

                        {/* Unread indicator */}
                        {!isRead && (
                          <span className="inline-flex items-center text-xs font-medium text-brand-600">
                            New
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

                      <p className={`mt-1 text-sm leading-relaxed ${isExpanded ? "" : "line-clamp-2"} ${
                        isRead ? "text-gray-500" : "text-gray-600"
                      }`}>
                        {a.content}
                      </p>

                      {a.content.length > 200 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : a.id)}
                          className="mt-1 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>Show less <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Read more <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Mark as read button */}
                    {!isRead && (
                      <button
                        onClick={() => handleMarkRead(a.id)}
                        disabled={markAsRead.isPending}
                        className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Mark Read
                      </button>
                    )}
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
                        : "Draft"}
                    </span>
                    {a.expires_at && (
                      <span>
                        Expires {new Date(a.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {isRead && a.read_at && (
                      <span className="flex items-center gap-1 text-green-500">
                        <Check className="h-3 w-3" /> Read
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
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
