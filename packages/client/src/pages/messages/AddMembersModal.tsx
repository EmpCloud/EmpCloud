// =============================================================================
// EMP CLOUD — Add members to a group (creator-only)
// =============================================================================

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { showToast } from "@/components/ui/Toast";
import { X, Search, Check, UserPlus } from "lucide-react";

interface DirectoryEmployee {
  id: number;
  first_name: string;
  last_name: string;
  designation?: string | null;
  photo_path?: string | null;
}

function extractEmployees(payload: unknown): DirectoryEmployee[] {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as DirectoryEmployee[];
  const nested = (data as { data?: unknown })?.data;
  if (Array.isArray(nested)) return nested as DirectoryEmployee[];
  return [];
}

export function AddMembersModal({
  conversationId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  conversationId: number;
  existingMemberIds: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: employees, isLoading } = useQuery<DirectoryEmployee[]>({
    queryKey: ["chat-directory", search],
    queryFn: () =>
      api
        .get("/employees/directory", { params: { per_page: 100, ...(search ? { search } : {}) } })
        .then((r) => extractEmployees(r.data)),
    staleTime: 30_000,
  });

  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);
  // Candidates = directory minus current members.
  const candidates = (employees ?? []).filter((e) => !existing.has(e.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await api.post(`/chat/conversations/${conversationId}/members`, {
        member_ids: [...selected],
      });
      showToast("success", t("addMembersModal.toast.added", { count: selected.size }));
      onAdded();
    } catch {
      showToast("error", t("addMembersModal.toast.addFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t("addMembersModal.header.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("addMembersModal.header.close")}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("addMembersModal.search.placeholder")}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">{t("addMembersModal.list.loading")}</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">
              {search
                ? t("addMembersModal.list.noMatches", { search })
                : t("addMembersModal.list.allInGroup")}
            </p>
          ) : (
            candidates.map((emp) => {
              const isSel = selected.has(emp.id);
              return (
                <button
                  key={emp.id}
                  onClick={() => toggle(emp.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                    isSel ? "bg-brand-50" : "hover:bg-gray-50"
                  }`}
                >
                  <EmployeeAvatar
                    userId={emp.id}
                    hasPhoto={!!emp.photo_path}
                    firstName={emp.first_name}
                    lastName={emp.last_name}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {emp.first_name} {emp.last_name}
                    </p>
                    {emp.designation && (
                      <p className="text-xs text-gray-400 truncate">{emp.designation}</p>
                    )}
                  </div>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSel ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {t("addMembersModal.footer.selectedCount", { count: selected.size })}
          </span>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0 || saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            <UserPlus className="h-4 w-4" />
            {saving ? t("addMembersModal.footer.adding") : t("addMembersModal.footer.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
