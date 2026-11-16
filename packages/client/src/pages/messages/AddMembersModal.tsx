// =============================================================================
// EMP CLOUD — Add members to a group (creator-only)
// =============================================================================

import { useRef, useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-members-dialog-title"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <Dialog.Title asChild>
            <h2 id="add-members-dialog-title" className="text-sm font-semibold text-foreground">{t("addMembersModal.header.title")}</h2>
          </Dialog.Title>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("addMembersModal.header.close")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={search}
              name="member-search"
              aria-label={t("addMembersModal.search.placeholder")}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("addMembersModal.search.placeholder")}
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-[13px] text-foreground focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{t("addMembersModal.list.loading")}</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
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
                    isSel ? "bg-brand-50 dark:bg-brand-950/40" : "hover:bg-muted"
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
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {emp.first_name} {emp.last_name}
                    </p>
                    {emp.designation && (
                      <p className="truncate text-xs text-muted-foreground">{emp.designation}</p>
                    )}
                  </div>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSel ? "border-brand-600 bg-brand-600 text-white" : "border-border"
                    }`}
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {t("addMembersModal.footer.selectedCount", { count: selected.size })}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0 || saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            {saving ? t("addMembersModal.footer.adding") : t("addMembersModal.footer.add")}
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
